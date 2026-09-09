import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["validation/api/**/*.test.ts"],
    sequence: { concurrent: false },
    testTimeout: 5_000,
  },
});
