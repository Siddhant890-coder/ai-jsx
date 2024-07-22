/* @jsxImportSource @ai-jsx/react */
import { AI, React } from './index.js';
import { Text } from 'ink';
import { render } from 'ink-testing-library';
import { it, expect } from 'vitest';

it('should work with plain React', () => {
  const Test = () => <Text>Hello World</Text>;
  const { lastFrame } = render(<Test />);

  expect(lastFrame()).toBe('Hello World');
});

it('simple text can be nested within React', () => {
  const Test = () => (
    <Text>
      <AI>Hello from AI.JSX!</AI>
    </Text>
  );
  const node = <Test />;
  const instance = render(node);
  expect(instance.lastFrame()).toBe('');
  instance.rerender(node);
  expect(instance.lastFrame()).toBe('Hello from AI.JSX!');
});

it('components can be nested', () => {
  const AIComponent = () => 'Hello from AI.JSX!';

  const Test = () => (
    <Text>
      <AI>
        <AIComponent />
      </AI>
    </Text>
  );
  const node = <Test />;
  const instance = render(node);
  expect(instance.lastFrame()).toBe('');
  instance.rerender(node);
  expect(instance.lastFrame()).toBe('Hello from AI.JSX!');
});

it('streaming components can be nested', async () => {
  async function* StreamingComponent() {
    yield 'Hello';
    await new Promise<void>((resolve) => setImmediate(resolve));
    yield ' from';
    await new Promise<void>((resolve) => setImmediate(resolve));
    yield ' AI.JSX!';
    setImmediate(() => abortController.abort());
  }

  const Test = () => (
    <Text>
      <AI>
        <StreamingComponent />
      </AI>
    </Text>
  );
  const node = <Test />;
  const instance = render(node);
  expect(instance.lastFrame()).toBe('');

  const abortController = new AbortController();
  function animate() {
    if (abortController.signal.aborted) {
      return;
    }
    instance.rerender(node);
    setImmediate(animate);
  }

  animate();
  await new Promise<void>((resolve) => setTimeout(resolve, 100));
  abortController.abort();
  expect(instance.frames).containSubset(['', 'Hello', 'Hello from', 'Hello from AI.JSX!']);
});

it('React components can be nested', () => {
  const AIComponent = () => (
    <React>
      <Text>Hello from React!</Text>
    </React>
  );

  const Test = () => (
    <Text>
      <AI>
        <AIComponent />
      </AI>
    </Text>
  );
  const node = <Test />;
  const instance = render(node);
  expect(instance.lastFrame()).toBe('');
  instance.rerender(node);
  expect(instance.lastFrame()).toBe('Hello from React!');
});
