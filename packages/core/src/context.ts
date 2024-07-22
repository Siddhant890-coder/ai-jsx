import {
  AIComponent,
  AINode,
  ComponentContext,
  Context,
  ContextWithProvider,
  LogFn,
  RenderMiddlewareFn,
} from './types.js';

export function createContext<T>(defaultValue: T): ContextWithProvider<T> {
  const contextValue = {
    Provider: ({ value, children }: { value: T; children: AINode }, { setContext }: ComponentContext) =>
      setContext(contextValue, value).create(contextValue.symbol, { value }, children),
    default: defaultValue,
    symbol: Symbol(`ai.jsx.context from:\n${new Error().stack}`),
  };

  return contextValue;
}
export const RenderMiddleware: Context<RenderMiddlewareFn> & {
  Provider: AIComponent<{ value: RenderMiddlewareFn; children: AINode }>;
} = {
  Provider: ({ value, children }, { getContext, setContext }) =>
    // Compose the middleware with the existing value.
    setContext(RenderMiddleware, (node, next) => value(node, (n) => getContext(RenderMiddleware)(n, next))).create(
      RenderMiddleware.symbol,
      { value },
      children,
    ),
  default: (n, next) => next(n),
  symbol: Symbol('ai.jsx.RenderMiddleware'),
};

export const Log = createContext<LogFn>(() => {});
