import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

import type { CourseScenario } from "../agents/generate.js";

export interface RunWorkspace {
  readonly id: string;
  readonly root: string;
  readonly workspaceRoot: string;
  readonly directImplementation: string;
  readonly tddImplementation: string;
  readonly trainTests: string;
  readonly rawDirectory: string;
  readonly testOutputDirectory: string;
  readonly logFile: string;
  readonly resultFile: string;
}

function timestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export async function createRunWorkspace(
  scenario: CourseScenario,
  options: {
    readonly runsRoot?: string;
    readonly workspaceRoot?: string;
    readonly now?: Date;
  } = {},
): Promise<RunWorkspace> {
  const now = options.now ?? new Date();
  const id = `${timestamp(now)}-${scenario}-${randomUUID().slice(0, 8)}`;
  const root = resolve(options.runsRoot ?? "runs", id);
  const workspaceRoot = resolve(options.workspaceRoot ?? "workspace", scenario);
  const implementationName = scenario === "api" ? "register.ts" : "index.html";
  const testName = scenario === "api" ? "register.test.ts" : "register.spec.ts";
  const rawDirectory = join(root, "raw");
  const testOutputDirectory = join(root, "test-output");

  await Promise.all(
    [
      rawDirectory,
      testOutputDirectory,
      join(root, "logs"),
      join(workspaceRoot, "direct"),
      join(workspaceRoot, "tdd"),
      join(workspaceRoot, "train"),
    ].map((directory) => mkdir(directory, { recursive: true })),
  );

  const directImplementation = join(workspaceRoot, "direct", implementationName);
  const tddImplementation = join(workspaceRoot, "tdd", implementationName);
  const trainTests = join(workspaceRoot, "train", testName);
  await Promise.all(
    [directImplementation, tddImplementation, trainTests].map((path) =>
      rm(path, { force: true }),
    ),
  );

  return {
    id,
    root,
    workspaceRoot,
    directImplementation,
    tddImplementation,
    trainTests,
    rawDirectory,
    testOutputDirectory,
    logFile: join(root, "logs", "events.jsonl"),
    resultFile: join(root, "result.json"),
  };
}

export async function writeJsonFile(path: string, value: unknown): Promise<void> {
  const temporaryPath = `${path}.next`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
}
