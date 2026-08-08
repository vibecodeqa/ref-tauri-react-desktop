import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __APP_MODE__: JSON.stringify("test"),
  },
  test: {
    environment: "jsdom",
    globals: false,
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    setupFiles: ["tests/setup.ts"],
  },
});
