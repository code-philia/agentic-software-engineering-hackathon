import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GenerationArtifactError,
  type GenerationResult,
} from "../../src/agents/generate.js";
import type { RepairResult } from "../../src/agents/repair.js";
import { ArtifactExtractionError } from "../../src/generation/artifact.js";
import { createRunLogger } from "../../src/logging/run-logger.js";
import type { CoursePresenter } from "../../src/presentation/presenter.js";
import {
  runCourseScenario,
  type ScenarioServices,
} from "../../src/run/orchestrator.js";
import type { TrainTestResult } from "../../src/testing/result.js";
import type { ValidationResult } from "../../src/validation/result.js";

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

function generation(content: string): GenerationResult {
  return {
    content,
    rawOutput: content,
    usage: {
      requests: 1,
      inputTokens: 10,
      outputTokens: 20,
      totalTokens: 30,
      requestUsage: [],
    },
    rawResponses: [],
  };
}

function validation(passed: number): ValidationResult {
  return {
    passed,
    total: 100,
    durationMs: 10,
    categories: [{ name: "Behavior", passed, total: 100 }],
    checks: [
      {
        name: "Handles the requested behavior",
        category: "Behavior",
        passed: passed === 100,
      },
    ],
  };
}

class RecordingPresenter implements CoursePresenter {
  readonly checkpoints: string[] = [];
  readonly trainStatuses: string[] = [];
  readonly modelCalls: Array<{ readonly status?: "completed" | "failed" }> = [];

  start(): void {}
  act(): void {}
  task(): void {}
  stage<T>(_message: string, action: () => Promise<T>): Promise<T> {
    return action();
  }
  artifact(): void {}
  trainResult(_label: string, result: TrainTestResult): void {
    this.trainStatuses.push(result.status);
  }
  repairStarted(): void {}
  repair(): void {}
  repairRound(
    _repair: number,
    _maxRepairs: number,
    result: TrainTestResult,
  ): void {
    this.trainStatuses.push(result.status);
  }
  prompt(): void {}
  validation(): void {}
  comparison(): void {}
  async checkpoint(nextAction: string): Promise<void> {
    this.checkpoints.push(nextAction);
  }
  finish(): void {}
  failure(): void {}
  modelCall(view: { readonly status?: "completed" | "failed" }): void {
    this.modelCalls.push(view);
  }
}

describe("run logger", () => {
  it("redacts configured credential fields", async () => {
    const directory = await localTemporaryDirectory();
    const logFile = join(directory, "events.jsonl");
    const runLogger = await createRunLogger(logFile, { runId: "test" });
    runLogger.logger.info({ event: "probe", apiKey: "must-not-appear" });
    await runLogger.close();

    const source = await readFile(logFile, "utf8");
    expect(source).not.toContain("must-not-appear");
    expect(source).toContain("[REDACTED]");
  });
});

describe("course scenario orchestrator", () => {
  it("requires a GUI train suite to become fully green on the reference", async () => {
    const outputRoot = await localTemporaryDirectory();
    const presenter = new RecordingPresenter();
    const reference: TrainTestResult = {
      status: "RED",
      summary: "4/8 train tests passed.",
      output: "four semantic mismatches",
      total: 8,
      passed: 4,
      failed: 4,
      failures: [
        { name: "fragile visual probe", message: "wrong DOM assumption" },
        { name: "duplicate probe", message: "reused fixture" },
      ],
    };
    const green: TrainTestResult = {
      status: "GREEN",
      summary: "4/4 trusted train tests passed.",
      output: "ok",
      total: 4,
      passed: 4,
      failed: 0,
      failures: [],
    };
    const repairTests = vi.fn(async (input) => {
      const tests =
        'import { test } from "@playwright/test";\ntest("repaired", async () => {});\n';
      await writeFile(input.artifactPath, tests, "utf8");
      return generation(tests);
    });
    const runTrainTests = vi.fn(async () => green);
    const source = "<!doctype html><html><body><h1>Register</h1></body></html>\n";

    const result = await runCourseScenario({
      scenario: "gui",
      publicBrief: "Register a user.",
      implementationContract: "Write one HTML file.",
      testContract: "Write executable Playwright tests.",
      modelName: "fake-model",
      envFile: ".fake.env",
      presenter,
      runsRoot: join(outputRoot, "runs"),
      workspaceRoot: join(outputRoot, "workspace"),
      services: {
        generateDirect: vi.fn(async (input) => {
          await writeFile(input.artifactPath, source, "utf8");
          return generation(source);
        }),
        generateTests: vi.fn(async (input) => {
          const tests = 'import { test } from "@playwright/test";\n';
          await writeFile(input.artifactPath, tests, "utf8");
          return generation(tests);
        }),
        repairTests,
        runReferenceTrainTests: vi
          .fn()
          .mockResolvedValueOnce(reference)
          .mockResolvedValue(green),
        runTrainTests,
        repairImplementation: vi.fn(async () => {
          throw new Error("The trusted subset is already Green.");
        }),
        validate: vi.fn(async () => validation(50)),
      },
    });

    expect(result).toMatchObject({
      outcome: "GREEN",
      testRepairs: 1,
    });
    expect(repairTests).toHaveBeenCalledOnce();
    expect(runTrainTests).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(String),
      expect.any(Object),
      expect.any(AbortSignal),
    );
  });

  it("stops rewriting when a deterministic repair leaves the suite unchanged", async () => {
    const outputRoot = await localTemporaryDirectory();
    const presenter = new RecordingPresenter();
    const invalidTrainSuite: TrainTestResult = {
      status: "RED",
      summary: "The suite rejects a contract-correct response.",
      output: "expected 2, received 201",
    };
    const brokenTrainSuite: TrainTestResult = {
      status: "TEST_ERROR",
      summary: "The suite could not load.",
      output: "Cannot find module ./wrong-helper",
    };
    let referenceRuns = 0;
    const repairImplementation = vi.fn(async () => {
      throw new Error(
        "Implementation repair must not run for an invalid train suite.",
      );
    });
    const repairTests = vi.fn(async (input) => {
      const content =
        'import { it } from "vitest";\nit("still has wrong semantics", () => {});\n';
      await writeFile(input.artifactPath, content, "utf8");
      return generation(content);
    });
    const validate = vi.fn(async (_path: string, arm: "direct" | "tdd") =>
      validation(arm === "direct" ? 80 : 90),
    );

    const result = await runCourseScenario({
      scenario: "api",
      publicBrief: "Register a user.",
      implementationContract: "Export a registration handler.",
      testContract: "Write executable Vitest tests.",
      modelName: "fake-model",
      envFile: ".fake.env",
      presenter,
      runsRoot: join(outputRoot, "runs"),
      workspaceRoot: join(outputRoot, "workspace"),
      services: {
        generateDirect: vi.fn(async (input) => {
          const content =
            "export default () => new Response(null, { status: 201 });\n";
          await writeFile(input.artifactPath, content, "utf8");
          return generation(content);
        }),
        generateTests: vi.fn(async (input) => {
          const content =
            'import { it } from "vitest";\nit("has wrong semantics", () => {});\n';
          await writeFile(input.artifactPath, content, "utf8");
          return generation(content);
        }),
        repairTests,
        runReferenceTrainTests: vi.fn(async () => {
          referenceRuns += 1;
          return referenceRuns === 1 ? brokenTrainSuite : invalidTrainSuite;
        }),
        runTrainTests: vi.fn(async () => {
          throw new Error("The invalid suite must not run against Direct.");
        }),
        repairImplementation,
        validate,
      },
    });

    expect(result).toMatchObject({
      outcome: "INVALID_TRAIN_SUITE",
      testRepairs: 2,
      repairs: 0,
      referenceTrainResult: { status: "RED" },
    });
    expect(repairTests).toHaveBeenCalledTimes(2);
    expect(referenceRuns).toBe(2);
    expect(repairTests).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceStatus: "TEST_ERROR",
        referenceFeedback: expect.stringContaining(
          "Cannot find module ./wrong-helper",
        ),
      }),
    );
    expect(repairTests).toHaveBeenCalledWith(
      expect.objectContaining({
        referenceStatus: "RED",
        referenceFeedback: expect.stringContaining("expected 2, received 201"),
      }),
    );
    expect(repairImplementation).not.toHaveBeenCalled();
    expect(validate).toHaveBeenCalledOnce();
  });

  it("runs Direct, Red-Green repair, and final validation in order", async () => {
    const outputRoot = await localTemporaryDirectory();
    const presenter = new RecordingPresenter();
    let trainRuns = 0;
    let directCopyObserved = false;
    const red: TrainTestResult = {
      status: "RED",
      summary: "0/1 train tests passed.",
      output: "expected 400",
    };
    const green: TrainTestResult = {
      status: "GREEN",
      summary: "1/1 train tests passed.",
      output: "ok",
    };

    const services: ScenarioServices = {
      generateDirect: vi.fn(async (input) => {
        const content =
          "export default () => new Response(null, { status: 201 });\n";
        await writeFile(input.artifactPath, content, "utf8");
        return generation(content);
      }),
      generateTests: vi.fn(async (input) => {
        const content =
          'import { it } from "vitest";\nit("checks input", () => {});\n';
        await writeFile(input.artifactPath, content, "utf8");
        return generation(content);
      }),
      repairTests: vi.fn(async () => {
        throw new Error(
          "Test repair should not run for an executable Red suite.",
        );
      }),
      runReferenceTrainTests: vi.fn(async () => green),
      runTrainTests: vi.fn(async () => {
        trainRuns += 1;
        return trainRuns === 1 ? red : green;
      }),
      repairImplementation: vi.fn(async (input): Promise<RepairResult> => {
        expect(input.maxRepairs).toBe(3);
        directCopyObserved = (
          await readFile(input.implementationPath, "utf8")
        ).includes("status: 201");
        await writeFile(
          input.implementationPath,
          "export default () => new Response(null, { status: 400 });\n",
          "utf8",
        );
        await input.onCheckpoint?.({
          type: "implementation-written",
          repair: 1,
          maxRepairs: 3,
        });
        const finalTestResult = await input.runTrainTests();
        await input.onCheckpoint?.({
          type: "train-tests-finished",
          repair: 1,
          maxRepairs: 3,
          result: finalTestResult,
          decision: "stop-green",
        });
        return {
          status: "GREEN",
          repairs: 1,
          finalTestResult,
          finalOutput: "Green.",
          usage: {
            requests: 2,
            inputTokens: 20,
            outputTokens: 30,
            totalTokens: 50,
            requestUsage: [],
          },
          rawResponses: [],
        };
      }),
      validate: vi.fn(async (_path, arm) =>
        validation(arm === "direct" ? 40 : 90),
      ),
    };

    const result = await runCourseScenario({
      scenario: "api",
      publicBrief: "Register a user.",
      implementationContract: "Export a registration handler.",
      testContract: "Write executable Vitest tests.",
      modelName: "fake-model",
      envFile: ".fake.env",
      presenter,
      services,
      runsRoot: join(outputRoot, "runs"),
      workspaceRoot: join(outputRoot, "workspace"),
    });

    expect(result).toMatchObject({ outcome: "GREEN", repairs: 1 });
    expect(result.directValidation.passed).toBe(40);
    expect(result.tddValidation?.passed).toBe(90);
    expect(directCopyObserved).toBe(true);
    expect(presenter.checkpoints).toEqual([
      "generate a Direct implementation from this task",
      "evaluate the Direct implementation",
      "generate executable train tests",
      "run these tests against the Direct implementation",
      "run final validation and compare Direct with TDD",
    ]);
    expect(presenter.trainStatuses).toEqual(["RED", "GREEN"]);

    const saved = JSON.parse(
      await readFile(join(result.runRoot, "result.json"), "utf8"),
    ) as {
      outcome: string;
      modelUsage: {
        direct: { totalTokens: number };
        implementationRepair: { totalTokens: number };
      };
      modelPerformance: {
        stages: number;
        requests: number;
        totalTokens: number;
      };
    };
    expect(saved.outcome).toBe("GREEN");
    expect(saved.modelUsage.direct.totalTokens).toBe(30);
    expect(saved.modelUsage.implementationRepair.totalTokens).toBe(50);
    expect(saved.modelPerformance).toMatchObject({
      stages: 3,
      requests: 4,
      totalTokens: 110,
    });
    await expect(
      readFile(join(result.runRoot, "raw", "direct-implementation.ts"), "utf8"),
    ).resolves.toContain("status: 201");
    await expect(
      readFile(join(result.runRoot, "raw", "tdd-initial.ts"), "utf8"),
    ).resolves.toContain("status: 201");
    await expect(
      readFile(join(result.runRoot, "raw", "tdd-final.ts"), "utf8"),
    ).resolves.toContain("status: 400");
    await expect(
      readFile(join(result.runRoot, "raw", "train-tests.ts"), "utf8"),
    ).resolves.toContain("checks input");
    expect(
      await readFile(join(result.runRoot, "logs", "events.jsonl"), "utf8"),
    ).toContain('"event":"run_completed"');
  });

  it("records malformed model artifacts as GENERATION_ERROR", async () => {
    const outputRoot = await localTemporaryDirectory();
    const presenter = new RecordingPresenter();
    const notReached = vi.fn(async () => {
      throw new Error("not reached");
    });

    await expect(
      runCourseScenario({
        scenario: "api",
        publicBrief: "Register a user.",
        implementationContract: "Export a registration handler.",
        testContract: "Write executable Vitest tests.",
        modelName: "fake-model",
        envFile: ".fake.env",
        presenter,
        runsRoot: join(outputRoot, "runs"),
        workspaceRoot: join(outputRoot, "workspace"),
        services: {
          generateDirect: vi.fn(async () => {
            throw new ArtifactExtractionError(
              "The model did not write a valid artifact.",
            );
          }),
          generateTests: notReached,
          repairTests: notReached,
          repairImplementation: notReached,
          runTrainTests: notReached,
          runReferenceTrainTests: notReached,
          validate: notReached,
        },
      }),
    ).rejects.toThrow(ArtifactExtractionError);

    const [runId] = await readdir(join(outputRoot, "runs"));
    const saved = JSON.parse(
      await readFile(join(outputRoot, "runs", runId!, "result.json"), "utf8"),
    ) as { outcome: string };
    expect(saved.outcome).toBe("GENERATION_ERROR");
  });

  it("includes usage from a failed artifact delivery in model totals", async () => {
    const outputRoot = await localTemporaryDirectory();
    const presenter = new RecordingPresenter();
    const usage = generation("unused").usage;
    const notReached = vi.fn(async () => {
      throw new Error("not reached");
    });

    await expect(
      runCourseScenario({
        scenario: "api",
        publicBrief: "Register a user.",
        implementationContract: "Export a registration handler.",
        testContract: "Write executable Vitest tests.",
        modelName: "fake-model",
        envFile: ".fake.env",
        presenter,
        runsRoot: join(outputRoot, "runs"),
        workspaceRoot: join(outputRoot, "workspace"),
        services: {
          generateDirect: vi.fn(async () => {
            throw new GenerationArtifactError(
              "The agent did not call write_file.",
              {
                rawOutput: "I forgot to write the file.",
                usage,
                rawResponses: [],
                prompt: { instructions: "write it", input: "task" },
              },
            );
          }),
          generateTests: notReached,
          repairTests: notReached,
          repairImplementation: notReached,
          runTrainTests: notReached,
          runReferenceTrainTests: notReached,
          validate: notReached,
        },
      }),
    ).rejects.toThrow(GenerationArtifactError);

    expect(presenter.modelCalls.map((call) => call.status)).toEqual(["failed"]);
    const [runId] = await readdir(join(outputRoot, "runs"));
    const saved = JSON.parse(
      await readFile(join(outputRoot, "runs", runId!, "result.json"), "utf8"),
    ) as {
      modelPerformance: {
        stages: number;
        totalTokens: number;
        calls: Array<{ status: string }>;
      };
    };
    expect(saved.modelPerformance).toMatchObject({
      stages: 1,
      totalTokens: 30,
      calls: [{ status: "failed" }],
    });
    const evidenceFiles = await readdir(
      join(outputRoot, "runs", runId!, "raw"),
    );
    expect(evidenceFiles).toEqual(
      expect.arrayContaining([
        "failed-direct-1-failure.json",
        "failed-direct-1-prompt.json",
        "failed-direct-1-raw-responses.json",
        "failed-direct-1-response.txt",
      ]),
    );
  });

  it("records cancellation as RUN_ERROR before starting another stage", async () => {
    const outputRoot = await localTemporaryDirectory();
    const presenter = new RecordingPresenter();
    const controller = new AbortController();
    const generateDirect = vi.fn(async () =>
      generation("export default () => new Response();\n"),
    );
    const notReached = vi.fn(async () => {
      throw new Error("not reached");
    });
    controller.abort(
      new Error("Received SIGINT; cancelling the active course run."),
    );

    await expect(
      runCourseScenario({
        scenario: "api",
        publicBrief: "Register a user.",
        implementationContract: "Export a registration handler.",
        testContract: "Write executable Vitest tests.",
        modelName: "fake-model",
        envFile: ".fake.env",
        presenter,
        runsRoot: join(outputRoot, "runs"),
        workspaceRoot: join(outputRoot, "workspace"),
        signal: controller.signal,
        services: {
          generateDirect,
          generateTests: notReached,
          repairTests: notReached,
          repairImplementation: notReached,
          runTrainTests: notReached,
          runReferenceTrainTests: notReached,
          validate: notReached,
        },
      }),
    ).rejects.toThrow("Received SIGINT");

    expect(generateDirect).not.toHaveBeenCalled();
    const [runId] = await readdir(join(outputRoot, "runs"));
    const saved = JSON.parse(
      await readFile(join(outputRoot, "runs", runId!, "result.json"), "utf8"),
    ) as { outcome: string; error: { message: string } };
    expect(saved).toMatchObject({
      outcome: "RUN_ERROR",
      error: { message: "Received SIGINT; cancelling the active course run." },
    });
  });
});
