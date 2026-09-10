import {
  Agent,
  AgentsError,
  MaxTurnsExceededError,
  tool,
  type ToolToFinalOutputFunction,
} from "@openai/agents";
import { resolve } from "node:path";
import { z } from "zod";

import { extractArtifact } from "../generation/artifact.js";
import type { TrainTestResult, TrainTestStatus } from "../testing/result.js";
import { AgentFileWorkspace } from "./file-workspace.js";
import { GenerationArtifactError, type CourseScenario } from "./generate.js";
import {
  CourseModelRuntime,
  snapshotUsage,
  type UsageSnapshot,
} from "./runtime.js";

export type RepairDecision = "continue" | "stop-green" | "stop-limit";

export type RepairTestToolResult = TrainTestResult & {
  readonly decision: RepairDecision;
};

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
  "Use write_file exactly once to replace the complete implementation with a substantive correction. The harness will run the complete frozen train suite immediately after an accepted write and provide fresh feedback in a new repair round if needed.",
  "Infer the general behavior required by each failure before editing. Fix the underlying validation, normalization, state transition, persistence, accessibility, or presentation rule rather than special-casing a test name or literal example.",
  "When several failures share a cause, repair the shared logic comprehensively. Preserve behavior that already passes and apply the rule consistently to equivalent boundary values and later state transitions.",
  "After each test run, compare the remaining failures with the previous result. If a failure repeats, reconsider the root cause and the complete behavior family instead of making another narrow patch to the same symptom.",
  "If the passing count drops, treat that as a regression: restore the behavior of the most recent higher-passing implementation and apply the next fix on top of that version instead of continuing from the regression.",
  "Remember that native HTML constraints such as maxlength can silently alter or block a value before JavaScript observes it. When executable tests require application feedback for an invalid submitted value, do not let a native constraint truncate that value into a different valid one.",
  "For persisted identity and duplicate checks, apply the same normalization to the new candidate and every stored record before comparing them. Do not normalize only one side.",
  "Do not hard-code frozen test inputs, expected strings, or one-off branches solely to satisfy individual assertions.",
  "Do not change the tests or merely resubmit the current implementation. The runtime, not prose, decides when the loop stops.",
];

const GUI_REPAIR_STABILITY_GUIDANCE = `For this GUI repair, implement these registration rules as one coherent policy rather than guessing them one failure at a time:
- Trim the username, preserve its trimmed spelling, require 3 through 20 characters, start with an ASCII letter, and then allow only ASCII letters, digits, or underscores. Compare stored usernames case-insensitively.
- Trim the email and store it lowercase. Require one non-empty local part, one at-sign, and a multi-label domain; reject whitespace, repeated dots, dot-bounded local parts, and empty or hyphen-bounded domain labels. Compare stored email addresses after the same normalization.
- Require passwords to be 10 through 64 characters with at least one ASCII letter and one digit. Password1 and Abcdefgh1 are 9 characters and invalid. Letter case is otherwise unrestricted. Confirmation must match exactly.
- Date of birth is optional; a supplied value must be a real YYYY-MM-DD date. Terms acceptance is required.
- On rejection, expose visible field explanations through aria-describedby, mark invalid controls accessibly, show an alert summary, and focus the first invalid control. Make the alert summary say that there is an error, invalid input, a problem to correct, a required field, a duplicate, or an account that is already registered/exists; a neutral sentence such as only "an account with these details exists" is too ambiguous for reliable assistive feedback. Clear stale errors after correction.
- One accessible Show/Hide action must toggle both password inputs and update its accessible action name.
- Persist multiple normalized public accounts across reloads, reject duplicate username or email independently, never reserve identifiers from rejected submissions, and never store passwords or password-named properties.`;

export function implementationRepairInstructions(
  scenario: CourseScenario,
  implementationContract: string,
): string {
  return [
    ...REPAIR_CORE_INSTRUCTIONS,
    ...(scenario === "gui" ? [GUI_REPAIR_STABILITY_GUIDANCE] : []),
    `Follow this implementation contract exactly:\n\n${implementationContract}`,
  ].join("\n\n");
}

export const repairToolUseBehavior: ToolToFinalOutputFunction = (
  _context,
  toolResults,
) => {
  for (const result of toolResults) {
    if (
      result.type === "function_output" &&
      typeof result.output === "object" &&
      result.output !== null &&
      "accepted" in result.output
    ) {
      return {
        isFinalOutput: true,
        isInterrupted: undefined,
        finalOutput: JSON.stringify(result.output),
      };
    }
  }
  return { isFinalOutput: false, isInterrupted: undefined };
};

export function implementationRepairLimit(scenario: CourseScenario): number {
  return scenario === "gui" ? 5 : 3;
}

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
  #currentImplementation: string;

  constructor(input: RepairInput) {
    this.#input = input;
    this.#maxRepairs = input.maxRepairs ?? implementationRepairLimit(input.scenario);
    this.#lastTestResult = input.initialTestResult;
    this.#currentImplementation = input.currentImplementation;
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

  get currentImplementation(): string {
    return this.#currentImplementation;
  }

  async writeImplementation(path: string, content: string) {
    if (resolve(path) !== this.#files.allowedPath) {
      return this.#files.writeFile(path, content);
    }
    const source = extractArtifact(
      content,
      `${this.#input.scenario}-implementation`,
    );
    if (source.trim() === this.#currentImplementation.trim()) {
      return {
        accepted: false,
        message:
          "Write rejected because the implementation is unchanged while the train suite is not Green. " +
          `Current result: ${this.#lastTestResult.summary} ` +
          "Use the remaining failure feedback and make a substantive correction before writing again.",
      };
    }
    const result = await this.#files.writeFile(path, source);
    if (result.accepted) this.#currentImplementation = source;
    return result;
  }

  async runTrainTests(): Promise<RepairTestToolResult> {
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
    return { ...this.#lastTestResult, decision };
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
  const maxRepairs =
    input.maxRepairs ?? implementationRepairLimit(input.scenario);
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
  const instructions = implementationRepairInstructions(
    input.scenario,
    input.implementationContract,
  );
  let usage: UsageSnapshot = {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    requestUsage: [],
  };
  const rawResponses: unknown[] = [];
  const promptInputs: string[] = [];
  let finalOutput: string | undefined;
  let modelAttempts = 0;
  let unchangedAttempts = 0;
  const maxModelAttempts = maxRepairs * 2;

  const collectUsage = (next: UsageSnapshot): void => {
    usage = {
      requests: usage.requests + next.requests,
      inputTokens: usage.inputTokens + next.inputTokens,
      outputTokens: usage.outputTokens + next.outputTokens,
      totalTokens: usage.totalTokens + next.totalTokens,
      requestUsage: [...usage.requestUsage, ...next.requestUsage],
    };
  };

  while (
    workspace.lastTestResult.status === "RED" &&
    workspace.repairs < maxRepairs &&
    modelAttempts < maxModelAttempts
  ) {
    modelAttempts += 1;
    const repairsBeforeAttempt = workspace.repairs;
    const promptInput = [
      `Registration task:\n\n${input.publicBrief}`,
      `Current implementation:\n\n${workspace.currentImplementation}`,
      `Frozen train tests:\n\n${input.frozenTrainTests}`,
      `Current train-test result:\n\n${JSON.stringify(compactTestResult(workspace.lastTestResult))}`,
      `Repair attempt ${modelAttempts} of at most ${maxModelAttempts}. Accepted implementation writes so far: ${workspace.repairs} of ${maxRepairs}.`,
      ...(unchangedAttempts === 0
        ? []
        : [
            `The previous ${unchangedAttempts} model attempt${unchangedAttempts === 1 ? " was" : "s were"} rejected because the submitted file was unchanged. Inspect the remaining failure and alter the relevant implementation logic before calling write_file.`,
          ]),
    ].join("\n\n---\n\n");
    promptInputs.push(promptInput);
    const agent = new Agent({
      name: `TDD Repair Agent · round ${workspace.repairs + 1}`,
      model: runtime.config.model,
      modelSettings: {
        ...runtime.modelSettingsFor("implementation-repair"),
        toolChoice: "required",
      },
      instructions,
      tools: [writeFile],
      toolUseBehavior: repairToolUseBehavior,
      resetToolChoice: false,
    });
    try {
      const result = await runtime.runner.run(agent, promptInput, {
        maxTurns: 2,
        ...(input.signal === undefined ? {} : { signal: input.signal }),
      });
      collectUsage(snapshotUsage(result.state.usage));
      rawResponses.push(...result.rawResponses);
      if (typeof result.finalOutput === "string") {
        finalOutput = result.finalOutput;
      }
    } catch (error) {
      if (
        !(error instanceof AgentsError) ||
        error.state === undefined
      ) {
        throw error;
      }
      collectUsage(snapshotUsage(error.state.usage));
      rawResponses.push(...error.state._modelResponses);
      if (!(error instanceof MaxTurnsExceededError)) {
        throw new GenerationArtifactError(
          error instanceof Error ? error.message : String(error),
          {
            rawOutput: "",
            usage,
            rawResponses,
            prompt: {
              instructions,
              input: promptInputs.join(
                "\n\n===== NEXT REPAIR MODEL CALL =====\n\n",
              ),
            },
          },
          { cause: error },
        );
      }
    }

    if (workspace.repairs === repairsBeforeAttempt) {
      unchangedAttempts += 1;
      continue;
    }
    unchangedAttempts = 0;
    await workspace.runTrainTests();
  }
  const finalTestResult = await workspace.ensureLatestImplementationWasTested();

  return {
    status:
      finalTestResult.status === "RED"
        ? "LIMIT_REACHED"
        : finalTestResult.status,
    repairs: workspace.repairs,
    finalTestResult,
    ...(finalOutput === undefined ? {} : { finalOutput }),
    usage,
    rawResponses,
    prompt: {
      instructions,
      input: promptInputs.join(
        "\n\n===== NEXT REPAIR MODEL CALL =====\n\n",
      ),
    },
  };
}
