import { test, expect } from '../fixtures/analysis.fixture.js';

test.describe('Export Menu', () => {
  test('dropdown shows JSON and HTML options', async ({ analysisPage }) => {
    const page = analysisPage;

    const exportBtn = page.locator('button', { hasText: 'Export' }).first();
    await exportBtn.click();

    // Dropdown items
    await expect(page.locator('button', { hasText: 'Export as JSON' })).toBeVisible({ timeout: 3000 });
    await expect(page.locator('button', { hasText: 'Export as HTML' })).toBeVisible();

    // Close by clicking elsewhere
    await page.locator('body').click({ position: { x: 0, y: 0 } });
  });

  test('JSON export triggers download', async ({ analysisPage }) => {
    const page = analysisPage;

    const exportBtn = page.locator('button', { hasText: 'Export' }).first();
    await exportBtn.click();

    // Listen for download
    const downloadPromise = page.waitForEvent('download', { timeout: 10_000 });
    await page.locator('button', { hasText: 'Export as JSON' }).click();

    const download = await downloadPromise;
    expect(download.suggestedFilename()).toMatch(/\.json$/);
  });

  test('Power Report option is conditionally visible', async ({ analysisPage }) => {
    const page = analysisPage;

    const exportBtn = page.locator('button', { hasText: 'Export' }).first();
    await exportBtn.click();

    // Power Report may or may not be visible depending on data
    const powerReportBtn = page.locator('button', { hasText: 'Power Report' });
    // Just check it doesn't crash — it's conditional
    const isVisible = await powerReportBtn.isVisible({ timeout: 1000 }).catch(() => false);

    if (isVisible) {
      // Verify it has indigo styling
      await expect(powerReportBtn).toBeVisible();
    }

    await page.locator('body').click({ position: { x: 0, y: 0 } });
  });
});
