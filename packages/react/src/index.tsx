import {
  AINode,
  ComponentContext,
  createRenderContext,
  RenderElement,
  RenderMiddleware,
  RenderMiddlewareFn,
} from '@ai-jsx/core';
import { NodeMap } from './node.js';
import { ReactNode, useEffect, useState } from 'react';

const middleware: RenderMiddlewareFn = (node: AINode, next) => {
  if (typeof node === 'object' && node && NodeMap.has(node)) {
    return next(NodeMap.get(node));
  }

  return next(node);
};

const toReact = Symbol('ai.jsx.toReact');

export function AI(
  {
    children,
    onStreamComplete,
    onStreamError,
  }: { children: AINode & ReactNode; onStreamComplete?: () => void; onStreamError?: (error: unknown) => void },
  maybeComponentContext?: unknown,
) {
  const isInAI =
    maybeComponentContext && typeof maybeComponentContext === 'object' && 'render' in maybeComponentContext;
  if (isInAI) {
    return children;
  }

  // Otherwise transition from React to AI.JSX.
  const [childReactNode, setChildReactNode] = useState<ReactNode>(null);
  useEffect(() => {
    const rendered = createRenderContext().render(
      <RenderMiddleware.Provider value={middleware}>{children}</RenderMiddleware.Provider>,
    );

    const update = () => {
      setChildReactNode(
        Array.from(
          rendered.flat(
            (node): node is 'string' | RenderElement<typeof toReact> =>
              typeof node === 'string' || node.type === toReact,
          ),
        ).map((node) => (typeof node === 'string' ? node : (node.attributes.reactNode as ReactNode))),
      );
    };

    if (rendered.isComplete()) {
      update();
    } else {
      (async () => {
        try {
          while (!rendered.isComplete()) {
            update();
            await rendered.untilChange();
          }
          update();
          onStreamComplete?.();
        } catch (ex) {
          onStreamError?.(ex);
        }
      })();
    }
  }, [children]);

  return childReactNode;
}

export function React({ children }: { children: AINode & ReactNode }, maybeComponentContext?: ComponentContext) {
  const isInAI =
    maybeComponentContext && typeof maybeComponentContext === 'object' && 'render' in maybeComponentContext;
  if (isInAI) {
    return maybeComponentContext.create(toReact, { reactNode: children }, null);
  }
  return children;
}
