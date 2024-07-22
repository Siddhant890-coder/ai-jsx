import { type JSX } from './jsx-runtime.js';
import { Tag, Props, IsRenderElement } from './symbols.js';

export interface AIElement<P = unknown> {
  [Tag]?: AIComponent<P> | string | symbol;
  [Props]?: P;
  (componentContext: ComponentContext): AINode;
}

export type RenderElementType = string | symbol;
export type RenderElementAttributes<T> = T extends keyof JSX.IntrinsicElements
  ? JSX.IntrinsicElements[T]
  : Record<string | symbol, unknown>;

export interface RenderElement<T extends RenderElementType = RenderElementType>
  extends AsyncIterable<RenderNode>,
    Iterable<RenderNode> {
  readonly [IsRenderElement]: true;
  readonly type: T;
  readonly attributes: RenderElementAttributes<T>;

  isComplete(local?: boolean): boolean;
  untilComplete(local?: boolean): Promise<RenderElement>;
  untilChange(local?: boolean): Promise<RenderElement> | null;
  onSynchronousComplete?(handler: () => void): void;

  text(): PromiseLike<string> & AsyncIterable<string>;
  toString(): string;

  flat<U extends RenderNode>(
    filter: (node: RenderNode, path: RenderElement[]) => node is U,
    considerRoot?: boolean,
    path?: RenderElement[],
  ): Iterable<U> & AsyncIterable<U>;
  find<U extends RenderElementType>(type: U): Promise<{ element: RenderElement<U> | undefined; path: RenderElement[] }>;
  replace(path: RenderElement[], node: RenderNode, replacement: AINode): AINode;
}

export interface RenderIterable {
  [Symbol.asyncIterator](): AsyncIterator<AINode, void, RenderNode>;
}

type Literal = string | number | null | undefined | boolean;
type TreeNode = RenderElement | AIElement<unknown> | Iterable<AINode> | RenderIterable;
export type RenderNode = RenderElement | string;
export type AINode = Literal | TreeNode | PromiseLike<Literal | TreeNode>;

export interface Context<T> {
  default: T;
  symbol: symbol;
}

export interface ContextWithProvider<T, V = T> extends Context<T> {
  Provider: AIComponent<{ value: V; children: AINode }>;
}

export interface RenderContext {
  create<T extends RenderElementType>(
    tag: T,
    attributes: RenderElementAttributes<T>,
    children: AINode,
  ): RenderElement<T>;
  render(node: AINode, abortSignal?: AbortSignal): RenderElement;
  getContext<T>(ctx: Context<T>): T;
  setContext<T>(ctx: Context<T>, value: T): RenderContext;
  abortSignal: AbortSignal;
}

export type LogLevel = 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
export interface Logger extends Record<LogLevel, (obj: object | string, msg?: string) => void> {}

export interface ComponentContext extends RenderContext {
  logger: Logger;
}

export type AIComponent<P> = (props: P, context: ComponentContext) => AINode;
export type PropsOfComponent<T extends AIComponent<never>> = T extends AIComponent<infer P> ? P : never;

export type RenderNodes = RenderNode | Iterable<RenderNodes>;
export type RenderMiddlewareFn = (node: AINode, next: (node: AINode) => RenderNodes) => RenderNodes;

export type LogFn = (
  level: LogLevel,
  node: AINode,
  renderId: string,
  metadataOrMessage: object | string,
  message?: string,
) => void;

export type TokenizerImplFn = (node: RenderNode, self: TokenizerFn) => number;
export type TokenizerFn = (node: RenderNode) => number;
