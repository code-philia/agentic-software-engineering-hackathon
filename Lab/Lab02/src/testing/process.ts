import { spawn } from "node:child_process";

const MAX_CAPTURE_BYTES = 5_000_000;
const SAFE_ENVIRONMENT_KEYS = [
  "PATH",
  "PATHEXT",
  "SystemRoot",
  "WINDIR",
  "COMSPEC",
  "TEMP",
  "TMP",
  "TMPDIR",
  "HOME",
  "USERPROFILE",
  "LOCALAPPDATA",
  "APPDATA",
  "LANG",
  "LC_ALL",
  "TERM",
] as const;

export interface ProcessResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly timedOut: boolean;
  readonly outputLimitExceeded: boolean;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
}

export function filteredEnvironment(
  extra: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {};
  for (const key of SAFE_ENVIRONMENT_KEYS) {
    if (process.env[key] !== undefined) {
      environment[key] = process.env[key];
    }
  }
  return { ...environment, NO_COLOR: "1", FORCE_COLOR: "0", ...extra };
}

export function runProcess(
  command: string,
  args: readonly string[],
  options: {
    readonly cwd: string;
    readonly env?: NodeJS.ProcessEnv;
    readonly timeoutMs: number;
    readonly signal?: AbortSignal;
  },
): Promise<ProcessResult> {
  return new Promise((resolve, reject) => {
    options.signal?.throwIfAborted();
    const startedAt = performance.now();
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: filteredEnvironment(options.env),
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let capturedBytes = 0;
    let timedOut = false;
    let outputLimitExceeded = false;

    const capture = (target: "stdout" | "stderr", chunk: Buffer): void => {
      capturedBytes += chunk.length;
      if (capturedBytes > MAX_CAPTURE_BYTES) {
        outputLimitExceeded = true;
        child.kill();
        return;
      }
      if (target === "stdout") stdout += chunk.toString("utf8");
      else stderr += chunk.toString("utf8");
    };
    child.stdout.on("data", (chunk: Buffer) => capture("stdout", chunk));
    child.stderr.on("data", (chunk: Buffer) => capture("stderr", chunk));

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, options.timeoutMs);

    const abort = (): void => {
      child.kill();
    };
    options.signal?.addEventListener("abort", abort, { once: true });

    const finish = (): void => {
      clearTimeout(timeout);
      options.signal?.removeEventListener("abort", abort);
    };

    child.once("error", (error) => {
      finish();
      reject(error);
    });
    child.once("close", (exitCode, signal) => {
      finish();
      resolve({
        exitCode,
        signal,
        timedOut,
        outputLimitExceeded,
        stdout,
        stderr,
        durationMs: Math.round(performance.now() - startedAt),
      });
    });
    if (options.signal?.aborted) abort();
  });
}
