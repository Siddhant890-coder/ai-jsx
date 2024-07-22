import { createRenderContext, AINode } from './index.js';
import { ChatCompletion, ChatModel } from './chat.js';
import { it, expect } from 'vitest';

it('allows specifying default chat props', () => {
  const ctx = createRenderContext();
  const result = ctx.render(
    <ChatModel.Provider value={({ result }: { result?: AINode; children: AINode }) => result} result="PASS">
      <ChatCompletion>Test</ChatCompletion>
    </ChatModel.Provider>,
  );
  expect(result.toString()).toBe('PASS');
});

it('prioritizes props on ChatCompletion', () => {
  const ctx = createRenderContext();
  const result = ctx.render(
    <ChatModel.Provider value={({ result }: { result?: AINode; children: AINode }) => result} result="FAIL">
      <ChatCompletion result="PASS">Test</ChatCompletion>
    </ChatModel.Provider>,
  );
  expect(result.toString()).toBe('PASS');
});

it('prioritizes innner provider props', () => {
  const ctx = createRenderContext();
  const result = ctx.render(
    <ChatModel.Provider value={({ result }: { result?: AINode; children: AINode }) => result} result="FAIL">
      <ChatModel.Provider result="PASS">
        <ChatCompletion>Test</ChatCompletion>
      </ChatModel.Provider>
    </ChatModel.Provider>,
  );
  expect(result.toString()).toBe('PASS');
});

it('requires model-specific props to be set', () => {
  // @ts-expect-error The required prop is missing
  <ChatModel.Provider value={({ required }: { required: string; children: AINode }) => required}>
    Test
  </ChatModel.Provider>;
});
