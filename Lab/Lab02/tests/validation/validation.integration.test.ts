import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { afterAll, beforeAll, expect, test } from "vitest";

import { runApiValidation, runGuiValidation } from "../../src/validation/index.js";

let outputDirectory: string;
let runNumber = 0;

beforeAll(async () => {
  outputDirectory = await mkdtemp(join(tmpdir(), "course-validation-"));
});

afterAll(async () => {
  await rm(outputDirectory, { recursive: true, force: true });
});

function paths(prefix: string) {
  runNumber += 1;
  const stem = join(outputDirectory, `${prefix}-${runNumber}`);
  return {
    reportPath: `${stem}-report.json`,
    rawOutputPath: `${stem}-output.txt`,
    browserOutputPath: `${stem}-browser`,
  };
}

test("API validation gives the known-good fixture full credit and is repeatable", async () => {
  const implementationPath = resolve("tests/validation/fixtures/api-good.ts");
  const first = await runApiValidation({ implementationPath, ...paths("api-good") });
  const second = await runApiValidation({ implementationPath, ...paths("api-good-repeat") });

  expect(first.passed).toBe(first.total);
  expect(first.categories.map(({ name, passed, total }) => ({ name, passed, total }))).toEqual(
    second.categories.map(({ name, passed, total }) => ({ name, passed, total })),
  );
  expect(first.categories).toHaveLength(4);
});

test("API validation materially separates a known-incomplete fixture", async () => {
  const result = await runApiValidation({
    implementationPath: resolve("tests/validation/fixtures/api-incomplete.ts"),
    ...paths("api-incomplete"),
  });
  expect(result.passed).toBeLessThanOrEqual(result.total / 2);
  expect(result.passed).toBeLessThan(result.total);
  expect(result.checks.some((check) => !check.passed)).toBe(true);
  expect(result.checks.every((check) => !check.name.startsWith("["))).toBe(true);
  expect(result.checks.every((check) => check.category.length > 0)).toBe(true);
});

test("GUI validation gives the known-good fixture full credit and is repeatable", async () => {
  const htmlPath = resolve("tests/validation/fixtures/gui-good.html");
  const first = await runGuiValidation({ htmlPath, ...paths("gui-good") });
  const second = await runGuiValidation({ htmlPath, ...paths("gui-good-repeat") });

  expect(first.passed).toBe(first.total);
  expect(first.categories.map(({ name, passed, total }) => ({ name, passed, total }))).toEqual(
    second.categories.map(({ name, passed, total }) => ({ name, passed, total })),
  );
  expect(first.categories).toHaveLength(4);
});

test("GUI validation materially separates a known-incomplete fixture", async () => {
  const result = await runGuiValidation({
    htmlPath: resolve("tests/validation/fixtures/gui-incomplete.html"),
    ...paths("gui-incomplete"),
  });
  expect(result.passed).toBeLessThanOrEqual(result.total / 2);
  expect(result.passed).toBeLessThan(result.total);
  expect(result.checks.some((check) => !check.passed)).toBe(true);
  expect(result.checks.every((check) => !check.name.startsWith("["))).toBe(true);
  expect(result.checks.every((check) => check.category.length > 0)).toBe(true);
});
