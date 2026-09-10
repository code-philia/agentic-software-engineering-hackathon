import { Agent, tool, type ToolToFinalOutputFunction } from "@openai/agents";
import { z } from "zod";

import type { ArtifactKind } from "../generation/artifact.js";
import { AgentFileWorkspace } from "./file-workspace.js";
import { CourseModelRuntime, snapshotUsage, type UsageSnapshot } from "./runtime.js";
import { testAuthoringInstructions } from "./test-authoring-instructions.js";

export type CourseScenario = "api" | "gui";

export interface GenerationInput {
  readonly scenario: CourseScenario;
  readonly publicBrief: string;
  readonly executionContract: string;
  readonly artifactPath: string;
  readonly signal?: AbortSignal;
}

export interface GenerationResult {
  readonly content: string;
  readonly rawOutput: string;
  readonly usage: UsageSnapshot;
  readonly rawResponses: readonly unknown[];
  readonly prompt?: { readonly instructions: string; readonly input: string };
}

export interface TestRepairInput extends GenerationInput {
  readonly currentTests: string;
  readonly referenceStatus: "TEST_ERROR" | "RED";
  readonly referenceFeedback: string;
}

function createWriteFileTool(workspace: AgentFileWorkspace, description: string) {
  return tool({
    name: "write_file",
    description: `${description} The only authorized path is ${workspace.allowedPath}.`,
    parameters: z.object({
      path: z.literal(workspace.allowedPath),
      content: z.string().min(1),
    }),
    execute: ({ path, content }) => workspace.writeFile(path, content),
  });
}

export const acceptedWriteToolUseBehavior: ToolToFinalOutputFunction = (
  _context,
  toolResults,
) => {
  let acceptedOutput: unknown;
  for (const result of toolResults) {
    if (
      result.type === "function_output" &&
      typeof result.output === "object" &&
      result.output !== null &&
      "accepted" in result.output &&
      result.output.accepted === true
    ) {
      acceptedOutput = result.output;
      break;
    }
  }
  if (acceptedOutput === undefined) {
    return { isFinalOutput: false, isInterrupted: undefined };
  }
  return {
    isFinalOutput: true,
    isInterrupted: undefined,
    finalOutput:
      typeof acceptedOutput === "string"
        ? acceptedOutput
        : JSON.stringify(acceptedOutput),
  };
};

async function runGeneration(
  runtime: CourseModelRuntime,
  input: GenerationInput,
  role: "implementation" | "tests",
): Promise<GenerationResult> {
  const artifactKind: ArtifactKind = `${input.scenario}-${role}`;
  const workspace = new AgentFileWorkspace({
    artifactKind,
    allowedPath: input.artifactPath,
    writeLabel: role === "implementation" ? "implementation" : "test suite",
  });
  const writeFile = createWriteFileTool(
    workspace,
    role === "implementation"
      ? "Write the complete generated implementation."
      : "Write the complete generated train-test suite.",
  );
  const instructions = [
    role === "implementation"
      ? "Create the complete implementation described by the public task."
      : "Create a complete executable train-test suite for the registration task.",
    ...(role === "tests"
      ? [
          "Think carefully about normalization, boundary conditions, malformed input, failed state transitions, duplicate handling, accessibility, persistence, and sensitive-data safety where applicable. Every test must make a meaningful externally observable assertion.",
          testAuthoringInstructions(input.scenario),
        ]
      : []),
    `Use write_file to save the complete artifact to ${workspace.allowedPath}.`,
    "You may write only that file. Do not merely print the source as your final answer.",
    `Follow this execution contract exactly.\n\n${input.executionContract}`,
  ].join("\n\n");
  const promptInput = `Registration task:\n\n${input.publicBrief}`;
  const agent = new Agent({
    name: role === "implementation" ? "Implementation File Agent" : "Test File Agent",
    model: runtime.config.model,
    modelSettings: {
      ...runtime.modelSettingsFor(
        role === "implementation" ? "direct" : "test-generation",
      ),
      toolChoice: "required",
    },
    instructions,
    tools: [writeFile],
    toolUseBehavior: acceptedWriteToolUseBehavior,
    resetToolChoice: false,
  });
  const result = await runtime.runner.run(
    agent,
    promptInput,
    { maxTurns: 6, ...(input.signal === undefined ? {} : { signal: input.signal }) },
  );
  const content = await workspace.readWrittenFile();

  return {
    content,
    rawOutput: typeof result.finalOutput === "string" ? result.finalOutput : "",
    usage: snapshotUsage(result.state.usage),
    rawResponses: result.rawResponses,
    prompt: { instructions, input: promptInput },
  };
}

export async function generateDirectImplementation(
  runtime: CourseModelRuntime,
  input: GenerationInput,
): Promise<GenerationResult> {
  return runGeneration(runtime, input, "implementation");
}

export async function generateTrainTests(
  runtime: CourseModelRuntime,
  input: GenerationInput,
): Promise<GenerationResult> {
  return runGeneration(runtime, input, "tests");
}

export async function repairTrainTests(
  runtime: CourseModelRuntime,
  input: TestRepairInput,
): Promise<GenerationResult> {
  const workspace = new AgentFileWorkspace({
    artifactKind: `${input.scenario}-tests`,
    allowedPath: input.artifactPath,
    writeLabel: "test-suite rewrite",
  });
  const writeFile = createWriteFileTool(
    workspace,
    "Replace the complete train-test suite once, after diagnosis is complete.",
  );
  const instructions = [
    "Repair the executable train-test suite so it runs successfully against a contract-correct reference implementation.",
    input.referenceStatus === "TEST_ERROR"
      ? "Fix its syntax, loading, collection, forbidden-access, or execution-contract problem."
      : "Fix any test-suite defect that makes the suite disagree with the supplied behavior, including invalid fixtures, helper-generated data, request construction, state isolation, or assertions.",
    "You have exactly one accepted write_file call in this repair round. Analyze the complete failure pattern and current suite before calling it. Do not write unchanged content, and do not call write_file until the final corrected suite is ready.",
    "You must finish the repair by calling write_file exactly once. Returning prose or source text without a write_file call is a failed repair.",
    ...(input.scenario === "gui"
      ? [
          "If the runner exceeded its overall time limit, reducing and consolidating the suite is part of the required repair. Replace one-test-per-example structures with a small number of focused scenario tests and remove redundant waits and assertions while preserving supported behavior coverage.",
          "Do not preserve a large suite merely by changing assertion timeouts. The repaired suite must finish comfortably within the fixed runner budget using one worker.",
          "When the same locator timeout causes several tests to fail, fix that shared locator first instead of rewriting unrelated assertions. In particular, use getByRole('checkbox', { name: /terms/i }) for terms rather than an anchored label matcher, and use a submit-specific locator for the primary action.",
          "For presentation failures, distinguish foreground color from backgroundColor. The orange requirement applies to the submit action's background; do not expect its readable foreground text to be orange.",
          "In field-policy tables, repeated success rows can pollute later rows through legitimate duplicate detection. Clear browser storage before each independent boundary row, or make both identifiers unique for every success. Keep persistence assertions in their separate scenarios.",
          "The username normalization rule trims whitespace but preserves spelling and case. Assert the trimmed submitted value itself; do not compare storage with a differently-cased seed variable.",
          "A label associated with an input may be a sibling through label[for], not an ancestor. For label-position failures, use the input element's labels collection and compare bounding rectangles; do not use an ancestor-label XPath.",
        ]
      : []),
    "When many expected-success cases receive the same rejection status, inspect shared fixtures, generators, request helpers, and default payloads before changing individual assertions.",
    "Do not change the implementation. Preserve supported coverage while correcting invalid or non-executable tests.",
    "Use only the task, the supplied test-authoring instructions, test contract, current suite, and bounded runner feedback. Do not attempt to inspect the implementation, reference implementation, validation files, repository, working directory, or run artifacts.",
    testAuthoringInstructions(input.scenario),
    `Use write_file to replace the complete test suite at ${workspace.allowedPath}.`,
    `Follow this execution contract exactly:\n\n${input.executionContract}`,
  ].join("\n\n");
  const promptInput = [
    `Registration task:\n\n${input.publicBrief}`,
    `Current train tests:\n\n${input.currentTests}`,
    `Reference status: ${input.referenceStatus}`,
    `Reference feedback:\n\n${input.referenceFeedback}`,
  ].join("\n\n---\n\n");
  const agent = new Agent({
    name: "Test File Repair Agent",
    model: runtime.config.model,
    modelSettings: {
      ...runtime.modelSettingsFor("test-repair"),
      toolChoice: "required",
    },
    instructions,
    tools: [writeFile],
    toolUseBehavior: acceptedWriteToolUseBehavior,
    resetToolChoice: false,
  });
  const result = await runtime.runner.run(
    agent,
    promptInput,
    { maxTurns: 6, ...(input.signal === undefined ? {} : { signal: input.signal }) },
  );
  const content = await workspace.readWrittenFile();

  return {
    content,
    rawOutput: typeof result.finalOutput === "string" ? result.finalOutput : "",
    usage: snapshotUsage(result.state.usage),
    rawResponses: result.rawResponses,
    prompt: { instructions, input: promptInput },
  };
}
