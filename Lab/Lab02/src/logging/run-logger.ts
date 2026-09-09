import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

import pino, { type Logger } from "pino";

const REDACTED_PATHS = [
  "apiKey",
  "api_key",
  "authorization",
  "cookie",
  "headers.authorization",
  "headers.cookie",
  "config.apiKey",
  "config.api_key",
  "request.headers.authorization",
  "request.headers.cookie",
] as const;

export interface RunLogger {
  readonly logger: Logger;
  close(): Promise<void>;
}

export async function createRunLogger(
  logFile: string,
  bindings: Record<string, string>,
): Promise<RunLogger> {
  await mkdir(dirname(logFile), { recursive: true });
  const destination = pino.destination({ dest: logFile, sync: true, mkdir: true });
  const logger = pino(
    {
      base: bindings,
      level: "info",
      redact: { paths: [...REDACTED_PATHS], censor: "[REDACTED]" },
      serializers: { error: pino.stdSerializers.err },
    },
    destination,
  );

  return {
    logger,
    close: async () => {
      destination.flushSync();
      destination.end();
    },
  };
}
