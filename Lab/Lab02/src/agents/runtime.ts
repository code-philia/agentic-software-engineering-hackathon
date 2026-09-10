import {
  ModelTimeoutError,
  OpenAIProvider,
  Runner,
  type ModelSettings,
  type RetryPolicyContext,
  type Usage,
} from "@openai/agents";
import OpenAI, { APIConnectionTimeoutError } from "openai";

import type { ModelConfig, SupportedModel } from "../config/model-config.js";

export interface UsageSnapshot {
  readonly requests: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly requestUsage: ReadonlyArray<{
    readonly inputTokens: number;
    readonly outputTokens: number;
    readonly totalTokens: number;
    readonly endpoint?: string;
  }>;
}

export interface InferencePolicy {
  readonly id: "closest-non-thinking-v1";
  readonly model: SupportedModel;
  readonly mode: "non-thinking" | "lowest-supported-thinking";
  readonly temperature?: 0;
  readonly reasoningEffort?: "none" | "low";
  readonly providerData: Readonly<Record<string, unknown>>;
}

export interface ExecutionPolicy {
  readonly id: "classroom-execution-v1";
  readonly modelCallTimeoutMs: Readonly<Record<ModelCallStage, number>>;
  readonly maxOutputTokens: Readonly<Record<ModelCallStage, number>>;
  readonly maxTransientRetries: number;
  readonly retryBackoff: {
    readonly initialDelayMs: number;
    readonly maxDelayMs: number;
  };
  readonly scenarioDeadlineMs: { readonly api: number; readonly gui: number };
}

export type ModelCallStage =
  | "doctor"
  | "direct"
  | "test-generation"
  | "test-repair"
  | "implementation-repair";

export interface RuntimeRetryEvent {
  readonly attempt: number;
  readonly maxRetries: number;
  readonly retry: boolean;
  readonly statusCode?: number;
  readonly errorCode?: string;
  readonly reason: string;
}

export const executionPolicy: ExecutionPolicy = {
  id: "classroom-execution-v1",
  modelCallTimeoutMs: {
    doctor: 180_000,
    direct: 300_000,
    "test-generation": 900_000,
    "test-repair": 900_000,
    "implementation-repair": 900_000,
  },
  maxOutputTokens: {
    doctor: 2_048,
    direct: 12_000,
    "test-generation": 8_192,
    "test-repair": 8_192,
    "implementation-repair": 8_192,
  },
  maxTransientRetries: 1,
  retryBackoff: { initialDelayMs: 1_000, maxDelayMs: 5_000 },
  scenarioDeadlineMs: { api: 2_700_000, gui: 1_800_000 },
};

const qwenNonThinkingPolicy = {
  mode: "non-thinking",
  temperature: 0,
  providerData: { enable_thinking: false },
} as const;

const standardNonThinkingPolicy = {
  mode: "non-thinking",
  temperature: 0,
  providerData: { thinking: { type: "disabled" } },
} as const;

const genericNonThinkingPolicy = {
  mode: "non-thinking",
  temperature: 0,
  providerData: {},
} as const;

const modelInferencePolicies: Readonly<
  Partial<Record<
    SupportedModel,
    Omit<InferencePolicy, "id" | "model">
  >>
> = {
  "qwen3.8-max": qwenNonThinkingPolicy,
  "qwen3.7-plus": qwenNonThinkingPolicy,
  "qwen3.6-flash": qwenNonThinkingPolicy,
  "qwen3.6-plus": qwenNonThinkingPolicy,
  "minimax-m3": standardNonThinkingPolicy,
  "kimi-k3": standardNonThinkingPolicy,
  "glm-5.3": {
    mode: "lowest-supported-thinking",
    temperature: 0,
    reasoningEffort: "low",
    providerData: {},
  },
  "glm-5.2": standardNonThinkingPolicy,
  "deepseek-v4-pro": standardNonThinkingPolicy,
  "deepseek-v4-pro-0813": standardNonThinkingPolicy,
  "deepseek-v4-flash": standardNonThinkingPolicy,
  "deepseek-v4-flash-0731": standardNonThinkingPolicy,
};

function inferredInferencePolicy(
  model: string,
): Omit<InferencePolicy, "id" | "model"> {
  const normalized = model.toLowerCase();
  if (normalized.startsWith("qwen")) return qwenNonThinkingPolicy;
  if (normalized.startsWith("glm-5.3")) {
    return {
      mode: "lowest-supported-thinking",
      temperature: 0,
      reasoningEffort: "low",
      providerData: {},
    };
  }
  if (
    normalized.startsWith("deepseek-") ||
    normalized.startsWith("kimi-") ||
    normalized.startsWith("minimax-") ||
    normalized.startsWith("glm-")
  ) {
    return standardNonThinkingPolicy;
  }
  return genericNonThinkingPolicy;
}

export function resolveInferencePolicy(config: ModelConfig): InferencePolicy {
  return {
    id: "closest-non-thinking-v1",
    model: config.model,
    ...(modelInferencePolicies[config.model] ??
      inferredInferencePolicy(config.model)),
  };
}

function createModelSettings(
  policy: InferencePolicy,
  timeoutMs: number,
  maxTokens: number,
  onRetry: (event: RuntimeRetryEvent) => void,
): ModelSettings {
  const retryableStatuses = new Set([408, 429, 500, 502, 503, 504, 524]);
  return {
    timeoutMs,
    maxTokens,
    ...(policy.temperature === undefined ? {} : { temperature: policy.temperature }),
    preserveRawUsage: true,
    parallelToolCalls: false,
    ...(policy.reasoningEffort === undefined
      ? {}
      : { reasoning: { effort: policy.reasoningEffort } }),
    providerData: { ...policy.providerData },
    retry: {
      maxRetries: executionPolicy.maxTransientRetries,
      backoff: {
        initialDelayMs: executionPolicy.retryBackoff.initialDelayMs,
        maxDelayMs: executionPolicy.retryBackoff.maxDelayMs,
        multiplier: 2,
        jitter: true,
      },
      policy: (context: RetryPolicyContext) => {
        const timedOut =
          context.error instanceof ModelTimeoutError ||
          context.error instanceof APIConnectionTimeoutError;
        const providerVetoed = context.providerAdvice?.suggested === false;
        const transientProxyTruncation =
          context.normalized.statusCode === 400 &&
          context.normalized.errorCode === "proxy_error" &&
          isConnectionTruncationError(context.error);
        const retry =
          transientProxyTruncation ||
          (!providerVetoed &&
            (timedOut ||
              context.normalized.isNetworkError ||
              (context.normalized.statusCode !== undefined &&
                retryableStatuses.has(context.normalized.statusCode))));
        const reason = timedOut
          ? "model request timeout"
          : transientProxyTruncation
            ? "transient provider proxy truncation"
          : context.normalized.statusCode === 429
            ? "rate limit"
            : context.normalized.statusCode !== undefined
              ? `HTTP ${context.normalized.statusCode}`
              : context.normalized.isNetworkError
                ? "network error"
                : "non-retryable error";
        onRetry({
          attempt: context.attempt,
          maxRetries: context.maxRetries,
          retry,
          ...(context.normalized.statusCode === undefined
            ? {}
            : { statusCode: context.normalized.statusCode }),
          ...(context.normalized.errorCode === undefined
            ? {}
            : { errorCode: context.normalized.errorCode }),
          reason,
        });
        return retry
          ? {
              retry: true,
              approveUnsafeReplay: true,
              ...(context.normalized.retryAfterMs === undefined
                ? {}
                : { delayMs: context.normalized.retryAfterMs }),
              reason,
            }
          : { retry: false, reason };
      },
    },
  };
}

function isConnectionTruncationError(error: unknown): boolean {
  const messages: string[] = [];
  const visited = new Set<unknown>();
  let current: unknown = error;

  while (current !== undefined && current !== null && !visited.has(current)) {
    visited.add(current);
    if (current instanceof Error) messages.push(current.message);
    else if (typeof current === "object" && "message" in current) {
      const message = current.message;
      if (typeof message === "string") messages.push(message);
    }
    current =
      typeof current === "object" && "cause" in current
        ? current.cause
        : undefined;
  }

  return messages.some((message) => {
    const normalized = message.toLowerCase();
    return (
      /\bunexpected\s+(?:eof|end of (?:file|input|stream))\b/.test(normalized) ||
      /\bpremature\s+(?:eof|end|close|closure)\b/.test(normalized) ||
      /\b(?:connection|response|socket|stream)\s+(?:was\s+)?(?:closed|cut off|terminated|truncated)\b/.test(
        normalized,
      ) ||
      /\btruncated\s+(?:connection|response|body|stream)\b/.test(normalized)
    );
  });
}

export class CourseModelRuntime {
  readonly config: ModelConfig;
  readonly runner: Runner;
  readonly modelSettings: ModelSettings;
  readonly inferencePolicy: InferencePolicy;
  readonly executionPolicy = executionPolicy;
  readonly #provider: OpenAIProvider;
  #retryListener: ((event: RuntimeRetryEvent) => void) | undefined;

  constructor(config: ModelConfig) {
    this.config = config;
    this.inferencePolicy = resolveInferencePolicy(config);
    this.modelSettings = this.modelSettingsFor("doctor");

    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      maxRetries: 0,
      ...(config.provider === undefined
        ? {}
        : { defaultHeaders: { "x-onr-provider": config.provider } }),
    });
    this.#provider = new OpenAIProvider({
      openAIClient: client,
      useResponses: false,
      strictFeatureValidation: true,
    });
    this.runner = new Runner({
      modelProvider: this.#provider,
      modelSettings: this.modelSettings,
      tracingDisabled: true,
      traceIncludeSensitiveData: false,
    });
  }

  modelSettingsFor(stage: ModelCallStage): ModelSettings {
    return createModelSettings(
      this.inferencePolicy,
      executionPolicy.modelCallTimeoutMs[stage],
      executionPolicy.maxOutputTokens[stage],
      (event) => this.#retryListener?.(event),
    );
  }

  setRetryListener(listener: ((event: RuntimeRetryEvent) => void) | undefined): void {
    this.#retryListener = listener;
  }

  async close(): Promise<void> {
    await this.#provider.close();
  }
}

export function snapshotUsage(usage: Usage): UsageSnapshot {
  return {
    requests: usage.requests,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    totalTokens: usage.totalTokens,
    requestUsage: (usage.requestUsageEntries ?? []).map((entry) => ({
      inputTokens: entry.inputTokens,
      outputTokens: entry.outputTokens,
      totalTokens: entry.totalTokens,
      ...(entry.endpoint === undefined ? {} : { endpoint: entry.endpoint }),
    })),
  };
}
