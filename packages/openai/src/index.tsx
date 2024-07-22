import { ChatCompletionProps, ChatElement, chatTokenizer, isChatElement } from '@ai-jsx/core/chat';
import { AINode, ComponentContext, createContext, RenderElement, RenderIterable, TokenizerImplFn } from '@ai-jsx/core';
import { OpenAI } from 'openai';
export { OpenAI, AzureOpenAI } from 'openai';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore https://github.com/arethetypeswrong/arethetypeswrong.github.io/blob/main/docs/problems/FalseESM.md
import { getEncoding, getEncodingNameForModel, Tiktoken, TiktokenEncoding, TiktokenModel } from 'js-tiktoken';

export const OpenAIClient = {
  ...createContext(
    (() => {
      let client: OpenAI | undefined = undefined;
      return () => {
        if (!client) {
          client = new OpenAI();
        }
        return client;
      };
    })(),
  ),
  Provider: ({ value, children }: { value: OpenAI; children: AINode }, { setContext }: ComponentContext) =>
    setContext(OpenAIClient, () => value).create(OpenAIClient.symbol, { value }, children),
};

const cachedEncodings = new Map<string, Tiktoken>();
cachedEncodings.set('cl100k_base', getEncoding('cl100k_base'));
cachedEncodings.set('o200k_base', getEncoding('o200k_base'));

function userMessageParts(message: RenderElement<'user'>): (string | RenderElement<'image'>)[] {
  const chunks: (string | RenderElement<'image'>)[] = [];

  for (const textOrImage of message.flat(
    (n): n is string | RenderElement<'image'> => typeof n === 'string' || n.type === 'image',
  )) {
    if (typeof textOrImage === 'object') {
      chunks.push(textOrImage);
      continue;
    }
    const currentChunk = chunks.at(-1);
    if (typeof currentChunk !== 'string') {
      chunks.push(textOrImage);
    } else {
      chunks[chunks.length - 1] = currentChunk + textOrImage;
    }
  }

  return chunks;
}

export function getEncodingForModel(model: TiktokenModel): Tiktoken {
  let encoding: TiktokenEncoding = 'cl100k_base';
  try {
    encoding = getEncodingNameForModel(model);
  } catch {
    // Do nothing, use cl100k_base.
  }

  if (!cachedEncodings.has(encoding)) {
    cachedEncodings.set(encoding, getEncoding(encoding));
  }

  return cachedEncodings.get(encoding)!;
}

export function tokenizerForModel(model: TiktokenModel): TokenizerImplFn {
  const tiktoken = getEncodingForModel(model);

  const chatMessageTokenizer = chatTokenizer((node, self) => {
    if (typeof node === 'string') {
      return tiktoken.encode(node).length;
    }

    const TOKENS_PER_MESSAGE = 3;
    const TOKENS_PER_NAME = 1;

    switch (node.type) {
      case 'user': {
        return (
          TOKENS_PER_MESSAGE +
          userMessageParts(node).reduce(
            (sum, chunk) => sum + self(chunk),
            node.attributes.name ? TOKENS_PER_NAME + self(node.attributes.name) : 0,
          )
        );
      }
      case 'assistant':
      case 'system':
      case 'functionCall':
        return (
          TOKENS_PER_MESSAGE +
          self(node.toString()) +
          (node.attributes.name ? TOKENS_PER_NAME + self(node.attributes.name) : 0)
        );
      case 'functionResponse':
        return TOKENS_PER_MESSAGE + self(node.toString());
      case 'functionDefinition':
        // According to https://community.openai.com/t/how-to-calculate-the-tokens-when-using-function-call/266573
        // function definitions are serialized as TypeScript. We'll use JSON-serialization as an approximation (which
        // is almost certainly an overestimate).
        return self(node.attributes.name) + self(node.toString()) + self(JSON.stringify(node.attributes.parameters));
      default: {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const _: never = node;
        return 0;
      }
    }
  });

  return (node, self) => {
    if (typeof node === 'object' && node.type == 'image') {
      if (node.attributes.detail === 'high') {
        // Assume 6 tiles.
        return 6 * 170 + 85;
      }

      // Otherwise assume low detail.
      return 85;
    }

    return chatMessageTokenizer(node, self);
  };
}

/**
 * Identifies any FunctionCall/FunctionResponse IDs that should be represented as ID-less function calls in the completion request.
 */
function getUnmatchedFunctionIds(messages: ChatElement[]): Set<string> {
  let activeFunctionCalls: string[] = [];
  let activeFunctionResponses: string[] = [];
  const unmatchedIds = new Set<string>(); // IDs that should be represented as ID-less function calls because they were part of an unmatched block.

  const flushActiveIds = () => {
    if (activeFunctionCalls.length === 0 && activeFunctionResponses.length === 0) {
      return;
    }

    const dedupedFunctionCalls = new Set(activeFunctionCalls);
    const dedupedFunctionResponses = new Set(activeFunctionResponses);

    // If there were any duplicated IDs, or any IDs were in one set but not the other, _all_ the IDs are invalid.
    const isInvalid =
      dedupedFunctionCalls.size !== activeFunctionCalls.length ||
      dedupedFunctionResponses.size !== activeFunctionResponses.length ||
      !activeFunctionCalls.every((id) => dedupedFunctionResponses.has(id)) ||
      !activeFunctionResponses.every((id) => dedupedFunctionCalls.has(id));

    if (isInvalid) {
      for (const id of activeFunctionCalls) {
        unmatchedIds.add(id);
      }
      for (const id of activeFunctionResponses) {
        unmatchedIds.add(id);
      }
    }

    activeFunctionCalls = [];
    activeFunctionResponses = [];
  };

  for (const message of messages) {
    if (message.type === 'functionCall') {
      if (activeFunctionResponses.length > 0) {
        flushActiveIds();
      }

      const id = message.attributes.id;
      if (id) {
        activeFunctionCalls.push(id);
      }
    } else if (message.type === 'functionResponse') {
      const id = message.attributes.id;
      if (id) {
        activeFunctionResponses.push(id);
      }
    } else {
      flushActiveIds();
    }
  }
  flushActiveIds();

  return unmatchedIds;
}

/**
 * Coalesces adjacent assistant messages with tool calls into single messages.
 */
function coalesceToolCallMessages(
  messages: OpenAI.Chat.ChatCompletionMessageParam[],
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const mergedMessages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

  for (const message of messages) {
    if (message.role === 'assistant' && message.tool_calls && message.content === '') {
      const lastMessage = mergedMessages.at(-1);
      if (lastMessage?.role === 'assistant' && lastMessage.tool_calls) {
        // Merge with the last message.
        lastMessage.tool_calls.push(...message.tool_calls);
      }
    }
    mergedMessages.push(message);
  }

  return mergedMessages;
}

export async function* OpenAIChatModel(
  props: ChatCompletionProps & { model: string; forcedFunction?: string },
  { getContext, render, logger }: ComponentContext,
): RenderIterable {
  // OpenAI requires that tool calls with IDs be immediately followed by tool messages with the corresponding IDs.
  // Walk through the conversation to find IDs that don't match up. Anything that doesn't match will be represented
  // as ID-less function calls.
  const children = render(props.children);
  if (!children.isComplete()) {
    await children.untilComplete();
  }

  const conversationMessages = Array.from(children.flat(isChatElement));
  const unmatchedFunctionCallIds = getUnmatchedFunctionIds(conversationMessages);

  const messages = conversationMessages
    .filter(
      (message): message is Exclude<ChatElement, { type: 'functionDefinition' }> =>
        message.type !== 'functionDefinition',
    )
    .map((message): OpenAI.Chat.ChatCompletionMessageParam => {
      switch (message.type) {
        case 'user': {
          const chunks: OpenAI.Chat.ChatCompletionContentPart[] = userMessageParts(message).map((part) =>
            typeof part === 'string'
              ? { type: 'text', text: part }
              : { type: 'image_url', image_url: { url: part.attributes.src, detail: part.attributes.detail } },
          );
          return {
            role: message.type,
            content: chunks.length === 1 && chunks[0].type === 'text' ? chunks[0].text : chunks,
          };
        }
        case 'system':
        case 'assistant':
          return {
            role: message.type,
            content: message.toString(),
          };
        case 'functionCall':
          if (message.attributes.id && !unmatchedFunctionCallIds.has(message.attributes.id)) {
            // N.B. Adjacent tool calls will be coalesced below.
            return {
              role: 'assistant',
              content: '',
              tool_calls: [
                {
                  type: 'function',
                  function: {
                    name: message.attributes.name,
                    arguments: message.toString(),
                  },
                  id: message.attributes.id,
                },
              ],
            };
          }

          return {
            role: 'assistant',
            content: '',
            function_call: {
              name: message.attributes.name,
              arguments: message.toString(),
            },
          };
        case 'functionResponse':
          if (message.attributes.id && !unmatchedFunctionCallIds.has(message.attributes.id)) {
            return {
              role: 'tool',
              tool_call_id: message.attributes.id,
              content: message.toString(),
            };
          }

          return {
            role: 'function',
            name: message.attributes.name,
            content: message.toString(),
          };
      }
    });

  const mergedMessages = coalesceToolCallMessages(messages);
  const openaiTools = conversationMessages
    .filter((m): m is ChatElement & { type: 'functionDefinition' } => m.type === 'functionDefinition')
    .map<OpenAI.Chat.ChatCompletionTool>((m) => ({
      function: {
        name: m.attributes.name,
        description: m.toString(),
        parameters: m.attributes.parameters as unknown as OpenAI.FunctionParameters,
      },
      type: 'function',
    }));

  const openai = getContext(OpenAIClient)();
  const chatCompletionRequest: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
    model: props.model,
    max_tokens: props.maxTokens,
    temperature: props.temperature,
    messages: mergedMessages,
    tools: openaiTools.length > 0 ? openaiTools : undefined,
    tool_choice: props.forcedFunction
      ? { function: { name: props.forcedFunction }, type: 'function' as const }
      : undefined,
    stop: props.stop,
    stream: true as const,
  };

  logger.debug({ chatCompletionRequest }, 'Calling createChatCompletion');
  const chatResponse = await openai.chat.completions.create(chatCompletionRequest);
  const iterator = chatResponse[Symbol.asyncIterator]();

  async function nextChoice() {
    // Eat any empty chunks, typically seen at the beginning of the stream.
    let next;
    do {
      next = await iterator.next();
      if (next.done) {
        return { delta: null };
      }
    } while (next.value.choices.length == 0);

    logger.trace({ deltaMessage: next.value }, 'Got delta message');
    return next.value.choices[0];
  }

  let { delta, ...choice } = await nextChoice();
  while (delta !== null) {
    if (delta.tool_calls?.[0].id) {
      const currentId = delta.tool_calls[0].id;

      // Emit content for the current tool call until either there's a delta without any tool_calls, or the tool_call ID changes.
      const currentToolCall = () =>
        delta?.tool_calls &&
        delta.tool_calls.length > 0 &&
        (delta.tool_calls[0].id === undefined || delta.tool_calls[0].id === currentId)
          ? delta.tool_calls[0]
          : null;

      // Collect the name of the function call.
      let name: string = '';
      for (;;) {
        const toolCall = currentToolCall();
        if (!toolCall) {
          break;
        }

        if (toolCall.function?.name) {
          name += toolCall.function.name;
        } else if (toolCall.function?.arguments) {
          break;
        }

        ({ delta, ...choice } = await nextChoice());
      }

      const functionCall = yield (
        <functionCall id={currentId} name={name}>
          {async function* (): RenderIterable {
            while (true) {
              const toolCall = currentToolCall();
              if (!toolCall) {
                break;
              }

              yield toolCall.function?.arguments;
              ({ delta, ...choice } = await nextChoice());
            }
          }}
        </functionCall>
      );
      await (functionCall as RenderElement).untilComplete();
    } else if (delta.content) {
      const assistantMessage = yield (
        <assistant>
          {async function* () {
            while (delta && !delta.tool_calls) {
              if (delta.content) {
                yield delta.content;
              }
              ({ delta, ...choice } = await nextChoice());
            }
          }}
        </assistant>
      );
      await (assistantMessage as RenderElement).untilComplete();
    } else if ('finish_reason' in choice && choice.finish_reason) {
      yield <finishReason reason={choice.finish_reason} />;
      ({ delta, ...choice } = await nextChoice());
    } else {
      ({ delta, ...choice } = await nextChoice());
    }
  }
}
