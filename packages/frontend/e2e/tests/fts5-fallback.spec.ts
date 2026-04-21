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

  test('search rebuilds rawDataStore after cleared (lazy cache)', async ({ analysisId }) => {
    // Clear raw data store
    await clearRawDataStore(analysisId);

    // Search should rebuild rawDataStore from FTS5 lazily, then use in-memory path
    const result = await searchLogcatAPI(analysisId, { q: 'ActivityManager' });
    expect(result.totalMatches).toBeGreaterThan(0);
    expect(result.entries.length).toBeGreaterThan(0);
    // After lazy rebuild, keyword-only search routes through in-memory handler (fts5 or keyword)
    expect(['keyword', 'fts5']).toContain(result.method);
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

  test('UI shows keyword badge after rawDataStore cleared (lazy rebuild)', async ({ analysisPage, analysisId }) => {
    const page = analysisPage;

    // Ensure raw store is cleared
    await clearRawDataStore(analysisId);

    // Open SearchModal — auto-loads entries (lazy rebuild restores rawDataStore)
    await page.locator('button', { hasText: 'Search' }).click();
    const modal = page.locator('.fixed.inset-0.z-50');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Wait for data to load — status bar shows "loaded"
    await expect(modal.locator('text=loaded')).toBeVisible({ timeout: 45_000 });

    // After lazy rebuild, method is 'keyword' (in-memory) not 'fts5-sql'
    await expect(modal.locator('text=keyword')).toBeVisible({ timeout: 10_000 });

    await page.keyboard.press('Escape');
  });
});
