import {
  Agent,
  AgentsError,
  tool,
  type ToolToFinalOutputFunction,
} from "@openai/agents";
import { z } from "zod";

import type { ArtifactKind } from "../generation/artifact.js";
import { ArtifactExtractionError } from "../generation/artifact.js";
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

/** Preserves billable inference evidence when artifact delivery fails afterwards. */
export class GenerationArtifactError extends ArtifactExtractionError {
  readonly usage: UsageSnapshot;
  readonly rawOutput: string;
  readonly rawResponses: readonly unknown[];
  readonly prompt: { readonly instructions: string; readonly input: string };

  constructor(
    message: string,
    evidence: Omit<GenerationResult, "content">,
    options?: { readonly cause?: unknown },
  ) {
    super(message);
    this.name = "GenerationArtifactError";
    this.usage = evidence.usage;
    this.rawOutput = evidence.rawOutput;
    this.rawResponses = evidence.rawResponses;
    this.prompt = evidence.prompt!;
    if (options && "cause" in options) this.cause = options.cause;
  }
}

export function generationArtifactErrorFromRunnerError(
  error: unknown,
  prompt: { readonly instructions: string; readonly input: string },
): GenerationArtifactError | undefined {
  if (!(error instanceof AgentsError) || error.state === undefined) {
    return undefined;
  }
  return new GenerationArtifactError(
    error instanceof Error ? error.message : String(error),
    {
      rawOutput: "",
      usage: snapshotUsage(error.state.usage),
      rawResponses: error.state._modelResponses,
      prompt,
    },
    { cause: error },
  );
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

function isMalformedToolArgumentsError(error: unknown): boolean {
  const visited = new Set<unknown>();
  let current: unknown = error;

  while (current !== undefined && current !== null && !visited.has(current)) {
    visited.add(current);
    if (current instanceof SyntaxError) {
      const message = current.message.toLowerCase();
      if (
        message.includes("not valid json") ||
        message.includes("json parse") ||
        message.includes(" in json") ||
        /unexpected (?:token|character).*json/.test(message)
      ) {
        return true;
      }
    }
    current =
      typeof current === "object" && "cause" in current
        ? current.cause
        : undefined;
  }

  return false;
}

async function runWithMalformedToolArgumentsRewrite<T>(
  promptInput: string,
  run: (input: string) => Promise<T>,
): Promise<T> {
  try {
    return await run(promptInput);
  } catch (error) {
    if (!isMalformedToolArgumentsError(error)) throw error;
    return run(
      [
        promptInput,
        "Your previous response could not be executed because the write_file tool arguments were malformed and were not valid JSON.",
        "Retry the task from scratch now. Call write_file exactly once with arguments matching its schema, put the complete artifact in the content field, and return no prose.",
      ].join("\n\n"),
    );
  }
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
  let result;
  try {
    result = await runWithMalformedToolArgumentsRewrite(
      promptInput,
      (attemptInput) =>
        runtime.runner.run(agent, attemptInput, {
          maxTurns: 6,
          ...(input.signal === undefined ? {} : { signal: input.signal }),
        }),
    );
  } catch (error) {
    throw (
      generationArtifactErrorFromRunnerError(error, {
        instructions,
        input: promptInput,
      }) ?? error
    );
  }
  const evidence = {
    rawOutput: typeof result.finalOutput === "string" ? result.finalOutput : "",
    usage: snapshotUsage(result.state.usage),
    rawResponses: result.rawResponses,
    prompt: { instructions, input: promptInput },
  };
  let content: string;
  try {
    content = await workspace.readWrittenFile();
  } catch (error) {
    throw new GenerationArtifactError(
      error instanceof Error ? error.message : String(error),
      evidence,
      { cause: error },
    );
  }

  return {
    content,
    ...evidence,
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
    rejectUnchangedFrom: input.currentTests,
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
    "Treat every supplied reference failure as evidence about a defect in the tests. Change the failing locator, fixture, helper, state setup, or assertion directly; do not keep rerunning an assertion that the reference feedback has already disproved.",
    "Analyze the complete failure pattern silently. Do not output diagnosis, plans, commentary, Markdown, or source as prose. Your only visible response must be exactly one write_file tool call containing the complete corrected suite.",
    "You have exactly one accepted write_file call in this repair round. Do not write unchanged content, and do not call write_file until the final corrected suite is ready.",
    "You must finish the repair by calling write_file exactly once. Returning prose or source text without a write_file call is a failed repair.",
    ...(input.scenario === "gui"
      ? [
          "If the runner exceeded its overall time limit, reducing and consolidating the suite is part of the required repair. Replace one-test-per-example structures with a small number of focused scenario tests and remove redundant waits and assertions while preserving supported behavior coverage.",
          "Do not preserve a large suite merely by changing assertion timeouts. The repaired suite must finish comfortably within the fixed runner budget using one worker.",
          "When the same locator timeout causes several tests to fail, fix that shared locator first instead of rewriting unrelated assertions. In particular, use getByRole('checkbox', { name: /terms/i }) for terms rather than an anchored label matcher, and use a submit-specific locator for the primary action.",
          "For presentation failures, distinguish foreground color from backgroundColor. The orange requirement applies to the submit action's background; do not expect its readable foreground text to be orange. Parse computed numeric color channels and compare their broad relationships instead of matching serialized rgb(...) text with a fragile regular expression. The form itself may be transparent inside the requested white panel, so inspect visible ancestors before declaring that the panel is not white.",
          "In field-policy tables, repeated success rows can pollute later rows through legitimate duplicate detection. Clear browser storage before each independent boundary row, or make both identifiers unique for every success. Keep persistence assertions in their separate scenarios.",
          "The username normalization rule trims whitespace but preserves spelling and case. Assert the trimmed submitted value itself; do not compare storage with a differently-cased seed variable.",
          "A label associated with an input may be a sibling through label[for], not an ancestor. For label-position failures, use the input element's labels collection and compare bounding rectangles; do not use an ancestor-label XPath.",
          "Never keep or add a malformed native-date case. In particular, do not fill a date input with a non-existent date such as February 29 in a non-leap year. The supported date coverage is one real Gregorian date and one omitted date.",
          "For password table failures, classify the field that actually owns the error. A confirmation mismatch must assert an error on confirmPassword, not password. Abcdefghi1 is a valid 10-character password; do not classify it as too short.",
          "The password rule requires an ASCII letter and a digit, but does not require both uppercase and lowercase letters. A value such as alllowercase1 is valid; do not invent a mixed-case requirement.",
          "To prove that a rejected attempt reserves nothing, submit otherwise-valid username and email identifiers with an invalid companion such as a short password or missing terms, then correct only that companion and reuse the same identifiers. Never expect an unchanged syntactically invalid username or email to become valid on a later attempt.",
          "If a supposedly valid row fails because its companion username or email contains spaces or punctuation copied from a row label, replace that local generator with the supplied uniqueRegistration() helper. Never derive constrained identity values from human-readable labels.",
          "Do not invent a minimum top-level-domain length. Within this exercise, a one-letter alphabetic final domain label is valid when the address otherwise has one at-sign, a non-empty local part, and non-empty domain labels without forbidden dot or hyphen placement.",
          "In a persistence or duplicate scenario, resetRegistration/localStorage.clear is allowed only before creating the prerequisite account. After creation succeeds, preserve storage through page.reload or openRegistration until both username and email duplicate assertions finish.",
          "If expectFieldError reports an empty described message, the chosen field is probably not the field that failed. Correct the case expectation or field name rather than weakening expectFieldError.",
          "Await every asynchronous supplied helper, including storageCorpus. Calling Object.keys or Object.values on the unresolved Promise is always a test defect.",
          "uniqueRegistration() returns only username and email, never a password. If a storage assertion receives undefined from credentials.password or another missing property, replace it with an explicit valid password constant that the test passes to fillRegistration, then assert that exact string is absent.",
          "Each Playwright test has its own lexical scope. If feedback reports that c or another locator variable is undefined, define const c = controls(page) inside that failing test or move the shared operation into a properly parameterized helper.",
          "Do not prefix or suffix a username value whose exact length is under test; that changes the boundary. Make companion emails unique instead, and keep every expected-success username within 20 characters.",
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
  let result;
  try {
    result = await runWithMalformedToolArgumentsRewrite(
      promptInput,
      (attemptInput) =>
        runtime.runner.run(agent, attemptInput, {
          maxTurns: 6,
          ...(input.signal === undefined ? {} : { signal: input.signal }),
        }),
    );
  } catch (error) {
    throw (
      generationArtifactErrorFromRunnerError(error, {
        instructions,
        input: promptInput,
      }) ?? error
    );
  }
  const evidence = {
    rawOutput: typeof result.finalOutput === "string" ? result.finalOutput : "",
    usage: snapshotUsage(result.state.usage),
    rawResponses: result.rawResponses,
    prompt: { instructions, input: promptInput },
  };
  let content: string;
  try {
    content = await workspace.readWrittenFile();
  } catch (error) {
    throw new GenerationArtifactError(
      error instanceof Error ? error.message : String(error),
      evidence,
      { cause: error },
    );
  }

  return {
    content,
    ...evidence,
  };
}
