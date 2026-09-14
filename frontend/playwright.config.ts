import { defineConfig, devices } from "@playwright/test";

const testMode = process.env.APP_ENV === "test";
const inheritedEnvironment = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);
const backendEnvironment: Record<string, string> = testMode
  ? {
      ...inheritedEnvironment,
      APP_ENV: "test",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
      PUBLIC_BASE_URL: "http://127.0.0.1:5173",
      SUPERADMIN_USERNAME: process.env.E2E_SUPERADMIN_USERNAME ?? "",
      SUPERADMIN_INITIAL_PASSWORD: process.env.E2E_SUPERADMIN_PASSWORD ?? "",
      FILE_ROOT: process.env.E2E_FILE_ROOT ?? "/tmp/jl-business-growth-e2e-files",
      MAIL_MODE: "file",
    }
  : inheritedEnvironment;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
      testMatch: /^(?!.*mobile-shell\.spec\.ts$).*\.spec\.ts$/,
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
      testMatch: /mobile-shell\.spec\.ts$/,
    },
  ],
  webServer: [
    {
      command: "cd ../backend && go run ./cmd/jl-business-api",
      url: "http://127.0.0.1:8080/api/health/live",
      env: backendEnvironment,
      reuseExistingServer: !process.env.CI && !testMode,
      timeout: 120_000,
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 5173",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI && !testMode,
      timeout: 120_000,
    },
  ],
});
