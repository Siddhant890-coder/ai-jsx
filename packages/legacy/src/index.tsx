export * from '@ai-jsx/core';
import {
  AIComponent,
  AIElement,
  AINode,
  ComponentContext,
  ContextWithProvider,
  RenderElement,
  RenderElementType,
  RenderIterable,
} from '@ai-jsx/core';
import { ChatCompletionProps, ChatElement, ChatModel, isChatElement } from '@ai-jsx/core/chat';
import { Tokenizer, cachedTokenizer } from '@ai-jsx/core/tokenizer';
import { OpenAIChatModel, tokenizerForModel } from '@ai-jsx/openai';
import { ShrinkConversation } from '@ai-jsx/shrinkable';
import { type JSONSchema7 } from 'json-schema';

export type Node = AINode;
export type Element<P> = AIElement<P>;
export type Component<P> = AIComponent<P>;

export interface FunctionDefinition {
  description?: string;
  parameters: JSONSchema7 & { type?: 'object' };
}

export type Context<T> = ContextWithProvider<T>;

function defaultMaxInputTokensForModel(model: string): number {
  const TOKENS_CONSUMED_BY_REPLY_PREFIX = 3;
  switch (model) {
    case 'gpt-4':
    case 'gpt-4-0613':
      return 8192 - TOKENS_CONSUMED_BY_REPLY_PREFIX;
    case 'gpt-4-32k':
    case 'gpt-4-32k-0613':
      return 32768 - TOKENS_CONSUMED_BY_REPLY_PREFIX;
    case 'gpt-4-1106-preview':
    case 'gpt-4-0125-preview':
    case 'gpt-4-turbo-preview':
    case 'gpt-4-turbo-2024-04-09':
    case 'gpt-4-turbo':
    case 'gpt-4-vision-preview':
    case 'gpt-4-1106-vision-preview':
      return 128_000 - TOKENS_CONSUMED_BY_REPLY_PREFIX;
    case 'gpt-3.5-turbo-0301':
    case 'gpt-3.5-turbo-0613':
      return 4096 - TOKENS_CONSUMED_BY_REPLY_PREFIX;
    case 'gpt-3.5-turbo':
    case 'gpt-3.5-turbo-16k':
    case 'gpt-3.5-turbo-16k-0613':
    case 'gpt-3.5-turbo-1106':
    case 'gpt-3.5-turbo-0125':
      return 16384 - TOKENS_CONSUMED_BY_REPLY_PREFIX;
    default: {
      return 16384 - TOKENS_CONSUMED_BY_REPLY_PREFIX;
    }
  }
}

export function LegacyOpenAIChatModel({
  functionDefinitions,
  model,
  maxTokens,
  reservedTokens,
  maxInputTokens = defaultMaxInputTokensForModel(model) - (reservedTokens ?? maxTokens ?? 0),
  ...props
}: {
  functionDefinitions?: Record<string, FunctionDefinition>;
  model: string;
  reservedTokens?: number;
  maxInputTokens?: number;
} & ChatCompletionProps) {
  return (
    <OpenAIChatModel model={model} maxTokens={maxTokens} {...props}>
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <Tokenizer.Provider value={cachedTokenizer(tokenizerForModel(model as any))}>
        <ShrinkConversation maximumLength={maxInputTokens}>
          {Object.entries(functionDefinitions ?? {}).map(([name, { description, parameters }]) => (
            <functionDefinition name={name} parameters={parameters}>
              {description}
            </functionDefinition>
          ))}
          {props.children}
        </ShrinkConversation>
      </Tokenizer.Provider>
    </OpenAIChatModel>
  );
}

export const UserMessage = 'user' as const;
export const AssistantMessage = 'assistant' as const;
export const SystemMessage = 'system' as const;
export function FunctionCall({
  id,
  name,
  args,
}: {
  name: string;
  id?: string;
  partial?: boolean;
  args: Record<string, string | number | boolean | null>;
  metadata?: Record<string, unknown>;
}) {
  return (
    <functionCall id={id ?? name} name={name}>
      {JSON.stringify(args)}
    </functionCall>
  );
}
export function FunctionResponse({
  id,
  name,
  children,
  failed,
  metadata,
}: {
  id?: string;
  name: string;
  failed?: boolean;
  children: AINode;
  metadata?: Record<string, unknown>;
}) {
  return (
    <functionResponse id={id ?? name} name={name} failed={failed} metadata={metadata}>
      {children}
    </functionResponse>
  );
}

type SingleConversationMessage<T> = T extends RenderElementType
  ? {
      type: T;
      element: RenderElement<T> & { props: RenderElement<T>['attributes'] };
    }
  : never;

export type ConversationMessage = SingleConversationMessage<ChatElement['type']>;

function toConversationMessage(chatElement: ChatElement): ConversationMessage {
  return { type: chatElement.type, element: Object.create(chatElement, { props: { value: chatElement.attributes } }) };
}

export async function renderToConversation(
  conversation: AINode,
  render: ComponentContext['render'],
): Promise<ConversationMessage[]> {
  const rendered = render(conversation);
  if (!rendered.isComplete()) {
    await rendered.untilComplete();
  }
  return Array.from(rendered.flat(isChatElement), toConversationMessage);
}

export async function* ShowConversation(
  {
    children: children,
    present,
    onComplete,
  }: {
    children: AINode;
    present?: (message: ConversationMessage, index: number) => AINode;
    onComplete?: (conversation: ConversationMessage[], render: ComponentContext['render']) => Promise<void> | void;
  },
  { render }: ComponentContext,
): RenderIterable {
  let index = 0;
  const renderedChildren = render(children);
  if (present) {
    for await (const message of renderedChildren.flat(isChatElement)) {
      yield present(toConversationMessage(message), index);
      index++;
    }
  } else {
    yield renderedChildren;
  }
  await renderedChildren.untilComplete();
  if (onComplete) {
    await onComplete(Array.from(renderedChildren.flat(isChatElement), toConversationMessage), render);
  }
}

export async function* Converse(
  {
    reply,
    children,
  }: {
    reply: (messages: ConversationMessage[], fullConversation: ConversationMessage[], isFirstRound: boolean) => AINode;
    children: AINode;
  },
  { render }: ComponentContext,
): RenderIterable {
  let previous = await render(children)
    .untilComplete()
    .then((r) => Array.from(r.flat(isChatElement), toConversationMessage));
  const results = [...previous];
  let isFirstRound = true;
  do {
    const rendered = render(reply(previous, results, isFirstRound));
    isFirstRound = false;
    yield rendered;
    previous = await rendered.untilComplete().then((r) => Array.from(r.flat(isChatElement), toConversationMessage));
    results.push(...previous);
  } while (previous.length > 0);
}

export const ChatProvider = ChatModel.Provider;
