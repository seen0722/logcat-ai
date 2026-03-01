import { test, expect } from '../fixtures/analysis.fixture.js';
import { searchLogcatAPI, searchKernelAPI, clearRawDataStore } from '../fixtures/api-helpers.js';

test.describe('FTS5 SQL Fallback', () => {
  test('search works with rawDataStore present (keyword-only → fts5)', async ({ analysisId }) => {
    // Keyword-only search should use fts5 when rawDataStore + FTS5 index exist
    const result = await searchLogcatAPI(analysisId, { q: 'ActivityManager' });
    expect(result.totalMatches).toBeGreaterThan(0);
    expect(result.entries.length).toBeGreaterThan(0);
    // fts5 when keyword-only search with raw data available, or keyword for in-memory
    expect(['keyword', 'fts5']).toContain(result.method);
  });

  test('search falls back to fts5-sql after rawDataStore cleared', async ({ analysisId }) => {
    // Clear raw data store
    await clearRawDataStore(analysisId);

    // Search should now use fts5-sql fallback
    const result = await searchLogcatAPI(analysisId, { q: 'ActivityManager' });
    expect(result.totalMatches).toBeGreaterThan(0);
    expect(result.entries.length).toBeGreaterThan(0);
    expect(result.method).toBe('fts5-sql');
  });

  test('kernel search also falls back to fts5-sql', async ({ analysisId }) => {
    // rawDataStore should already be cleared from previous test
    await clearRawDataStore(analysisId);

    const result = await searchKernelAPI(analysisId, { q: 'kernel' });

    // Kernel entries may or may not exist, but the method should be fts5-sql
    if (result.totalMatches > 0) {
      expect(result.method).toBe('fts5-sql');
    }
  });

  test('UI shows fts5-sql badge after rawDataStore cleared', async ({ analysisPage, analysisId }) => {
    const page = analysisPage;

    // Ensure raw store is cleared
    await clearRawDataStore(analysisId);

    // Open SearchModal
    await page.locator('button', { hasText: 'Search' }).click();
    const modal = page.locator('.fixed.inset-0.z-50');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Search for a keyword
    await modal.locator('input[placeholder="Search keyword..."]').fill('ActivityManager');
    await modal.locator('button', { hasText: /^Search$/ }).click();

    // Wait for results to load
    await page.waitForTimeout(3000);

    // Should show results with fts5-sql method badge
    await expect(modal.locator('text=fts5-sql')).toBeVisible({ timeout: 10_000 });

    // Result rows should exist
    const rows = modal.locator('tr[data-ts]');
    expect(await rows.count()).toBeGreaterThan(0);

    await page.keyboard.press('Escape');
  });
});
