import { isChatElement } from '@ai-jsx/core/chat';
import { OpenAIChatModel } from './index.js';
import { it, expect } from 'vitest';
import { createRenderContext } from '@ai-jsx/core';

it('streams a simple chat completion', async () => {
  const ctx = createRenderContext();
  const result = ctx.render(
    <OpenAIChatModel model="gpt-3.5-turbo">
      <user>Hello, how are you?</user>
    </OpenAIChatModel>,
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

it('streams a function call', async () => {
  const ctx = createRenderContext();
  const result = ctx.render(
    <OpenAIChatModel model="gpt-3.5-turbo">
      <functionDefinition
        name="turnOffLights"
        parameters={{ type: 'object', properties: { room: { type: 'string', enum: ['bedroom', 'kitchen'] } } }}
      >
        Turns off the lights in a room.
      </functionDefinition>
      <user>Turn off the lights in the bedroom.</user>
    </OpenAIChatModel>,
  );

  let messages = 0;
  let accumulated = '';
  for await (const node of result.flat(isChatElement)) {
    ++messages;
    expect(node.type).toBe('functionCall');
    expect(node.attributes.name).toBe('turnOffLights');

    let chunks = 0;
    for await (const chunk of node.text()) {
      ++chunks;
      accumulated += chunk;
    }

    expect(chunks).toBeGreaterThan(1);
    expect(JSON.parse(accumulated)).toStrictEqual({ room: 'bedroom' });
  }

  expect(messages).toBe(1);
  expect(accumulated).toMatch(result.toString());
});

it('handles function synthesis', async () => {
  const ctx = createRenderContext();
  const result = ctx.render(
    <OpenAIChatModel model="gpt-3.5-turbo">
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
    </OpenAIChatModel>,
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

it('handles images', { timeout: 10000 }, async () => {
  const result = await createRenderContext()
    .render(
      <OpenAIChatModel model="gpt-4o">
        <system>Answer questions with a single word "Yes" or "No".</system>
        <user>
          Does the following show the moon?
          <image src="https://upload.wikimedia.org/wikipedia/commons/8/89/Apollo_11_bootprint.jpg" detail="low" />
        </user>
      </OpenAIChatModel>,
    )
    .untilComplete();

  expect(result.toString()).toContain('Yes');
});
