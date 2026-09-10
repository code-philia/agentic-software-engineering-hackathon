import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  implementationRepairLimit,
  repairToolUseBehavior,
  RepairWorkspace,
} from "../../src/agents/repair.js";
import { testAuthoringInstructions } from "../../src/agents/test-authoring-instructions.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("GUI prompt and repair tuning", () => {
  it("keeps the Direct implementation contract intentionally outcome-level", async () => {
    const contract = await readFile(
      join(process.cwd(), "prompts/contracts/gui-implementation.md"),
      "utf8",
    );

    expect(contract).toContain("Choose sensible modern conventions");
    expect(contract).toContain("Do not attempt to anticipate or reverse-engineer");
    expect(contract).not.toContain("[A-Za-z][A-Za-z0-9_]*");
    expect(contract).not.toContain('aria-invalid="true"');
    expect(contract).not.toContain("375 CSS pixels");
  });

  it("requires broad state-lifecycle coverage without prescribing storage internals", () => {
    const instructions = testAuthoringInstructions("gui");

    expect(instructions).toContain("complete state lifecycle");
    expect(instructions).toContain("adding a second distinct account preserves the first");
    expect(instructions).toContain("rejection atomicity");
    expect(instructions).toContain("removes their stale explanations and invalid state");
    expect(instructions).toContain("without depending on a particular storage key or object schema");
    expect(instructions).toContain("specification-discovery stage");
    expect(instructions).toContain("exactly 8 top-level Playwright tests");
    expect(instructions).toContain("at most 320 source lines");
    expect(instructions).toContain("The required eight executable scenarios");
    expect(instructions).toContain("role=alert summary");
    expect(instructions).toContain("Permanent hint text and a stable empty error-node ID may remain");
    expect(instructions).toContain("a missing type is valid HTML text-input behavior");
    expect(instructions).toContain("explicitly call check() or uncheck()");
    expect(instructions).toContain("getByRole('checkbox', { name: /terms/i })");
    expect(instructions).toContain("backgroundColor, not its text color");
    expect(instructions).toContain("clearing storage between these boundary rows is preferred");
    expect(instructions).toContain("submittedUsername.trim() ('MiXeD_1')");
    expect(instructions).toContain("el.labels?.[0]");
    expect(instructions).toContain("Do not search for an ancestor label");
    expect(instructions).toContain("form itself may be transparent inside the white panel");
  });

  it("forbids the optional native-date false rejection pattern", () => {
    const instructions = testAuthoringInstructions("gui");

    expect(instructions).toContain("Date of birth is optional");
    expect(instructions).toContain("that empty value is a valid submission");
    expect(instructions).toContain("otherwise omit that case entirely");
    expect(instructions).toContain("/^password(?!.*confirm)/i");
  });

  it("keeps the repair agent running until tests are green or the limit is reached", async () => {
    const invoke = repairToolUseBehavior as unknown as (
      context: unknown,
      results: unknown[],
    ) => Promise<unknown> | unknown;

    expect(
      await invoke({}, [
        { type: "function_output", output: { decision: "continue" } },
      ]),
    ).toMatchObject({ isFinalOutput: false });
    expect(
      await invoke({}, [
        { type: "function_output", output: { decision: "stop-green" } },
      ]),
    ).toMatchObject({ isFinalOutput: true });
  });

  it("allows four implementation writes by default and rejects a fifth", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lab02-repair-policy-"));
    temporaryDirectories.push(directory);
    const implementationPath = join(directory, "index.html");
    const workspace = new RepairWorkspace({
      scenario: "gui",
      publicBrief: "Register an account.",
      implementationContract: "Write one index.html file.",
      implementationPath,
      currentImplementation: "<html></html>",
      frozenTrainTests: "",
      initialTestResult: {
        status: "RED",
        summary: "A behavior is missing.",
        output: "failed",
      },
      runTrainTests: async () => ({
        status: "RED",
        summary: "Still missing.",
        output: "failed",
      }),
    });

    expect(implementationRepairLimit("api")).toBe(3);
    expect(implementationRepairLimit("gui")).toBe(4);
    for (let repair = 1; repair <= 4; repair += 1) {
      await expect(
        workspace.writeImplementation(
          implementationPath,
          `<html data-repair="${repair}"></html>`,
        ),
      ).resolves.toMatchObject({ accepted: true });
    }
    await expect(
      workspace.writeImplementation(
        implementationPath,
        "<html data-repair=\"5\"></html>",
      ),
    ).resolves.toMatchObject({ accepted: false });
  });
});
