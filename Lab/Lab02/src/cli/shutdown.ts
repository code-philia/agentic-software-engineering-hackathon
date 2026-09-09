export interface ShutdownController {
  readonly signal: AbortSignal;
  dispose(): void;
}

export function installShutdownSignalHandlers(): ShutdownController {
  const controller = new AbortController();
  const handlers = new Map<NodeJS.Signals, () => void>();

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    const handler = (): void => {
      controller.abort(
        new Error(`Received ${signal}; cancelling the active course run.`),
      );
    };
    handlers.set(signal, handler);
    process.once(signal, handler);
  }

  return {
    signal: controller.signal,
    dispose: () => {
      for (const [signal, handler] of handlers) process.off(signal, handler);
    },
  };
}
