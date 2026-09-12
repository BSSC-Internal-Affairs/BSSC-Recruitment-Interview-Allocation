import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  use: {
    baseURL: "http://localhost:3011",
    headless: true,
    launchOptions: { channel: "chrome" },
  },
  reporter: "list",
});
