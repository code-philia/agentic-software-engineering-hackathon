import { copyFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import launchUrl from "open";

import type { GenerationResult } from "../agents/generate.js";
import type { RepairResult } from "../agents/repair.js";
import type { UsageSnapshot } from "../agents/runtime.js";
import type { RunningServer } from "../harness/api-server.js";
import { startGuiServer } from "../harness/gui-server.js";
import { TerminalPresenter } from "../presentation/presenter.js";
import {
  runCourseScenario,
  type ScenarioServices,
} from "../run/orchestrator.js";
import type { RunWorkspace } from "../run/workspace.js";
import { runGuiTrainTests } from "../testing/run-generated-tests.js";
import { runGuiValidation } from "../validation/run-validation.js";
import { installShutdownSignalHandlers } from "./shutdown.js";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

interface RehearsalOptions {
  readonly interactive: boolean;
  readonly openBrowser: boolean;
  readonly stepRepairs: boolean;
}

function parseOptions(args: readonly string[]): RehearsalOptions {
  let interactive = true;
  let openBrowser = true;
  let stepRepairs = false;
  for (const argument of args) {
    if (argument === "--no-interactive") interactive = false;
    else if (argument === "--no-open") openBrowser = false;
    else if (argument === "--step-repairs") stepRepairs = true;
    else throw new Error(`Unknown option: ${argument}`);
  }
  return { interactive, openBrowser, stepRepairs };
}

const offlineUsage: UsageSnapshot = {
  requests: 0,
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  requestUsage: [],
};

function fixedGeneration(content: string): GenerationResult {
  return {
    content,
    rawOutput: content,
    usage: offlineUsage,
    rawResponses: [],
  };
}

function outputPath(workspace: RunWorkspace, name: string): string {
  return join(workspace.testOutputDirectory, name);
}

async function main(): Promise<void> {
  const shutdown = installShutdownSignalHandlers();
  const previewServers: RunningServer[] = [];
  try {
    const options = parseOptions(process.argv.slice(2));
    const presenter = new TerminalPresenter({
      interactive: options.interactive,
      rehearsal: true,
      signal: shutdown.signal,
    });
    const incompleteHtml = join(
      projectRoot,
      "tests",
      "rehearsal",
      "gui-direct.html",
    );
    const correctHtml = join(
      projectRoot,
      "tests",
      "validation",
      "fixtures",
      "gui-good.html",
    );
    const rehearsalTests = join(
      projectRoot,
      "tests",
      "rehearsal",
      "gui-train.spec.ts",
    );
    const standardHtml = join(
      projectRoot,
      "requirements",
      "gui-reference",
      "index.html",
    );

    const [
      publicBrief,
      implementationContract,
      testContract,
      directSource,
      trainSource,
    ] = await Promise.all([
      readFile(join(projectRoot, "requirements", "register_gui.md"), "utf8"),
      readFile(
        join(projectRoot, "prompts", "contracts", "gui-implementation.md"),
        "utf8",
      ),
      readFile(
        join(projectRoot, "prompts", "contracts", "gui-tests.md"),
        "utf8",
      ),
      readFile(incompleteHtml, "utf8"),
      readFile(rehearsalTests, "utf8"),
    ]);

    process.stdout.write(
      "OFFLINE GUI REHEARSAL — fixed local artifacts simulate generation; no model or provider is called.\n",
    );

    const services: ScenarioServices = {
      generateDirect: async (input) => {
        await writeFile(input.artifactPath, directSource, "utf8");
        return fixedGeneration(directSource);
      },
      generateTests: async (input) => {
        await writeFile(input.artifactPath, trainSource, "utf8");
        return fixedGeneration(trainSource);
      },
      repairTests: async () => {
        throw new Error(
          "The fixed rehearsal train suite should not require infrastructure repair.",
        );
      },
      runReferenceTrainTests: (testPath, workspace, signal) =>
        runGuiTrainTests({
          htmlPath: correctHtml,
          testPath,
          reportPath: outputPath(
            workspace,
            "reference-train-playwright-report.json",
          ),
          rawOutputPath: outputPath(
            workspace,
            "reference-train-playwright-output.txt",
          ),
          browserOutputPath: outputPath(
            workspace,
            "reference-train-playwright-artifacts",
          ),
          ...(signal === undefined ? {} : { signal }),
        }),
      runTrainTests: (
        implementationPath,
        testPath,
        workspace,
        signal,
        excludedTestNames,
      ) =>
        runGuiTrainTests({
          htmlPath: implementationPath,
          testPath,
          reportPath: outputPath(workspace, "train-playwright-report.json"),
          rawOutputPath: outputPath(workspace, "train-playwright-output.txt"),
          browserOutputPath: outputPath(
            workspace,
            "train-playwright-artifacts",
          ),
          timeoutDisposition: "red",
          ...(excludedTestNames === undefined
            ? {}
            : { excludedTestNames }),
          ...(signal === undefined ? {} : { signal }),
        }),
      repairImplementation: async (input): Promise<RepairResult> => {
        await copyFile(correctHtml, input.implementationPath);
        await input.onCheckpoint?.({
          type: "implementation-written",
          repair: 1,
          maxRepairs: 4,
        });
        const finalTestResult = await input.runTrainTests();
        await input.onCheckpoint?.({
          type: "train-tests-finished",
          repair: 1,
          maxRepairs: 4,
          result: finalTestResult,
          decision: "stop-green",
        });
        return {
          status: finalTestResult.status,
          repairs: 1,
          finalTestResult,
          finalOutput: "The fixed rehearsal repair was applied.",
          usage: offlineUsage,
          rawResponses: [],
        };
      },
      validate: (htmlPath, arm, workspace, signal) =>
        runGuiValidation({
          htmlPath,
          reportPath: outputPath(
            workspace,
            `${arm}-validation-playwright-report.json`,
          ),
          rawOutputPath: outputPath(
            workspace,
            `${arm}-validation-playwright-output.txt`,
          ),
          browserOutputPath: outputPath(
            workspace,
            `${arm}-validation-playwright-artifacts`,
          ),
          ...(signal === undefined ? {} : { signal }),
        }),
      ...(options.interactive
        ? {
            preview: async (htmlPath: string) => {
              const server = await startGuiServer({ htmlPath });
              previewServers.push(server);
              if (options.openBrowser) await launchUrl(server.url);
              return server.url;
            },
          }
        : {}),
    };

    let standardPreviewUrl: string | undefined;
    if (options.interactive) {
      const standardServer = await startGuiServer({ htmlPath: standardHtml });
      previewServers.push(standardServer);
      standardPreviewUrl = standardServer.url;
      if (options.openBrowser) await launchUrl(standardServer.url);
    }
    const result = await runCourseScenario({
      scenario: "gui",
      publicBrief,
      implementationContract,
      testContract,
      modelName: "offline-rehearsal",
      envFile: "offline-rehearsal",
      presenter,
      services,
      stepRepairs: options.stepRepairs,
      rehearsal: true,
      signal: shutdown.signal,
      ...(standardPreviewUrl === undefined ? {} : { standardPreviewUrl }),
    });
    if (
      result.outcome !== "GREEN" ||
      result.tddValidation?.passed !== result.tddValidation?.total
    ) {
      throw new Error(
        "The offline GUI rehearsal did not reach the expected Green result.",
      );
    }
  } finally {
    shutdown.dispose();
    const cleanupResults = await Promise.allSettled(
      previewServers.map((server) => server.close()),
    );
    for (const result of cleanupResults) {
      if (result.status !== "rejected") continue;
      const message =
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);
      process.stderr.write(`[warning] Cleanup failed: ${message}\n`);
      process.exitCode = 1;
    }
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[error] ${message}\n`);
  process.exitCode = 1;
});
