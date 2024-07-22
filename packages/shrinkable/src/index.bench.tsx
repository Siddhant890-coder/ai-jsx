import { createRenderContext } from '@ai-jsx/core';
import { chatTokenizer } from '@ai-jsx/core/chat';
import { Shrinkable, ShrinkConversation } from './index.js';
import { bench } from 'vitest';
import { Tokenizer } from '@ai-jsx/core/tokenizer';

const tokenizer = chatTokenizer((node) => node.toString().length);

function createBenchmark(width: number, outerHeight: number, innerHeight: number, shrinkable: boolean = true) {
  let node = <user>Hello, user!</user>;
  for (let i = 0; i < innerHeight; i++) {
    node = <>{node}</>;
  }
  if (shrinkable) {
    node = <Shrinkable importance={Math.random()}>{node}</Shrinkable>;
  }
  for (let i = 0; i < outerHeight; i++) {
    node = <>{node}</>;
  }

  return (
    <Tokenizer.Provider value={tokenizer}>
      <ShrinkConversation maximumLength={0}>{Array.from({ length: width }, () => node)}</ShrinkConversation>
    </Tokenizer.Provider>
  );
}

bench(
  '1000x0x0 (no replacements)',
  async () => {
    await createRenderContext()
      .render(createBenchmark(1000, 0, 0, false))
      .untilComplete();
  },
  {},
);

bench(
  '1000x0x0',
  async () => {
    await createRenderContext()
      .render(createBenchmark(1000, 0, 0))
      .untilComplete();
  },
  {},
);

bench(
  '1x1000x0',
  async () => {
    await createRenderContext()
      .render(createBenchmark(1, 1000, 0))
      .untilComplete();
  },
  {},
);

bench(
  '1x1000x0 (no replacements)',
  async () => {
    await createRenderContext()
      .render(createBenchmark(1, 1000, 0, false))
      .untilComplete();
  },
  {},
);

bench(
  '1x0x1000',
  async () => {
    await createRenderContext()
      .render(createBenchmark(1, 0, 1000))
      .untilComplete();
  },
  {},
);

bench(
  '50x50x50',
  async () => {
    await createRenderContext()
      .render(createBenchmark(50, 50, 50))
      .untilComplete();
  },
  {},
);

bench(
  '50x50x50 (no replacements)',
  async () => {
    await createRenderContext()
      .render(createBenchmark(50, 50, 50, false))
      .untilComplete();
  },
  {},
);
