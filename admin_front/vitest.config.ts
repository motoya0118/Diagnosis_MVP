import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts?(x)"],
    environment: "jsdom",
    clearMocks: true,
    restoreMocks: true,
    setupFiles: [],
  },
});
