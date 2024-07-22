import { isChatElement } from '@ai-jsx/core/chat';
import { AnthropicChatModel } from './index.js';
import { it, expect } from 'vitest';
import { createRenderContext } from '@ai-jsx/core';

it('streams a simple chat completion', async () => {
  const ctx = createRenderContext();
  const result = ctx.render(
    <AnthropicChatModel model="claude-3-haiku-20240307">
      <system>Start every message with the word "Dude".</system>
      <user>Hello, how are you?</user>
    </AnthropicChatModel>,
  );

  let messages = 0;
  let accumulated = '';
  for await (const node of result.flat(isChatElement)) {
    ++messages;
    expect(node.type).toBe('assistant');
    let chunks = 0;
    for await (const chunk of node.text()) {
      ++chunks;
      accumulated += chunk;
    }

    expect(chunks).toBeGreaterThan(1);
  }

  expect(messages).toBe(1);
  expect(accumulated).toMatch(result.toString());
  expect(result.toString()).toContain('Dude');
});

it('streams a function call', async () => {
  const ctx = createRenderContext();
  const result = ctx.render(
    <AnthropicChatModel model="claude-3-haiku-20240307">
      <functionDefinition
        name="turnOffLights"
        parameters={{ type: 'object', properties: { room: { type: 'string', enum: ['bedroom', 'kitchen'] } } }}
      >
        Turns off the lights in a room.
      </functionDefinition>
      <user>Turn off the lights in the bedroom.</user>
    </AnthropicChatModel>,
  );

  let functionCalls = 0;
  for await (const node of result.flat(isChatElement)) {
    if (node.type === 'assistant') {
      // Anthropic might respond with an assistant message before making the function call.
      continue;
    }
    expect(node.type).toBe('functionCall');
    expect(node.attributes.name).toBe('turnOffLights');
    ++functionCalls;

    let chunks = 0;
    let accumulated = '';
    for await (const chunk of node.text()) {
      ++chunks;
      accumulated += chunk;
    }

    expect(chunks).toBeGreaterThan(1);
    expect(JSON.parse(accumulated)).toStrictEqual({ room: 'bedroom' });
  }

  expect(functionCalls).toBe(1);
});

it('handles function synthesis', async () => {
  const ctx = createRenderContext();
  const result = ctx.render(
    <AnthropicChatModel model="claude-3-haiku-20240307">
      <functionDefinition
        name="turnOffLights"
        parameters={{ type: 'object', properties: { room: { type: 'string', enum: ['bedroom', 'kitchen'] } } }}
      >
        Turns off the lights in a room.
      </functionDefinition>
      <user>Turn off the lights in the bedroom.</user>
      <functionCall id="1" name="turnOffLights">
        {JSON.stringify({ room: 'bedroom' })}
      </functionCall>
      <functionResponse id="1" name="turnOffLights">
        OK
      </functionResponse>
    </AnthropicChatModel>,
  );

  let messages = 0;
  let accumulated = '';
  for await (const node of result.flat(isChatElement)) {
    ++messages;
    expect(node.type).toBe('assistant');

    let chunks = 0;
    for await (const chunk of node.text()) {
      ++chunks;
      accumulated += chunk;
    }

    expect(chunks).toBeGreaterThan(1);
  }

  expect(messages).toBe(1);
  expect(accumulated).toMatch(result.toString());
});
