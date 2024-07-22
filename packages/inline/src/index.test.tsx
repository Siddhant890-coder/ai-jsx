import { createRenderContext, RenderElement } from '@ai-jsx/core';
import { Inline, $_ } from './index.js';
import { it, expect } from 'vitest';

it('works with a single child', () => {
  const result = createRenderContext().render(<Inline>Hello!</Inline>);
  expect(result.toString()).toBe('Hello!');
});

it('works with multiple nested children', () => {
  const result = createRenderContext().render(
    <Inline>
      Hello,
      <>
        {' '}
        wo<>rld!</>
      </>
    </Inline>,
  );
  expect(result.toString()).toMatchInlineSnapshot(`"Hello, world!"`);
});

it('works with the placeholder', () => {
  const result = createRenderContext().render(
    <Inline>
      [A]
      <>
        [<$_ /> B]
      </>
      <>
        [<$_ /> C]
      </>
    </Inline>,
  );
  expect(result.toString()).toMatchInlineSnapshot(`"[A][[A] B][[A][[A] B] C]"`);
});

it('works with the placeholder and initial', () => {
  const result = createRenderContext().render(
    <Inline initial="X">
      [A]
      <>
        [<$_ /> B]
      </>
    </Inline>,
  );
  expect(result.toString()).toMatchInlineSnapshot(`"[A][X[A] B]"`);
});

it('works with nested intrinsic elements', () => {
  const result = createRenderContext().render(
    <Inline>
      <a>[Hello]</a>
      <b>
        [<$_ /> world]
      </b>
      <c>
        [<$_ />
        !]
      </c>
    </Inline>,
  );
  for (const c of result.flat((c): c is RenderElement<'c'> => typeof c === 'object' && c.type === 'c')) {
    expect(c.toString()).toMatchInlineSnapshot(`"[[Hello][[Hello] world]!]"`);
  }
});

it('works with async elements', async () => {
  const result = await createRenderContext()
    .render(
      <Inline>
        {Promise.resolve(<>[Hello]</>)}
        {Promise.resolve(
          <>
            [<$_ /> world]
          </>,
        )}
        {Promise.resolve(
          <>
            [<$_ />
            !]
          </>,
        )}
      </Inline>,
    )
    .untilComplete();
  expect(result.toString()).toMatchInlineSnapshot(`"[Hello][[Hello] world][[Hello][[Hello] world]!]"`);
});

it('works with nested inline elements', () => {
  const result = createRenderContext().render(
    <Inline>
      <Inline>[Hello]</Inline>
      <Inline initial={<$_ />}>
        <>
          [<$_ /> world]
        </>
      </Inline>
      <Inline initial={<$_ />}>
        <>
          [<$_ />
          !]
        </>
      </Inline>
    </Inline>,
  );

  expect(result.toString()).toMatchInlineSnapshot(`"[Hello][[Hello] world][[Hello][[Hello] world]!]"`);
});

it('fails when using $ outside of Inline', async () => {
  await expect(
    createRenderContext()
      .render(<$_ />)
      .untilComplete(),
  ).rejects.toThrowError('$_ must be used within a <Inline> component');
});
