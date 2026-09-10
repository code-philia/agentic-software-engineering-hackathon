import type { Readable, Writable } from "node:stream";

import {
  intro,
  isCancel,
  log,
  note,
  outro,
  spinner,
  text,
} from "@clack/prompts";
import Table from "cli-table3";

import type { CourseScenario } from "../agents/generate.js";
import type { RepairDecision } from "../agents/repair.js";
import type { RuntimeRetryEvent, UsageSnapshot } from "../agents/runtime.js";
import type { TrainTestResult } from "../testing/result.js";
import type { ValidationResult } from "../validation/result.js";
import {
  promptPreview,
  sourcePreview,
  trainFailureSummary,
  validationFailureSummary,
} from "./terminal-format.js";

export interface ArtifactView {
  readonly label: string;
  readonly path: string;
  readonly source: string;
  readonly language: "typescript" | "html";
  readonly usage?: UsageSnapshot;
  readonly detail?: string;
}

export interface ModelCallView {
  readonly stage: string;
  readonly durationMs: number;
  readonly usage: UsageSnapshot;
  readonly status?: "completed" | "failed";
}

export interface ModelRunSummary {
  readonly model: string;
  readonly stages: number;
  readonly durationMs: number;
  readonly requests: number;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly totalTokens: number;
  readonly calls: readonly ModelCallView[];
}

export interface CoursePresenter {
  start(scenario: CourseScenario, runId: string): void;
  act(step: number, title: string, description?: string): void;
  task(publicBrief: string): void;
  stage<T>(message: string, action: () => Promise<T>): Promise<T>;
  artifact(view: ArtifactView): void;
  modelCall?(view: ModelCallView): void;
  modelSummary?(summary: ModelRunSummary): void;
  preview?(label: "Standard" | "Direct" | "TDD", url: string): void;
  prompt(label: string, preview: string, path: string): void;
  trainResult(label: string, result: TrainTestResult): void;
  repairStarted(maxRepairs: number): void;
  repair(repair: number, maxRepairs: number): void;
  repairRound(
    repair: number,
    maxRepairs: number,
    result: TrainTestResult,
    decision: RepairDecision,
  ): void;
  validation(label: "Direct" | "TDD", result: ValidationResult): void;
  comparison(direct: ValidationResult, tdd: ValidationResult): void;
  checkpoint(nextAction: string): Promise<void>;
  finish(runRoot: string): void;
  failure(message: string): void;
  retry?(event: RuntimeRetryEvent): void;
}

export interface TerminalPresenterOptions {
  readonly interactive: boolean;
  readonly rehearsal?: boolean;
  readonly input?: Readable;
  readonly output?: Writable;
  readonly signal?: AbortSignal;
}

function usageLine(usage?: UsageSnapshot): string {
  if (!usage) return "";
  return ` · ${usage.requests} request(s) · ${usage.totalTokens.toLocaleString("en-US")} tokens`;
}

function seconds(durationMs: number): string {
  return `${(durationMs / 1_000).toFixed(1)}s`;
}

export class TerminalPresenter implements CoursePresenter {
  readonly #input: Readable;
  readonly #output: Writable;
  readonly #interactive: boolean;
  readonly #rehearsal: boolean;
  readonly #rich: boolean;
  readonly #color: boolean;
  readonly #signal: AbortSignal | undefined;

  constructor(options: TerminalPresenterOptions) {
    this.#input = options.input ?? process.stdin;
    this.#output = options.output ?? process.stdout;
    this.#interactive = options.interactive && Boolean(process.stdin.isTTY);
    this.#rehearsal = options.rehearsal ?? false;
    this.#rich =
      this.#output === process.stdout && Boolean(process.stdout.isTTY);
    this.#color = this.#rich && process.env.NO_COLOR === undefined;
    this.#signal = options.signal;
  }

  #line(message = ""): void {
    this.#output.write(`${message}\n`);
  }

  start(scenario: CourseScenario, runId: string): void {
    const scenarioName =
      scenario === "api" ? "Registration API" : "Registration GUI";
    const title = `TDD Lab — ${scenarioName}${this.#rehearsal ? " (offline rehearsal)" : ""}`;
    if (this.#rich) {
      intro(title);
      log.info(`Run ID: ${runId}`);
      log.info(
        "Flow: task → Direct → validation → train tests → TDD repair → comparison",
      );
    } else {
      this.#line(title);
      this.#line(`Run ID: ${runId}`);
      this.#line(
        "Flow: task -> Direct -> validation -> train tests -> TDD repair -> comparison",
      );
    }
  }

  act(step: number, title: string, description?: string): void {
    const heading =
      step === 0 ? `ACT 0 · ${title}` : `ACT ${step}/5 · ${title}`;
    if (this.#rich) {
      log.step(heading);
      if (description) log.info(description);
    } else {
      this.#line();
      this.#line(`[${heading}]`);
      if (description) this.#line(description);
    }
  }

  task(publicBrief: string): void {
    if (this.#rich) note(publicBrief.trim(), "Task brief");
    else {
      this.#line("Task brief:");
      this.#line(publicBrief.trim());
    }
  }

  async stage<T>(message: string, action: () => Promise<T>): Promise<T> {
    if (!this.#rich) {
      this.#line(`[stage] ${message}`);
      return action();
    }
    const indicator = spinner({ indicator: "timer" });
    indicator.start(message);
    try {
      const result = await action();
      indicator.stop(message);
      return result;
    } catch (error) {
      indicator.error(`${message} failed`);
      throw error;
    }
  }

  artifact(view: ArtifactView): void {
    const suffix = this.#rehearsal
      ? " · fixed local fixture"
      : usageLine(view.usage);
    const heading = `${view.label}${view.detail ? ` · ${view.detail}` : ""}${suffix}`;
    const preview = sourcePreview(view.source, view.language, this.#color);
    if (this.#rich) {
      log.success(heading);
      note(preview, `${view.path} · preview`);
    } else {
      this.#line(`[artifact] ${heading}`);
      this.#line(`File: ${view.path}`);
      this.#line(preview);
    }
  }

  modelCall(view: ModelCallView): void {
    if (this.#rehearsal) return;
    const message =
      `${view.stage}${view.status === "failed" ? " · failed" : ""} · ${seconds(view.durationMs)} · ` +
      `${view.usage.requests} request(s) · ` +
      `input ${view.usage.inputTokens.toLocaleString("en-US")} · ` +
      `output ${view.usage.outputTokens.toLocaleString("en-US")} · ` +
      `total ${view.usage.totalTokens.toLocaleString("en-US")} tokens`;
    if (this.#rich) log.info(message);
    else this.#line(`[model] ${message}`);
  }

  modelSummary(summary: ModelRunSummary): void {
    if (this.#rehearsal) return;
    const message =
      `${summary.model} · ${summary.stages} stage(s) · ` +
      `${seconds(summary.durationMs)} · ${summary.requests} request(s) · ` +
      `input ${summary.inputTokens.toLocaleString("en-US")} · ` +
      `output ${summary.outputTokens.toLocaleString("en-US")} · ` +
      `total ${summary.totalTokens.toLocaleString("en-US")} tokens`;
    if (this.#rich) log.info(`Model total · ${message}`);
    else this.#line(`[model-total] ${message}`);
    this.#line(`MODEL_RUN_SUMMARY ${JSON.stringify(summary)}`);
  }

  preview(label: "Standard" | "Direct" | "TDD", url: string): void {
    const message = `${label} preview: ${url}`;
    if (this.#rich) log.info(message);
    else this.#line(`[preview] ${message}`);
  }

  prompt(label: string, preview: string, path: string): void {
    const body = `${promptPreview(preview)}\n\nFull prompt: ${path}`;
    if (this.#rich) note(body, `${label} · prompt preview`);
    else {
      this.#line(`[prompt] ${label}`);
      this.#line(body);
    }
  }

  #testOutcome(label: string, result: TrainTestResult): void {
    const message = `${label} · ${result.status} · ${result.summary}`;
    if (this.#rich) {
      if (result.status === "GREEN") log.success(message);
      else if (result.status === "RED") log.warn(message);
      else log.error(message);
    } else this.#line(`[test] ${message}`);

    if (result.status === "GREEN") return;
    const summary = trainFailureSummary(result);
    const failureHeading =
      result.status === "TEST_ERROR"
        ? "Test runner problem"
        : "Behaviors still failing";
    if (this.#rich) note(summary, failureHeading);
    else {
      this.#line(`${failureHeading}:`);
      for (const line of summary.split("\n")) this.#line(`  ${line}`);
    }
  }

  trainResult(label: string, result: TrainTestResult): void {
    this.#testOutcome(label, result);
  }

  repairStarted(maxRepairs: number): void {
    const message = `Repair agent started · up to ${maxRepairs} rounds`;
    if (this.#rich) log.info(message);
    else this.#line(`[repair] ${message}`);
  }

  repair(repair: number, maxRepairs: number): void {
    const message = `Repair round ${repair}/${maxRepairs} · implementation updated`;
    if (this.#rich) log.step(message);
    else this.#line(`[repair] ${message}`);
  }

  repairRound(
    repair: number,
    maxRepairs: number,
    result: TrainTestResult,
    decision: RepairDecision,
  ): void {
    this.#testOutcome(`Repair round ${repair}/${maxRepairs}`, result);
    if (decision !== "stop-limit") return;
    const message = `Repair limit reached (${repair}/${maxRepairs}) · LIMIT_REACHED`;
    if (this.#rich) log.warn(message);
    else this.#line(`[repair] ${message}`);
  }

  validation(label: "Direct" | "TDD", result: ValidationResult): void {
    const table = new Table({
      head: ["Category", "Checks"],
      style: { head: [], border: [] },
    });
    for (const category of result.categories) {
      table.push([category.name, `${category.passed}/${category.total}`]);
    }
    table.push(["Total", `${result.passed}/${result.total}`]);
    const heading = `${label} validation · ${(result.durationMs / 1_000).toFixed(1)}s`;
    if (this.#rich) log.info(heading);
    else this.#line(`[validation] ${heading}`);
    this.#line(table.toString());

    const failures = validationFailureSummary(result);
    if (failures) {
      this.#line();
      this.#line(failures);
    } else if (this.#rich) log.success("All validation checks passed.");
    else this.#line("All validation checks passed.");
  }

  comparison(direct: ValidationResult, tdd: ValidationResult): void {
    const byName = new Map(
      tdd.categories.map((category) => [category.name, category]),
    );
    const table = new Table({
      head: ["Category", "Direct", "TDD"],
      style: { head: [], border: [] },
    });
    for (const category of direct.categories) {
      const tddCategory = byName.get(category.name);
      table.push([
        category.name,
        `${category.passed}/${category.total}`,
        tddCategory ? `${tddCategory.passed}/${tddCategory.total}` : "—",
      ]);
    }
    table.push([
      "Total",
      `${direct.passed}/${direct.total}`,
      `${tdd.passed}/${tdd.total}`,
    ]);
    this.#line(table.toString());

    const failures = validationFailureSummary(tdd);
    if (failures) {
      this.#line();
      this.#line("TDD failures");
      this.#line(failures);
    }
  }

  async checkpoint(nextAction: string): Promise<void> {
    if (!this.#interactive) return;
    const response = await text({
      message: `Press Enter to ${nextAction}.`,
      input: this.#input,
      output: this.#output,
      placeholder: `↵ ${nextAction}`,
      ...(this.#signal === undefined ? {} : { signal: this.#signal }),
    });
    if (isCancel(response)) throw new Error("The course run was cancelled.");
  }

  finish(runRoot: string): void {
    const message = `Run complete · Artifacts: ${runRoot}`;
    if (this.#rich) outro(message);
    else this.#line(`[done] ${message}`);
  }

  failure(message: string): void {
    if (this.#rich) log.error(message);
    else this.#line(`[error] ${message}`);
  }

  retry(event: RuntimeRetryEvent): void {
    const message = `Model request ${event.attempt} failed (${event.reason}); ${event.retry ? "retrying" : "not retrying"}.`;
    if (this.#rich) log.warn(message);
    else this.#line(`[retry] ${message}`);
  }
}
