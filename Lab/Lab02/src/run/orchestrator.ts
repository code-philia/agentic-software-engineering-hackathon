import { basename, join } from "node:path";
import { copyFile, readFile, writeFile } from "node:fs/promises";

import type {
  GenerationInput,
  GenerationResult,
  TestRepairInput,
} from "../agents/generate.js";
import {
  GenerationArtifactError,
  generateDirectImplementation,
  generateTrainTests,
  repairTrainTests,
  type CourseScenario,
} from "../agents/generate.js";
import {
  implementationRepairLimit,
  runTddRepair,
  type RepairInput,
  type RepairResult,
} from "../agents/repair.js";
import {
  executionPolicy,
  type CourseModelRuntime,
  type InferencePolicy,
  type RuntimeRetryEvent,
  type UsageSnapshot,
} from "../agents/runtime.js";
import { ArtifactExtractionError } from "../generation/artifact.js";
import { createRunLogger } from "../logging/run-logger.js";
import type {
  CoursePresenter,
  ModelRunSummary,
} from "../presentation/presenter.js";
import type { TrainTestResult } from "../testing/result.js";
import type { ValidationResult } from "../validation/result.js";
import {
  createRunWorkspace,
  writeJsonFile,
  type RunWorkspace,
} from "./workspace.js";

export interface ScenarioServices {
  setRetryListener?(
    listener: ((event: RuntimeRetryEvent) => void) | undefined,
  ): void;
  generateDirect(input: GenerationInput): Promise<GenerationResult>;
  generateTests(input: GenerationInput): Promise<GenerationResult>;
  repairTests(input: TestRepairInput): Promise<GenerationResult>;
  repairImplementation(input: RepairInput): Promise<RepairResult>;
  runTrainTests(
    implementationPath: string,
    testPath: string,
    workspace: RunWorkspace,
    signal?: AbortSignal,
    excludedTestNames?: readonly string[],
  ): Promise<TrainTestResult>;
  runReferenceTrainTests(
    testPath: string,
    workspace: RunWorkspace,
    signal?: AbortSignal,
  ): Promise<TrainTestResult>;
  validate(
    implementationPath: string,
    arm: "direct" | "tdd",
    workspace: RunWorkspace,
    signal?: AbortSignal,
  ): Promise<ValidationResult>;
  preview?(
    implementationPath: string,
    arm: "direct" | "tdd",
    workspace: RunWorkspace,
  ): Promise<string>;
}

export interface ScenarioRunOptions {
  readonly scenario: CourseScenario;
  readonly publicBrief: string;
  readonly implementationContract: string;
  readonly testContract: string;
  readonly modelName: string;
  readonly envFile: string;
  readonly inferencePolicy?: InferencePolicy;
  readonly presenter: CoursePresenter;
  readonly services: ScenarioServices;
  readonly runsRoot?: string;
  readonly workspaceRoot?: string;
  readonly stepRepairs?: boolean;
  readonly rehearsal?: boolean;
  readonly maxTestRepairs?: number;
  readonly standardPreviewUrl?: string;
  readonly deadlineMs?: number;
  readonly signal?: AbortSignal;
}

export type RunOutcome =
  | "GREEN"
  | "LIMIT_REACHED"
  | "INVALID_TRAIN_SUITE"
  | "GENERATION_ERROR"
  | "RUN_ERROR";

export interface ScenarioRunResult {
  readonly outcome: Extract<
    RunOutcome,
    "GREEN" | "LIMIT_REACHED" | "INVALID_TRAIN_SUITE"
  >;
  readonly runId: string;
  readonly runRoot: string;
  readonly workspaceRoot: string;
  readonly directValidation: ValidationResult;
  readonly tddValidation?: ValidationResult;
  readonly initialTrainResult?: TrainTestResult;
  readonly referenceTrainResult?: TrainTestResult;
  readonly finalTrainResult?: TrainTestResult;
  readonly testRepairs: number;
  readonly repairs: number;
  readonly modelUsage: {
    readonly direct: UsageSnapshot;
    readonly testGeneration: UsageSnapshot;
    readonly testRepairs: readonly UsageSnapshot[];
    readonly implementationRepair?: UsageSnapshot;
  };
  readonly modelPerformance: ModelRunSummary;
}

const MAX_REFERENCE_FEEDBACK_CHARACTERS = 12_000;

function safePromptPreview(
  role: "implementation" | "tests",
  executionContract: string,
): string {
  const request =
    role === "implementation"
      ? "Create the complete implementation described in the task."
      : "Create a complete executable train-test suite for the task.";
  return [
    "Registration task: (same as Act 0)",
    request,
    `Execution contract:\n\n${executionContract}`,
    ...(role === "tests"
      ? [
          "Course-owned test-authoring guidance is applied but is not displayed here.",
        ]
      : []),
  ].join("\n\n");
}

function referenceFeedback(result: TrainTestResult): string {
  if (result.failures && result.failures.length > 0) {
    const structured = result.failures
      .map((failure) => `- ${failure.name}:\n${failure.message}`)
      .join("\n\n");
    const bounded =
      structured.length <= MAX_REFERENCE_FEEDBACK_CHARACTERS
        ? structured
        : `${structured.slice(0, MAX_REFERENCE_FEEDBACK_CHARACTERS)}\n[feedback truncated]`;
    return `${result.summary}\n\n${bounded}`;
  }
  const output =
    result.output.length <= MAX_REFERENCE_FEEDBACK_CHARACTERS
      ? result.output
      : `${result.output.slice(0, MAX_REFERENCE_FEEDBACK_CHARACTERS)}\n[output truncated]`;
  return `${result.summary}\n\n${output}`;
}

export function createModelServices(
  runtime: CourseModelRuntime,
  local: Pick<
    ScenarioServices,
    "runTrainTests" | "runReferenceTrainTests" | "validate"
  >,
): ScenarioServices {
  return {
    setRetryListener: (listener) => runtime.setRetryListener(listener),
    generateDirect: (input) => generateDirectImplementation(runtime, input),
    generateTests: (input) => generateTrainTests(runtime, input),
    repairTests: (input) => repairTrainTests(runtime, input),
    repairImplementation: (input) => runTddRepair(runtime, input),
    ...local,
  };
}

function trainResultForLog(
  result: TrainTestResult,
): Omit<TrainTestResult, "output"> {
  const { output: _output, ...summary } = result;
  return summary;
}

function modelConfigurationForFile(options: ScenarioRunOptions): unknown {
  return {
    envFile: basename(options.envFile),
    model: options.modelName,
    ...(options.inferencePolicy === undefined
      ? {}
      : { inferencePolicy: options.inferencePolicy }),
  };
}

function resultForFile(
  result: ScenarioRunResult,
  options: ScenarioRunOptions,
): unknown {
  return {
    ...result,
    modelConfiguration: modelConfigurationForFile(options),
    ...(result.referenceTrainResult === undefined
      ? {}
      : {
          referenceTrainResult: trainResultForLog(result.referenceTrainResult),
        }),
    ...(result.initialTrainResult === undefined
      ? {}
      : { initialTrainResult: trainResultForLog(result.initialTrainResult) }),
    ...(result.finalTrainResult === undefined
      ? {}
      : { finalTrainResult: trainResultForLog(result.finalTrainResult) }),
  };
}

export async function runCourseScenario(
  options: ScenarioRunOptions,
): Promise<ScenarioRunResult> {
  const workspace = await createRunWorkspace(options.scenario, {
    ...(options.runsRoot === undefined ? {} : { runsRoot: options.runsRoot }),
    ...(options.workspaceRoot === undefined
      ? {}
      : { workspaceRoot: options.workspaceRoot }),
  });
  const runLog = await createRunLogger(workspace.logFile, {
    runId: workspace.id,
    scenario: options.scenario,
    model: options.modelName,
  });
  const { logger } = runLog;
  const activeRunDeadlineMs =
    options.deadlineMs ?? executionPolicy.scenarioDeadlineMs[options.scenario];
  let activeRunDurationMs = 0;
  const modelCalls: Array<{
    stage: string;
    durationMs: number;
    usage: UsageSnapshot;
  }> = [];
  const modelStageAttempts = new Map<string, number>();
  const modelPerformance = (): ModelRunSummary => ({
    model: options.modelName,
    stages: modelCalls.length,
    durationMs: modelCalls.reduce((total, call) => total + call.durationMs, 0),
    requests: modelCalls.reduce(
      (total, call) => total + call.usage.requests,
      0,
    ),
    inputTokens: modelCalls.reduce(
      (total, call) => total + call.usage.inputTokens,
      0,
    ),
    outputTokens: modelCalls.reduce(
      (total, call) => total + call.usage.outputTokens,
      0,
    ),
    totalTokens: modelCalls.reduce(
      (total, call) => total + call.usage.totalTokens,
      0,
    ),
    calls: [...modelCalls],
  });
  const finishPresentation = (): void => {
    options.presenter.modelSummary?.(modelPerformance());
    options.presenter.finish(workspace.root);
  };
  const generationInput: GenerationInput = {
    scenario: options.scenario,
    publicBrief: options.publicBrief,
    executionContract: options.implementationContract,
    artifactPath: workspace.directImplementation,
  };

  const stage = async <T>(
    name: string,
    action: (signal: AbortSignal) => Promise<T>,
    present = true,
  ): Promise<T> => {
    const remainingMs = activeRunDeadlineMs - activeRunDurationMs;
    if (remainingMs <= 0)
      throw new Error("The experiment exceeded its active-work deadline.");
    const deadlineSignal = AbortSignal.timeout(
      Math.max(1, Math.floor(remainingMs)),
    );
    const stageSignal = options.signal
      ? AbortSignal.any([options.signal, deadlineSignal])
      : deadlineSignal;
    const startedAt = performance.now();
    logger.info({ event: "stage_started", stage: name });
    try {
      stageSignal.throwIfAborted();
      const value = present
        ? await options.presenter.stage(name, () => action(stageSignal))
        : await action(stageSignal);
      stageSignal.throwIfAborted();
      logger.info({
        event: "stage_completed",
        stage: name,
        durationMs: Math.round(performance.now() - startedAt),
      });
      return value;
    } catch (error) {
      logger.error({
        event: "stage_failed",
        stage: name,
        durationMs: Math.round(performance.now() - startedAt),
        error,
      });
      throw error;
    } finally {
      activeRunDurationMs += performance.now() - startedAt;
    }
  };
  const modelStage = async <T>(
    modelStageName: string,
    presentationName: string,
    action: (signal: AbortSignal) => Promise<T>,
    present = true,
  ): Promise<T> => {
    const attempt = (modelStageAttempts.get(modelStageName) ?? 0) + 1;
    modelStageAttempts.set(modelStageName, attempt);
    logger.info({ event: "model_started", stage: modelStageName });
    const startedAt = performance.now();
    try {
      const value = await stage(presentationName, action, present);
      const durationMs = Math.round(performance.now() - startedAt);
      if (
        typeof value === "object" &&
        value !== null &&
        "usage" in value
      ) {
        const usage = value.usage as UsageSnapshot;
        const call = {
          stage: modelStageName,
          durationMs,
          usage,
          status: "completed" as const,
        };
        modelCalls.push(call);
        options.presenter.modelCall?.(call);
      }
      return value;
    } catch (error) {
      if (error instanceof GenerationArtifactError) {
        const durationMs = Math.round(performance.now() - startedAt);
        const call = {
          stage: modelStageName,
          durationMs,
          usage: error.usage,
          status: "failed" as const,
        };
        modelCalls.push(call);
        options.presenter.modelCall?.(call);
        const evidenceName =
          `failed-${modelStageName.replace(/[^a-z0-9-]+/gi, "-")}-${attempt}`;
        try {
          await Promise.all([
            writeFile(
              join(workspace.rawDirectory, `${evidenceName}-response.txt`),
              error.rawOutput,
              "utf8",
            ),
            writeJsonFile(
              join(workspace.rawDirectory, `${evidenceName}-raw-responses.json`),
              error.rawResponses,
            ),
            writeJsonFile(
              join(workspace.rawDirectory, `${evidenceName}-prompt.json`),
              error.prompt,
            ),
            writeJsonFile(
              join(workspace.rawDirectory, `${evidenceName}-failure.json`),
              {
                name: error.name,
                message: error.message,
                durationMs,
                usage: error.usage,
              },
            ),
          ]);
        } catch (persistenceError) {
          logger.warn({
            event: "failed_model_evidence_write_failed",
            stage: modelStageName,
            attempt,
            error: persistenceError,
          });
        }
      }
      logger.error({ event: "model_failed", stage: modelStageName, error });
      throw error;
    }
  };

  let primaryError: unknown;
  try {
    options.services.setRetryListener?.((event) => {
      logger.warn({ event: "model_retry_decision", ...event });
      options.presenter.retry?.(event);
    });
    options.presenter.start(options.scenario, workspace.id);
    logger.info({
      event: "run_started",
      envFile: basename(options.envFile),
      ...(options.inferencePolicy === undefined
        ? {}
        : { inferencePolicy: options.inferencePolicy }),
      runRoot: workspace.root,
      workspaceRoot: workspace.workspaceRoot,
    });

    await Promise.all([
      writeFile(
        join(workspace.rawDirectory, "task-brief.md"),
        options.publicBrief,
        "utf8",
      ),
      writeFile(
        join(workspace.rawDirectory, "implementation-contract.md"),
        options.implementationContract,
        "utf8",
      ),
      writeFile(
        join(workspace.rawDirectory, "test-contract.md"),
        options.testContract,
        "utf8",
      ),
    ]);

    options.presenter.act(
      0,
      "Review the task",
      options.scenario === "api"
        ? "In this task, you’ll build an API that lets users create an account."
        : "In this task, you’ll build a registration page for creating an account.",
    );
    options.presenter.task(options.publicBrief);
    if (options.standardPreviewUrl) {
      options.presenter.preview?.("Standard", options.standardPreviewUrl);
      logger.info({
        event: "preview_started",
        arm: "standard",
        url: options.standardPreviewUrl,
      });
    }
    await options.presenter.checkpoint(
      "generate a Direct implementation from this task",
    );

    options.presenter.act(
      1,
      "Generate the Direct implementation",
      options.rehearsal
        ? "Load the fixed incomplete implementation used by this rehearsal."
        : undefined,
    );
    const directPromptPath = join(workspace.rawDirectory, "direct-prompt.json");
    if (!options.rehearsal) {
      options.presenter.prompt(
        "Direct implementation",
        safePromptPreview("implementation", options.implementationContract),
        directPromptPath,
      );
    }
    const direct = await modelStage(
      "direct",
      options.rehearsal
        ? "Load the fixed Direct artifact"
        : "Agent writes the Direct implementation",
      (signal) =>
        options.services.generateDirect({ ...generationInput, signal }),
    );
    await Promise.all([
      writeFile(
        join(workspace.rawDirectory, "direct-response.txt"),
        direct.rawOutput,
        "utf8",
      ),
      writeJsonFile(
        join(workspace.rawDirectory, "direct-raw-responses.json"),
        direct.rawResponses,
      ),
      ...(direct.prompt === undefined
        ? []
        : [writeJsonFile(directPromptPath, direct.prompt)]),
    ]);
    await copyFile(workspace.directImplementation, workspace.tddImplementation);
    const implementationExtension = options.scenario === "api" ? "ts" : "html";
    await Promise.all([
      copyFile(
        workspace.directImplementation,
        join(
          workspace.rawDirectory,
          `direct-implementation.${implementationExtension}`,
        ),
      ),
      copyFile(
        workspace.tddImplementation,
        join(workspace.rawDirectory, `tdd-initial.${implementationExtension}`),
      ),
    ]);
    options.presenter.artifact({
      label: "Direct implementation generated",
      path: workspace.directImplementation,
      source: direct.content,
      language: options.scenario === "api" ? "typescript" : "html",
      usage: direct.usage,
    });
    logger.info({
      event: "model_completed",
      stage: "direct",
      usage: direct.usage,
    });
    if (options.services.preview) {
      const url = await stage("Start Direct preview", () =>
        options.services.preview!(
          workspace.directImplementation,
          "direct",
          workspace,
        ),
      );
      options.presenter.preview?.("Direct", url);
      logger.info({ event: "preview_started", arm: "direct", url });
    }
    await options.presenter.checkpoint("evaluate the Direct implementation");

    options.presenter.act(
      2,
      "Check the Direct result",
      "Measure the Direct implementation.",
    );
    const directValidation = await stage(
      "Run validation against Direct",
      (signal) =>
        options.services.validate(
          workspace.directImplementation,
          "direct",
          workspace,
          signal,
        ),
    );
    options.presenter.validation("Direct", directValidation);
    logger.info({
      event: "validation_completed",
      arm: "direct",
      result: directValidation,
    });
    await options.presenter.checkpoint("generate executable train tests");

    options.presenter.act(
      3,
      "Generate train tests",
      options.rehearsal
        ? "Load the fixed executable tests used by this rehearsal."
        : undefined,
    );
    const trainTestsPromptPath = join(
      workspace.rawDirectory,
      "train-tests-prompt.json",
    );
    if (!options.rehearsal) {
      options.presenter.prompt(
        "Train-test generation",
        safePromptPreview("tests", options.testContract),
        trainTestsPromptPath,
      );
    }
    const preparedTrainSuite = await options.presenter.stage(
      options.rehearsal
        ? "Load rehearsal train tests"
        : "Agent prepares executable train tests",
      async () => {
        let currentTests = await modelStage(
          "test_generation",
          "Generate executable train tests",
          (signal) =>
            options.services.generateTests({
              scenario: options.scenario,
              publicBrief: options.publicBrief,
              executionContract: options.testContract,
              artifactPath: workspace.trainTests,
              signal,
            }),
          false,
        );
        const testGenerationUsage = currentTests.usage;
        await Promise.all([
          writeFile(
            join(workspace.rawDirectory, "train-tests-response.txt"),
            currentTests.rawOutput,
            "utf8",
          ),
          writeJsonFile(
            join(workspace.rawDirectory, "train-tests-raw-responses.json"),
            currentTests.rawResponses,
          ),
          ...(currentTests.prompt === undefined
            ? []
            : [writeJsonFile(trainTestsPromptPath, currentTests.prompt)]),
        ]);
        logger.info({
          event: "model_completed",
          stage: "test_generation",
          usage: currentTests.usage,
        });
        let referenceTrainResult = await stage(
          "Check generated train tests",
          (signal) =>
            options.services.runReferenceTrainTests(
              workspace.trainTests,
              workspace,
              signal,
            ),
          false,
        );
        const maxTestRepairs = options.maxTestRepairs ?? 3;
        let testRepairs = 0;
        const testRepairUsage: UsageSnapshot[] = [];
        while (
          referenceTrainResult.status !== "GREEN" &&
          testRepairs < maxTestRepairs
        ) {
          testRepairs += 1;
          logger.warn({
            event: "train_tests_need_repair",
            phase: "reference",
            attempt: testRepairs,
            status: referenceTrainResult.status,
            summary: referenceTrainResult.summary,
          });
          const referenceStatus = referenceTrainResult.status;
          const repairedTests = await modelStage(
            "test_repair",
            "Refine executable train tests",
            (signal) =>
              options.services.repairTests({
                scenario: options.scenario,
                publicBrief: options.publicBrief,
                executionContract: options.testContract,
                artifactPath: workspace.trainTests,
                signal,
                currentTests: currentTests.content,
                referenceStatus,
                referenceFeedback: referenceFeedback(referenceTrainResult),
              }),
            false,
          );
          const repairChanged = repairedTests.content !== currentTests.content;
          currentTests = repairedTests;
          testRepairUsage.push(repairedTests.usage);
          const testRepairPromptPath = join(
            workspace.rawDirectory,
            `train-tests-repair-${testRepairs}-prompt.json`,
          );
          await Promise.all([
            writeFile(
              join(
                workspace.rawDirectory,
                `train-tests-repair-${testRepairs}-response.txt`,
              ),
              repairedTests.rawOutput,
              "utf8",
            ),
            writeJsonFile(
              join(
                workspace.rawDirectory,
                `train-tests-repair-${testRepairs}-raw-responses.json`,
              ),
              repairedTests.rawResponses,
            ),
            ...(repairedTests.prompt === undefined
              ? []
              : [writeJsonFile(testRepairPromptPath, repairedTests.prompt)]),
          ]);
          logger.info({
            event: "model_completed",
            stage: "test_repair",
            attempt: testRepairs,
            referenceStatus,
            usage: repairedTests.usage,
          });
          if (!repairChanged) {
            logger.warn({
              event: "train_tests_repair_unchanged",
              attempt: testRepairs,
            });
            break;
          }
          referenceTrainResult = await stage(
            "Check generated train tests",
            (signal) =>
              options.services.runReferenceTrainTests(
                workspace.trainTests,
                workspace,
                signal,
              ),
            false,
          );
        }

        logger.info({
          event: "train_tests_completed",
          phase: "reference",
          result: trainResultForLog(referenceTrainResult),
        });
        await copyFile(
          workspace.trainTests,
          join(
            workspace.rawDirectory,
            options.scenario === "api"
              ? "train-tests.ts"
              : "train-tests.spec.ts",
          ),
        );
        return {
          currentTests,
          testGenerationUsage,
          referenceTrainResult,
          testRepairs,
          testRepairUsage,
        };
      },
    );
    const {
      currentTests,
      testGenerationUsage,
      referenceTrainResult,
      testRepairs,
      testRepairUsage,
    } = preparedTrainSuite;

    if (referenceTrainResult.status !== "GREEN") {
      const reason = `The train suite could not be verified after ${testRepairs} rewrite attempt(s).`;
      const invalidResult: ScenarioRunResult = {
        outcome: "INVALID_TRAIN_SUITE",
        runId: workspace.id,
        runRoot: workspace.root,
        workspaceRoot: workspace.workspaceRoot,
        directValidation,
        referenceTrainResult,
        finalTrainResult: referenceTrainResult,
        testRepairs,
        repairs: 0,
        modelUsage: {
          direct: direct.usage,
          testGeneration: testGenerationUsage,
          testRepairs: testRepairUsage,
        },
        modelPerformance: modelPerformance(),
      };
      await writeJsonFile(
        workspace.resultFile,
        resultForFile(invalidResult, options),
      );
      logger.warn({
        event: "run_completed",
        outcome: invalidResult.outcome,
        reason,
      });
      options.presenter.failure(reason);
      finishPresentation();
      return invalidResult;
    }

    options.presenter.artifact({
      label: options.rehearsal
        ? "Rehearsal train tests loaded"
        : "Train tests generated",
      path: workspace.trainTests,
      source: currentTests.content,
      language: "typescript",
      usage: currentTests.usage,
      detail: `${currentTests.content.trimEnd().split("\n").length} lines`,
    });
    await options.presenter.checkpoint(
      "run these tests against the Direct implementation",
    );

    options.presenter.act(
      4,
      "Establish Red and repair toward Green",
      "Run the generated tests, then repair the implementation from their feedback.",
    );

    const initialTrainResult = await stage(
      "Run train tests against the unchanged implementation",
      (signal) =>
        options.services.runTrainTests(
          workspace.tddImplementation,
          workspace.trainTests,
          workspace,
          signal,
        ),
    );

    options.presenter.trainResult("Initial result", initialTrainResult);
    logger.info({
      event: "train_tests_completed",
      phase: "initial",
      result: trainResultForLog(initialTrainResult),
    });

    if (initialTrainResult.status === "TEST_ERROR") {
      const invalidResult: ScenarioRunResult = {
        outcome: "INVALID_TRAIN_SUITE",
        runId: workspace.id,
        runRoot: workspace.root,
        workspaceRoot: workspace.workspaceRoot,
        directValidation,
        referenceTrainResult,
        initialTrainResult,
        finalTrainResult: initialTrainResult,
        testRepairs,
        repairs: 0,
        modelUsage: {
          direct: direct.usage,
          testGeneration: testGenerationUsage,
          testRepairs: testRepairUsage,
        },
        modelPerformance: modelPerformance(),
      };
      await writeJsonFile(
        workspace.resultFile,
        resultForFile(invalidResult, options),
      );
      logger.warn({ event: "run_completed", outcome: invalidResult.outcome });
      options.presenter.failure(
        "The verified train suite could not run against the unchanged baseline.",
      );
      finishPresentation();
      return invalidResult;
    }

    let finalTrainResult = initialTrainResult;
    let repairs = 0;
    let outcome: ScenarioRunResult["outcome"] = "GREEN";
    let implementationRepairUsage: UsageSnapshot | undefined;

    if (initialTrainResult.status === "RED") {
      const maxImplementationRepairs = implementationRepairLimit(
        options.scenario,
      );
      options.presenter.repairStarted(maxImplementationRepairs);
      const repair = await modelStage(
        "tdd_repair",
        options.rehearsal
          ? "Apply the fixed rehearsal repair"
          : "Run TDD repair loop",
        async (signal) =>
          options.services.repairImplementation({
            scenario: options.scenario,
            publicBrief: options.publicBrief,
            implementationContract: options.implementationContract,
            implementationPath: workspace.tddImplementation,
            currentImplementation: direct.content,
            frozenTrainTests: await readFile(workspace.trainTests, "utf8"),
            initialTestResult: initialTrainResult,
            signal,
            runTrainTests: () =>
              options.services.runTrainTests(
                workspace.tddImplementation,
                workspace.trainTests,
                workspace,
                signal,
              ),
            onCheckpoint: async (checkpoint) => {
              if (checkpoint.type === "implementation-written") {
                options.presenter.repair(
                  checkpoint.repair,
                  checkpoint.maxRepairs,
                );
              } else {
                options.presenter.repairRound(
                  checkpoint.repair,
                  checkpoint.maxRepairs,
                  checkpoint.result,
                  checkpoint.decision,
                );
              }
              if (options.stepRepairs) {
                await options.presenter.checkpoint("run the next repair step");
              }
            },
            maxRepairs: maxImplementationRepairs,
          }),
        false,
      );
      finalTrainResult = repair.finalTestResult;
      repairs = repair.repairs;
      implementationRepairUsage = repair.usage;
      outcome = repair.status === "GREEN" ? "GREEN" : "LIMIT_REACHED";
      const tddRepairPromptPath = join(
        workspace.rawDirectory,
        "tdd-repair-prompt.json",
      );
      await Promise.all([
        writeJsonFile(
          join(workspace.rawDirectory, "repair-raw-responses.json"),
          repair.rawResponses,
        ),
        repair.finalOutput === undefined
          ? Promise.resolve()
          : writeFile(
              join(workspace.rawDirectory, "repair-final-output.txt"),
              repair.finalOutput,
              "utf8",
            ),
        ...(repair.prompt === undefined
          ? []
          : [writeJsonFile(tddRepairPromptPath, repair.prompt)]),
      ]);
      logger.info({
        event: "model_completed",
        stage: "tdd_repair",
        repairs,
        status: repair.status,
        usage: repair.usage,
      });
    }

    await copyFile(
      workspace.tddImplementation,
      join(workspace.rawDirectory, `tdd-final.${implementationExtension}`),
    );

    const finalTddSource = await readFile(workspace.tddImplementation, "utf8");
    options.presenter.artifact({
      label:
        repairs === 0
          ? "TDD implementation unchanged"
          : "TDD implementation ready",
      path: workspace.tddImplementation,
      source: finalTddSource,
      language: options.scenario === "api" ? "typescript" : "html",
      ...(implementationRepairUsage === undefined
        ? {}
        : { usage: implementationRepairUsage }),
      detail: repairs === 0 ? "no repair needed" : `${repairs} repair round(s)`,
    });

    await options.presenter.checkpoint(
      "run final validation and compare Direct with TDD",
    );

    options.presenter.act(5, "Compare Direct and TDD");

    if (options.services.preview) {
      const url = await stage("Start TDD preview", () =>
        options.services.preview!(
          workspace.tddImplementation,
          "tdd",
          workspace,
        ),
      );
      options.presenter.preview?.("TDD", url);
      logger.info({ event: "preview_started", arm: "tdd", url });
    }

    const tddValidation = await stage("Run validation against TDD", (signal) =>
      options.services.validate(
        workspace.tddImplementation,
        "tdd",
        workspace,
        signal,
      ),
    );
    options.presenter.comparison(directValidation, tddValidation);
    logger.info({
      event: "validation_completed",
      arm: "tdd",
      result: tddValidation,
    });
    const completedResult: ScenarioRunResult = {
      outcome,
      runId: workspace.id,
      runRoot: workspace.root,
      workspaceRoot: workspace.workspaceRoot,
      directValidation,
      tddValidation,
      referenceTrainResult,
      initialTrainResult,
      finalTrainResult,
      testRepairs,
      repairs,
      modelUsage: {
        direct: direct.usage,
        testGeneration: testGenerationUsage,
        testRepairs: testRepairUsage,
        ...(implementationRepairUsage === undefined
          ? {}
          : { implementationRepair: implementationRepairUsage }),
      },
      modelPerformance: modelPerformance(),
    };
    await writeJsonFile(
      workspace.resultFile,
      resultForFile(completedResult, options),
    );
    logger.info({ event: "run_completed", outcome, testRepairs, repairs });
    finishPresentation();
    return completedResult;
  } catch (error) {
    primaryError = error;
    const message = error instanceof Error ? error.message : String(error);
    const outcome: RunOutcome =
      error instanceof ArtifactExtractionError
        ? "GENERATION_ERROR"
        : "RUN_ERROR";
    try {
      options.presenter.failure(message);
      options.presenter.modelSummary?.(modelPerformance());
    } catch {
      // Preserve the experiment error if the presentation stream has already closed.
    }
    try {
      logger.error({ event: "run_failed", outcome, error });
    } catch {
      // Result persistence below remains the authoritative failure record.
    }
    try {
      await writeJsonFile(workspace.resultFile, {
        outcome,
        runId: workspace.id,
        runRoot: workspace.root,
        workspaceRoot: workspace.workspaceRoot,
        modelConfiguration: modelConfigurationForFile(options),
        modelPerformance: modelPerformance(),
        error: { name: error instanceof Error ? error.name : "Error", message },
      });
    } catch (persistenceError) {
      try {
        logger.error({ event: "result_write_failed", error: persistenceError });
      } catch {
        // Never replace the original run failure with a diagnostic failure.
      }
    }
    throw error;
  } finally {
    let cleanupFailure: unknown;
    try {
      options.services.setRetryListener?.(undefined);
    } catch (cleanupError) {
      cleanupFailure = cleanupError;
    }
    try {
      await runLog.close();
    } catch (cleanupError) {
      cleanupFailure ??= cleanupError;
    }
    if (primaryError === undefined && cleanupFailure !== undefined)
      throw cleanupFailure;
  }
}
