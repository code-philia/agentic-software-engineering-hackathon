import { Agent, MaxTurnsExceededError, tool } from "@openai/agents";
import { z } from "zod";

import type { TrainTestResult, TrainTestStatus } from "../testing/result.js";
import { AgentFileWorkspace } from "./file-workspace.js";
import type { CourseScenario } from "./generate.js";
import {
  CourseModelRuntime,
  snapshotUsage,
  type UsageSnapshot,
} from "./runtime.js";

export type RepairDecision = "continue" | "stop-green" | "stop-limit";

export type RepairCheckpoint =
  | {
      readonly type: "implementation-written";
      readonly repair: number;
      readonly maxRepairs: number;
    }
  | {
      readonly type: "train-tests-finished";
      readonly repair: number;
      readonly maxRepairs: number;
      readonly result: TrainTestResult;
      readonly decision: RepairDecision;
    };

const REPAIR_CORE_INSTRUCTIONS: readonly string[] = [
  "Repair the implementation by following the frozen executable tests and their actual feedback.",
  "Use write_file to replace the complete implementation, then use run_train_tests to observe the result.",
  "Do not change the tests. Stop when they are Green or no repair attempts remain.",
  "When run_train_tests reports stop-green or stop-limit, return your final answer without calling another tool.",
];

export interface RepairInput {
  readonly scenario: CourseScenario;
  readonly publicBrief: string;
  readonly implementationContract: string;
  readonly implementationPath: string;
  readonly currentImplementation: string;
  readonly frozenTrainTests: string;
  readonly initialTestResult: TrainTestResult;
  readonly runTrainTests: () => Promise<TrainTestResult>;
  readonly onCheckpoint?: (
    checkpoint: RepairCheckpoint,
  ) => Promise<void> | void;
  readonly maxRepairs?: number;
  readonly signal?: AbortSignal;
}

export interface RepairResult {
  readonly status: TrainTestStatus | "LIMIT_REACHED";
  readonly repairs: number;
  readonly finalTestResult: TrainTestResult;
  readonly finalOutput?: string;
  readonly usage: UsageSnapshot;
  readonly rawResponses: readonly unknown[];
  readonly prompt?: { readonly instructions: string; readonly input: string };
}

const MAX_TOOL_OUTPUT_CHARACTERS = 12_000;

function compactTestResult(result: TrainTestResult): TrainTestResult {
  return {
    ...result,
    output:
      result.output.length <= MAX_TOOL_OUTPUT_CHARACTERS
        ? result.output
        : `${result.output.slice(0, MAX_TOOL_OUTPUT_CHARACTERS)}\n[output truncated]`,
  };
}

export class RepairWorkspace {
  readonly #files: AgentFileWorkspace;
  readonly #input: RepairInput;
  readonly #maxRepairs: number;
  #testedRepair = 0;
  #lastTestResult: TrainTestResult;

  constructor(input: RepairInput) {
    this.#input = input;
    this.#maxRepairs = input.maxRepairs ?? 3;
    this.#lastTestResult = input.initialTestResult;
    this.#files = new AgentFileWorkspace({
      artifactKind: `${input.scenario}-implementation`,
      allowedPath: input.implementationPath,
      maxWrites: this.#maxRepairs,
      writeLabel: "implementation repair",
      onWrite: async (repair) => {
        await this.#input.onCheckpoint?.({
          type: "implementation-written",
          repair,
          maxRepairs: this.#maxRepairs,
        });
      },
    });
  }

  get repairs(): number {
    return this.#files.writes;
  }

  get lastTestResult(): TrainTestResult {
    return this.#lastTestResult;
  }

  async writeImplementation(path: string, content: string) {
    return this.#files.writeFile(path, content);
  }

  async runTrainTests(): Promise<TrainTestResult> {
    this.#lastTestResult = compactTestResult(await this.#input.runTrainTests());
    this.#testedRepair = this.repairs;
    const decision: RepairDecision =
      this.#lastTestResult.status === "GREEN"
        ? "stop-green"
        : this.repairs >= this.#maxRepairs
          ? "stop-limit"
          : "continue";
    await this.#input.onCheckpoint?.({
      type: "train-tests-finished",
      repair: this.repairs,
      maxRepairs: this.#maxRepairs,
      result: this.#lastTestResult,
      decision,
    });
    return this.#lastTestResult;
  }

  async ensureLatestImplementationWasTested(): Promise<TrainTestResult> {
    if (this.#testedRepair !== this.repairs) {
      return this.runTrainTests();
    }
    return this.#lastTestResult;
  }
}

export async function runTddRepair(
  runtime: CourseModelRuntime,
  input: RepairInput,
): Promise<RepairResult> {
  const maxRepairs = input.maxRepairs ?? 3;
  const workspace = new RepairWorkspace(input);
  const writeFile = tool({
    name: "write_file",
    description:
      `Replace the complete TDD working implementation at ${input.implementationPath}. ` +
      "No other file is writable. Each accepted call consumes one repair attempt.",
    parameters: z.object({
      path: z.string().min(1),
      content: z.string().min(1),
    }),
    execute: ({ path, content }) =>
      workspace.writeImplementation(path, content),
  });
  const runTrainTests = tool({
    name: "run_train_tests",
    description:
      "Run the frozen executable train-test suite against the current TDD implementation.",
    parameters: z.object({}),
    execute: () => workspace.runTrainTests(),
  });
  const instructions = [
    ...REPAIR_CORE_INSTRUCTIONS,
    `Follow this implementation contract exactly:\n\n${input.implementationContract}`,
  ].join("\n\n");
  const promptInput = [
    `Registration task:\n\n${input.publicBrief}`,
    `Current implementation:\n\n${input.currentImplementation}`,
    `Frozen train tests:\n\n${input.frozenTrainTests}`,
    `Initial train-test result:\n\n${JSON.stringify(compactTestResult(input.initialTestResult))}`,
  ].join("\n\n---\n\n");
  const agent = new Agent({
    name: "TDD Repair Agent",
    model: runtime.config.model,
    modelSettings: runtime.modelSettings,
    instructions,
    tools: [writeFile, runTrainTests],
  });
  let result;
  try {
    result = await runtime.runner.run(agent, promptInput, {
      maxTurns: maxRepairs * 2 + 1,
      ...(input.signal === undefined ? {} : { signal: input.signal }),
    });
  } catch (error) {
    if (
      !(error instanceof MaxTurnsExceededError) ||
      workspace.repairs < maxRepairs ||
      error.state === undefined
    ) {
      throw error;
    }
    const finalTestResult =
      await workspace.ensureLatestImplementationWasTested();
    return {
      status:
        finalTestResult.status === "RED"
          ? "LIMIT_REACHED"
          : finalTestResult.status,
      repairs: workspace.repairs,
      finalTestResult,
      usage: snapshotUsage(error.state.usage),
      rawResponses: error.state._modelResponses,
      prompt: { instructions, input: promptInput },
    };
  }
  const finalTestResult = await workspace.ensureLatestImplementationWasTested();

  return {
    status:
      finalTestResult.status === "RED" && workspace.repairs >= maxRepairs
        ? "LIMIT_REACHED"
        : finalTestResult.status,
    repairs: workspace.repairs,
    finalTestResult,
    ...(typeof result.finalOutput === "string"
      ? { finalOutput: result.finalOutput }
      : {}),
    usage: snapshotUsage(result.state.usage),
    rawResponses: result.rawResponses,
    prompt: { instructions, input: promptInput },
  };
}
