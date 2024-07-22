import { it, expect, beforeAll, beforeEach } from 'vitest';
import opentelemetry from '@opentelemetry/sdk-node';
import { type Span } from '@opentelemetry/api';
import { AINode, createRenderContext } from '@ai-jsx/core';
import { OpenTelemetrySpan, OpenTelemetryTrace } from './index.js';

const startedSpans: Span[] = [];
const endedSpans: opentelemetry.node.ReadableSpan[] = [];

beforeAll(() => {
  const sdk = new opentelemetry.NodeSDK({
    spanProcessors: [
      {
        forceFlush: async () => {},
        onStart: (span) => {
          startedSpans.push(span);
        },
        onEnd: (span) => {
          endedSpans.push(span);
        },
        shutdown: async () => {},
      },
    ],
  });
  sdk.start();

  return async () => sdk.shutdown();
});

beforeEach(() => {
  startedSpans.length = 0;
  endedSpans.length = 0;
});

it('registers spans', () => {
  createRenderContext().render(<OpenTelemetrySpan name="test">test</OpenTelemetrySpan>);
  expect(startedSpans.length).toBe(1);
  expect(endedSpans.length).toBe(1);
  expect(endedSpans[0].name).toBe('test');
});

it('tracks async children spans', async () => {
  await createRenderContext()
    .render(
      <OpenTelemetrySpan name="test">
        {() =>
          new Promise<string>((r) => {
            expect(startedSpans.length).toBe(1);
            setTimeout(() => {
              expect(endedSpans.length).toBe(0);
              r('done');
            }, 10);
          })
        }
      </OpenTelemetrySpan>,
    )
    .untilComplete();
  expect(startedSpans.length).toBe(1);
  expect(endedSpans.length).toBe(1);
  expect(endedSpans[0].name).toBe('test');
});

it('tracks nested spans', async () => {
  await createRenderContext()
    .render(
      <OpenTelemetrySpan name="test">
        {async () => (
          <OpenTelemetrySpan name="nested">
            {() =>
              new Promise<string>((r) => {
                expect(startedSpans.length).toBe(2);
                setTimeout(() => {
                  expect(endedSpans.length).toBe(0);
                  r('done');
                }, 10);
              })
            }
          </OpenTelemetrySpan>
        )}
      </OpenTelemetrySpan>,
    )
    .untilComplete();
  expect(startedSpans.length).toBe(2);
  expect(endedSpans.length).toBe(2);
  expect(endedSpans[0].name).toBe('nested');
  expect(endedSpans[1].name).toBe('test');
  expect(endedSpans[0].parentSpanId).toBe(endedSpans[1].spanContext().spanId);
});

it('tracks nested span with async generators', async () => {
  await createRenderContext()
    .render(
      <OpenTelemetrySpan name="test">
        {async function* () {
          yield (
            <OpenTelemetrySpan name="nested">
              {() =>
                new Promise<string>((r) => {
                  expect(startedSpans.length).toBe(2);
                  setTimeout(() => {
                    expect(endedSpans.length).toBe(0);
                    r('done');
                  }, 10);
                })
              }
            </OpenTelemetrySpan>
          );
        }}
      </OpenTelemetrySpan>,
    )
    .untilComplete();
  expect(startedSpans.length).toBe(2);
  expect(endedSpans.length).toBe(2);
  expect(endedSpans[0].name).toBe('nested');
  expect(endedSpans[1].name).toBe('test');
  expect(endedSpans[0].parentSpanId).toBe(endedSpans[1].spanContext().spanId);
});

it('auto-instruments async elements', async () => {
  async function TracedComponent({ children }: { children: AINode }) {
    await new Promise((r) => setTimeout(r, 10));
    return children;
  }

  await createRenderContext()
    .render(
      <OpenTelemetryTrace>
        <TracedComponent>
          <TracedComponent>Another one!</TracedComponent>
          <TracedComponent>And another.</TracedComponent>
        </TracedComponent>
      </OpenTelemetryTrace>,
    )
    .untilComplete();

  expect(startedSpans.length).toBe(3);
  expect(endedSpans.length).toBe(3);
  expect(endedSpans[0].name).toBe('<TracedComponent>');
  expect(endedSpans[1].name).toBe('<TracedComponent>');
  expect(endedSpans[2].name).toBe('<TracedComponent>');
  expect(endedSpans[0].parentSpanId).toBe(endedSpans[2].spanContext().spanId);
  expect(endedSpans[1].parentSpanId).toBe(endedSpans[2].spanContext().spanId);
});
