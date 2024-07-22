import { AINode, ComponentContext, createContext, RenderIterable } from '@ai-jsx/core';
import { ChatCompletionProps, isChatElement } from '@ai-jsx/core/chat';

import { Anthropic } from '@anthropic-ai/sdk';
export { Anthropic } from '@anthropic-ai/sdk';

export const AnthropicClient = {
  ...createContext(
    (() => {
      let client: Anthropic | undefined = undefined;
      return () => {
        if (!client) {
          client = new Anthropic();
        }
        return client;
      };
    })(),
  ),
  Provider: ({ value, children }: { value: Anthropic; children: AINode }, { setContext }: ComponentContext) =>
    setContext(AnthropicClient, () => value).create(AnthropicClient.symbol, { value }, children),
};

export async function* AnthropicChatModel(
  {
    children,
    model,
    maxTokens = 1000,
    ...props
  }: {
    children: AINode;
    model: Anthropic.MessageCreateParams['model'];
  } & ChatCompletionProps,
  { render, getContext, logger }: ComponentContext,
): RenderIterable {
  const client = getContext(AnthropicClient)();
  const renderedChildren = await render(children).untilComplete();

  const messages: Array<
    Anthropic.MessageParam & {
      content: Array<
        | Anthropic.TextBlockParam
        | Anthropic.ImageBlockParam
        | Anthropic.ToolUseBlockParam
        | Anthropic.ToolResultBlockParam
      >;
    }
  > = [];

  let systemPrompt = '';
  const tools: Anthropic.Tool[] = [];

  for (const node of renderedChildren.flat(isChatElement)) {
    const merge = (msg: (typeof messages)[number]) => {
      const lastMessage = messages.at(-1);
      if (lastMessage && lastMessage.role === msg.role) {
        lastMessage.content.push(...msg.content);
      } else {
        messages.push(msg);
      }
    };
    switch (node.type) {
      case 'system':
        systemPrompt += node.toString();
        break;
      case 'user':
      case 'assistant':
        merge({
          role: node.type,
          content: [{ type: 'text', text: node.toString() }],
        });
        break;
      case 'functionDefinition':
        tools.push({
          name: node.attributes.name,
          input_schema: node.attributes.parameters as Anthropic.Tool['input_schema'],
          description: node.toString(),
        });
        break;
      case 'functionCall':
        merge({
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: node.attributes.id,
              name: node.attributes.name,
              input: JSON.parse(node.toString()),
            },
          ],
        });
        break;
      case 'functionResponse':
        merge({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: node.attributes.id,
              content: node.toString(),
              is_error: node.attributes.failed,
            },
          ],
        });
        break;
    }
  }

  const messageStream = client.messages.stream({
    model,
    max_tokens: maxTokens,
    messages,
    system: systemPrompt,
    tools,
    temperature: props.temperature,
    stop_sequences: props.stop,
  });

  const iterator = messageStream[Symbol.asyncIterator]();
  async function next() {
    const result = await iterator.next();
    if (!result.done) {
      logger.trace({ message: result.value }, 'Got Anthropic stream event');
    }
    return result;
  }
  let current = await next();
  while (!current.done) {
    switch (current.value.type) {
      case 'message_start':
      case 'message_stop':
        break;
      case 'message_delta':
        if (current.value.delta.stop_reason) {
          yield <finishReason reason={current.value.delta.stop_reason} sequence={current.value.delta.stop_sequence} />;
        }
        break;
      case 'content_block_start':
        if (current.value.content_block.type === 'text') {
          const assistantMessage = render(
            <assistant>
              {async function* () {
                current = await next();
                while (!current.done) {
                  switch (current.value.type) {
                    case 'content_block_delta':
                      if (current.value.delta.type === 'text_delta') {
                        yield current.value.delta.text;
                      } else {
                        return;
                      }
                      break;
                    case 'content_block_start':
                    case 'content_block_stop':
                      return;
                  }

                  current = await next();
                }
              }}
            </assistant>,
          );
          yield assistantMessage;
          await assistantMessage.untilComplete();
          continue;
        } else if (current.value.content_block.type === 'tool_use') {
          const functionCall = render(
            <functionCall id={current.value.content_block.id} name={current.value.content_block.name}>
              {async function* () {
                current = await next();
                while (!current.done) {
                  switch (current.value.type) {
                    case 'content_block_delta':
                      if (current.value.delta.type === 'input_json_delta') {
                        yield current.value.delta.partial_json;
                      } else {
                        return;
                      }
                      break;
                    case 'content_block_start':
                    case 'content_block_stop':
                      return;
                  }

                  current = await next();
                }
              }}
            </functionCall>,
          );
          yield functionCall;
          await functionCall.untilComplete();
          continue;
        }
        break;
      case 'content_block_delta':
        break;
      case 'content_block_stop':
        break;
    }

    current = await next();
  }
}
