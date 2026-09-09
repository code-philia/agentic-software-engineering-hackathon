import {
  ModelTimeoutError,
  OpenAIProvider,
  Runner,
  type ModelSettings,
  type RetryPolicyContext,
  type Usage,
} from "@openai/agents";
import OpenAI from "openai";

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
  readonly modelCallTimeoutMs: number;
  readonly maxTransientRetries: number;
  readonly retryBackoff: {
    readonly initialDelayMs: number;
    readonly maxDelayMs: number;
  };
  readonly scenarioDeadlineMs: { readonly api: number; readonly gui: number };
}

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
  modelCallTimeoutMs: 120_000,
  maxTransientRetries: 1,
  retryBackoff: { initialDelayMs: 1_000, maxDelayMs: 5_000 },
  scenarioDeadlineMs: { api: 600_000, gui: 900_000 },
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

const modelInferencePolicies: Readonly<
  Record<
    SupportedModel,
    Omit<InferencePolicy, "id" | "model">
  >
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
  "deepseek-v4-pro-0813": standardNonThinkingPolicy,
  "deepseek-v4-flash-0731": standardNonThinkingPolicy,
  "deepseek-v4-pro": standardNonThinkingPolicy,
  "deepseek-v4-flash": standardNonThinkingPolicy,
};

export function resolveInferencePolicy(config: ModelConfig): InferencePolicy {
  return {
    id: "closest-non-thinking-v1",
    model: config.model,
    ...modelInferencePolicies[config.model],
  };
}

function createModelSettings(
  policy: InferencePolicy,
  onRetry: (event: RuntimeRetryEvent) => void,
): ModelSettings {
  const retryableStatuses = new Set([408, 429, 500, 502, 503, 504]);
  return {
    timeoutMs: executionPolicy.modelCallTimeoutMs,
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
        const timedOut = context.error instanceof ModelTimeoutError;
        const providerVetoed = context.providerAdvice?.suggested === false;
        const retry = !providerVetoed && (
          timedOut ||
          context.normalized.isNetworkError ||
          (context.normalized.statusCode !== undefined &&
            retryableStatuses.has(context.normalized.statusCode))
        );
        const reason = timedOut
          ? "model request timeout"
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
    this.modelSettings = createModelSettings(this.inferencePolicy, (event) => {
      this.#retryListener?.(event);
    });

    const client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      maxRetries: 0,
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
