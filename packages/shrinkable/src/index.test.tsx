import { createRenderContext } from '@ai-jsx/core';
import { chatTokenizer } from '@ai-jsx/core/chat';
import { Shrinkable, ShrinkConversation } from './index.js';
import { test, expect } from 'vitest';
import { Tokenizer } from '@ai-jsx/core/tokenizer';

const tokenizer = chatTokenizer((node) => node.toString().length);

test('ShrinkConversation does not shrink without Shrinkable', async () => {
  const renderContext = createRenderContext();
  const node = await renderContext
    .render(
      <Tokenizer.Provider value={tokenizer}>
        <ShrinkConversation maximumLength={4}>
          <user>Hello, user!</user>
          <assistant>Hello, assistant!</assistant>
        </ShrinkConversation>
      </Tokenizer.Provider>,
    )
    .untilComplete();
  expect(node.toString()).toBe('Hello, user!Hello, assistant!');
});

test('ShrinkConversation shrinks until shrinkables are replaced', async () => {
  const renderContext = createRenderContext();
  const node = await renderContext
    .render(
      <Tokenizer.Provider value={tokenizer}>
        <ShrinkConversation maximumLength={4}>
          <Shrinkable>
            <user>Hello, user!</user>
          </Shrinkable>
          <assistant>Hello, assistant!</assistant>
        </ShrinkConversation>
      </Tokenizer.Provider>,
    )
    .untilComplete();
  expect(node.toString()).toBe('Hello, assistant!');
});

test('ShrinkConversation prioritizes importance', async () => {
  const renderContext = createRenderContext();
  const node = await renderContext
    .render(
      <Tokenizer.Provider value={tokenizer}>
        <ShrinkConversation maximumLength={20}>
          <Shrinkable importance={1}>
            <user>Hello, user!</user>
          </Shrinkable>
          <Shrinkable importance={0}>
            <assistant>Hello, assistant!</assistant>
          </Shrinkable>
        </ShrinkConversation>
      </Tokenizer.Provider>,
    )
    .untilComplete();
  expect(node.toString()).toBe('Hello, user!');
});

test('ShrinkConversation works inside chat components', async () => {
  const renderContext = createRenderContext();
  const node = await renderContext
    .render(
      <Tokenizer.Provider value={tokenizer}>
        <ShrinkConversation maximumLength={0}>
          <user>
            Hello,{' '}
            <Shrinkable importance={1} replacement="replaced!">
              user!
            </Shrinkable>
          </user>
          <Shrinkable importance={0}>
            <assistant>Hello, assistant!</assistant>
          </Shrinkable>
        </ShrinkConversation>
      </Tokenizer.Provider>,
    )
    .untilComplete();
  expect(node.toString()).toBe('Hello, replaced!');
});
