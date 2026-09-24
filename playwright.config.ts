import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'http://127.0.0.1:8087',
  },
  webServer: {
    command: 'corepack pnpm exec tsx apps/backend/src/scripts/e2e-server.ts',
    port: 8087,
    reuseExistingServer: !process.env.CI,
  },
});
