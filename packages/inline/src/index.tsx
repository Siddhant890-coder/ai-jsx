import { AINode, createContext, ComponentContext } from '@ai-jsx/core';

const placeholderContext = createContext<AINode>(() => {
  throw new Error('$_ must be used within a <Inline> component');
});

export function* Inline({ children, initial }: { children: AINode; initial?: AINode }, { render }: ComponentContext) {
  const flattenedChildren: AINode[] = ([] as AINode[]).concat(children).flat(Infinity as 1);
  let prefix: AINode[] = initial ? [render(initial)] : [];
  for (const child of flattenedChildren) {
    const next = render(<placeholderContext.Provider value={prefix}>{child}</placeholderContext.Provider>);
    yield next;
    prefix = prefix.concat(next);
  }
}

export function $_(_: Record<string | symbol, never>, { getContext }: ComponentContext) {
  return getContext(placeholderContext);
}
