import { test, expect } from '../fixtures/analysis.fixture.js';

/**
 * The analysisPage fixture navigates to an already-loaded analysis, which
 * means by the time the test starts, the prefetch may have already fired
 * (and its rawDataStore on the backend is warm — second prefetch from a
 * different uploadId won't even fire because of the idempotent guard).
 *
 * To get a deterministic measurement we `page.reload()` inside each test.
 * Reload re-mounts AnalysisProvider with fresh prefetchedEntriesRef, so
 * the AnalysisPage useEffect fires a new prefetch we can observe.
 */
test.describe('SearchModal prefetch', () => {
  test('AnalysisPage triggers a prefetch shortly after settling', async ({ analysisPage }) => {
    const page = analysisPage;

    // Set up listener BEFORE reload so we don't miss the request.
    const prefetchRequestPromise = page.waitForRequest(
      (req) => req.url().includes('/api/search/') && req.url().includes('export=true'),
      { timeout: 10_000 },
    );

    await page.reload();

    const prefetchRequest = await prefetchRequestPromise;
    expect(prefetchRequest).toBeTruthy();
  });

  test('Opening SearchModal after prefetch results in zero additional fetch', async ({ analysisPage }) => {
    const page = analysisPage;

    // Set up the response wait BEFORE reload.
    const prefetchResponsePromise = page.waitForResponse(
      (res) => res.url().includes('/api/search/') && res.url().includes('export=true') && res.status() === 200,
      { timeout: 60_000 },
    );

    await page.reload();

    const prefetchResponse = await prefetchResponsePromise;
    expect(prefetchResponse.ok()).toBe(true);

    // Now count any FURTHER /api/search/ calls.
    let extraSearchCalls = 0;
    page.on('request', (req) => {
      if (req.url().includes('/api/search/') && req.url().includes('export=true')) {
        extraSearchCalls++;
      }
    });

    // Open SearchModal — should hit the in-memory cache.
    await page.locator('button', { hasText: 'Search' }).click();
    const modal = page.locator('.fixed.inset-0.z-50');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Status bar should show entries loaded.
    await expect(modal.locator('text=loaded')).toBeVisible({ timeout: 3000 });

    // Verify no additional fetch happened.
    expect(extraSearchCalls).toBe(0);

    await page.keyboard.press('Escape');
  });
});
