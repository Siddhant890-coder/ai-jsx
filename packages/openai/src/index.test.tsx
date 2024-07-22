import { createRenderContext } from '@ai-jsx/core';
import { tokenizerForModel } from './index.js';
import { it, expect } from 'vitest';
import { isChatElement } from '@ai-jsx/core/chat';
import { seal } from '@ai-jsx/core/tokenizer';

it('tokenizes text', () => {
  const tokenize = seal(tokenizerForModel('gpt-4o'));
  expect(tokenize('Hello, world!')).toBe(4);
});

it('tokenizes completed render elements', () => {
  const tokenize = seal(tokenizerForModel('gpt-4o'));
  const renderContext = createRenderContext();
  const node = renderContext.render(<user>Hello, world!</user>);
  expect(tokenize(node)).toBe(7);
});

it('tokenizes incomplete render elements', async () => {
  const tokenize = seal(tokenizerForModel('gpt-4o'));
  const renderContext = createRenderContext();
  const node = await renderContext.render(Promise.resolve(<user>Hello, world!</user>)).untilComplete();
  expect(tokenize(node)).toBe(7);
});

it('aggregates children', async () => {
  const tokenize = seal(tokenizerForModel('gpt-4o'));
  const renderContext = createRenderContext();
  const rendered = await renderContext
    .render(
      <>
        <functionDefinition
          name="myAwesomeFunction"
          parameters={{
            type: 'object',
            properties: {
              test: { type: 'boolean' },
            },
          }}
        >
          Does some awesome stuff.
        </functionDefinition>
        <user>Hello, world!</user>
        {async () => <assistant>Hello, world!</assistant>}
        <functionCall id="1" name="myAwesomeFunction">
          {'{'} "test": true {'}'}
        </functionCall>
        <functionResponse id="1">
          {'{'} "test": true {'}'}
        </functionResponse>
      </>,
    )
    .untilComplete();
  expect(tokenize(rendered)).toBe(58);
  expect(Array.from(rendered.flat(isChatElement)).map(tokenize)).toEqual([22, 7, 7, 13, 9]);
});
