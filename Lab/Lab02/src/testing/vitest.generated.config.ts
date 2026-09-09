import { defineConfig } from "vitest/config";

export default defineConfig({
  ...(process.env.COURSE_TEST_CACHE === undefined
    ? {}
    : { cacheDir: process.env.COURSE_TEST_CACHE }),
  test: {
    include: ["**/*.test.ts"],
    environment: "node",
    fileParallelism: false,
    maxWorkers: 1,
    retry: 0,
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
