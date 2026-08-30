/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { configDefaults } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: "jsdom",
    setupFiles: "./src/setupTests.ts",
    // e2e/ holds real Playwright specs (frontend/playwright.config.ts runs those separately,
    // via `npm run test:e2e`) - they call @playwright/test's own test(), which collides with
    // Vitest's global test() once Vitest's default include pattern picks the same *.spec.ts
    // files up too.
    exclude: [...configDefaults.exclude, "e2e/**"],
    fileParallelism: false,
  },
});
