import { test as base, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

const __dirname = path.dirname(new URL(import.meta.url).pathname);
const STATE_FILE = path.join(__dirname, '..', '.e2e-state.json');

function readAnalysisId(): string {
  // Try state file first (works across processes)
  if (fs.existsSync(STATE_FILE)) {
    const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    if (state.analysisId) return state.analysisId;
  }
  // Fallback to env var
  if (process.env.TEST_ANALYSIS_ID) return process.env.TEST_ANALYSIS_ID;
  throw new Error('TEST_ANALYSIS_ID not set — did global-setup run?');
}

/**
 * Extended test fixture that provides an analysis result page.
 *
 * - `analysisId`: the ID from global-setup
 * - `analysisPage`: a Page already navigated to the result view
 */
export const test = base.extend<{
  analysisId: string;
  analysisPage: Page;
}>({
  analysisId: async ({}, use) => {
    await use(readAnalysisId());
  },

  analysisPage: async ({ page }, use) => {
    const analysisId = readAnalysisId();

    // Load the analysis result directly via the History API, then navigate
    // This is more reliable than clicking through the UI
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Open History panel
    const viewHistoryBtn = page.locator('button', { hasText: 'View History' });
    const historyBtn = page.locator('button', { hasText: /^History$/ });

    if (await viewHistoryBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await viewHistoryBtn.click();
    } else {
      await historyBtn.click();
    }

    // Wait for history panel to load
    const historyHeading = page.locator('h2', { hasText: 'Analysis History' });
    await historyHeading.waitFor({ timeout: 10_000 });

    // Find and click the history item that matches our analysis ID
    // History items are inside the panel overlay — target items by their content
    // Each history item is a div with cursor-pointer containing the file name
    const panelOverlay = page.locator('.fixed.inset-0.z-50');
    const historyItems = panelOverlay.locator('div.cursor-pointer');
    await historyItems.first().waitFor({ timeout: 5000 });

    // Click the first (most recent) history item
    await historyItems.first().click();

    // Wait for result page to load (System Overview heading)
    await page.locator('h2', { hasText: 'System Overview' }).waitFor({ timeout: 30_000 });

    // Brief wait for all sections to render
    await page.waitForTimeout(500);

    await use(page);
  },
});

export { expect } from '@playwright/test';
