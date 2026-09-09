import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import { createEnv } from "@t3-oss/env-core";
import { parse } from "dotenv";
import { z } from "zod";

export const supportedModels = [
  "qwen3.8-max",
  "qwen3.7-plus",
  "qwen3.6-flash",
  "qwen3.6-plus",
  "minimax-m3",
  "kimi-k3",
  "glm-5.3",
  "glm-5.2",
  "deepseek-v4-pro-0813",
  "deepseek-v4-flash-0731",
  "deepseek-v4-pro",
  "deepseek-v4-flash",
] as const;
export type SupportedModel = (typeof supportedModels)[number];

const codeOwnedModelFields = [
  "temperature",
  "thinking",
  "enable_thinking",
  "reasoning_effort",
] as const;

export interface ModelConfig {
  readonly envFile: string;
  readonly baseUrl: string;
  readonly apiKey: string;
  readonly model: SupportedModel;
}

export class ModelConfigError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ModelConfigError";
  }
}

export async function loadModelConfig(
  envFile = ".env",
  modelOverride?: string,
): Promise<ModelConfig> {
  const absolutePath = resolve(envFile);
  let source: string;

  try {
    source = await readFile(absolutePath, "utf8");
  } catch (error) {
    throw new ModelConfigError(`Cannot read environment file: ${absolutePath}`, {
      cause: error,
    });
  }

  const runtimeEnv = parse(source);
  if (runtimeEnv.provider?.trim()) {
    throw new ModelConfigError(
      `Invalid model configuration in ${absolutePath}: provider is no longer configured; remove it from the environment file`,
    );
  }
  const codeOwnedFieldsPresent = codeOwnedModelFields.filter(
    (field) => runtimeEnv[field]?.trim(),
  );
  if (codeOwnedFieldsPresent.length > 0) {
    throw new ModelConfigError(
      `Invalid model configuration in ${absolutePath}: ${codeOwnedFieldsPresent.join(", ")} is controlled by the course runtime; remove it from the environment file`,
    );
  }

  const env = createEnv({
    server: {
      base_url: z.url(),
      api_key: z.string().trim().min(1),
      model: z.string().trim().min(1),
    },
    runtimeEnv,
    emptyStringAsUndefined: true,
    onValidationError: (issues) => {
      const details = issues
        .map((issue) => `${issue.path?.map(String).join(".") || "environment"}: ${issue.message}`)
        .join("; ");
      throw new ModelConfigError(`Invalid model configuration in ${absolutePath}: ${details}`);
    },
  });

  const requestedModel = (modelOverride ?? env.model).trim().toLowerCase();
  const parsedModel = z.enum(supportedModels).safeParse(requestedModel);
  if (!parsedModel.success) {
    throw new ModelConfigError(
      `Unsupported model "${requestedModel}". Choose one of: ${supportedModels.join(", ")}`,
    );
  }

  return {
    envFile: absolutePath,
    baseUrl: env.base_url,
    apiKey: env.api_key,
    model: parsedModel.data,
  };
}
