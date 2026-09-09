import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import launchUrl from "open";

import type { CourseScenario } from "../agents/generate.js";
import { CourseModelRuntime } from "../agents/runtime.js";
import { loadModelConfig } from "../config/model-config.js";
import type { RunningServer } from "../harness/api-server.js";
import { startGuiServer } from "../harness/gui-server.js";
import { TerminalPresenter } from "../presentation/presenter.js";
import { createModelServices, runCourseScenario } from "../run/orchestrator.js";
import type { RunWorkspace } from "../run/workspace.js";
import {
  runApiTrainTests,
  runGuiTrainTests,
} from "../testing/run-generated-tests.js";
import {
  runApiValidation,
  runGuiValidation,
} from "../validation/run-validation.js";
import { parseDemoOptions } from "./arguments.js";
import { installShutdownSignalHandlers } from "./shutdown.js";

const projectRoot = fileURLToPath(new URL("../../", import.meta.url));

function scenarioFromArgument(value: string | undefined): CourseScenario {
  if (value === "api" || value === "gui") return value;
  throw new Error("Choose one scenario: api or gui.");
}

function outputPath(workspace: RunWorkspace, name: string): string {
  return join(workspace.testOutputDirectory, name);
}

function safeErrorMessage(error: unknown, apiKey?: string): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replaceAll(apiKey ?? "", apiKey ? "[REDACTED]" : "")
    .replace(/Bearer\s+[^\s,;]+/gi, "Bearer [REDACTED]");
}

async function main(): Promise<void> {
  const shutdown = installShutdownSignalHandlers();
  const previewServers: RunningServer[] = [];
  let runtime: CourseModelRuntime | undefined;
  let apiKey: string | undefined;

  try {
    const scenario = scenarioFromArgument(process.argv[2]);
    const options = parseDemoOptions(process.argv.slice(3));
    const config = await loadModelConfig(options.envFile, options.model);
    apiKey = config.apiKey;
    runtime = new CourseModelRuntime(config);
    const presenter = new TerminalPresenter({
      interactive: options.interactive,
      signal: shutdown.signal,
    });
    const [publicBrief, implementationContract, testContract] =
      await Promise.all([
        readFile(
          join(projectRoot, "requirements", `register_${scenario}.md`),
          "utf8",
        ),
        readFile(
          join(
            projectRoot,
            "prompts",
            "contracts",
            `${scenario}-implementation.md`,
          ),
          "utf8",
        ),
        readFile(
          join(projectRoot, "prompts", "contracts", `${scenario}-tests.md`),
          "utf8",
        ),
      ]);

    let standardPreviewUrl: string | undefined;
    if (scenario === "gui" && options.interactive) {
      const standardServer = await startGuiServer({
        htmlPath: join(
          projectRoot,
          "requirements",
          "gui-reference",
          "index.html",
        ),
      });
      previewServers.push(standardServer);
      standardPreviewUrl = standardServer.url;
      if (options.openBrowser) {
        try {
          await launchUrl(standardServer.url);
        } catch (error) {
          process.stderr.write(
            `[warning] Could not open the standard UI automatically: ${safeErrorMessage(error)}\n`,
          );
        }
      }
    }
    const services = createModelServices(runtime, {
      runReferenceTrainTests: (testPath, workspace, signal) =>
        scenario === "api"
          ? runApiTrainTests({
              implementationPath: join(
                projectRoot,
                "tests",
                "validation",
                "fixtures",
                "api-good.ts",
              ),
              testPath,
              reportPath: outputPath(
                workspace,
                "reference-train-vitest-report.json",
              ),
              rawOutputPath: outputPath(
                workspace,
                "reference-train-vitest-output.txt",
              ),
              ...(signal === undefined ? {} : { signal }),
            })
          : runGuiTrainTests({
              htmlPath: join(
                projectRoot,
                "tests",
                "validation",
                "fixtures",
                "gui-good.html",
              ),
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
      runTrainTests: (implementationPath, testPath, workspace, signal) =>
        scenario === "api"
          ? runApiTrainTests({
              implementationPath,
              testPath,
              reportPath: outputPath(workspace, "train-vitest-report.json"),
              rawOutputPath: outputPath(workspace, "train-vitest-output.txt"),
              ...(signal === undefined ? {} : { signal }),
            })
          : runGuiTrainTests({
              htmlPath: implementationPath,
              testPath,
              reportPath: outputPath(workspace, "train-playwright-report.json"),
              rawOutputPath: outputPath(
                workspace,
                "train-playwright-output.txt",
              ),
              browserOutputPath: outputPath(
                workspace,
                "train-playwright-artifacts",
              ),
              timeoutDisposition: "red",
              ...(signal === undefined ? {} : { signal }),
            }),
      validate: (implementationPath, arm, workspace, signal) =>
        scenario === "api"
          ? runApiValidation({
              implementationPath,
              reportPath: outputPath(
                workspace,
                `${arm}-validation-vitest-report.json`,
              ),
              rawOutputPath: outputPath(
                workspace,
                `${arm}-validation-vitest-output.txt`,
              ),
              ...(signal === undefined ? {} : { signal }),
            })
          : runGuiValidation({
              htmlPath: implementationPath,
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
      ...(scenario === "gui" && options.interactive
        ? {
            preview: async (implementationPath: string) => {
              const server = await startGuiServer({
                htmlPath: implementationPath,
              });
              previewServers.push(server);
              if (options.openBrowser) {
                try {
                  await launchUrl(server.url);
                } catch (error) {
                  process.stderr.write(
                    `[warning] Could not open the browser automatically: ${safeErrorMessage(error)}\n`,
                  );
                }
              }
              return server.url;
            },
          }
        : {}),
    });

    await runCourseScenario({
      scenario,
      publicBrief,
      implementationContract,
      testContract,
      modelName: config.model,
      envFile: config.envFile,
      inferencePolicy: runtime.inferencePolicy,
      presenter,
      services,
      stepRepairs: options.stepRepairs,
      signal: shutdown.signal,
      ...(standardPreviewUrl === undefined ? {} : { standardPreviewUrl }),
    });
  } catch (error) {
    process.stderr.write(`[error] ${safeErrorMessage(error, apiKey)}\n`);
    process.exitCode = 1;
  } finally {
    shutdown.dispose();
    const cleanupResults = await Promise.allSettled([
      ...previewServers.map((server) => server.close()),
      ...(runtime === undefined ? [] : [runtime.close()]),
    ]);
    for (const result of cleanupResults) {
      if (result.status !== "rejected") continue;
      process.stderr.write(
        `[warning] Cleanup failed: ${safeErrorMessage(result.reason, apiKey)}\n`,
      );
      process.exitCode = 1;
    }
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`[error] ${safeErrorMessage(error)}\n`);
  process.exitCode = 1;
});
