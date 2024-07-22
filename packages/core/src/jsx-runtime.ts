/* eslint-disable @typescript-eslint/no-explicit-any */
import { AINode, AIComponent, AIElement, RenderNode } from './types.js';
import { createElement } from './node.js';
export { Fragment } from './node.js';
import { type JSONSchema7 } from 'json-schema';

interface IntrinsicProps {
  children?: AINode;
  [key: string | symbol]: any;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
export declare namespace JSX {
  type ElementType = AIComponent<any> | string | symbol;
  interface Element extends AIElement<any> {}
  interface IntrinsicElements {
    system: IntrinsicProps;
    user: IntrinsicProps & { name?: string };
    assistant: IntrinsicProps;
    functionDefinition: IntrinsicProps & {
      name: string;
      parameters: JSONSchema7 & { type?: 'object' };
    };
    functionCall: IntrinsicProps & { id: string; name: string };
    functionResponse: IntrinsicProps & { id: string; name: string; failed?: boolean };
    shrinkable: { importance: number; replacement: () => RenderNode } & IntrinsicProps;
    image: { src: string } & IntrinsicProps;
    [key: string]: IntrinsicProps;
  }
  interface ElementChildrenAttribute {
    children: object;
  }
}

export function jsx(type: any, config: any, maybeKey?: any) {
  const configWithKey = maybeKey !== undefined ? { ...config, key: maybeKey } : config;
  return createElement(type, configWithKey);
}

export const jsxs = jsx;
