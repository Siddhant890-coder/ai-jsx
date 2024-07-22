import {
  AINode,
  ComponentContext,
  LogFn,
  PropsOfComponent,
  RenderElement,
  RenderMiddleware,
  Symbols,
} from '@ai-jsx/core';
import { trace, Span, SpanStatusCode } from '@opentelemetry/api';
import { logs } from '@opentelemetry/api-logs';

const SpanSymbol = Symbol('ai.jsx.opentelemetry.span');

export function OpenTelemetrySpan(
  {
    children,
    name,
    instrument,
  }: {
    children?: AINode;
    name: string;
    instrument?: (renderElement: RenderElement, span: Span, error?: unknown) => void;
  },
  { create }: ComponentContext,
) {
  return trace.getTracer('ai.jsx').startActiveSpan(name, (span) => {
    const renderElement = create(SpanSymbol, { name }, children);
    if (!renderElement.isComplete()) {
      renderElement.untilComplete().then(
        () => {
          span.setStatus({ code: SpanStatusCode.OK });
          instrument?.(renderElement, span);
          span.end();
        },
        (e) => {
          span.setStatus({ code: SpanStatusCode.ERROR, message: `${e}` });
          instrument?.(renderElement, span, e);
          span.end();
        },
      );
    } else {
      span.setStatus({ code: SpanStatusCode.OK });
      instrument?.(renderElement, span);
      span.end();
    }

    return renderElement;
  });
}

export function asyncComponentName(node: AINode): string | undefined {
  return typeof node === 'function' &&
    typeof node[Symbols.Tag] === 'function' &&
    node[Symbols.Tag].constructor !== Function
    ? `<${node[Symbols.Tag].name}>`
    : undefined;
}

export function OpenTelemetryTrace({
  children,
  spanName = asyncComponentName,
  ...props
}: {
  children?: AINode;
  spanName?: (node: AINode) => string | undefined;
} & Omit<PropsOfComponent<typeof OpenTelemetrySpan>, 'name'>) {
  return (
    <RenderMiddleware.Provider
      value={(node, next) => {
        const name = spanName(node);
        if (name) {
          return next(
            <OpenTelemetrySpan name={name} {...props}>
              {() => next(node)}
            </OpenTelemetrySpan>,
          );
        }
        return next(node);
      }}
    >
      {children}
    </RenderMiddleware.Provider>
  );
}

export function createOpenTelemetryLogger(name: string = 'ai.jsx'): LogFn {
  const severityToLevel = {
    // https://github.com/open-telemetry/opentelemetry-specification/blob/main/specification/logs/data-model.md#field-severitynumber
    trace: 1,
    debug: 5,
    info: 9,
    warn: 13,
    error: 17,
    fatal: 21,
  };

  const logger = logs.getLoggerProvider().getLogger(name);
  return (level, node, renderId, metadataOrMessage, message) => {
    const attributes: Record<string, string> = {};
    if (typeof node === 'function' && typeof node[Symbols.Tag] === 'function') {
      attributes.element = `<${node[Symbols.Tag].name}>`;
    }

    logger.emit({
      severityText: level.toUpperCase(),
      severityNumber: severityToLevel[level],
      body: typeof metadataOrMessage === 'object' ? (message ?? '') : metadataOrMessage,
      attributes: {
        ...attributes,
        renderId,
        ...(typeof metadataOrMessage === 'object' ? metadataOrMessage : {}),
      },
    });
  };
}
