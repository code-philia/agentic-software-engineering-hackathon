import { loadRuns, markdownSummary, summarizeRuns } from "../benchmark/summarize-runs.js";

let afterRunId: string | undefined;
const roots: string[] = [];
for (let index = 2; index < process.argv.length; index += 1) {
  const argument = process.argv[index]!;
  if (argument === "--after") {
    afterRunId = process.argv[index + 1];
    index += 1;
  } else {
    roots.push(argument);
  }
}

const runs = await loadRuns(roots.length === 0 ? ["runs"] : roots, afterRunId);
process.stdout.write(`${markdownSummary(summarizeRuns(runs))}\n`);
