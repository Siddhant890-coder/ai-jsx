import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    coverage: {
      include: ['packages/*/src/**/*.ts?(x)'],
    },
  },
  resolve: {
    conditions: ['@ai-jsx/source'],
  },
});
