import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";

import { afterEach, describe, expect, it, vi } from "vitest";
import { APIConnectionTimeoutError } from "openai";
import { MaxTurnsExceededError, ModelBehaviorError } from "@openai/agents";

import { AgentFileWorkspace } from "../../src/agents/file-workspace.js";
import {
  acceptedWriteToolUseBehavior,
  generateDirectImplementation,
  generateTrainTests,
  GenerationArtifactError,
  generationArtifactErrorFromRunnerError,
  repairTrainTests,
} from "../../src/agents/generate.js";
import { RepairWorkspace, runTddRepair } from "../../src/agents/repair.js";
import { testAuthoringInstructions } from "../../src/agents/test-authoring-instructions.js";
import {
  CourseModelRuntime,
  resolveInferencePolicy,
} from "../../src/agents/runtime.js";
import {
  loadModelConfig,
  ModelConfigError,
} from "../../src/config/model-config.js";
import {
  parseCommonOptions,
  parseDemoOptions,
} from "../../src/cli/arguments.js";
import {
  ArtifactExtractionError,
  extractArtifact,
} from "../../src/generation/artifact.js";
import { TerminalPresenter } from "../../src/presentation/presenter.js";
import { filteredEnvironment } from "../../src/testing/process.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function temporaryDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "tdd-course-model-"));
  temporaryDirectories.push(directory);
  return directory;
}

describe("model configuration", () => {
  it("uses expanded output budgets for every generated artifact stage", async () => {
    const runtime = new CourseModelRuntime({
      envFile: "/unused/model.env",
      baseUrl: "https://provider.example/v1",
      apiKey: "secret-for-test",
      model: "deepseek-v4-flash-0731",
    });

    try {
      expect(runtime.modelSettings.temperature).toBe(0.2);
      expect(runtime.modelSettingsFor("doctor").timeoutMs).toBe(180_000);
      expect(runtime.modelSettingsFor("direct").timeoutMs).toBe(300_000);
      expect(runtime.modelSettingsFor("test-generation").timeoutMs).toBe(
        900_000,
      );
      expect(runtime.modelSettingsFor("test-repair").timeoutMs).toBe(900_000);
      expect(runtime.modelSettingsFor("implementation-repair").timeoutMs).toBe(
        900_000,
      );
      expect(runtime.modelSettingsFor("direct").maxTokens).toBe(16_384);
      expect(runtime.modelSettingsFor("test-generation").maxTokens).toBe(
        16_384,
      );
      expect(runtime.modelSettingsFor("test-repair").maxTokens).toBe(16_384);
      expect(runtime.modelSettingsFor("implementation-repair").maxTokens).toBe(
        16_384,
      );
      expect(runtime.modelSettings.retry?.maxRetries).toBe(1);
      expect(runtime.executionPolicy.scenarioDeadlineMs).toEqual({
        api: 2_700_000,
        gui: 1_800_000,
      });
    } finally {
      await runtime.close();
    }
  });

  it("applies the exact model policy in code rather than environment configuration", async () => {
    const runtime = new CourseModelRuntime({
      envFile: "/unused/model.env",
      baseUrl: "https://provider.example/v1",
      apiKey: "secret-for-test",
      model: "qwen3.8-max",
    });

    try {
      expect(runtime.modelSettings).toMatchObject({
        temperature: 0,
        providerData: { enable_thinking: false },
      });
    } finally {
      await runtime.close();
    }
  });

  it("selects the stage timeout on every generation and repair agent path", async () => {
    const runtime = new CourseModelRuntime({
      envFile: "/unused/model.env",
      baseUrl: "https://provider.example/v1",
      apiKey: "secret-for-test",
      model: "qwen3.8-max",
    });
    const directory = await temporaryDirectory();
    const stopped = new Error("stop before model request");
    const run = vi.spyOn(runtime.runner, "run").mockRejectedValue(stopped);
    const baseInput = {
      scenario: "api" as const,
      publicBrief: "Register a user.",
      executionContract: "Export a handler.",
      artifactPath: join(directory, "artifact.ts"),
    };

    try {
      await expect(generateDirectImplementation(runtime, baseInput)).rejects.toBe(
        stopped,
      );
      expect(run.mock.calls.at(-1)?.[0].modelSettings.timeoutMs).toBe(300_000);

      await expect(generateTrainTests(runtime, baseInput)).rejects.toBe(stopped);
      expect(run.mock.calls.at(-1)?.[0].modelSettings.timeoutMs).toBe(900_000);

      await expect(
        repairTrainTests(runtime, {
          ...baseInput,
          currentTests: "test('registration', () => {});",
          referenceStatus: "RED",
          referenceFeedback: "One assertion failed.",
        }),
      ).rejects.toBe(stopped);
      expect(run.mock.calls.at(-1)?.[0].modelSettings.timeoutMs).toBe(900_000);

      await expect(
        runTddRepair(runtime, {
          scenario: "api",
          publicBrief: "Register a user.",
          implementationContract: "Export a handler.",
          implementationPath: join(directory, "implementation.ts"),
          currentImplementation: "export default () => new Response();",
          frozenTrainTests: "test('registration', () => {});",
          initialTestResult: {
            status: "RED",
            summary: "One assertion failed.",
            output: "failed",
          },
          runTrainTests: async () => ({
            status: "RED",
            summary: "One assertion failed.",
            output: "failed",
          }),
        }),
      ).rejects.toMatchObject({
        name: "GenerationArtifactError",
        message: stopped.message,
        cause: stopped,
        usage: { requests: 0, totalTokens: 0 },
        prompt: { input: expect.stringContaining("Current train-test result") },
      });
      expect(run.mock.calls.at(-1)?.[0].modelSettings.timeoutMs).toBe(900_000);
    } finally {
      await runtime.close();
    }
  });

  it("retries only truncation-shaped proxy 400s despite generic provider vetoes", async () => {
    const runtime = new CourseModelRuntime({
      envFile: "/unused/model.env",
      baseUrl: "https://provider.example/v1",
      apiKey: "secret-for-test",
      model: "qwen3.8-max",
    });
    const retryPolicy = runtime.modelSettings.retry?.policy;
    expect(retryPolicy).toBeTypeOf("function");
    const context = {
      attempt: 1,
      maxRetries: 1,
      stream: false,
      providerAdvice: { suggested: false as const },
      normalized: {
        statusCode: 400,
        errorCode: "proxy_error",
        isNetworkError: false,
        isAbort: false,
      },
    };

    try {
      await expect(
        Promise.resolve(
          retryPolicy!({
            ...context,
            error: new Error("provider request failed", {
              cause: new Error("unexpected EOF while reading response"),
            }),
          }),
        ),
      ).resolves.toMatchObject({ retry: true, approveUnsafeReplay: true });

      await expect(
        Promise.resolve(
          retryPolicy!({
            ...context,
            error: new Error("invalid request payload"),
          }),
        ),
      ).resolves.toMatchObject({ retry: false });

      await expect(
        Promise.resolve(
          retryPolicy!({
            ...context,
            normalized: {
              ...context.normalized,
              errorCode: "invalid_request",
            },
            error: new Error("unexpected EOF while reading response"),
          }),
        ),
      ).resolves.toMatchObject({ retry: false });

      await expect(
        Promise.resolve(
          retryPolicy!({
            ...context,
            normalized: { ...context.normalized, statusCode: 503 },
            error: new Error("service unavailable"),
          }),
        ),
      ).resolves.toMatchObject({ retry: false });
    } finally {
      await runtime.close();
    }
  });

  it("retries provider connection timeouts and gateway 524 responses once", async () => {
    const runtime = new CourseModelRuntime({
      envFile: "/unused/model.env",
      baseUrl: "https://provider.example/v1",
      apiKey: "secret-for-test",
      model: "kimi-k3",
    });
    const retryPolicy = runtime.modelSettings.retry?.policy;
    expect(retryPolicy).toBeTypeOf("function");
    const normalized = {
      isNetworkError: false,
      isAbort: false,
    };

    try {
      await expect(
        Promise.resolve(
          retryPolicy!({
            attempt: 1,
            maxRetries: 1,
            stream: false,
            normalized,
            error: new APIConnectionTimeoutError(),
          }),
        ),
      ).resolves.toMatchObject({ retry: true });

      await expect(
        Promise.resolve(
          retryPolicy!({
            attempt: 1,
            maxRetries: 1,
            stream: false,
            normalized: { ...normalized, statusCode: 524 },
            error: new Error("upstream request timed out"),
          }),
        ),
      ).resolves.toMatchObject({ retry: true });
    } finally {
      await runtime.close();
    }
  });

  it("disables thinking for Kimi after endpoint compatibility verification", () => {
    expect(
      resolveInferencePolicy({
        envFile: "/unused/model.env",
        baseUrl: "https://provider.example/v1",
        apiKey: "secret-for-test",
        model: "kimi-k3",
      }),
    ).toMatchObject({
      mode: "non-thinking",
      temperature: 0,
      providerData: { thinking: { type: "disabled" } },
    });
  });

  it("uses low thinking for GLM 5.3 while keeping deterministic sampling", () => {
    expect(
      resolveInferencePolicy({
        envFile: "/unused/model.env",
        baseUrl: "https://provider.example/v1",
        apiKey: "secret-for-test",
        model: "glm-5.3",
      }),
    ).toMatchObject({
      id: "classroom-model-policy-v2",
      mode: "lowest-supported-thinking",
      temperature: 0,
      reasoningEffort: "low",
      providerData: {},
    });
  });

  it("loads one selected environment file without changing process.env", async () => {
    const directory = await temporaryDirectory();
    const envFile = join(directory, "model.env");
    await writeFile(
      envFile,
      "base_url=https://provider.example/v1\napi_key=secret-for-test\nmodel=deepseek-v4-flash-0731\n",
      "utf8",
    );

    const before = process.env.api_key;
    const config = await loadModelConfig(envFile);

    expect(config).toMatchObject({
      baseUrl: "https://provider.example/v1",
      model: "deepseek-v4-flash-0731",
    });
    expect(process.env.api_key).toBe(before);
  });

  it("rejects model behavior controls in an environment file", async () => {
    const directory = await temporaryDirectory();
    const envFile = join(directory, "model.env");
    await writeFile(
      envFile,
      "base_url=https://provider.example/v1\napi_key=secret-for-test\nmodel=deepseek-v4-flash-0731\ntemperature=1\n",
      "utf8",
    );

    await expect(loadModelConfig(envFile)).rejects.toThrow(
      "temperature is controlled by the course runtime",
    );
  });

  it("reports invalid field names without exposing values", async () => {
    const directory = await temporaryDirectory();
    const envFile = join(directory, "broken.env");
    await writeFile(envFile, "base_url=invalid\napi_key=do-not-show\n", "utf8");

    await expect(loadModelConfig(envFile)).rejects.toSatisfy((error) => {
      expect(error).toBeInstanceOf(ModelConfigError);
      expect(String(error)).toContain("base_url");
      expect(String(error)).toContain("model");
      expect(String(error)).not.toContain("do-not-show");
      return true;
    });
  });

  it("accepts an optional provider route for multi-channel gateways", async () => {
    const directory = await temporaryDirectory();
    const envFile = join(directory, "legacy.env");
    await writeFile(
      envFile,
      "provider=qwen\nbase_url=https://provider.example/v1\napi_key=secret-for-test\nmodel=qwen3.8-max\n",
      "utf8",
    );

    await expect(loadModelConfig(envFile)).resolves.toMatchObject({
      model: "qwen3.8-max",
      provider: "qwen",
    });
  });

  it("lets --model override the environment default", async () => {
    const directory = await temporaryDirectory();
    const envFile = join(directory, "model.env");
    await writeFile(
      envFile,
      "base_url=https://provider.example/v1\napi_key=secret-for-test\nmodel=glm-5.2\n",
      "utf8",
    );

    await expect(
      loadModelConfig(envFile, "QWEN3.8-MAX"),
    ).resolves.toMatchObject({
      model: "qwen3.8-max",
    });
    expect(parseCommonOptions(["--model", "kimi-k3"])).toMatchObject({
      model: "kimi-k3",
    });
    expect(
      parseDemoOptions(["--model=glm-5.3", "--no-interactive"]),
    ).toMatchObject({
      model: "glm-5.3",
      interactive: false,
    });
  });

  it("passes provider-specific model identifiers through without a local allowlist", async () => {
    const directory = await temporaryDirectory();
    const envFile = join(directory, "custom-model.env");
    await writeFile(
      envFile,
      "base_url=https://provider.example/v1\napi_key=secret-for-test\nmodel=Vendor/DeepSeek-V4-Pro-custom\n",
      "utf8",
    );

    const config = await loadModelConfig(envFile);
    expect(config.model).toBe("Vendor/DeepSeek-V4-Pro-custom");
    expect(resolveInferencePolicy(config)).toMatchObject({
      model: "Vendor/DeepSeek-V4-Pro-custom",
      mode: "non-thinking",
      temperature: 0,
      providerData: {},
    });
  });

  it("enables light thinking and modest sampling for DeepSeek aliases", () => {
    for (const model of [
      "deepseek-v4-pro",
      "deepseek-v4-pro-0813",
      "deepseek-v4-flash",
      "deepseek-v4-flash-0731",
    ]) {
      expect(
        resolveInferencePolicy({
          envFile: "/unused/model.env",
          baseUrl: "https://provider.example/v1",
          apiKey: "secret-for-test",
          model,
        }),
      ).toMatchObject({
        model,
        id: "classroom-model-policy-v2",
        mode: "lowest-supported-thinking",
        temperature: 0.2,
        reasoningEffort: "low",
        providerData: { thinking: { type: "enabled" } },
      });
    }
  });
});

describe("generated file agent writes", () => {
  it("finalizes accepted writes but returns rejected writes to the model", async () => {
    await expect(
      Promise.resolve(
        acceptedWriteToolUseBehavior({} as never, [
          {
            type: "function_output",
            output: { accepted: true, message: "written" },
          } as never,
        ]),
      ),
    ).resolves.toEqual({
      isFinalOutput: true,
      isInterrupted: undefined,
      finalOutput: JSON.stringify({ accepted: true, message: "written" }),
    });

    await expect(
      Promise.resolve(
        acceptedWriteToolUseBehavior({} as never, [
          {
            type: "function_output",
            output: { accepted: false, message: "wrong path" },
          } as never,
        ]),
      ),
    ).resolves.toEqual({
      isFinalOutput: false,
      isInterrupted: undefined,
    });
  });

  it("requires the exact artifact path and retains required tool use for retries", async () => {
    const runtime = new CourseModelRuntime({
      envFile: "/unused/model.env",
      baseUrl: "https://provider.example/v1",
      apiKey: "secret-for-test",
      model: "qwen3.8-max",
    });
    const directory = await temporaryDirectory();
    const artifactPath = join(directory, "artifact.ts");
    const stopped = new Error("stop before model request");
    const run = vi.spyOn(runtime.runner, "run").mockRejectedValue(stopped);
    const baseInput = {
      scenario: "api" as const,
      publicBrief: "Register a user.",
      executionContract: "Export a handler.",
      artifactPath,
    };

    try {
      await expect(generateDirectImplementation(runtime, baseInput)).rejects.toBe(
        stopped,
      );
      await expect(generateTrainTests(runtime, baseInput)).rejects.toBe(stopped);
      await expect(
        repairTrainTests(runtime, {
          ...baseInput,
          currentTests: "test('registration', () => {});",
          referenceStatus: "RED",
          referenceFeedback: "Expected 201, received password-related 400.",
        }),
      ).rejects.toBe(stopped);

      expect(run).toHaveBeenCalledTimes(3);
      for (const [agent, , options] of run.mock.calls) {
        expect(agent.modelSettings.toolChoice).toBe("required");
        expect(agent.resetToolChoice).toBe(false);
        expect(agent.toolUseBehavior).toBe(acceptedWriteToolUseBehavior);
        expect(options).toMatchObject({ maxTurns: 6 });

        const writeFile = agent.tools[0];
        expect(writeFile?.type).toBe("function");
        if (writeFile?.type !== "function") throw new Error("missing write_file");
        expect(writeFile.parameters).toMatchObject({
          properties: { path: { const: artifactPath } },
        });
      }
    } finally {
      await runtime.close();
    }
  });
});

describe("artifact extraction", () => {
  it("accepts raw output or one plain code fence", () => {
    expect(
      extractArtifact(
        "export default () => new Response();",
        "api-implementation",
      ),
    ).toBe("export default () => new Response();\n");
    expect(
      extractArtifact("```html\n<html></html>\n```", "gui-implementation"),
    ).toBe("<html></html>\n");
  });

  it("rejects commentary around generated source", () => {
    expect(() =>
      extractArtifact(
        "Here is the file:\n```html\n<html></html>\n```",
        "gui-implementation",
      ),
    ).toThrow(ArtifactExtractionError);
  });
});

describe("test authoring instructions", () => {
  it("supplies scenario-specific product behavior", () => {
    const api = testAuthoringInstructions("api");
    const gui = testAuthoringInstructions("gui");

    expect(api).toContain("3 to 20 characters");
    expect(api).toContain("10 to 64 characters");
    expect(api).toContain("Password01");
    expect(api).toContain("Abcdefghi1");
    expect(api).toContain("Password1 and Abcdefgh1 are only 9 characters");
    expect(api).toContain("'A1' + 'x'.repeat(62)");
    expect(api).toContain("expected to return 201");
    expect(api).toContain("shared password and password-confirmation fixture");
    expect(api).toContain("Do not use Date.now(), Math.random(), UUIDs");
    expect(api).toContain(
      "include the received response body as a safe assertion message",
    );
    expect(gui).toContain("Match the heading with /register|create.*account|sign up/i");
    expect(gui).toContain("alert summary");
    expect(gui).toContain("documented Playwright matchers");
  });

  it("prints only the caller-supplied safe prompt preview", () => {
    let terminalOutput = "";
    const output = new Writable({
      write(chunk, _encoding, callback) {
        terminalOutput += chunk.toString();
        callback();
      },
    });
    const presenter = new TerminalPresenter({ interactive: false, output });

    presenter.prompt(
      "Train test generation",
      "Registration task: (same as Act 0)\n\nWrite executable Vitest tests.",
      "/tmp/train-tests-prompt.json",
    );

    expect(terminalOutput).toContain("Write executable Vitest tests");
    expect(terminalOutput).toContain("/tmp/train-tests-prompt.json");
    expect(terminalOutput).not.toContain("3 to 20 characters");
    expect(terminalOutput).not.toContain("Username policy");
  });

  it("prints per-stage metrics and a machine-readable model total", () => {
    let terminalOutput = "";
    const output = new Writable({
      write(chunk, _encoding, callback) {
        terminalOutput += chunk.toString();
        callback();
      },
    });
    const presenter = new TerminalPresenter({ interactive: false, output });

    presenter.modelCall({
      stage: "direct",
      durationMs: 1_234,
      usage: {
        requests: 1,
        inputTokens: 100,
        outputTokens: 200,
        totalTokens: 300,
        requestUsage: [],
      },
    });
    presenter.modelSummary({
      model: "example-model",
      stages: 1,
      durationMs: 1_234,
      requests: 1,
      inputTokens: 100,
      outputTokens: 200,
      totalTokens: 300,
      calls: [
        {
          stage: "direct",
          durationMs: 1_234,
          usage: {
            requests: 1,
            inputTokens: 100,
            outputTokens: 200,
            totalTokens: 300,
            requestUsage: [],
          },
        },
      ],
    });

    expect(terminalOutput).toContain("[model] direct · 1.2s");
    expect(terminalOutput).toContain("input 100 · output 200 · total 300 tokens");
    const summaryLine = terminalOutput
      .split("\n")
      .find((line) => line.startsWith("MODEL_RUN_SUMMARY "));
    expect(summaryLine).toBeTruthy();
    expect(JSON.parse(summaryLine!.slice("MODEL_RUN_SUMMARY ".length))).toEqual({
      model: "example-model",
      stages: 1,
      durationMs: 1_234,
      requests: 1,
      inputTokens: 100,
      outputTokens: 200,
      totalTokens: 300,
      calls: [
        {
          stage: "direct",
          durationMs: 1_234,
          usage: {
            requests: 1,
            inputTokens: 100,
            outputTokens: 200,
            totalTokens: 300,
            requestUsage: [],
          },
        },
      ],
    });
  });
});

describe("generated-code environment", () => {
  it("does not pass provider credentials into test subprocesses", () => {
    const previous = process.env.api_key;
    process.env.api_key = "must-not-leak";
    try {
      expect(filteredEnvironment()).not.toHaveProperty("api_key");
      expect(
        filteredEnvironment({ COURSE_API_BASE_URL: "http://127.0.0.1:1" }),
      ).toHaveProperty("COURSE_API_BASE_URL", "http://127.0.0.1:1");
    } finally {
      if (previous === undefined) delete process.env.api_key;
      else process.env.api_key = previous;
    }
  });
});

describe("repair workspace", () => {
  it("counts successful implementation writes and verifies the latest write", async () => {
    const directory = await temporaryDirectory();
    const implementationPath = join(directory, "register.ts");
    const runTrainTests = vi.fn(async () => ({
      status: "GREEN" as const,
      summary: "All train tests passed.",
      output: "ok",
    }));
    const workspace = new RepairWorkspace({
      scenario: "api",
      publicBrief: "Register a user.",
      implementationContract: "Export a handler.",
      implementationPath,
      currentImplementation: "export default () => new Response();\n",
      frozenTrainTests: "",
      initialTestResult: {
        status: "RED",
        summary: "One failure.",
        output: "failed",
      },
      runTrainTests,
      maxRepairs: 1,
    });

    await expect(
      workspace.writeImplementation(
        implementationPath,
        "export default () => Response.json({ ok: true });",
      ),
    ).resolves.toMatchObject({ accepted: true });
    await expect(
      workspace.writeImplementation(
        implementationPath,
        "export default () => new Response();",
      ),
    ).resolves.toMatchObject({ accepted: false });
    await expect(
      workspace.ensureLatestImplementationWasTested(),
    ).resolves.toMatchObject({
      status: "GREEN",
    });

    expect(runTrainTests).toHaveBeenCalledOnce();
    expect(await readFile(implementationPath, "utf8")).toContain(
      "Response.json",
    );
  });
});

describe("agent file workspace", () => {
  it("preserves usage and responses from a state-bearing runner failure", () => {
    const runnerError = new MaxTurnsExceededError("Max turns (6) exceeded", {
      usage: {
        requests: 2,
        inputTokens: 120,
        outputTokens: 30,
        totalTokens: 150,
        requestUsage: [],
      },
      _modelResponses: [{ id: "failed-response" }],
    } as never);

    const converted = generationArtifactErrorFromRunnerError(runnerError, {
      instructions: "repair the tests",
      input: "current suite and feedback",
    });

    expect(converted).toMatchObject({
      message: "Max turns (6) exceeded",
      usage: { requests: 2, totalTokens: 150 },
      rawResponses: [{ id: "failed-response" }],
      prompt: {
        instructions: "repair the tests",
        input: "current suite and feedback",
      },
      cause: runnerError,
    });
  });

  it("preserves implementation-repair evidence from a state-bearing runner failure", async () => {
    const runtime = new CourseModelRuntime({
      envFile: "/unused/model.env",
      baseUrl: "https://provider.example/v1",
      apiKey: "secret-for-test",
      model: "qwen3.8-max",
    });
    const directory = await temporaryDirectory();
    const runnerError = new ModelBehaviorError("invalid model tool call", {
      usage: {
        requests: 1,
        inputTokens: 80,
        outputTokens: 20,
        totalTokens: 100,
        requestUsage: [],
      },
      _modelResponses: [{ id: "repair-failed-response" }],
    } as never);
    vi.spyOn(runtime.runner, "run").mockRejectedValue(runnerError);

    try {
      await expect(
        runTddRepair(runtime, {
          scenario: "gui",
          publicBrief: "Register an account.",
          implementationContract: "Write one index.html file.",
          implementationPath: join(directory, "index.html"),
          currentImplementation: "<html><body>current</body></html>",
          frozenTrainTests: "test('registration', () => {});",
          initialTestResult: {
            status: "RED",
            summary: "One assertion failed.",
            output: "failed",
          },
          runTrainTests: async () => ({
            status: "RED",
            summary: "One assertion failed.",
            output: "failed",
          }),
        }),
      ).rejects.toMatchObject<Partial<GenerationArtifactError>>({
        name: "GenerationArtifactError",
        usage: {
          requests: 1,
          inputTokens: 80,
          outputTokens: 20,
          totalTokens: 100,
          requestUsage: [],
        },
        rawResponses: [{ id: "repair-failed-response" }],
        prompt: {
          instructions: expect.stringContaining("Repair the implementation"),
          input: expect.stringContaining("Current train-test result"),
        },
        cause: runnerError,
      });
    } finally {
      await runtime.close();
    }
  });

  it("combines earlier repair evidence when a later model round fails", async () => {
    const runtime = new CourseModelRuntime({
      envFile: "/unused/model.env",
      baseUrl: "https://provider.example/v1",
      apiKey: "secret-for-test",
      model: "qwen3.8-max",
    });
    const directory = await temporaryDirectory();
    const implementationPath = join(directory, "index.html");
    const laterError = new ModelBehaviorError("second repair failed", {
      usage: {
        requests: 1,
        inputTokens: 200,
        outputTokens: 30,
        totalTokens: 230,
        requestUsage: [],
      },
      _modelResponses: [{ id: "second-response" }],
    } as never);
    vi.spyOn(runtime.runner, "run")
      .mockImplementationOnce(async (agent) => {
        const writeTool = agent.tools[0];
        if (writeTool?.type !== "function") {
          throw new Error("expected the implementation write tool");
        }
        await writeTool.invoke(
          {} as never,
          JSON.stringify({
            path: implementationPath,
            content: "<html><body>first repair</body></html>",
          }),
        );
        return {
          state: {
            usage: {
              requests: 1,
              inputTokens: 100,
              outputTokens: 20,
              totalTokens: 120,
              requestUsage: [],
            },
          },
          rawResponses: [{ id: "first-response" }],
          finalOutput: "written",
        } as never;
      })
      .mockRejectedValueOnce(laterError);

    try {
      await expect(
        runTddRepair(runtime, {
          scenario: "gui",
          publicBrief: "Register an account.",
          implementationContract: "Write one index.html file.",
          implementationPath,
          currentImplementation: "<html><body>current</body></html>",
          frozenTrainTests: "test('registration', () => {});",
          initialTestResult: {
            status: "RED",
            summary: "Two assertions failed.",
            output: "failed twice",
          },
          runTrainTests: async () => ({
            status: "RED",
            summary: "One assertion failed.",
            output: "failed once",
          }),
          maxRepairs: 2,
        }),
      ).rejects.toMatchObject<Partial<GenerationArtifactError>>({
        name: "GenerationArtifactError",
        usage: {
          requests: 2,
          inputTokens: 300,
          outputTokens: 50,
          totalTokens: 350,
          requestUsage: [],
        },
        rawResponses: [
          { id: "first-response" },
          { id: "second-response" },
        ],
        prompt: {
          instructions: expect.stringContaining("Repair the implementation"),
          input: expect.stringContaining("NEXT REPAIR MODEL CALL"),
        },
        cause: laterError,
      });
    } finally {
      await runtime.close();
    }
  });

  it("rejects an unchanged repair without consuming its write", async () => {
    const directory = await temporaryDirectory();
    const allowedPath = join(directory, "register.spec.ts");
    const current =
      'import { test } from "@playwright/test";\ntest("current", async () => {});\n';
    const workspace = new AgentFileWorkspace({
      artifactKind: "gui-tests",
      allowedPath,
      writeLabel: "test-suite rewrite",
      rejectUnchangedFrom: current,
    });

    await expect(workspace.writeFile(allowedPath, current)).resolves.toMatchObject({
      accepted: false,
      message: expect.stringContaining("unchanged"),
    });
    expect(workspace.writes).toBe(0);

    const corrected =
      'import { test } from "@playwright/test";\ntest("corrected", async () => {});\n';
    await expect(
      workspace.writeFile(allowedPath, corrected),
    ).resolves.toMatchObject({ accepted: true });
    expect(workspace.writes).toBe(1);
  });

  it("writes the authorized artifact and rejects every other path", async () => {
    const directory = await temporaryDirectory();
    const allowedPath = join(directory, "register.ts");
    const forbiddenPath = join(directory, "register.test.ts");
    const workspace = new AgentFileWorkspace({
      artifactKind: "api-implementation",
      allowedPath,
      writeLabel: "implementation",
    });

    await expect(
      workspace.writeFile(
        forbiddenPath,
        "export default () => new Response();",
      ),
    ).resolves.toMatchObject({ accepted: false });
    await expect(
      workspace.writeFile(allowedPath, "export default () => new Response();"),
    ).resolves.toMatchObject({ accepted: true });

    await expect(readFile(forbiddenPath, "utf8")).rejects.toThrow();
    await expect(readFile(allowedPath, "utf8")).resolves.toContain(
      "export default",
    );
  });
});
