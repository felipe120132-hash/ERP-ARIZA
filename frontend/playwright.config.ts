import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173",
    channel: "chrome",
    headless: true,
    viewport: { width: 1440, height: 1000 },
  },
  workers: 1,
  reporter: "list",
});
