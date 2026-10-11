import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests", testMatch: "**/*.oauth.ts", workers: 1, reporter: "list",
  use: { baseURL: "http://127.0.0.1:5174", channel: "chrome", headless: true, viewport: { width: 1440, height: 1000 } },
  webServer: {
    command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5174 --strictPort',
    url: "http://127.0.0.1:5174", reuseExistingServer: false,
    env: { VITE_ONEDRIVE_CLIENT_ID: "00000000-0000-4000-8000-000000000001", VITE_ONEDRIVE_REDIRECT_URI: "http://127.0.0.1:5174/onedrive/callback" },
  },
});
