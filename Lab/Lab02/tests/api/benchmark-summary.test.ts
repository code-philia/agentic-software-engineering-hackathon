import { describe, expect, it } from "vitest";

import {
  isDesiredGuiSuccess,
  markdownSummary,
  summarizeRuns,
} from "../../src/benchmark/summarize-runs.js";

function run(model: string, outcome: string, direct = 8, tdd = 24) {
  return {
    outcome,
    modelConfiguration: { model },
    modelPerformance: {
      model,
      durationMs: 120_000,
      inputTokens: 30_000,
      outputTokens: 10_000,
      totalTokens: 40_000,
    },
    referenceTrainResult: { status: "GREEN" },
    finalTrainResult: { status: outcome === "GREEN" ? "GREEN" : "RED" },
    directValidation: { passed: direct, total: 36 },
    tddValidation: { passed: tdd, total: 36 },
  };
}

describe("benchmark summary", () => {
  it("uses desired-flow successes as the average population", () => {
    const success = run("model-a", "GREEN");
    const failure = run("model-a", "LIMIT_REACHED", 9, 20);
    expect(isDesiredGuiSuccess(success)).toBe(true);
    expect(isDesiredGuiSuccess(run("model-a", "GREEN", 20, 20))).toBe(false);

    const [summary] = summarizeRuns([success, failure]);
    expect(summary).toMatchObject({
      attempts: 2,
      successes: 1,
      successRate: 0.5,
      referenceGreen: 2,
      tddGreen: 1,
      averageDurationMs: 120_000,
      averageTotalTokens: 40_000,
      averageDirectPassed: 8,
      averageTddPassed: 24,
      averageImprovement: 16,
    });
    expect(markdownSummary([summary!])).toContain("1/2 | 50%");
  });
});
