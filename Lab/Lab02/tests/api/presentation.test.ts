import { describe, expect, it } from "vitest";

import {
  promptPreview,
  sourcePreview,
  trainFailureSummary,
} from "../../src/presentation/terminal-format.js";

describe("terminal formatting", () => {
  it("shows a short head-only source preview", () => {
    const source = Array.from(
      { length: 30 },
      (_, index) => `const line${index + 1} = ${index + 1};`,
    ).join("\n");

    const preview = sourcePreview(source, "typescript", false);

    expect(preview).toContain("const line1 = 1;");
    expect(preview).toContain("… 14 more lines");
    expect(preview).not.toContain("const line30 = 30;");
  });

  it("truncates prompt previews without exposing the omitted tail", () => {
    const preview = promptPreview(
      Array.from({ length: 20 }, (_, index) => `instruction ${index + 1}`).join(
        "\n",
      ),
    );

    expect(preview).toContain("instruction 1");
    expect(preview).toContain("prompt preview truncated");
    expect(preview).not.toContain("instruction 20");
  });

  it("summarizes structured failures without printing response bodies", () => {
    const summary = trainFailureSummary({
      status: "RED",
      summary: "0/1 train tests passed.",
      output: "raw runner output containing a secret token",
      failures: [
        {
          name: "POST /api/register rejects malformed email domains",
          message:
            'AssertionError: response body: {"sessionToken":"secret"}: expected 201 to be 400',
        },
      ],
    });

    expect(summary).toContain("Rejects malformed email domains");
    expect(summary).toContain("Received 201; expected 400.");
    expect(summary).not.toContain("sessionToken");
    expect(summary).not.toContain("secret");
  });
});
