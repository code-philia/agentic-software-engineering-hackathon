import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadRegistrationHandler,
  startApiServer,
} from "../harness/api-server.js";
import { startGuiServer } from "../harness/gui-server.js";
import { runProcess, type ProcessResult } from "./process.js";
import type { TrainTestFailure, TrainTestResult } from "./result.js";

const require = createRequire(import.meta.url);
const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const vitestCli = join(
  dirname(require.resolve("vitest/package.json")),
  "vitest.mjs",
);
const playwrightCli = join(
  dirname(require.resolve("@playwright/test/package.json")),
  "cli.js",
);
const vitestConfig = fileURLToPath(
  new URL("./vitest.generated.config.ts", import.meta.url),
);
const playwrightConfig = fileURLToPath(
  new URL("./playwright.generated.config.ts", import.meta.url),
);

interface CommonTestOptions {
  readonly testPath: string;
  readonly reportPath: string;
  readonly rawOutputPath: string;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

export interface ApiTestOptions extends CommonTestOptions {
  readonly implementationPath: string;
}

export interface GuiTestOptions extends CommonTestOptions {
  readonly htmlPath: string;
  readonly browserOutputPath: string;
  readonly timeoutDisposition?: "test-error" | "red";
  readonly excludedTestNames?: readonly string[];
}

interface VitestAssertionResult {
  readonly status?: string;
  readonly fullName?: string;
  readonly title?: string;
  readonly failureMessages?: readonly string[];
}

interface VitestReport {
  readonly success?: boolean;
  readonly numTotalTests?: number;
  readonly numPassedTests?: number;
  readonly numFailedTests?: number;
  readonly testResults?: ReadonlyArray<{
    readonly assertionResults?: readonly VitestAssertionResult[];
  }>;
}

interface PlaywrightReport {
  readonly stats?: {
    readonly expected?: number;
    readonly unexpected?: number;
    readonly skipped?: number;
    readonly flaky?: number;
  };
  readonly suites?: readonly PlaywrightSuite[];
}

interface PlaywrightSuite {
  readonly suites?: readonly PlaywrightSuite[];
  readonly specs?: readonly PlaywrightSpec[];
}

interface PlaywrightSpec {
  readonly title?: string;
  readonly tests?: ReadonlyArray<{
    readonly status?: string;
    readonly results?: ReadonlyArray<{
      readonly status?: string;
      readonly error?: { readonly message?: string };
    }>;
  }>;
}

function firstLine(message: string): string {
  return message.split("\n")[0]?.trim() ?? message.trim();
}

function vitestFailures(report: VitestReport): TrainTestFailure[] {
  const failures = (report.testResults ?? []).flatMap(
    (file) => file.assertionResults ?? [],
  );
  return failures
    .filter((assertion) => assertion.status === "failed")
    .map((assertion) => ({
      name: assertion.fullName ?? assertion.title ?? "unnamed test",
      message: firstLine(
        assertion.failureMessages?.[0] ?? "no failure message",
      ),
    }));
}

function playwrightFailures(report: PlaywrightReport): TrainTestFailure[] {
  const failures: TrainTestFailure[] = [];
  const walk = (suites: readonly PlaywrightSuite[] | undefined): void => {
    for (const suite of suites ?? []) {
      for (const spec of suite.specs ?? []) {
        for (const test of spec.tests ?? []) {
          if (test.status === "expected") continue;
          const message = firstLine(
            test.results?.find((result) => result.error?.message)?.error
              ?.message ?? "no failure message",
          );
          failures.push({ name: spec.title ?? "unnamed test", message });
        }
      }
      walk(suite.suites);
    }
  };
  walk(report.suites);
  return failures;
}

function failureDetails(failures: readonly TrainTestFailure[]): string {
  const lines = failures.map(
    (failure) => `- ${failure.name}: ${failure.message}`,
  );
  return lines.length === 0 ? "" : `Failing tests:\n${lines.join("\n")}`;
}

function processFailure(result: ProcessResult): string | undefined {
  if (result.timedOut)
    return "The test runner exceeded its overall time limit.";
  if (result.outputLimitExceeded)
    return "The test runner produced too much console output.";
  if (result.signal)
    return `The test runner stopped after signal ${result.signal}.`;
  return undefined;
}

function combinedOutput(result: ProcessResult): string {
  return [result.stdout, result.stderr].filter(Boolean).join("\n").trim();
}

function archiveOutput(result: ProcessResult, report = ""): string {
  return [result.stdout, result.stderr, report]
    .filter(Boolean)
    .join("\n")
    .trim();
}

async function saveRawOutput(path: string, output: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${output}\n`, "utf8");
}

async function readReport(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, "utf8");
  } catch {
    return undefined;
  }
}

function testError(
  summary: string,
  output: string,
  durationMs: number,
): TrainTestResult {
  return { status: "TEST_ERROR", summary, output, durationMs };
}

async function interpretVitest(
  processResult: ProcessResult,
  reportPath: string,
  rawOutputPath: string,
): Promise<TrainTestResult> {
  const reportSource = await readReport(reportPath);
  const output = combinedOutput(processResult);
  await saveRawOutput(
    rawOutputPath,
    archiveOutput(processResult, reportSource),
  );
  const failure = processFailure(processResult);
  if (failure) return testError(failure, output, processResult.durationMs);
  if (!reportSource) {
    return testError(
      "Vitest did not produce a machine-readable report.",
      output,
      processResult.durationMs,
    );
  }

  let report: VitestReport;
  try {
    report = JSON.parse(reportSource) as VitestReport;
  } catch {
    return testError(
      "Vitest produced an invalid JSON report.",
      output,
      processResult.durationMs,
    );
  }

  const total = report.numTotalTests ?? 0;
  const passed = report.numPassedTests ?? 0;
  const failed = report.numFailedTests ?? 0;
  if (total === 0) {
    return testError(
      "Vitest did not collect any executable tests.",
      output,
      processResult.durationMs,
    );
  }

  const failures = vitestFailures(report);
  const details = failureDetails(failures);
  return {
    status: failed === 0 && report.success ? "GREEN" : "RED",
    summary: `${passed}/${total} train tests passed.`,
    output:
      details === "" ? output : [output, details].filter(Boolean).join("\n\n"),
    total,
    passed,
    failed,
    durationMs: processResult.durationMs,
    failures,
  };
}

async function interpretPlaywright(
  processResult: ProcessResult,
  reportPath: string,
  rawOutputPath: string,
  timeoutDisposition: "test-error" | "red",
): Promise<TrainTestResult> {
  const reportSource = await readReport(reportPath);
  const output = combinedOutput(processResult);
  await saveRawOutput(
    rawOutputPath,
    archiveOutput(processResult, reportSource),
  );
  if (processResult.timedOut && timeoutDisposition === "red") {
    let failures: TrainTestFailure[] = [];
    let details = "";
    if (reportSource) {
      try {
        failures = playwrightFailures(
          JSON.parse(reportSource) as PlaywrightReport,
        );
        details = failureDetails(failures);
      } catch {
        // The console output remains useful when a killed runner leaves partial JSON.
      }
    }
    return {
      status: "RED",
      summary:
        "The verified train suite exceeded its overall time limit against the current implementation.",
      output:
        details === ""
          ? output
          : [output, details].filter(Boolean).join("\n\n"),
      durationMs: processResult.durationMs,
      failures,
    };
  }
  const failure = processFailure(processResult);
  if (failure) return testError(failure, output, processResult.durationMs);
  if (!reportSource) {
    return testError(
      "Playwright did not produce a machine-readable report.",
      output,
      processResult.durationMs,
    );
  }

  let report: PlaywrightReport;
  try {
    report = JSON.parse(reportSource) as PlaywrightReport;
  } catch {
    return testError(
      "Playwright produced an invalid JSON report.",
      output,
      processResult.durationMs,
    );
  }

  const passed = report.stats?.expected ?? 0;
  const failed = report.stats?.unexpected ?? 0;
  const flaky = report.stats?.flaky ?? 0;
  const total = passed + failed + flaky;
  if (total === 0) {
    return testError(
      "Playwright did not collect any executable tests.",
      output,
      processResult.durationMs,
    );
  }

  const failures = playwrightFailures(report);
  const details = failureDetails(failures);
  return {
    status: failed === 0 && flaky === 0 ? "GREEN" : "RED",
    summary: `${passed}/${total} train tests passed.`,
    output:
      details === "" ? output : [output, details].filter(Boolean).join("\n\n"),
    total,
    passed,
    failed: failed + flaky,
    durationMs: processResult.durationMs,
    failures,
  };
}

export async function runApiTrainTests(
  options: ApiTestOptions,
): Promise<TrainTestResult> {
  const server = await startApiServer({
    handler: await loadRegistrationHandler(options.implementationPath),
  });

  let primaryError: unknown;
  try {
    const result = await runProcess(
      process.execPath,
      [
        vitestCli,
        "run",
        resolve(options.testPath),
        "--root",
        dirname(resolve(options.testPath)),
        "--config",
        vitestConfig,
        "--reporter=json",
        `--outputFile=${resolve(options.reportPath)}`,
        "--no-color",
      ],
      {
        cwd: projectRoot,
        env: {
          COURSE_API_BASE_URL: server.url,
          COURSE_TEST_CACHE: join(
            dirname(resolve(options.reportPath)),
            "vitest-cache",
          ),
        },
        timeoutMs: options.timeoutMs ?? 60_000,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      },
    );
    return await interpretVitest(
      result,
      options.reportPath,
      options.rawOutputPath,
    );
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try {
      await server.close();
    } catch (cleanupError) {
      if (primaryError === undefined) throw cleanupError;
    }
  }
}

export async function runGuiTrainTests(
  options: GuiTestOptions,
): Promise<TrainTestResult> {
  const server = await startGuiServer({ htmlPath: options.htmlPath });

  let primaryError: unknown;
  try {
    const excludedPattern =
      options.excludedTestNames === undefined ||
      options.excludedTestNames.length === 0
        ? undefined
        : options.excludedTestNames
            .map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
            .join("|");
    const result = await runProcess(
      process.execPath,
      [
        playwrightCli,
        "test",
        resolve(options.testPath),
        "--config",
        playwrightConfig,
        ...(excludedPattern === undefined
          ? []
          : ["--grep-invert", excludedPattern]),
      ],
      {
        cwd: projectRoot,
        env: {
          COURSE_GUI_BASE_URL: server.url,
          COURSE_TEST_DIR: dirname(resolve(options.testPath)),
          COURSE_TEST_REPORT: resolve(options.reportPath),
          COURSE_TEST_OUTPUT: resolve(options.browserOutputPath),
        },
        timeoutMs: options.timeoutMs ?? 90_000,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      },
    );
    return await interpretPlaywright(
      result,
      options.reportPath,
      options.rawOutputPath,
      options.timeoutDisposition ?? "test-error",
    );
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try {
      await server.close();
    } catch (cleanupError) {
      if (primaryError === undefined) throw cleanupError;
    }
  }
}
