import { Agent, tool } from "@openai/agents";
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
      path: z.string().min(1),
      content: z.string().min(1),
    }),
    execute: ({ path, content }) => workspace.writeFile(path, content),
  });
}

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
    modelSettings: runtime.modelSettings,
    instructions,
    tools: [writeFile],
  });
  const result = await runtime.runner.run(
    agent,
    promptInput,
    { maxTurns: 4, ...(input.signal === undefined ? {} : { signal: input.signal }) },
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
    modelSettings: runtime.modelSettings,
    instructions,
    tools: [writeFile],
  });
  const result = await runtime.runner.run(
    agent,
    promptInput,
    { maxTurns: 4, ...(input.signal === undefined ? {} : { signal: input.signal }) },
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
