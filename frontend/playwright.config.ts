import { defineConfig, devices } from "@playwright/test";

const testMode = process.env.APP_ENV === "test";
const port = (value: string | undefined, fallback: string) => value && /^\d+$/.test(value) ? value : fallback;
const backendPort = port(process.env.E2E_BACKEND_PORT, "8080");
const frontendPort = port(process.env.E2E_FRONTEND_PORT, "5173");
const e2eBaseURL = `http://127.0.0.1:${frontendPort}`;
const frontendCommand = process.env.E2E_PRODUCTION === "1"
  ? `npx vite preview --host 127.0.0.1 --port ${frontendPort}`
  : `npm run dev -- --host 127.0.0.1 --port ${frontendPort}`;
const inheritedEnvironment = Object.fromEntries(
  Object.entries(process.env).filter((entry): entry is [string, string] => entry[1] !== undefined),
);
const backendEnvironment: Record<string, string> = testMode
  ? {
      ...inheritedEnvironment,
      APP_ENV: "test",
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? "",
      PUBLIC_BASE_URL: e2eBaseURL,
      LISTEN_ADDR: `127.0.0.1:${backendPort}`,
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
    baseURL: e2eBaseURL,
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
      url: `http://127.0.0.1:${backendPort}/api/health/live`,
      env: backendEnvironment,
      reuseExistingServer: !process.env.CI && !testMode,
      timeout: 120_000,
    },
    {
      command: frontendCommand,
      url: e2eBaseURL,
      reuseExistingServer: !process.env.CI && !testMode,
      timeout: 120_000,
    },
  ],
});
