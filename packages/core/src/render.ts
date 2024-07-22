import {
  AINode,
  Context,
  RenderContext,
  RenderElement,
  RenderNode,
  RenderElementAttributes,
  RenderElementType,
  Logger,
} from './types.js';
import { Log, RenderMiddleware } from './context.js';
import * as Symbols from './symbols.js';
import { setMaxListeners } from 'node:events';
import { randomUUID } from 'node:crypto';

type NextChildPromise = PromiseLike<[RenderNode | null, NextChildPromise | null]>;
type RenderChildren = RenderNode | Iterable<RenderChildren>;
type AsyncRenderChildren = RenderChildren | AsyncIterable<AsyncRenderChildren> | PromiseLike<AsyncRenderChildren>;

function isRenderNode(value: unknown): value is RenderNode {
  return typeof value === 'string' || (typeof value === 'object' && value !== null && Symbols.IsRenderElement in value);
}

abstract class RenderElementBase<T extends RenderElementType> implements RenderElement<T> {
  [Symbols.IsRenderElement] = true as const;

  abstract readonly type: T;
  abstract readonly attributes: RenderElementAttributes<T>;

  abstract isComplete(local?: boolean): boolean;
  abstract untilComplete(local?: boolean): Promise<RenderElement>;
  abstract untilChange(local?: boolean | undefined): Promise<RenderElement> | null;

  abstract text(): PromiseLike<string> & AsyncIterable<string>;
  abstract toString(): string;

  abstract [Symbol.asyncIterator](): AsyncIterator<RenderNode>;
  abstract [Symbol.iterator](): Iterator<RenderNode>;

  flat<U extends RenderNode>(
    filter: (node: RenderNode, path: RenderElement[]) => node is U,
    considerRoot: boolean = true,
    path: RenderElement[] = [],
  ): Iterable<U> & AsyncIterable<U> {
    if (considerRoot && filter(this, path)) {
      // eslint-disable-next-line @typescript-eslint/no-this-alias
      const root: U = this;
      return {
        async *[Symbol.asyncIterator]() {
          yield root;
        },
        *[Symbol.iterator]() {
          yield root;
        },
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const root: RenderElement = this;
    const newPath = [...path, root];

    return {
      async *[Symbol.asyncIterator]() {
        for await (const node of root) {
          if (filter(node, newPath)) {
            yield node;
          } else if (typeof node !== 'string') {
            yield* node.flat(filter, false, newPath);
          }
        }
      },
      *[Symbol.iterator]() {
        for (const node of root) {
          if (filter(node, newPath)) {
            yield node;
          } else if (typeof node !== 'string') {
            yield* node.flat(filter, false, newPath);
          }
        }
      },
    };
  }

  async find<U extends RenderElementType>(
    type: U,
  ): Promise<{ element: RenderElement<U> | undefined; path: RenderElement[] }> {
    let path: RenderElement[] = [];
    const isTarget = (e: RenderNode, p: RenderElement[]): e is RenderElement<U> => {
      if (typeof e !== 'string' && e.type === type) {
        path = p;
        return true;
      }
      return false;
    };
    if (this.isComplete()) {
      for (const element of this.flat(isTarget)) {
        return { element, path };
      }
    } else {
      for await (const element of this.flat(isTarget)) {
        return { element, path };
      }
    }

    return { element: undefined, path };
  }

  private static replaceChild(parent: RenderElement, node: RenderNode, replacement: AINode): AINode {
    return (ctx) =>
      ctx.create(
        parent.type,
        parent.attributes,
        parent.isComplete()
          ? (function* () {
              for (const child of parent) {
                yield child === node ? replacement : child;
              }
            })()
          : (async function* () {
              for await (const child of parent) {
                yield child === node ? replacement : child;
              }
            })(),
      );
  }

  replace(path: RenderElement[], node: RenderNode, replacement: AINode): AINode {
    if (path.length === 0) {
      return node === this ? replacement : this;
    }

    const currentPath = path.slice();
    let currentTarget = node;
    let currentReplacement = replacement;
    while (currentPath.length > 0) {
      const parent = currentPath.pop()!;
      currentReplacement = RenderElementBase.replaceChild(parent, currentTarget, currentReplacement);
      currentTarget = parent;
    }

    return currentReplacement;
  }
}

class RenderElementImpl extends RenderElementBase<RenderElementType> {
  public readonly [Symbols.IsRenderElement] = true as const;
  private readonly children: RenderNode[] = [];

  private completePromise: PromiseLike<unknown> | null;
  private nextChildPromise: NextChildPromise | null = null;
  private readonly synchronousCompleteHandlers: (() => void)[] = [];

  constructor(
    readonly type: string | symbol,
    readonly attributes: Record<string | symbol, unknown>,
    readonly abortSignal: AbortSignal,
    children: AsyncRenderChildren,
  ) {
    super();
    let resolveNextChildPromise: ((value: Awaited<NextChildPromise>) => void) | null = null;
    let rejectNextChildPromise: ((reason: unknown) => void) | null = null;

    // Track pending children explicitly so that we can clear `completedPromise` as soon
    // as the child is completed. (Since we're the first to see the child we can be the first
    // react to its completion.)
    let pendingChildren = 0;
    const childResolutions: Promise<unknown>[] = [];

    const collectChild = (child: RenderNode) => {
      if (abortSignal.aborted) {
        throw new Error('Render aborted');
      }

      this.children.push(child);

      if (typeof child !== 'string' && !child.isComplete()) {
        ++pendingChildren;

        // If the child supports synchronous completion, prefer that to make completion atomic.
        if (child.onSynchronousComplete) {
          childResolutions.push(child.untilComplete());
          child.onSynchronousComplete(() => {
            if (--pendingChildren === 0 && this.nextChildPromise === null) {
              this.markComplete();
            }
          });
        } else {
          childResolutions.push(
            child.untilComplete().then(() => {
              if (--pendingChildren === 0 && this.nextChildPromise === null) {
                this.markComplete();
              }
            }),
          );
        }
      }

      if (resolveNextChildPromise) {
        let nextResolve: typeof resolveNextChildPromise | null = null;
        let nextReject: typeof rejectNextChildPromise | null = null;
        this.nextChildPromise = new Promise((resolve, reject) => {
          nextResolve = resolve;
          nextReject = reject;
        });
        resolveNextChildPromise([child, this.nextChildPromise]);
        resolveNextChildPromise = nextResolve;
        rejectNextChildPromise = nextReject;
      }
    };

    const handleItem = (item: AsyncRenderChildren): PromiseLike<unknown> | null => {
      if (isRenderNode(item)) {
        collectChild(item);
        return null;
      }

      if (Symbol.iterator in item) {
        // eslint-disable-next-line @typescript-eslint/no-use-before-define
        return handleIterator(item[Symbol.iterator]());
      }

      if (Symbol.asyncIterator in item) {
        return (async () => {
          for await (const child of item) {
            const next = handleItem(child);
            if (next) {
              await next;
            }
          }
        })();
      }

      if ('then' in item) {
        return item.then(handleItem);
      }

      throw new Error(`Unsupported child type: ${item}`);
    };

    const handleIterator = (iterator: Iterator<RenderChildren>): PromiseLike<unknown> | null => {
      for (;;) {
        const { value, done } = iterator.next();
        if (done) {
          return null;
        }

        const itemResult = handleItem(value);
        if (itemResult) {
          return itemResult.then(() => handleIterator(iterator));
        }
      }
    };

    const allChildrenCollected = handleItem(children);
    if (allChildrenCollected !== null) {
      // Not all the children are collected yet.
      this.nextChildPromise = new Promise((resolve, reject) => {
        resolveNextChildPromise = resolve;
        rejectNextChildPromise = reject;
      });
      this.completePromise = allChildrenCollected.then(
        () => {
          resolveNextChildPromise!([null, null]);
          this.nextChildPromise = null;

          if (pendingChildren === 0) {
            this.markComplete();
          }

          return Promise.all(childResolutions);
        },
        (e) => {
          rejectNextChildPromise!(e);
          // Ensure that any errors in the promises are rolled up.
          return Promise.all([this.nextChildPromise, ...childResolutions]);
        },
      );
    } else if (pendingChildren > 0) {
      // Check for any children that need to be waited on.
      this.completePromise = Promise.all(childResolutions);
    } else {
      this.completePromise = null;
    }

    if (this.completePromise) {
      const abort = () => {
        rejectNextChildPromise?.(new Error('Render aborted'));
      };
      abortSignal.addEventListener('abort', abort);
      const cleanup = () => {
        abortSignal.removeEventListener('abort', abort);
        this.synchronousCompleteHandlers.splice(0, this.synchronousCompleteHandlers.length);
      };
      this.completePromise.then(cleanup, cleanup);
    }
  }

  isComplete(local?: boolean): boolean {
    return local ? this.nextChildPromise === null : this.completePromise === null;
  }

  onSynchronousComplete(handler: () => void) {
    if (this.completePromise === null) {
      handler();
    } else {
      this.synchronousCompleteHandlers.push(handler);

      // If completion failed, clear the handler right away.
      Promise.race([this.completePromise, Promise.resolve()]).catch(() => {
        this.synchronousCompleteHandlers.splice(0, this.synchronousCompleteHandlers.length);
      });
    }
  }

  private markComplete() {
    this.completePromise = null;
    this.synchronousCompleteHandlers.forEach((f) => {
      try {
        f();
      } catch (ex) {
        console.warn(`onSynchronousComplete failed with ${ex}`);
      }
    });
    this.synchronousCompleteHandlers.splice(0, this.synchronousCompleteHandlers.length);
  }

  async untilComplete(local?: boolean): Promise<RenderElement> {
    if (local) {
      while (this.nextChildPromise) {
        await this.nextChildPromise;
      }
    } else if (this.completePromise) {
      await this.completePromise;
    }

    return this;
  }

  untilChange(local?: boolean): Promise<RenderElement> | null {
    if (this.isComplete(local)) {
      return null;
    }

    if (local) {
      return this.nextChildPromise ? Promise.resolve(this.nextChildPromise).then(() => this) : null;
    }

    const promises: PromiseLike<unknown>[] = [];
    for (const child of this) {
      if (typeof child !== 'string') {
        const promise = child.untilChange();
        if (promise) {
          promises.push(promise);
        }
      }
    }

    if (this.nextChildPromise !== null) {
      promises.push(this.nextChildPromise);
    }

    if (promises.length === 0) {
      // This is already complete but the status hasn't been reflected yet.
      return this.untilComplete();
    }

    return Promise.race(promises).then(() => this);
  }

  [Symbol.iterator](): Iterator<RenderNode> {
    return this.children[Symbol.iterator]();
  }

  async *[Symbol.asyncIterator](): AsyncIterator<RenderNode> {
    const childrenToYield = this.children.slice();
    let nextPromise = this.nextChildPromise;
    yield* childrenToYield;

    while (nextPromise) {
      const [child, next] = await nextPromise;
      if (child !== null) {
        yield child;
      }

      nextPromise = next;
    }
  }

  toString(): string {
    function addStringChunks(renderNode: RenderNode, chunks: string[]): string[] {
      if (typeof renderNode === 'string') {
        chunks.push(renderNode);
        return chunks;
      }

      for (const child of renderNode) {
        addStringChunks(child, chunks);
      }

      return chunks;
    }

    return addStringChunks(this, []).join('');
  }

  private async *textStream(): AsyncIterable<string> {
    for await (const child of this) {
      if (typeof child === 'string') {
        yield child;
      } else {
        yield* child.text();
      }
    }
  }

  text(): PromiseLike<string> & AsyncIterable<string> {
    return {
      then: (onFulfilled, onError?) =>
        this.untilComplete()
          .then(() => this.toString())
          .then(onFulfilled, onError),
      [Symbol.asyncIterator]: () => this.textStream()[Symbol.asyncIterator](),
    };
  }
}

class RenderContextImpl implements RenderContext {
  constructor(
    private readonly userContext: Record<symbol, unknown>,
    readonly abortSignal: AbortSignal,
  ) {
    this.create = this.create.bind(this);
    this.render = this.render.bind(this);
    this.getContext = this.getContext.bind(this);
    this.setContext = this.setContext.bind(this);

    const boundRenderInternal = this.renderInternal.bind(this);
    this.renderInternal = (node) => this.getContext(RenderMiddleware)(node, boundRenderInternal);

    setMaxListeners(0, this.abortSignal);
  }
  create<T extends RenderElementType>(
    tag: T,
    attributes: RenderElementAttributes<T>,
    children: AINode,
  ): RenderElement<T> {
    return new RenderElementImpl(
      tag,
      attributes,
      this.abortSignal,
      this.renderInternal(children),
    ) as unknown as RenderElement<T>;
  }

  render(renderable: AINode, abortSignal: AbortSignal | undefined = this.abortSignal): RenderElement {
    if (abortSignal !== this.abortSignal) {
      // Tie the parent and given abort signals together.
      const controller = new AbortController();
      const abortSubRender = () => controller.abort();
      this.abortSignal.addEventListener('abort', abortSubRender);
      abortSignal.addEventListener('abort', abortSubRender);
      const result = new RenderContextImpl(this.userContext, controller.signal).render(renderable);
      result.untilComplete().finally(() => {
        this.abortSignal.removeEventListener('abort', abortSubRender);
        abortSignal.removeEventListener('abort', abortSubRender);
      });
      return result;
    }

    const result = this.renderInternal(renderable);
    return typeof result === 'object' && Symbols.IsRenderElement in result
      ? result
      : new RenderElementImpl(Symbols.Root, {}, abortSignal, result);
  }

  private renderInternal(node: AINode): RenderChildren {
    let _logger: Logger | undefined = undefined;
    const getLogger = () => {
      if (_logger === undefined) {
        const renderId = randomUUID();
        const log = this.getContext(Log);
        _logger = {
          fatal: (obj, msg) => log('fatal', node, renderId, obj, msg),
          error: (obj, msg) => log('error', node, renderId, obj, msg),
          warn: (obj, msg) => log('warn', node, renderId, obj, msg),
          info: (obj, msg) => log('info', node, renderId, obj, msg),
          debug: (obj, msg) => log('debug', node, renderId, obj, msg),
          trace: (obj, msg) => log('trace', node, renderId, obj, msg),
        };
      }
      return _logger;
    };

    switch (typeof node) {
      case 'string':
        return node;
      case 'number':
        return node.toString();
      case 'boolean':
      case 'undefined':
      case 'symbol':
        return '';
      case 'object': {
        if (node === null) {
          return '';
        }

        if (Symbols.IsRenderElement in node) {
          return node;
        }

        if (this.abortSignal.aborted) {
          throw new Error('Render aborted');
        }

        if (Symbol.iterator in node) {
          const result: RenderChildren[] = [];
          try {
            for (const child of node) {
              result.push(this.renderInternal(child));
            }
          } catch (error) {
            getLogger().error(error as object);
            result.push(this.create(Symbols.Error, { error }, Promise.reject(error)));
          }
          return result;
        }

        if ('then' in node) {
          node.then(undefined, (e) => getLogger().error(e));
          return new RenderElementImpl(
            Symbols.Async,
            {},
            this.abortSignal,
            node.then((value) => this.renderInternal(value)),
          );
        }

        if (Symbol.asyncIterator in node) {
          // eslint-disable-next-line @typescript-eslint/no-this-alias
          const self = this;
          return new RenderElementImpl(
            Symbols.Stream,
            {},
            this.abortSignal,
            (async function* () {
              const iterator = node[Symbol.asyncIterator]();
              try {
                let { value, done } = await iterator.next();
                while (true) {
                  if (done) {
                    break;
                  }

                  const renderChildren = self.renderInternal(value as AINode);
                  const renderNode =
                    typeof renderChildren === 'string'
                      ? renderChildren
                      : Symbols.IsRenderElement in renderChildren
                        ? renderChildren
                        : self.create(Symbols.Root, {}, renderChildren);

                  let didAbort = true;
                  try {
                    yield renderNode;
                    didAbort = false;
                  } finally {
                    if (didAbort) {
                      await iterator.throw?.();
                    }
                  }
                  ({ value, done } = await iterator.next(renderNode));
                }
              } catch (e) {
                getLogger().error(e as object);
                throw e;
              }
            })(),
          );
        }

        throw new TypeError(`Unsupported object type: ${node}`);
      }
      case 'function': {
        if (this.abortSignal.aborted) {
          throw new Error('Render aborted');
        }
        try {
          return this.renderInternal(node(Object.create(this, { logger: { get: getLogger } })));
        } catch (e) {
          getLogger().error(e as object);
          // Embed the error in the render tree.
          return this.create(Symbols.Error, { error: e }, Promise.reject(e));
        }
      }
      default: {
        const shouldBeNever: never = node;
        throw new TypeError(`Unsupported literal type: ${shouldBeNever}`);
      }
    }
  }
  getContext<T>(ctx: Context<T>): T {
    return ctx.symbol in this.userContext ? (this.userContext[ctx.symbol] as T) : ctx.default;
  }
  setContext<T>(ctx: Context<T>, value: T): RenderContext {
    return new RenderContextImpl({ ...this.userContext, [ctx.symbol]: value }, this.abortSignal);
  }
}

export function createRenderContext(opts: { abortSignal?: AbortSignal } = {}): RenderContext {
  return new RenderContextImpl({}, opts.abortSignal ?? new AbortController().signal);
}
