import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./gui",
  fullyParallel: true,
  workers: 2,
  retries: 0,
  timeout: 10_000,
  expect: { timeout: 1_000 },
  reporter: [["json", { outputFile: process.env.COURSE_VALIDATION_REPORT }]],
  outputDir: process.env.COURSE_VALIDATION_OUTPUT,
  use: {
    actionTimeout: 1_000,
    browserName: "chromium",
    headless: true,
    trace: "off",
    screenshot: "off",
    video: "off",
  },
});
