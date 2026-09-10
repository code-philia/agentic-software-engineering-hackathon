import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { Agent, tool } from "@openai/agents";
import { z } from "zod";

import { CourseModelRuntime, snapshotUsage } from "../agents/runtime.js";
import { loadModelConfig, type ModelConfig } from "../config/model-config.js";
import { parseCommonOptions } from "./arguments.js";
import { writeJsonFile } from "../run/workspace.js";
import { installShutdownSignalHandlers } from "./shutdown.js";

function safeErrorMessage(error: unknown, apiKey?: string): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replaceAll(apiKey ?? "", apiKey ? "[REDACTED]" : "")
    .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [REDACTED]");
}

async function main(): Promise<void> {
  const shutdown = installShutdownSignalHandlers();
  const doctorRunId = `${new Date()
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z")}-${randomUUID().slice(0, 8)}`;
  const doctorRoot = resolve("runs", "doctor", doctorRunId);
  const startedAt = performance.now();
  let config: ModelConfig | undefined;
  let runtime: CourseModelRuntime | undefined;
  try {
    const options = parseCommonOptions(process.argv.slice(2));
    config = await loadModelConfig(options.envFile, options.model);
    runtime = new CourseModelRuntime(config);
    const endpoint = new URL(config.baseUrl);
    await mkdir(doctorRoot, { recursive: true });

    process.stdout.write(
      [
        "TDD Course — Model Doctor",
        `Configuration: ${config.envFile}`,
        `Endpoint: ${endpoint.origin}`,
        `Model: ${config.model}`,
        `Inference policy: ${runtime.inferencePolicy.id}`,
        `Effective settings: ${JSON.stringify(runtime.inferencePolicy)}`,
        "[check] Requesting a minimal response and a local function call...",
      ].join("\n") + "\n",
    );

    let toolCalled = false;
    const readinessTool = tool({
      name: "course_readiness_check",
      description:
        "Confirm that this model can call the course's narrow local function tools.",
      parameters: z.object({ value: z.literal("ready") }),
      execute: ({ value }) => {
        toolCalled = value === "ready";
        return { ok: true };
      },
    });
    const agent = new Agent({
      name: "Course Model Doctor",
      model: config.model,
      instructions:
        "Call course_readiness_check exactly once with value ready. After it returns, reply with the single word READY.",
      tools: [readinessTool],
      modelSettings: {
        ...runtime.modelSettingsFor("doctor"),
        toolChoice: "required",
      },
    });
    const requestSignal = AbortSignal.any([
      shutdown.signal,
      AbortSignal.timeout(runtime.executionPolicy.modelCallTimeoutMs.doctor),
    ]);
    const result = await runtime.runner.run(
      agent,
      "Check course model readiness.",
      {
        maxTurns: 2,
        signal: requestSignal,
      },
    );
    const output =
      typeof result.finalOutput === "string" ? result.finalOutput.trim() : "";
    if (!toolCalled)
      throw new Error(
        "The model returned without calling the required local tool.",
      );
    if (!output) throw new Error("The model returned an empty final response.");

    const usage = snapshotUsage(result.state.usage);
    await writeJsonFile(join(doctorRoot, "result.json"), {
      outcome: "READY",
      runId: doctorRunId,
      model: config.model,
      inferencePolicy: runtime.inferencePolicy,
      durationMs: Math.round(performance.now() - startedAt),
      usage,
    });
    process.stdout.write(
      [
        `[ok] Endpoint, credential, model response, and function calling are available.`,
        `[result] ${output}`,
        `[usage] ${usage.requests} request(s), ${usage.inputTokens} input, ${usage.outputTokens} output, ${usage.totalTokens} total tokens`,
        `[time] ${Math.round(performance.now() - startedAt)} ms`,
      ].join("\n") + "\n",
    );
  } catch (error) {
    if (config && runtime) {
      try {
        await writeJsonFile(join(doctorRoot, "result.json"), {
          outcome: "NOT_READY",
          runId: doctorRunId,
          model: config.model,
          inferencePolicy: runtime.inferencePolicy,
          durationMs: Math.round(performance.now() - startedAt),
          error: {
            name: error instanceof Error ? error.name : "Error",
            message: safeErrorMessage(error, config.apiKey),
          },
        });
      } catch (writeError) {
        process.stderr.write(
          `[warning] Could not save doctor result: ${safeErrorMessage(writeError, config.apiKey)}\n`,
        );
      }
    }
    process.stderr.write(
      `[error] ${safeErrorMessage(error, config?.apiKey)}\n`,
    );
    process.exitCode = 1;
  } finally {
    shutdown.dispose();
    if (runtime) {
      try {
        await runtime.close();
      } catch (error) {
        process.stderr.write(
          `[warning] Cleanup failed: ${safeErrorMessage(error, config?.apiKey)}\n`,
        );
        process.exitCode = 1;
      }
    }
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`[error] ${safeErrorMessage(error)}\n`);
  process.exitCode = 1;
});
