import { Props, Tag } from './symbols.js';
import { AIComponent, ComponentContext, AIElement, AINode } from './types.js';

type OptionalNodeChildren<P> = P extends { children: AINode } ? Omit<P, 'children'> & { children?: AINode } : P;

function annotate<P>(tag: AIComponent<P> | string | symbol, props: P, fn: AIElement<P>): AIElement<P> {
  fn[Tag] = tag;
  fn[Props] = props;
  return fn;
}

export function createElement<T, P extends object>(
  tag: AIComponent<P> | string | symbol,
  props?:
    | (T extends AIComponent<P> ? OptionalNodeChildren<P> : Record<string | symbol, unknown> & { children?: AINode })
    | null,
  ...children: AINode[]
): AIElement<P> {
  const propsToPass = (
    children.length === 0
      ? (props ?? {})
      : {
          ...(props ?? {}),
          ...{ children: children.length === 1 ? children[0] : children },
        }
  ) as P;

  if (typeof tag === 'function') {
    return annotate(tag, propsToPass, (ctx: ComponentContext) => tag(propsToPass as P, ctx));
  }

  const propsWithoutChildren: P & { children?: AINode } = { ...propsToPass };
  const resolvedChildren = propsWithoutChildren.children;
  delete propsWithoutChildren.children;

  return annotate(tag, propsToPass, (ctx: ComponentContext) => ctx.create(tag, propsWithoutChildren, resolvedChildren));
}

export function Fragment({ children }: { children: AINode }) {
  return children;
}
