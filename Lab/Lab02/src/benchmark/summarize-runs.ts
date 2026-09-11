import { readFile, readdir } from "node:fs/promises";
import { basename, join, resolve } from "node:path";

interface TestResultLike {
  readonly status?: string;
}

interface ValidationLike {
  readonly passed?: number;
  readonly total?: number;
}

interface PerformanceLike {
  readonly model?: string;
  readonly durationMs?: number;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly totalTokens?: number;
}

interface SavedRun {
  readonly runId?: string;
  readonly outcome?: string;
  readonly modelConfiguration?: { readonly model?: string };
  readonly modelPerformance?: PerformanceLike;
  readonly referenceTrainResult?: TestResultLike;
  readonly finalTrainResult?: TestResultLike;
  readonly directValidation?: ValidationLike;
  readonly tddValidation?: ValidationLike;
}

export interface ModelBenchmarkSummary {
  readonly model: string;
  readonly attempts: number;
  readonly successes: number;
  readonly successRate: number;
  readonly referenceGreen: number;
  readonly tddGreen: number;
  readonly averageDurationMs: number | undefined;
  readonly averageInputTokens: number | undefined;
  readonly averageOutputTokens: number | undefined;
  readonly averageTotalTokens: number | undefined;
  readonly averageDirectPassed: number | undefined;
  readonly averageTddPassed: number | undefined;
  readonly averageImprovement: number | undefined;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function average(values: readonly number[]): number | undefined {
  if (values.length === 0) return undefined;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export function isDesiredGuiSuccess(run: SavedRun): boolean {
  return (
    run.outcome === "GREEN" &&
    run.referenceTrainResult?.status === "GREEN" &&
    run.finalTrainResult?.status === "GREEN" &&
    finite(run.directValidation?.passed) &&
    finite(run.tddValidation?.passed) &&
    run.tddValidation.passed > run.directValidation.passed
  );
}

export function summarizeRuns(
  runs: readonly SavedRun[],
): readonly ModelBenchmarkSummary[] {
  const grouped = new Map<string, SavedRun[]>();
  for (const run of runs) {
    const model =
      run.modelConfiguration?.model ?? run.modelPerformance?.model ?? "unknown";
    const current = grouped.get(model) ?? [];
    current.push(run);
    grouped.set(model, current);
  }

  return [...grouped.entries()]
    .map(([model, attempts]) => {
      const successful = attempts.filter(isDesiredGuiSuccess);
      const numbers = (select: (run: SavedRun) => unknown) =>
        successful.map(select).filter(finite);
      const direct = numbers((run) => run.directValidation?.passed);
      const tdd = numbers((run) => run.tddValidation?.passed);
      const improvements = successful
        .map((run) => {
          const before = run.directValidation?.passed;
          const after = run.tddValidation?.passed;
          return finite(before) && finite(after) ? after - before : undefined;
        })
        .filter(finite);

      return {
        model,
        attempts: attempts.length,
        successes: successful.length,
        successRate: successful.length / attempts.length,
        referenceGreen: attempts.filter(
          (run) => run.referenceTrainResult?.status === "GREEN",
        ).length,
        tddGreen: attempts.filter((run) => run.finalTrainResult?.status === "GREEN")
          .length,
        averageDurationMs: average(
          numbers((run) => run.modelPerformance?.durationMs),
        ),
        averageInputTokens: average(
          numbers((run) => run.modelPerformance?.inputTokens),
        ),
        averageOutputTokens: average(
          numbers((run) => run.modelPerformance?.outputTokens),
        ),
        averageTotalTokens: average(
          numbers((run) => run.modelPerformance?.totalTokens),
        ),
        averageDirectPassed: average(direct),
        averageTddPassed: average(tdd),
        averageImprovement: average(improvements),
      } satisfies ModelBenchmarkSummary;
    })
    .sort(
      (left, right) =>
        right.successRate - left.successRate || left.model.localeCompare(right.model),
    );
}

async function resultFiles(root: string): Promise<readonly string[]> {
  const absolute = resolve(root);
  if (basename(absolute).endsWith(".json")) return [absolute];
  const entries = await readdir(absolute, { withFileTypes: true });
  if (entries.some((entry) => entry.isFile() && entry.name === "result.json")) {
    return [join(absolute, "result.json")];
  }
  const copiedResults = entries
    .filter(
      (entry) =>
        entry.isFile() && entry.name.includes("-gui-") && entry.name.endsWith(".json"),
    )
    .map((entry) => join(absolute, entry.name));
  const nested = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => resultFiles(join(absolute, entry.name))),
  );
  return [...copiedResults, ...nested.flat()];
}

export async function loadRuns(
  roots: readonly string[],
  afterRunId?: string,
): Promise<readonly SavedRun[]> {
  const files = (await Promise.all(roots.map(resultFiles))).flat();
  const runs: SavedRun[] = [];
  for (const file of files) {
    try {
      const parsed = JSON.parse(await readFile(file, "utf8")) as SavedRun;
      if (!parsed.runId?.includes("-gui-")) continue;
      if (afterRunId !== undefined && parsed.runId < afterRunId) continue;
      runs.push(parsed);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
  return runs;
}

function display(value: number | undefined, digits = 0): string {
  return value === undefined ? "—" : value.toFixed(digits);
}

export function markdownSummary(
  summaries: readonly ModelBenchmarkSummary[],
): string {
  const rows = summaries.map((summary) =>
    [
      summary.model,
      String(summary.attempts),
      `${summary.successes}/${summary.attempts}`,
      `${(summary.successRate * 100).toFixed(0)}%`,
      `${summary.referenceGreen}/${summary.attempts}`,
      `${summary.tddGreen}/${summary.attempts}`,
      display(
        summary.averageDurationMs === undefined
          ? undefined
          : summary.averageDurationMs / 1_000,
        1,
      ),
      display(summary.averageInputTokens),
      display(summary.averageOutputTokens),
      display(summary.averageTotalTokens),
      display(summary.averageDirectPassed, 1),
      display(summary.averageTddPassed, 1),
      display(summary.averageImprovement, 1),
    ].join(" | "),
  );
  return [
    "Model | Attempts | Success | Rate | Ref GREEN | TDD GREEN | Avg time (s) | Avg input | Avg output | Avg total | Avg Direct | Avg TDD | Avg Δ",
    "--- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---:",
    ...rows,
  ].join("\n");
}
