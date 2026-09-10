import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  implementationRepairInstructions,
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

  it("requests focused GUI coverage without prescribing test count or storage internals", () => {
    const instructions = testAuthoringInstructions("gui");

    expect(instructions).toContain("coverage quality and reliability matter more than test count");
    expect(instructions).toContain("rejected attempts reserve nothing");
    expect(instructions).toContain("clears stale invalid state");
    expect(instructions).toContain("without assuming a key or schema");
    expect(instructions).toContain("specification-discovery stage");
    expect(instructions).toContain("Aim for roughly 220 source lines or fewer");
    expect(instructions).toContain("correct executable suite over an arbitrary test or line count");
    expect(instructions).not.toContain("exactly 8 top-level Playwright tests");
    expect(instructions).not.toContain("required eight executable scenarios");
    expect(instructions).toContain("Use the supplied resetRegistration helper");
    expect(instructions).toContain("Use the supplied controls, fillRegistration");
    expect(instructions).toContain("expectFirstInvalid, expectRejection");
    expect(instructions).toContain("create.*account");
    expect(instructions).toContain("set confirmation to that same value");
  });

  it("forbids the optional native-date false rejection pattern", () => {
    const instructions = testAuthoringInstructions("gui");

    expect(instructions).toContain("Date of birth is optional");
    expect(instructions).toContain("a real Gregorian date and an omitted date");
    expect(instructions).toContain("Never put an invalid date in fillRegistration");
    expect(instructions).toContain("A password-confirmation mismatch belongs to confirmPassword");
    expect(instructions).toContain("fillRegistration keeps all companion fields valid");
    expect(instructions).toContain("use await expectFirstInvalid(page)");
  });

  it("gives GUI repair an explicit coherent policy without changing Direct", () => {
    const instructions = implementationRepairInstructions(
      "gui",
      "Write one index.html file.",
    );

    expect(instructions).toContain("Password1 and Abcdefgh1 are 9 characters");
    expect(instructions).toContain("Compare stored usernames case-insensitively");
    expect(instructions).toContain("visible field explanations through aria-describedby");
    expect(instructions).toContain("never store passwords");
  });

  it("ends the repair agent from the real train-test tool output when tests turn green", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lab02-repair-green-"));
    temporaryDirectories.push(directory);
    const implementationPath = join(directory, "register.ts");
    const workspace = new RepairWorkspace({
      scenario: "api",
      publicBrief: "Register an account.",
      implementationContract: "Write one register.ts file.",
      implementationPath,
      currentImplementation: "export default () => new Response();",
      frozenTrainTests: "",
      initialTestResult: {
        status: "RED",
        summary: "A behavior is missing.",
        output: "failed",
      },
      runTrainTests: async () => ({
        status: "GREEN",
        summary: "All train tests passed.",
        output: "passed",
      }),
    });
    await workspace.writeImplementation(
      implementationPath,
      "export default () => new Response(null, { status: 201 });",
    );
    const toolOutput = await workspace.runTrainTests();
    const invoke = repairToolUseBehavior as unknown as (
      context: unknown,
      results: unknown[],
    ) => Promise<unknown> | unknown;

    expect(toolOutput).toMatchObject({
      status: "GREEN",
      decision: "stop-green",
    });
    expect(
      await invoke({}, [
        { type: "function_output", output: toolOutput },
      ]),
    ).toMatchObject({ isFinalOutput: true });
  });

  it("returns continue before the write limit and stop-limit at the limit", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lab02-repair-limit-"));
    temporaryDirectories.push(directory);
    const implementationPath = join(directory, "register.ts");
    const workspace = new RepairWorkspace({
      scenario: "api",
      publicBrief: "Register an account.",
      implementationContract: "Write one register.ts file.",
      implementationPath,
      currentImplementation: "export default () => new Response();",
      frozenTrainTests: "",
      initialTestResult: {
        status: "RED",
        summary: "A behavior is missing.",
        output: "failed",
      },
      runTrainTests: async () => ({
        status: "RED",
        summary: "A behavior is still missing.",
        output: "failed",
      }),
      maxRepairs: 2,
    });

    await workspace.writeImplementation(
      implementationPath,
      "export default () => new Response('first repair');",
    );
    await expect(workspace.runTrainTests()).resolves.toMatchObject({
      decision: "continue",
    });
    await workspace.writeImplementation(
      implementationPath,
      "export default () => new Response('second repair');",
    );
    await expect(workspace.runTrainTests()).resolves.toMatchObject({
      decision: "stop-limit",
    });
  });

  it("rejects an unchanged implementation without consuming a repair", async () => {
    const directory = await mkdtemp(join(tmpdir(), "lab02-repair-unchanged-"));
    temporaryDirectories.push(directory);
    const implementationPath = join(directory, "index.html");
    const current = "<html><body>current</body></html>";
    const workspace = new RepairWorkspace({
      scenario: "gui",
      publicBrief: "Register an account.",
      implementationContract: "Write one index.html file.",
      implementationPath,
      currentImplementation: current,
      frozenTrainTests: "",
      initialTestResult: {
        status: "RED",
        summary: "5/10 train tests passed.",
        output: "failed",
      },
      runTrainTests: async () => ({
        status: "RED",
        summary: "Still failing.",
        output: "failed",
      }),
    });

    await expect(
      workspace.writeImplementation(implementationPath, `${current}\n`),
    ).resolves.toMatchObject({
      accepted: false,
      message: expect.stringContaining("5/10 train tests passed"),
    });
    expect(workspace.repairs).toBe(0);
  });

  it("allows five GUI implementation writes by default and rejects a sixth", async () => {
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
    expect(implementationRepairLimit("gui")).toBe(5);
    for (let repair = 1; repair <= 5; repair += 1) {
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
        "<html data-repair=\"6\"></html>",
      ),
    ).resolves.toMatchObject({ accepted: false });
  });
});
