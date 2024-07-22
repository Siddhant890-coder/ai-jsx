import { createRenderContext, AINode, RenderMiddlewareFn, RenderMiddleware, RenderElement } from './index.js';
import { it, expect, describe } from 'vitest';

it('works for simple strings without awaiting', () => {
  const ctx = createRenderContext();
  expect(ctx.render('Hello, world!').toString()).toBe('Hello, world!');
});

it('works for promised strings', async () => {
  const ctx = createRenderContext();
  expect(await ctx.render(Promise.resolve('Hello, world!')).text()).toBe('Hello, world!');
});

it('handles failures', async () => {
  const ctx = createRenderContext();
  await expect(ctx.render(Promise.reject(new Error('failure'))).text()).rejects.toThrow('failure');
});

it('handles failures in components', async () => {
  function Component(): never {
    throw new Error('failure');
  }

  const ctx = createRenderContext();
  await expect(ctx.render(<Component />).text()).rejects.toThrow('failure');
});

it('handles failures in async components', async () => {
  async function* Component(): AINode {
    yield 'Hi';
    throw new Error('failure');
  }

  const ctx = createRenderContext();
  await expect(ctx.render(<Component />).text()).rejects.toThrow('failure');
});

it('works for simple JSX without awaiting', () => {
  const ctx = createRenderContext();
  expect(
    ctx
      .render(
        <b>
          Hello, <i>world!</i>
        </b>,
      )
      .toString(),
  ).toBe('Hello, world!');
});

it('works for async generators', async () => {
  async function* gen() {
    yield 'Hello, ';
    await Promise.resolve();
    yield 'world!';
  }

  const ctx = createRenderContext();
  expect(await ctx.render(gen()).text()).toBe('Hello, world!');
});

it('works for async generators with JSX', async () => {
  async function* gen() {
    yield 'Hello, ';
    await Promise.resolve();
    yield <b>world!</b>;
  }

  const ctx = createRenderContext();
  expect(await ctx.render(<>{gen()}</>).text()).toBe('Hello, world!');
});

describe('replacement', () => {
  const ctx = createRenderContext();
  const renderElement = ctx.render(
    <b>
      Hello, <i>world!</i>
    </b>,
  );

  it('works for synchronous replacements', async () => {
    const replacement = ctx.render(<u>goodbye!</u>);
    const { element: target, path } = await renderElement.find('i');
    const replaced = ctx.render(renderElement.replace(path, target!, replacement));
    expect(replaced.toString()).toBe('Hello, goodbye!');
  });

  it('works for asynchronous replacements', async () => {
    const replacement = ctx.render(Promise.resolve(<u>goodbye!</u>));
    const { element: target, path } = await renderElement.find('i');
    const replaced = ctx.render(renderElement.replace(path, target!, replacement));
    expect(await replaced.text()).toBe('Hello, goodbye!');
  });
});

describe('subtree replacement', () => {
  const ctx = createRenderContext();
  const renderElement = ctx.render(
    <b>
      Hello,{' '}
      <i>
        <u>world</u>!
      </i>
    </b>,
  );

  const replacement = ctx.render(<u>goodbye</u>);

  it('works for synchronous replacements', async () => {
    const { element: target, path } = await renderElement.find('u');
    const replaced = ctx.render(renderElement.replace(path, target!, replacement));
    expect(await replaced.text()).toBe('Hello, goodbye!');
  });
});

it('frame iteration should iterate over frames', async () => {
  let resolveInitialPromise: () => void = () => {};
  const initialPromise = new Promise<void>((r) => {
    resolveInitialPromise = r;
  });

  const ctx = createRenderContext();
  const renderElement = ctx.render(
    <b>
      <i>
        1.{' '}
        {async function* gen() {
          await initialPromise;
          yield 'Hello, ';
          await new Promise((r) => setTimeout(r, 100));
          yield 'world!';
        }}
        {'\n'}
      </i>
      <u>
        2.{' '}
        {async function* gen() {
          await initialPromise;
          yield 'Hello, ';
          await new Promise((r) => setTimeout(r, 200));
          yield 'goodbye!';
        }}
      </u>
    </b>,
  );

  const expectedFrames = [
    '1. \n2. ',
    '1. Hello, \n2. Hello, ',
    '1. Hello, world!\n2. Hello, ',
    '1. Hello, world!\n2. Hello, goodbye!',
  ];
  const frames = [];
  for (;;) {
    frames.push(renderElement.toString());
    if (renderElement.isComplete()) {
      break;
    }
    resolveInitialPromise();
    await renderElement.untilChange();
  }
  expect(frames).toEqual(expectedFrames);
});

it('middleware should get access to every render', () => {
  const ctx = createRenderContext();
  const renderedNodes: AINode[] = [];
  const middleware: RenderMiddlewareFn = (node, next) => {
    renderedNodes.push(node);
    return next(node);
  };

  const rendered = ctx.render(
    <RenderMiddleware.Provider value={middleware}>
      <i>
        <u>Hello!</u>
      </i>
    </RenderMiddleware.Provider>,
  );

  expect(rendered.toString()).toBe('Hello!');
  expect(renderedNodes.length).toBe(5);
  expect(typeof renderedNodes[0]).toBe('function');
  expect(typeof renderedNodes[1]).toBe('function');
  expect(renderedNodes[2]).toBe('Hello!');
  expect((renderedNodes[3] as RenderElement).type).toBe('u');
  expect((renderedNodes[4] as RenderElement).type).toBe('i');
});

it('nested middleware should work together', () => {
  const ctx = createRenderContext();

  const middleware1: RenderMiddlewareFn = (node, next) => {
    if (typeof node === 'string') {
      return next(node.toLocaleUpperCase());
    }

    return next(node);
  };

  const middleware2: RenderMiddlewareFn = (node, next) => {
    if (typeof node === 'string') {
      expect(node).toBe(node.toLocaleUpperCase());
      return next(`${node}!`);
    }
    return next(node);
  };

  const rendered = ctx.render(
    <RenderMiddleware.Provider value={middleware2}>
      <RenderMiddleware.Provider value={middleware1}>
        <i>Hello</i>
      </RenderMiddleware.Provider>
    </RenderMiddleware.Provider>,
  );

  expect(rendered.toString()).toBe('HELLO!');
});

it('aborts rendering', async () => {
  const abortController = new AbortController();
  const renderContext = createRenderContext({ abortSignal: abortController.signal });

  let didComponentRender = false;
  const rendered = renderContext.render(
    <>
      {async function () {
        await Promise.resolve();
        return () => {
          didComponentRender = true;
          console.error('This component should not render');
        };
      }}
    </>,
  );

  abortController.abort();
  try {
    await rendered.untilComplete();
  } catch {
    // Do nothing.
  }
  await new Promise((r) => setImmediate(r));
  expect(didComponentRender).toBe(false);
});

it('aborts any async generators', async () => {
  const abortController = new AbortController();
  const renderContext = createRenderContext({ abortSignal: abortController.signal });

  let resolveDidRunAfterYield: (value: boolean) => void = () => {};
  const didRunAfterYield = new Promise<boolean>((r) => {
    resolveDidRunAfterYield = r;
  });
  const rendered = renderContext.render(
    <>
      {async function* () {
        try {
          yield 1;
          resolveDidRunAfterYield(true);
        } catch {
          resolveDidRunAfterYield(false);
        }
      }}
    </>,
  );

  abortController.abort();
  try {
    await rendered.untilComplete();
    throw new Error('An aborted render should fail.');
  } catch {
    // Do nothing.
  }

  expect(await didRunAfterYield).toBe(false);
});
