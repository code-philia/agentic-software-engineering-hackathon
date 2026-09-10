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
  "deepseek-v4-pro",
  "deepseek-v4-pro-0813",
  "deepseek-v4-flash",
  "deepseek-v4-flash-0731",
] as const;
// Providers own their model namespaces. This list documents models for which the
// course has an explicit policy; it is not a client-side allowlist.
export type SupportedModel = string;

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
  readonly provider?: string;
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
      provider: z.string().trim().min(1).optional(),
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

  const requestedModel = (modelOverride ?? env.model).trim();
  const canonicalKnownModel = supportedModels.find(
    (model) => model.toLowerCase() === requestedModel.toLowerCase(),
  );

  return {
    envFile: absolutePath,
    baseUrl: env.base_url,
    apiKey: env.api_key,
    // Keep convenient case-insensitive matching for documented models, but do
    // not alter provider-specific identifiers that may be case-sensitive.
    model: canonicalKnownModel ?? requestedModel,
    ...(env.provider === undefined ? {} : { provider: env.provider }),
  };
}
