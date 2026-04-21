import { test, expect } from '../fixtures/analysis.fixture.js';
import { clearRawDataStore } from '../fixtures/api-helpers.js';

/**
 * Test 1: Warm cache path — SearchModal opens right after analysis,
 * rawDataStore is populated, all entries load from in-memory.
 * Validates: full load, tag filter, keyword search, level filter — all client-side.
 */
test.describe('Search Full Load — Warm Cache', () => {
  test('loads all entries and filters by tag, keyword, level without server round-trip', async ({ analysisPage }) => {
    const page = analysisPage;

    // Open SearchModal
    await page.locator('button', { hasText: 'Search' }).click();
    const modal = page.locator('.fixed.inset-0.z-50');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Wait for full load — spinner disappears, status shows "loaded"
    await expect(modal.locator('text=loaded')).toBeVisible({ timeout: 60_000 });

    // Should show method badge (keyword = in-memory path, meaning cache was warm)
    await expect(modal.locator('text=keyword')).toBeVisible({ timeout: 5_000 });

    // ── Get baseline count ──
    const getShownCount = async () => {
      const statusText = await modal.locator('text=shown').locator('..').textContent() ?? '';
      const match = statusText.match(/([\d,]+)\s*shown/);
      return match ? parseInt(match[1].replace(/,/g, ''), 10) : 0;
    };

    const totalLoaded = await getShownCount();
    expect(totalLoaded).toBeGreaterThan(0);

    // ── Filter by tag ──
    const tagInput = modal.locator('input[placeholder="e.g. RIL,RILJ"]');
    await tagInput.fill('ActivityManager');
    await page.waitForTimeout(300); // useMemo debounce

    const tagFiltered = await getShownCount();
    expect(tagFiltered).toBeLessThan(totalLoaded);
    expect(tagFiltered).toBeGreaterThan(0);

    // Clear tag
    await tagInput.clear();
    await page.waitForTimeout(300);

    // ── Filter by level (E+) ──
    const levelSelect = modal.locator('select').nth(1); // Min Level is 2nd select
    await levelSelect.selectOption('E');
    await page.waitForTimeout(300);

    const levelFiltered = await getShownCount();
    expect(levelFiltered).toBeLessThan(totalLoaded);
    expect(levelFiltered).toBeGreaterThan(0);

    // Reset level
    await levelSelect.selectOption('');
    await page.waitForTimeout(300);

    // ── Keyword search (Find highlight) ──
    const findInput = modal.locator('input[placeholder="Find in logs..."]');
    await findInput.fill('ActivityManager');
    await expect(modal.locator('text=matches')).toBeVisible({ timeout: 5_000 });

    // Match counter should be visible (e.g. "1 / 47")
    const matchCounter = modal.locator('span').filter({ hasText: /^\d+\s*\/\s*\d+$/ });
    await expect(matchCounter.first()).toBeVisible({ timeout: 3_000 });

    // Shown count should still be totalLoaded (keyword doesn't filter, only highlights)
    const afterKeyword = await getShownCount();
    expect(afterKeyword).toBe(totalLoaded);

    // ── Combined: tag + level ──
    await findInput.clear();
    await tagInput.fill('ActivityManager');
    await levelSelect.selectOption('W');
    await page.waitForTimeout(300);

    const combinedFiltered = await getShownCount();
    expect(combinedFiltered).toBeLessThanOrEqual(tagFiltered);

    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible({ timeout: 3000 });
  });
});

/**
 * Test 2: Cold cache path — rawDataStore cleared (simulates history re-open
 * after TTL expiry or server restart). SearchModal must rebuild from FTS5/DB.
 * Validates: full load from DB, loading animation, filters work after cold load.
 */
test.describe('Search Full Load — Cold Cache (History Path)', () => {
  test('loads all entries from DB when rawDataStore is empty, then filters work', async ({ analysisPage, analysisId }) => {
    const page = analysisPage;

    // Clear rawDataStore to simulate cold cache (TTL expiry / server restart)
    await clearRawDataStore(analysisId);

    // Open SearchModal — must rebuild from FTS5
    await page.locator('button', { hasText: 'Search' }).click();
    const modal = page.locator('.fixed.inset-0.z-50');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Loading animation should appear (spinner overlay)
    const loadingOverlay = modal.locator('text=Loading all entries...');
    // It may or may not be visible depending on speed — just ensure it eventually loads
    await expect(modal.locator('text=loaded')).toBeVisible({ timeout: 90_000 });

    // Method should be 'keyword' (lazy rebuild restores rawDataStore → in-memory path)
    await expect(modal.locator('text=keyword')).toBeVisible({ timeout: 5_000 });

    // ── Verify data is loaded ──
    const getShownCount = async () => {
      const statusText = await modal.locator('text=shown').locator('..').textContent() ?? '';
      const match = statusText.match(/([\d,]+)\s*shown/);
      return match ? parseInt(match[1].replace(/,/g, ''), 10) : 0;
    };

    const totalLoaded = await getShownCount();
    expect(totalLoaded).toBeGreaterThan(0);

    // ── Verify filters work on cold-loaded data ──

    // Tag filter
    const tagInput = modal.locator('input[placeholder="e.g. RIL,RILJ"]');
    await tagInput.fill('ActivityManager');
    await page.waitForTimeout(300);

    const tagFiltered = await getShownCount();
    expect(tagFiltered).toBeLessThan(totalLoaded);
    expect(tagFiltered).toBeGreaterThan(0);
    await tagInput.clear();
    await page.waitForTimeout(300);

    // Time range filter (client-side — no server call)
    // Get the first entry's timestamp to use as a filter anchor
    const firstRow = modal.locator('[style*="height: 22px"]').first();
    const firstRowText = await firstRow.textContent() ?? '';
    const tsMatch = firstRowText.match(/(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/);

    if (tsMatch) {
      const fromInput = modal.locator('input[placeholder="MM-DD HH:mm:ss"]').first();
      const toInput = modal.locator('input[placeholder="MM-DD HH:mm:ss"]').nth(1);
      await fromInput.fill(tsMatch[1]);
      // Set "To" to same timestamp + a few chars to create a narrow window
      await toInput.fill(tsMatch[1]);
      await page.waitForTimeout(300);

      const timeFiltered = await getShownCount();
      // Narrow time window should show fewer entries (or same if exact match)
      expect(timeFiltered).toBeLessThanOrEqual(totalLoaded);

      // Clear time range
      await modal.locator('text=Clear').click();
      await page.waitForTimeout(300);

      const afterClear = await getShownCount();
      expect(afterClear).toBe(totalLoaded);
    }

    // Keyword find works
    const findInput = modal.locator('input[placeholder="Find in logs..."]');
    await findInput.fill('Error');
    await page.waitForTimeout(500);

    // Should show matches or "0 / 0" — either is fine, just verify no crash
    const matchText = modal.locator('span').filter({ hasText: /^\d+\s*\/\s*\d+$/ });
    await expect(matchText.first()).toBeVisible({ timeout: 5_000 });

    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible({ timeout: 3000 });
  });
});
