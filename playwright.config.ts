import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: './tests/e2e',
  // Provisions the PHI Contact Info / Appointment Confirmation e2e fixtures
  // (company, roles, users, study) once per run — see tests/e2e/global-setup.ts.
  globalSetup: require.resolve('./tests/e2e/global-setup'),
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  ...(isCI
    ? {
        workers: 1,
        webServer: {
          command: 'pnpm start',
          url: 'http://localhost:3000',
          reuseExistingServer: true,
        },
      }
    : {}),
});
