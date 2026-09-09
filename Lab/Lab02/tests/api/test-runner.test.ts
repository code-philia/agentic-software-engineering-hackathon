import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createRunWorkspace } from "../../src/run/workspace.js";
import { installShutdownSignalHandlers } from "../../src/cli/shutdown.js";
import {
  runApiTrainTests,
  runGuiTrainTests,
} from "../../src/testing/run-generated-tests.js";
import { runProcess } from "../../src/testing/process.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function localTemporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(process.cwd(), ".course-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

describe("run workspace", () => {
  it("creates predictable API artifact paths", async () => {
    const outputRoot = await localTemporaryDirectory();
    const workspace = await createRunWorkspace("api", {
      runsRoot: join(outputRoot, "runs"),
      workspaceRoot: join(outputRoot, "workspace"),
      now: new Date("2026-09-09T01:02:03Z"),
    });

    expect(workspace.id).toMatch(/^20260909T010203Z-api-[0-9a-f]{8}$/);
    expect(workspace.directImplementation).toBe(
      join(workspace.workspaceRoot, "direct", "register.ts"),
    );
    expect(workspace.tddImplementation).toBe(
      join(workspace.workspaceRoot, "tdd", "register.ts"),
    );
    expect(workspace.trainTests).toBe(
      join(workspace.workspaceRoot, "train", "register.test.ts"),
    );
  });
});

describe("child process lifecycle", () => {
  it("turns a termination signal into a disposable cancellation signal", () => {
    const existingListeners = new Set(process.listeners("SIGTERM"));
    const shutdown = installShutdownSignalHandlers();
    const handler = process
      .listeners("SIGTERM")
      .find((listener) => !existingListeners.has(listener));

    expect(handler).toBeDefined();
    handler!("SIGTERM");
    expect(shutdown.signal.aborted).toBe(true);
    expect(shutdown.signal.reason).toEqual(
      new Error("Received SIGTERM; cancelling the active course run."),
    );

    shutdown.dispose();
    expect(process.listeners("SIGTERM")).not.toContain(handler);
  });

  it("stops an active child process when the run is cancelled", async () => {
    const controller = new AbortController();
    const startedAt = performance.now();
    const processResult = runProcess(
      process.execPath,
      ["-e", "setInterval(() => {}, 1_000)"],
      {
        cwd: process.cwd(),
        timeoutMs: 10_000,
        signal: controller.signal,
      },
    );

    setTimeout(() => controller.abort(new Error("cancelled by test")), 25);
    await expect(processResult).resolves.toMatchObject({
      signal: "SIGTERM",
      timedOut: false,
    });
    expect(performance.now() - startedAt).toBeLessThan(2_000);
  });
});

describe("generated API train-test runner", () => {
  it("runs tests against a generated Request handler", async () => {
    const outputRoot = await localTemporaryDirectory();
    const workspace = await createRunWorkspace("api", {
      runsRoot: join(outputRoot, "runs"),
      workspaceRoot: join(outputRoot, "workspace"),
    });
    await writeFile(
      workspace.tddImplementation,
      `export default async function register(request: Request): Promise<Response> {
        const input = await request.json() as { username: string; email: string };
        return Response.json({ ...input, sessionToken: "token" }, { status: 201 });
      }\n`,
      "utf8",
    );
    await writeFile(
      workspace.trainTests,
      `import { expect, it } from "vitest";
      it("registers a user", async () => {
        const response = await fetch(process.env.COURSE_API_BASE_URL + "/api/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ username: "student", email: "student@example.com" }),
        });
        expect(response.status).toBe(201);
      });\n`,
      "utf8",
    );

    await expect(
      runApiTrainTests({
        implementationPath: workspace.tddImplementation,
        testPath: workspace.trainTests,
        reportPath: join(workspace.testOutputDirectory, "api.json"),
        rawOutputPath: join(workspace.testOutputDirectory, "api.txt"),
      }),
    ).resolves.toMatchObject({
      status: "GREEN",
      total: 1,
      passed: 1,
      failed: 0,
    });
  });

  it("classifies a broken suite as TEST_ERROR", async () => {
    const outputRoot = await localTemporaryDirectory();
    const workspace = await createRunWorkspace("api", {
      runsRoot: join(outputRoot, "runs"),
      workspaceRoot: join(outputRoot, "workspace"),
    });
    await writeFile(
      workspace.tddImplementation,
      "export default () => new Response(null, { status: 204 });\n",
      "utf8",
    );
    await writeFile(
      workspace.trainTests,
      'import { it } from "vitest";\nit("broken", () => {\n',
      "utf8",
    );

    await expect(
      runApiTrainTests({
        implementationPath: workspace.tddImplementation,
        testPath: workspace.trainTests,
        reportPath: join(workspace.testOutputDirectory, "broken.json"),
        rawOutputPath: join(workspace.testOutputDirectory, "broken.txt"),
      }),
    ).resolves.toMatchObject({ status: "TEST_ERROR" });
  });

  it("classifies an executable failing assertion as RED", async () => {
    const outputRoot = await localTemporaryDirectory();
    const workspace = await createRunWorkspace("api", {
      runsRoot: join(outputRoot, "runs"),
      workspaceRoot: join(outputRoot, "workspace"),
    });
    await writeFile(
      workspace.tddImplementation,
      "export default () => new Response(null, { status: 201 });\n",
      "utf8",
    );
    await writeFile(
      workspace.trainTests,
      `import { expect, it } from "vitest";
      it("rejects bad input", async () => {
        const response = await fetch(process.env.COURSE_API_BASE_URL + "/api/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        });
        expect(response.status).toBe(400);
      });\n`,
      "utf8",
    );

    await expect(
      runApiTrainTests({
        implementationPath: workspace.tddImplementation,
        testPath: workspace.trainTests,
        reportPath: join(workspace.testOutputDirectory, "red.json"),
        rawOutputPath: join(workspace.testOutputDirectory, "red.txt"),
      }),
    ).resolves.toMatchObject({ status: "RED", total: 1, passed: 0, failed: 1 });
  });
});

describe("generated GUI train-test runner", () => {
  it("runs Playwright against a generated HTML page", async () => {
    const outputRoot = await localTemporaryDirectory();
    const workspace = await createRunWorkspace("gui", {
      runsRoot: join(outputRoot, "runs"),
      workspaceRoot: join(outputRoot, "workspace"),
    });
    await writeFile(
      workspace.tddImplementation,
      "<!doctype html><html><body><h1>Registration</h1></body></html>\n",
      "utf8",
    );
    await writeFile(
      workspace.trainTests,
      `import { expect, test } from "@playwright/test";
      test("shows registration", async ({ page }) => {
        await page.goto(process.env.COURSE_GUI_BASE_URL!);
        await expect(page.getByRole("heading", { name: "Registration" })).toBeVisible();
      });\n`,
      "utf8",
    );

    await expect(
      runGuiTrainTests({
        htmlPath: workspace.tddImplementation,
        testPath: workspace.trainTests,
        reportPath: join(workspace.testOutputDirectory, "gui.json"),
        rawOutputPath: join(workspace.testOutputDirectory, "gui.txt"),
        browserOutputPath: join(workspace.testOutputDirectory, "playwright"),
      }),
    ).resolves.toMatchObject({
      status: "GREEN",
      total: 1,
      passed: 1,
      failed: 0,
    });
  });

  it("treats only a frozen-suite overall timeout as RED", async () => {
    const outputRoot = await localTemporaryDirectory();
    const workspace = await createRunWorkspace("gui", {
      runsRoot: join(outputRoot, "runs"),
      workspaceRoot: join(outputRoot, "workspace"),
    });
    await writeFile(
      workspace.tddImplementation,
      "<!doctype html><html><body><h1>Registration</h1></body></html>\n",
      "utf8",
    );
    await writeFile(
      workspace.trainTests,
      `import { test } from "@playwright/test";
      test("waits for missing behavior", async ({ page }) => {
        await page.goto(process.env.COURSE_GUI_BASE_URL!);
        console.log("partial-playwright-marker");
        await page.waitForTimeout(10_000);
      });\n`,
      "utf8",
    );

    const common = {
      htmlPath: workspace.tddImplementation,
      testPath: workspace.trainTests,
      timeoutMs: 1_000,
    } as const;
    await expect(
      runGuiTrainTests({
        ...common,
        reportPath: join(workspace.testOutputDirectory, "reference-timeout.json"),
        rawOutputPath: join(workspace.testOutputDirectory, "reference-timeout.txt"),
        browserOutputPath: join(workspace.testOutputDirectory, "reference-timeout"),
      }),
    ).resolves.toMatchObject({ status: "TEST_ERROR" });
    const frozenResult = await runGuiTrainTests({
      ...common,
      reportPath: join(workspace.testOutputDirectory, "frozen-timeout.json"),
      rawOutputPath: join(workspace.testOutputDirectory, "frozen-timeout.txt"),
      browserOutputPath: join(workspace.testOutputDirectory, "frozen-timeout"),
      timeoutDisposition: "red",
    });
    expect(frozenResult).toMatchObject({
      status: "RED",
      summary:
        "The verified train suite exceeded its overall time limit against the current implementation.",
    });
    expect(frozenResult.output).toContain("partial-playwright-marker");
  });
});
