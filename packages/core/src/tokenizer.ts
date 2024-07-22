import { ContextWithProvider, RenderElement, RenderNode, TokenizerFn, TokenizerImplFn } from './types.js';

export const Tokenizer: ContextWithProvider<TokenizerFn, TokenizerImplFn> = {
  Provider: ({ value, children }, { setContext }) =>
    setContext(Tokenizer, seal(value)).create(Tokenizer.symbol, { value }, children),
  default: () => 0,
  symbol: Symbol('ai.jsx.Tokenizer'),
};

export function cachedTokenizer(tokenizer: TokenizerImplFn): TokenizerImplFn {
  const nodeCache = new WeakMap<RenderElement, number>();
  const textCache = new Map<string, number>();

  return (node, self) => {
    const cache = (typeof node === 'string' ? textCache : nodeCache) as Map<RenderNode, number>;
    const cached = cache.get(node);
    if (cached !== undefined) {
      return cached;
    }

    const tokens = tokenizer(node, self);
    cache.set(node, tokens);
    return tokens;
  };
}

export function seal(tokenizer: TokenizerImplFn): TokenizerFn {
  const self = (node: RenderNode) => tokenizer(node, self);
  return self;
}
