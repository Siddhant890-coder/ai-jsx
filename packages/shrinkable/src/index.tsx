import { AINode, ComponentContext, RenderElement } from '@ai-jsx/core';
import { Tokenizer } from '@ai-jsx/core/tokenizer';
import { isChatElement } from '@ai-jsx/core/chat';
import { PriorityQueue } from '@datastructures-js/priority-queue';

export const ShrinkableSymbol = Symbol.for('ai.jsx.shrinkable');

export function ShrinkConversation(
  { children, maximumLength }: { children: AINode; maximumLength: number },
  { render, create, getContext }: ComponentContext,
) {
  const renderedChildren = render(children);
  if (!renderedChildren.isComplete()) {
    return renderedChildren
      .untilComplete()
      .then(() => <ShrinkConversation maximumLength={maximumLength}>{renderedChildren}</ShrinkConversation>);
  }

  const tokenizer = getContext(Tokenizer);
  let currentLength = tokenizer(renderedChildren);
  if (currentLength <= maximumLength) {
    return renderedChildren;
  }

  async function ApplyReplacements() {
    const shrinkables = new PriorityQueue<{
      shrinkable: RenderElement;
      path: RenderElement[];
    }>((a, b) => a.shrinkable.attributes.importance - b.shrinkable.attributes.importance);

    const collectShrinkables = (element: RenderElement, currentPath: RenderElement[]) => {
      if (element.type === ShrinkableSymbol) {
        shrinkables.enqueue({ shrinkable: element, path: currentPath });
      }

      for (const child of element) {
        if (typeof child === 'object') {
          collectShrinkables(child, [...currentPath, element]);
        }
      }
    };
    collectShrinkables(renderedChildren, []);

    type ReplacementTrie = {
      next: Map<RenderElement, ReplacementTrie>;
      replacements: Map<RenderElement, RenderElement>;
    };

    const trie = {
      next: new Map<RenderElement, ReplacementTrie>(),
      replacements: new Map<RenderElement, RenderElement>(),
    };

    const addReplacement = (shrinkable: RenderElement, path: RenderElement[], replacement: RenderElement) => {
      let currentPath = path;
      let currentTrie = trie;
      while (currentPath.length > 0) {
        let nextTrie = currentTrie.next.get(currentPath[0]);
        if (nextTrie === undefined) {
          nextTrie = {
            next: new Map<RenderElement, ReplacementTrie>(),
            replacements: new Map<RenderElement, RenderElement>(),
          };
          currentTrie.next.set(currentPath[0], nextTrie);
        }
        currentTrie = nextTrie;
        currentPath = currentPath.slice(1);
      }
      currentTrie.replacements.set(shrinkable, replacement);
    };

    while (currentLength > maximumLength && !shrinkables.isEmpty()) {
      const { shrinkable, path } = shrinkables.dequeue();
      const replacement: RenderElement = shrinkable.attributes.replacement();

      if (path.find((element) => element.type === ShrinkableSymbol)) {
        // TODO: Support nested shrinkable elements.
        // With nested shrinkables we need to:
        //   - Ensure that any ancestor shrinkables have their costs adjusted by any replacements.
        //   - Ensure that any descendent shrinkables are not replaced.
        throw new Error('Nested shrinkable elements are not currently supported.');
      }

      // N.B. We're assuming that token counts are additive across <Shrinkable> boundaries, which is not necessarily the case.
      // The proper way to handle this would be to re-tokenize highest ancestor chat element with and without the replacement.
      const hasAncestorChatElement = path.some((element) => isChatElement(element));

      const replacedLength = tokenizer(hasAncestorChatElement ? shrinkable.toString() : shrinkable);
      const replacementLength = hasAncestorChatElement
        ? await replacement.untilComplete().then((complete) => tokenizer(complete.toString()))
        : tokenizer(replacement);

      currentLength = currentLength - replacedLength + replacementLength;
      addReplacement(shrinkable, path, replacement);
      collectShrinkables(replacement, path);
    }

    // Apply the replacements.
    const applyReplacements = (element: RenderElement, currentTrie: ReplacementTrie): RenderElement => {
      const replacement = currentTrie.replacements.get(element);
      if (replacement) {
        return applyReplacements(replacement, currentTrie);
      }

      const nextTrie = currentTrie.next.get(element);
      if (nextTrie) {
        return create(element.type, element.attributes, function* () {
          for (const child of element) {
            if (typeof child === 'string') {
              yield child;
            } else {
              yield applyReplacements(child, nextTrie);
            }
          }
        });
      }

      return element;
    };

    return applyReplacements(renderedChildren, trie);
  }

  return <ApplyReplacements />;
}

export function Shrinkable(
  { importance, replacement, children }: { importance?: number; replacement?: AINode; children: AINode },
  { create, render }: ComponentContext,
) {
  let rendered: AINode = undefined;
  return create(
    ShrinkableSymbol,
    {
      importance,
      replacement: () => {
        if (rendered === undefined) {
          rendered = render(replacement);
        }
        return rendered;
      },
    },
    children,
  );
}
