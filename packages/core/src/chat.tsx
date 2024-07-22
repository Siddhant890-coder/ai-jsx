import {
  AIComponent,
  AINode,
  ComponentContext,
  RenderElement,
  RenderNode,
  TokenizerFn,
  TokenizerImplFn,
} from './types.js';

export interface ChatCompletionProps {
  children: AINode;
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
}
const DefaultChatCompletion: AIComponent<ChatCompletionProps> = () => {
  throw new Error('No completion model defined');
};

export const ChatModel = {
  Provider: <C extends ChatCompletionProps = ChatCompletionProps>(
    { value, children, ...implicitProps }: { value?: AIComponent<C> } & C,
    { getContext, setContext }: ComponentContext,
  ) => {
    const Component = (value as AIComponent<ChatCompletionProps>) ?? getContext(ChatModel);
    const BoundComponent = (explicitProps: ChatCompletionProps) => <Component {...implicitProps} {...explicitProps} />;
    return setContext(ChatModel, BoundComponent).create(ChatModel.symbol, { value, props: implicitProps }, children);
  },
  default: DefaultChatCompletion,
  symbol: Symbol('ai.jsx.ChatModel'),
};

export function ChatCompletion<T extends ChatCompletionProps>(props: T, { getContext }: ComponentContext): AINode {
  const Component = getContext(ChatModel);
  return <Component {...props} />;
}

export type ChatElement =
  | RenderElement<'user'>
  | RenderElement<'assistant'>
  | RenderElement<'system'>
  | RenderElement<'functionCall'>
  | RenderElement<'functionResponse'>
  | RenderElement<'functionDefinition'>;

export function isChatElement(renderNode: RenderNode): renderNode is ChatElement {
  if (typeof renderNode === 'object') {
    switch (renderNode.type) {
      case 'user':
      case 'assistant':
      case 'system':
      case 'functionCall':
      case 'functionResponse':
      case 'functionDefinition':
        return true;
    }
  }

  return false;
}

export function chatTokenizer(tokenizer: (node: string | ChatElement, self: TokenizerFn) => number): TokenizerImplFn {
  return (node: RenderNode, self: TokenizerFn): number => {
    if (typeof node === 'string') {
      return tokenizer(node, self);
    }

    if (isChatElement(node)) {
      return tokenizer(node, self);
    }

    let sum = 0;
    for (const chatElement of node.flat(isChatElement)) {
      sum += self(chatElement);
    }

    return sum;
  };
}
