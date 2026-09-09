import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/validation/**/*.test.ts"],
    sequence: { concurrent: false },
    testTimeout: 240_000,
    hookTimeout: 10_000,
  },
});
