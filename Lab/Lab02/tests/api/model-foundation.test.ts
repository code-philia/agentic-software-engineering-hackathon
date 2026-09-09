import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";

import { afterEach, describe, expect, it, vi } from "vitest";

import { AgentFileWorkspace } from "../../src/agents/file-workspace.js";
import { RepairWorkspace } from "../../src/agents/repair.js";
import { testAuthoringInstructions } from "../../src/agents/test-authoring-instructions.js";
import {
  CourseModelRuntime,
  resolveInferencePolicy,
} from "../../src/agents/runtime.js";
import {
  loadModelConfig,
  ModelConfigError,
  supportedModels,
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
  it("uses deterministic sampling for every model stage", async () => {
    const runtime = new CourseModelRuntime({
      envFile: "/unused/model.env",
      baseUrl: "https://provider.example/v1",
      apiKey: "secret-for-test",
      model: "deepseek-v4-flash",
    });

    try {
      expect(runtime.modelSettings.temperature).toBe(0);
      expect(runtime.modelSettings.timeoutMs).toBe(120_000);
      expect(runtime.modelSettings.retry?.maxRetries).toBe(1);
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

  it("maps all twelve supported model names to an explicit policy", () => {
    expect(supportedModels).toHaveLength(12);
    for (const model of supportedModels) {
      expect(
        resolveInferencePolicy({
          envFile: "/unused/model.env",
          baseUrl: "https://provider.example/v1",
          apiKey: "secret-for-test",
          model,
        }),
      ).toMatchObject({ id: "closest-non-thinking-v1", model });
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
      id: "closest-non-thinking-v1",
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
      "base_url=https://provider.example/v1\napi_key=secret-for-test\nmodel=deepseek-v4-flash\n",
      "utf8",
    );

    const before = process.env.api_key;
    const config = await loadModelConfig(envFile);

    expect(config).toMatchObject({
      baseUrl: "https://provider.example/v1",
      model: "deepseek-v4-flash",
    });
    expect(process.env.api_key).toBe(before);
  });

  it("rejects model behavior controls in an environment file", async () => {
    const directory = await temporaryDirectory();
    const envFile = join(directory, "model.env");
    await writeFile(
      envFile,
      "base_url=https://provider.example/v1\napi_key=secret-for-test\nmodel=deepseek-v4-flash\ntemperature=1\n",
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

  it("rejects the removed provider field with a migration message", async () => {
    const directory = await temporaryDirectory();
    const envFile = join(directory, "legacy.env");
    await writeFile(
      envFile,
      "provider=qwen\nbase_url=https://provider.example/v1\napi_key=secret-for-test\nmodel=qwen3.8-max\n",
      "utf8",
    );

    await expect(loadModelConfig(envFile)).rejects.toThrow(
      "provider is no longer configured",
    );
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
    expect(api).toContain("Do not use Date.now(), Math.random(), UUIDs");
    expect(api).toContain(
      "include the received response body as a safe assertion message",
    );
    expect(gui).toContain("375-pixel viewport");
    expect(gui).toContain("error summary");
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
