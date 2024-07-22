/* eslint-disable @typescript-eslint/no-namespace */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as React from 'react';
import { jsx as aiJsx, jsxs as aiJsxs, Fragment as aiFragment, JSX as AIJSX } from '@ai-jsx/core/jsx-runtime';
import { jsx as reactJsx, jsxs as reactJsxs, Fragment as reactFragment } from 'react/jsx-runtime';
import { NodeMap } from './node.js';

export declare namespace JSX {
  type ElementType = React.JSX.ElementType | AIJSX.ElementType;
  type Element = React.JSX.Element & AIJSX.Element;
  type IntrinsicElements = React.JSX.IntrinsicElements & AIJSX.IntrinsicElements;
  type ElementChildrenAttribute = React.JSX.ElementChildrenAttribute & AIJSX.ElementChildrenAttribute;
  type IntrinsicAttributes = React.JSX.IntrinsicAttributes;
}

export function jsx(type: any, config: any, maybeKey?: any) {
  const aiElement = aiJsx(type === reactFragment ? aiFragment : type, config, maybeKey);
  const reactElement = reactJsx(type, config, maybeKey);
  NodeMap.set(reactElement, aiElement);
  return reactElement;
}

export function jsxs(type: any, config: any, maybeKey?: any) {
  const aiElement = aiJsxs(type, config, maybeKey);
  const reactElement = reactJsxs(type, config, maybeKey);
  NodeMap.set(reactElement, aiElement);
  return reactElement;
}

export const Fragment = reactFragment;
