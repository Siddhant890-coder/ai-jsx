import { createRenderContext } from '@ai-jsx/core';
import { LegacyOpenAIChatModel, renderToConversation, UserMessage } from './index.js';
import { expect, it } from 'vitest';

it('supports function definitions', async () => {
  const context = createRenderContext();
  const conversationMessages = await renderToConversation(
    <LegacyOpenAIChatModel
      model="gpt-3.5-turbo"
      functionDefinitions={{
        turnOffLights: {
          description: 'Turns off the lights',
          parameters: {
            type: 'object',
            properties: {
              room: {
                type: 'string',
                enum: ['living room', 'kitchen'],
                description: 'The room to turn off the lights in',
              },
            },
          },
        },
      }}
    >
      <UserMessage>Turns off the lights in the living room.</UserMessage>
    </LegacyOpenAIChatModel>,
    context.render,
  );

  expect(conversationMessages[0].type).toBe('functionCall');
  expect(conversationMessages[0].element.props.name).toBe('turnOffLights');
  expect(JSON.parse(conversationMessages[0].element.toString())).toEqual({ room: 'living room' });
});
