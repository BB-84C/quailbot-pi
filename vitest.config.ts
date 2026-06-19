import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: ["tests/**/*.test.ts"],
          exclude: ["tests/workspace-ui/dom/**/*.test.ts"],
          testTimeout: 30_000,
        },
      },
      {
        test: {
          name: "dom",
          environment: "jsdom",
          include: ["tests/workspace-ui/dom/**/*.test.ts"],
          environmentOptions: {
            jsdom: {
              runScripts: "dangerously",
            },
          },
          testTimeout: 30_000,
        },
      },
    ],
  },
});
