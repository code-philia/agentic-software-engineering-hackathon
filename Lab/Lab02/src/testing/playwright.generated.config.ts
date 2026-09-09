import { defineConfig } from "@playwright/test";

const testDirectory = process.env.COURSE_TEST_DIR;
const reportFile = process.env.COURSE_TEST_REPORT;
const outputDirectory = process.env.COURSE_TEST_OUTPUT;

if (!testDirectory || !reportFile || !outputDirectory) {
  throw new Error("The generated-test runner configuration is incomplete.");
}

export default defineConfig({
  testDir: testDirectory,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 8_000,
  expect: { timeout: 2_000 },
  reporter: [["json", { outputFile: reportFile }]],
  outputDir: outputDirectory,
  use: {
    headless: true,
    screenshot: "off",
    trace: "off",
    video: "off",
  },
});
