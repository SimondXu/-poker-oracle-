import type { AgentRunTrace, AgentRunTraceSpan, AgentTraceSpanName } from './types.ts';

export interface AgentTraceSpanHandle {
  end: (metadata?: Record<string, unknown>) => void;
}

export interface AgentTraceCollector {
  record: (name: AgentTraceSpanName, metadata?: Record<string, unknown>) => void;
  start: (name: AgentTraceSpanName, metadata?: Record<string, unknown>) => AgentTraceSpanHandle;
  build: () => AgentRunTrace;
}

export function createTraceCollector(): AgentTraceCollector {
  const spans: AgentRunTraceSpan[] = [];

  function buildCompletedSpan(
    name: AgentTraceSpanName,
    startedAt: string,
    endedAt: string,
    durationMs: number,
    metadata?: Record<string, unknown>,
  ): AgentRunTraceSpan {
    const span: AgentRunTraceSpan = {
      name,
      startedAt,
      endedAt,
      durationMs,
    };
    if (metadata) {
      span.metadata = metadata;
    }

    return span;
  }

  return {
    record(name, metadata) {
      const timestamp = new Date().toISOString();
      spans.push(buildCompletedSpan(name, timestamp, timestamp, 0, metadata));
    },
    start(name, metadata) {
      const startedAtDate = new Date();
      const startedAt = startedAtDate.toISOString();
      const startedAtPerf = performance.now();

      return {
        end(endMetadata) {
          const endedAtDate = new Date();
          const endedAt = endedAtDate.toISOString();
          const mergedMetadata = metadata || endMetadata
            ? {
                ...metadata,
                ...endMetadata,
              }
            : undefined;

          spans.push(
            buildCompletedSpan(
              name,
              startedAt,
              endedAt,
              Number((performance.now() - startedAtPerf).toFixed(3)),
              mergedMetadata,
            ),
          );
        },
      };
    },
    build() {
      return { spans: [...spans] };
    },
  };
}
