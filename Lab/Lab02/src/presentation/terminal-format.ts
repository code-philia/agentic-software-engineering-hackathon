import { highlight } from "cli-highlight";

import type { TrainTestFailure, TrainTestResult } from "../testing/result.js";
import type { ValidationResult } from "../validation/result.js";

const SOURCE_PREVIEW_LINES = 16;
const PROMPT_PREVIEW_LINES = 14;
const PREVIEW_CHARACTERS = 1_600;
const FAILURE_LIMIT = 5;

function truncateLines(
  value: string,
  maxLines: number,
  maxCharacters: number,
): { readonly text: string; readonly omittedLines: number } {
  const source = value.trimEnd();
  const lines = source.split("\n");
  const selected = lines.slice(0, maxLines);
  let text = selected.join("\n");
  if (text.length > maxCharacters)
    text = text.slice(0, maxCharacters).trimEnd();
  const renderedLines = text.split("\n").length;
  return {
    text,
    omittedLines: Math.max(0, lines.length - renderedLines),
  };
}

export function sourcePreview(
  source: string,
  language: "typescript" | "html",
  color: boolean,
): string {
  const preview = truncateLines(
    source,
    SOURCE_PREVIEW_LINES,
    PREVIEW_CHARACTERS,
  );
  const rendered = color
    ? highlight(preview.text, { language, ignoreIllegals: true })
    : preview.text;
  return preview.omittedLines === 0
    ? rendered
    : `${rendered}\n… ${preview.omittedLines} more lines`;
}

export function promptPreview(source: string): string {
  const preview = truncateLines(
    source,
    PROMPT_PREVIEW_LINES,
    PREVIEW_CHARACTERS,
  );
  return preview.omittedLines === 0
    ? preview.text
    : `${preview.text}\n… prompt preview truncated`;
}

function shortTestName(name: string): string {
  const shortened = name
    .replace(/^POST \/api\/register\s+/i, "")
    .replace(/^Registration (?:API|GUI)\s+/i, "")
    .trim();
  return shortened.length === 0
    ? "Unnamed behavior"
    : `${shortened[0]!.toUpperCase()}${shortened.slice(1)}`;
}

function failureDetail(failure: TrainTestFailure): string | undefined {
  const status = failure.message.match(
    /expected\s+(\d{3})\s+to (?:be|equal)\s+(\d{3})/i,
  );
  if (status) return `Received ${status[1]}; expected ${status[2]}.`;
  const expectedReceived = failure.message.match(
    /Expected(?:\s+value)?:?\s*([^,;]+).*Received(?:\s+value)?:?\s*([^,;]+)/i,
  );
  if (expectedReceived) {
    return `Received ${expectedReceived[2]!.trim()}; expected ${expectedReceived[1]!.trim()}.`;
  }
  if (/locator|element|selector/i.test(failure.message)) {
    return "The expected page control or state was not found.";
  }
  return undefined;
}

export function trainFailureSummary(result: TrainTestResult): string {
  const failures = result.failures ?? [];
  if (failures.length === 0) return result.summary;
  const visible = failures.slice(0, FAILURE_LIMIT);
  const lines = visible.flatMap((failure) => {
    const detail = failureDetail(failure);
    return [
      `× ${shortTestName(failure.name)}`,
      ...(detail === undefined ? [] : [`  ${detail}`]),
    ];
  });
  if (failures.length > visible.length) {
    lines.push(`… ${failures.length - visible.length} more failures`);
  }
  return lines.join("\n");
}

export function validationFailureSummary(
  result: ValidationResult,
): string | undefined {
  const failedChecks = result.checks.filter((check) => !check.passed);
  if (failedChecks.length === 0) return undefined;
  const lines: string[] = [];
  for (const category of result.categories) {
    const failures = failedChecks.filter(
      (check) => check.category === category.name,
    );
    if (failures.length === 0) continue;
    if (lines.length > 0) lines.push("");
    lines.push(category.name);
    for (const check of failures) lines.push(`  × ${check.name}`);
  }
  return lines.join("\n");
}
