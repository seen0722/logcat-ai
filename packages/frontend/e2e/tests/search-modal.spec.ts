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

    // Logcat-specific filters should be visible
    await expect(modal.locator('text=Tag')).toBeVisible();
    await expect(modal.locator('text=Buffer')).toBeVisible();
    await expect(modal.locator('text=Min Level')).toBeVisible();
    await expect(modal.locator('text=PID')).toBeVisible();

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

    // Switch to Kernel
    await modal.locator('button', { hasText: 'Kernel' }).click();
    await page.waitForTimeout(300);

    // Logcat-only filters should not be visible
    await expect(modal.locator('text=Tag')).not.toBeVisible();
    await expect(modal.locator('text=Buffer')).not.toBeVisible();
    await expect(modal.locator('text=PID')).not.toBeVisible();

    // Keyword input placeholder should change
    await expect(modal.locator('input[placeholder="Search kernel message..."]')).toBeVisible();

    await page.keyboard.press('Escape');
  });

  test('keyword search returns results', async ({ analysisPage }) => {
    const page = analysisPage;

    await page.locator('button', { hasText: 'Search' }).click();
    const modal = page.locator('.fixed.inset-0.z-50');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Type a common keyword
    await modal.locator('input[placeholder="Search keyword..."]').fill('ActivityManager');
    await modal.locator('button', { hasText: /^Search$/ }).click();

    // Wait for results — look for result rows to appear
    const rows = modal.locator('tr[data-ts]');
    await rows.first().waitFor({ timeout: 15_000 });

    // Should show "matched" label in status bar
    await expect(modal.locator('text=matched')).toBeVisible();

    // Result rows should exist
    expect(await rows.count()).toBeGreaterThan(0);

    await page.keyboard.press('Escape');
  });

  test('empty search browses all entries', async ({ analysisPage }) => {
    const page = analysisPage;

    await page.locator('button', { hasText: 'Search' }).click();
    const modal = page.locator('.fixed.inset-0.z-50');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Click Search with empty keyword
    await modal.locator('button', { hasText: /^Search$/ }).click();

    // Should show results
    await page.waitForTimeout(2000);
    const rows = modal.locator('tr[data-ts]');
    expect(await rows.count()).toBeGreaterThan(0);

    await page.keyboard.press('Escape');
  });

  test('pagination works', async ({ analysisPage }) => {
    const page = analysisPage;

    await page.locator('button', { hasText: 'Search' }).click();
    const modal = page.locator('.fixed.inset-0.z-50');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Search all entries
    await modal.locator('button', { hasText: /^Search$/ }).click();
    await page.waitForTimeout(2000);

    // Check for Next button
    const nextBtn = modal.locator('button', { hasText: 'Next' }).first();
    if (await nextBtn.isEnabled({ timeout: 3000 }).catch(() => false)) {
      await nextBtn.click();
      await page.waitForTimeout(1000);

      // Page indicator should show page 2
      await expect(modal.locator('text=/Page 2/')).toBeVisible({ timeout: 5000 });

      // Prev button should now be enabled
      const prevBtn = modal.locator('button', { hasText: 'Prev' }).first();
      await expect(prevBtn).toBeEnabled();
    }

    await page.keyboard.press('Escape');
  });
});
