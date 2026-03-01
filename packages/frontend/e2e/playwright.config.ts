import { defineConfig } from '@playwright/test';
import path from 'node:path';

const __dirname = path.dirname(new URL(import.meta.url).pathname);

export default defineConfig({
  testDir: './tests',
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },

  reporter: [
    ['list'],
    ['html', { outputFolder: path.join(__dirname, 'playwright-report'), open: 'never' }],
  ],

  use: {
    baseURL: 'http://localhost:3000',
    viewport: { width: 1440, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },

  outputDir: path.join(__dirname, 'test-results'),

  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
  ],

  globalSetup: path.join(__dirname, 'global-setup.ts'),

  webServer: [
    {
      command: 'npm run dev -w packages/backend',
      port: 8000,
      cwd: path.resolve(__dirname, '../../..'),
      reuseExistingServer: true,
      timeout: 90_000,
      env: { NODE_OPTIONS: '--max-old-space-size=4096' },
    },
    {
      command: 'npm run dev -w packages/frontend',
      port: 3000,
      cwd: path.resolve(__dirname, '../../..'),
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
