import { isChatElement } from '@ai-jsx/core/chat';
import { OpenAIChatModel } from './index.js';
import { it, expect } from 'vitest';
import { AINode, createRenderContext, RenderElement, RenderNode } from '@ai-jsx/core';

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

it('handles strict functions', { timeout: 10000 }, async () => {
  const ctx = createRenderContext();
  const result = ctx.render(
    <OpenAIChatModel model="gpt-3.5-turbo">
      <functionDefinition
        name="turnOffLights"
        parameters={{
          type: 'object',
          properties: { room: { type: 'string', enum: ['bedroom', 'kitchen'] } },
          additionalProperties: false,
          required: ['room'],
        }}
        strict
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

it('handles multiple concurrent function calls', async () => {
  const ctx = createRenderContext();
  const prompt = (
    <>
      <functionDefinition
        name="turnOffLights"
        parameters={{ type: 'object', properties: { room: { type: 'string', enum: ['bedroom', 'kitchen'] } } }}
      >
        Turns off the lights in a room.
      </functionDefinition>
      <user>Turn off the lights in the bedroom and the kitchen.</user>
    </>
  );
  const functionCalls = ctx.render(<OpenAIChatModel model="gpt-3.5-turbo">{prompt}</OpenAIChatModel>);
  const isFunctionCall = (node: RenderNode): node is RenderElement<'functionCall'> =>
    typeof node === 'object' && node.type === 'functionCall';

  let messages = 0;
  const allParsed: Array<{ room: string }> = [];
  const functionResponses: Array<AINode> = [];

  for await (const node of functionCalls.flat(isChatElement)) {
    if (node.type === 'assistant') {
      continue;
    }
    ++messages;
    expect(node.type).toBe('functionCall');
    expect(node.attributes.name).toBe('turnOffLights');
    const parsed = JSON.parse(await node.text());
    expect([{ room: 'bedroom' }, { room: 'kitchen' }]).toContainEqual(parsed);
    expect(allParsed).not.toContainEqual(parsed);
    allParsed.push(parsed);
    functionResponses.push(
      <functionResponse id={node.attributes.id} name={node.attributes.name}>
        OK
      </functionResponse>,
    );
  }

  expect(messages).toBe(2);

  const synthesis = ctx.render(
    <OpenAIChatModel model="gpt-3.5-turbo">
      {prompt}
      {functionCalls.flat(isFunctionCall)}
      {functionResponses}
    </OpenAIChatModel>,
  );
  messages = 0;
  for await (const node of synthesis.flat(isChatElement)) {
    ++messages;
    expect(node.type).toBe('assistant');
  }
  expect(messages).toBe(1);

  // It should also work properly if there's an assistant message in between.
  const synthesis2 = ctx.render(
    <OpenAIChatModel model="gpt-3.5-turbo">
      {prompt}
      <assistant>Okay, let me do that for you.</assistant>
      {functionCalls.flat(isFunctionCall)}
      {functionResponses}
    </OpenAIChatModel>,
  );
  for await (const node of synthesis2.flat(isChatElement)) {
    expect(node.type).toBe('assistant');
  }
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
