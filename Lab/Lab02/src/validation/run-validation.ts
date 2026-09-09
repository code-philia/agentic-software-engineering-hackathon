import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  loadRegistrationHandler,
  startApiServer,
} from "../harness/api-server.js";
import { startGuiServer } from "../harness/gui-server.js";
import { runProcess, type ProcessResult } from "../testing/process.js";
import type {
  ValidationCategoryResult,
  ValidationCheckResult,
  ValidationResult,
} from "./result.js";

const require = createRequire(import.meta.url);
const projectRoot = fileURLToPath(new URL("../../", import.meta.url));
const validationRoot = join(projectRoot, "validation");
const vitestCli = join(
  dirname(require.resolve("vitest/package.json")),
  "vitest.mjs",
);
const playwrightCli = join(
  dirname(require.resolve("@playwright/test/package.json")),
  "cli.js",
);

interface CommonValidationOptions {
  readonly reportPath: string;
  readonly rawOutputPath: string;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
}

export interface ApiValidationOptions extends CommonValidationOptions {
  readonly implementationPath: string;
}

export interface GuiValidationOptions extends CommonValidationOptions {
  readonly htmlPath: string;
  readonly browserOutputPath: string;
}

interface CheckResult {
  readonly name: string;
  readonly passed: boolean;
}

interface VitestReport {
  readonly testResults?: readonly {
    readonly assertionResults?: readonly {
      readonly ancestorTitles?: readonly string[];
      readonly fullName?: string;
      readonly status?: string;
      readonly title?: string;
    }[];
  }[];
}

interface PlaywrightSuite {
  readonly title?: string;
  readonly suites?: readonly PlaywrightSuite[];
  readonly specs?: readonly {
    readonly title?: string;
    readonly ok?: boolean;
  }[];
}

interface PlaywrightReport {
  readonly suites?: readonly PlaywrightSuite[];
}

const API_CATEGORIES = [
  "Core registration behavior",
  "Input validation",
  "State and duplicate handling",
  "Response contract and safety",
] as const;

const GUI_CATEGORIES = [
  "Structure and accessibility",
  "Form validation",
  "Interaction and state",
  "Stable visual requirements",
] as const;

async function readJsonReport<T>(path: string): Promise<T> {
  const source = await readFile(path, "utf8");
  return JSON.parse(source) as T;
}

async function saveRawOutput(
  path: string,
  result: ProcessResult,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(
    path,
    [result.stdout, result.stderr].filter(Boolean).join("\n"),
    "utf8",
  );
}

function categoryFromName(
  name: string,
  categories: readonly string[],
): string | undefined {
  return categories.find((category) => name.includes(`[${category}]`));
}

function humanCheckName(name: string, category: string): string {
  const marker = `[${category}]`;
  const markerIndex = name.indexOf(marker);
  return markerIndex === -1
    ? name.trim()
    : name.slice(markerIndex + marker.length).trim();
}

function aggregate(
  checks: readonly CheckResult[],
  categories: readonly string[],
  durationMs: number,
): ValidationResult {
  const categorizedChecks: ValidationCheckResult[] = checks.map((check) => {
    const category = categoryFromName(check.name, categories);
    if (!category) {
      throw new Error(
        `Validation check is missing a known category: ${check.name}`,
      );
    }
    return {
      name: humanCheckName(check.name, category),
      category,
      passed: check.passed,
    };
  });
  const categoryResults: ValidationCategoryResult[] = categories.map((name) => {
    const categoryChecks = categorizedChecks.filter(
      (check) => check.category === name,
    );
    if (categoryChecks.length === 0) {
      throw new Error(
        `Validation report did not contain checks for category: ${name}`,
      );
    }
    const passed = categoryChecks.filter((check) => check.passed).length;
    return {
      name,
      passed,
      total: categoryChecks.length,
    };
  });

  const passed = categoryResults.reduce(
    (sum, category) => sum + category.passed,
    0,
  );
  const total = categoryResults.reduce(
    (sum, category) => sum + category.total,
    0,
  );
  return {
    passed,
    total,
    durationMs,
    categories: categoryResults,
    checks: categorizedChecks,
  };
}

function ensureRunnerCompleted(result: ProcessResult): void {
  if (result.timedOut)
    throw new Error("Validation tests exceeded their time limit.");
  if (result.outputLimitExceeded)
    throw new Error("Validation tests produced too much output.");
  if (result.signal)
    throw new Error(`Validation tests stopped after signal ${result.signal}.`);
}

function vitestChecks(report: VitestReport): CheckResult[] {
  return (report.testResults ?? []).flatMap((file) =>
    (file.assertionResults ?? []).map((test) => ({
      name: [
        ...(test.ancestorTitles ?? []),
        test.title ?? test.fullName ?? "",
      ].join(" "),
      passed: test.status === "passed",
    })),
  );
}

function playwrightChecks(report: PlaywrightReport): CheckResult[] {
  const checks: CheckResult[] = [];
  const visit = (
    suite: PlaywrightSuite,
    ancestors: readonly string[],
  ): void => {
    const names = suite.title ? [...ancestors, suite.title] : ancestors;
    for (const spec of suite.specs ?? []) {
      checks.push({
        name: [...names, spec.title ?? ""].join(" "),
        passed: spec.ok === true,
      });
    }
    for (const child of suite.suites ?? []) visit(child, names);
  };
  for (const suite of report.suites ?? []) visit(suite, []);
  return checks;
}

export async function runApiValidation(
  options: ApiValidationOptions,
): Promise<ValidationResult> {
  await mkdir(dirname(resolve(options.reportPath)), { recursive: true });
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
        join(validationRoot, "api", "register.validation.test.ts"),
        "--config",
        join(validationRoot, "vitest.validation.config.ts"),
        "--reporter=json",
        `--outputFile=${resolve(options.reportPath)}`,
        "--no-color",
      ],
      {
        cwd: projectRoot,
        env: { COURSE_API_BASE_URL: server.url },
        timeoutMs: options.timeoutMs ?? 60_000,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      },
    );
    await saveRawOutput(options.rawOutputPath, result);
    ensureRunnerCompleted(result);
    const checks = vitestChecks(
      await readJsonReport<VitestReport>(options.reportPath),
    );
    return aggregate(checks, API_CATEGORIES, result.durationMs);
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

export async function runGuiValidation(
  options: GuiValidationOptions,
): Promise<ValidationResult> {
  await Promise.all([
    mkdir(dirname(resolve(options.reportPath)), { recursive: true }),
    mkdir(resolve(options.browserOutputPath), { recursive: true }),
  ]);
  const server = await startGuiServer({ htmlPath: options.htmlPath });
  let primaryError: unknown;
  try {
    const result = await runProcess(
      process.execPath,
      [
        playwrightCli,
        "test",
        join(validationRoot, "gui", "register.validation.spec.ts"),
        "--config",
        join(validationRoot, "playwright.validation.config.ts"),
      ],
      {
        cwd: projectRoot,
        env: {
          COURSE_GUI_BASE_URL: server.url,
          COURSE_VALIDATION_REPORT: resolve(options.reportPath),
          COURSE_VALIDATION_OUTPUT: resolve(options.browserOutputPath),
        },
        timeoutMs: options.timeoutMs ?? 90_000,
        ...(options.signal === undefined ? {} : { signal: options.signal }),
      },
    );
    await saveRawOutput(options.rawOutputPath, result);
    ensureRunnerCompleted(result);
    const checks = playwrightChecks(
      await readJsonReport<PlaywrightReport>(options.reportPath),
    );
    return aggregate(checks, GUI_CATEGORIES, result.durationMs);
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
