import { test, expect } from '../fixtures/analysis.fixture.js';

test.describe('Search Modal', () => {
  test('opens from header Search button with correct layout', async ({ analysisPage }) => {
    const page = analysisPage;

    // Click header Search button
    await page.locator('button', { hasText: 'Search' }).click();

    const modal = page.locator('.fixed.inset-0.z-50');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Default to Logcat tab
    const logcatTab = modal.locator('button', { hasText: 'Logcat' });
    await expect(logcatTab).toBeVisible();

    // Logcat-specific filter labels should be visible
    await expect(modal.locator('label', { hasText: 'Tag' })).toBeVisible();
    await expect(modal.locator('label', { hasText: 'Buffer' })).toBeVisible();
    await expect(modal.locator('label', { hasText: 'Min Level' })).toBeVisible();
    await expect(modal.locator('label', { hasText: 'PID' })).toBeVisible();

    // Time range inputs
    const timeInputs = modal.locator('input[placeholder="MM-DD HH:mm:ss"]');
    expect(await timeInputs.count()).toBe(2);

    // Close
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible({ timeout: 3000 });
  });

  test('switching to Kernel tab hides Logcat filters', async ({ analysisPage }) => {
    const page = analysisPage;

    await page.locator('button', { hasText: 'Search' }).click();
    const modal = page.locator('.fixed.inset-0.z-50');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Wait for initial data load to complete
    await expect(modal.locator('text=loaded')).toBeVisible({ timeout: 15_000 });

    // Switch to Kernel
    await modal.locator('button', { hasText: 'Kernel' }).click();

    // Wait for kernel data to load
    await expect(modal.locator('text=loaded')).toBeVisible({ timeout: 15_000 });

    // Logcat-only filters should not be visible
    await expect(modal.locator('text=Tag')).not.toBeVisible();
    await expect(modal.locator('text=Buffer')).not.toBeVisible();
    await expect(modal.locator('text=PID')).not.toBeVisible();

    // Find input placeholder should change
    await expect(modal.locator('input[placeholder="Find in kernel logs..."]')).toBeVisible();

    await page.keyboard.press('Escape');
  });

  test('auto-loads entries and displays in virtual scroll', async ({ analysisPage }) => {
    const page = analysisPage;

    await page.locator('button', { hasText: 'Search' }).click();
    const modal = page.locator('.fixed.inset-0.z-50');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Should auto-load entries without clicking any Search button
    await expect(modal.locator('text=loaded')).toBeVisible({ timeout: 15_000 });
    await expect(modal.locator('text=shown')).toBeVisible();

    // Column headers should be visible
    await expect(modal.locator('text=Timestamp')).toBeVisible();
    await expect(modal.locator('text=Message')).toBeVisible();

    await page.keyboard.press('Escape');
  });

  test('keyword find highlights matches with count', async ({ analysisPage }) => {
    const page = analysisPage;

    await page.locator('button', { hasText: 'Search' }).click();
    const modal = page.locator('.fixed.inset-0.z-50');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Wait for data to load
    await expect(modal.locator('text=loaded')).toBeVisible({ timeout: 15_000 });

    // Type a keyword in the Find input
    await modal.locator('input[placeholder="Find in logs..."]').fill('ActivityManager');

    // Should show match count (e.g. "1 / 47") and "matches" in status bar
    await expect(modal.locator('text=matches')).toBeVisible({ timeout: 5000 });

    // Navigation buttons should be enabled
    const nextBtn = modal.locator('button[title="Next match (Enter)"]');
    await expect(nextBtn).toBeEnabled();
    const prevBtn = modal.locator('button[title="Previous match (Shift+Enter)"]');
    await expect(prevBtn).toBeEnabled();

    await page.keyboard.press('Escape');
  });

  test('level filter reduces shown entries', async ({ analysisPage }) => {
    const page = analysisPage;

    await page.locator('button', { hasText: 'Search' }).click();
    const modal = page.locator('.fixed.inset-0.z-50');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Wait for data to load
    const shownLabel = modal.locator('text=shown');
    await expect(shownLabel).toBeVisible({ timeout: 15_000 });

    // Get shown count from the span right before "shown" text
    const getShownCount = async () => {
      const shownEl = modal.locator('text=shown');
      // Go up to parent container that has the full status bar text
      const statusText = await shownEl.locator('..').textContent() ?? '';
      const match = statusText.match(/([\d,]+)\s*shown/);
      return match ? parseInt(match[1].replace(/,/g, ''), 10) : 0;
    };

    const initialShown = await getShownCount();
    expect(initialShown).toBeGreaterThan(0);

    // Set level filter to E+ (Error and above)
    // Filter order: Tag input, Buffer select, Min Level select, PID input
    const levelSelect = modal.locator('select').nth(1); // Min Level is the second select
    await levelSelect.selectOption('E');
    await page.waitForTimeout(500);

    // Shown count should decrease
    const updatedShown = await getShownCount();
    expect(updatedShown).toBeLessThan(initialShown);

    await page.keyboard.press('Escape');
  });
});
