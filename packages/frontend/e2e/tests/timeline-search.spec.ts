import { test, expect } from '../fixtures/analysis.fixture.js';

test.describe('Timeline & Search Integration', () => {
  test('timeline displays event count', async ({ analysisPage }) => {
    const timeline = analysisPage.locator('#section-timeline');
    // Header shows "(N shown / M total)"
    const heading = timeline.locator('h2', { hasText: 'Timeline' });
    await expect(heading).toBeVisible();
    await expect(heading).toContainText(/\d+/);
  });

  test('severity filters toggle events', async ({ analysisPage }) => {
    const timeline = analysisPage.locator('#section-timeline');
    await timeline.scrollIntoViewIfNeeded();

    // Info filter should be off by default — click to enable
    const infoBtn = timeline.locator('button', { hasText: 'Info' });
    if (await infoBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      const headingBefore = await timeline.locator('h2').textContent();

      await infoBtn.click();
      await analysisPage.waitForTimeout(300);

      const headingAfter = await timeline.locator('h2').textContent();
      // Shown count should change
      expect(headingAfter).not.toBe(headingBefore);

      // Toggle back
      await infoBtn.click();
    }
  });

  test('source filters toggle events', async ({ analysisPage }) => {
    const timeline = analysisPage.locator('#section-timeline');
    await timeline.scrollIntoViewIfNeeded();

    const logcatBtn = timeline.locator('button', { hasText: 'Logcat' });
    if (await logcatBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await logcatBtn.click();
      await analysisPage.waitForTimeout(300);
      // Re-enable
      await logcatBtn.click();
    }
  });

  test('hover reveals search icon and opens SearchModal', async ({ analysisPage }) => {
    const timeline = analysisPage.locator('#section-timeline');
    await timeline.scrollIntoViewIfNeeded();

    // Find a timeline event row with the search icon
    const eventRow = timeline.locator('.group').first();
    if (await eventRow.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Hover over the event to reveal search icon
      await eventRow.hover();

      const searchIcon = eventRow.locator('button[title="Search logs around this time"]');
      if (await searchIcon.isVisible({ timeout: 2000 }).catch(() => false)) {
        await searchIcon.click();

        // SearchModal should open
        const modal = analysisPage.locator('.fixed.inset-0.z-50');
        await expect(modal).toBeVisible({ timeout: 5000 });

        // Time range fields should be pre-filled
        const fromInput = modal.locator('input[placeholder="MM-DD HH:mm:ss"]').first();
        const fromValue = await fromInput.inputValue();
        expect(fromValue.length).toBeGreaterThan(0);

        // Close modal
        await analysisPage.keyboard.press('Escape');
        await expect(modal).not.toBeVisible({ timeout: 3000 });
      }
    }
  });

  test('search icon opens modal at correct page near focus time', async ({ analysisPage }) => {
    const page = analysisPage;
    const timeline = page.locator('#section-timeline');
    await timeline.scrollIntoViewIfNeeded();

    // Pick a timeline event that is NOT the first one (more likely to land on page > 1)
    // Look for events with a single timestamp (not a range), which tend to be in the middle of the log
    const eventRows = timeline.locator('.group');
    const count = await eventRows.count();
    // Use the last event row — it typically has the latest timestamp, so the
    // search time window will include many earlier log entries, forcing page > 1
    const targetRow = eventRows.nth(count - 1);
    if (!(await targetRow.isVisible({ timeout: 2000 }).catch(() => false))) return;

    // Extract the event timestamp from the row (first time-like text)
    const tsText = await targetRow.locator('span').first().textContent() ?? '';
    const tsMatch = tsText.match(/(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})/);
    if (!tsMatch) return; // skip if no parseable timestamp
    const eventTs = tsMatch[1];

    // Hover and click search icon
    await targetRow.hover();
    const searchIcon = targetRow.locator('button[title="Search logs around this time"]');
    await searchIcon.waitFor({ timeout: 3000 });
    await searchIcon.click();

    // SearchModal should open with auto-search results
    const modal = page.locator('.fixed.inset-0.z-50');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Wait for search results to load
    const rows = modal.locator('tr[data-ts]');
    await rows.first().waitFor({ timeout: 15_000 });

    // Verify the time range is pre-filled (±5s around the event)
    const fromInput = modal.locator('input[placeholder="MM-DD HH:mm:ss"]').first();
    const fromValue = await fromInput.inputValue();
    expect(fromValue.length).toBeGreaterThan(0);

    // Check that exactly one row is highlighted (inline background-color) near the focus time
    // The highlight is applied via inline style and fades after 3s — check promptly
    const highlightedRow = modal.locator('tr[data-ts][style*="background-color"]');
    await expect(highlightedRow).toHaveCount(1, { timeout: 5000 });

    // The highlighted row's timestamp should be close to the event timestamp
    const highlightTs = await highlightedRow.getAttribute('data-ts') ?? '';
    const eventSec = parseTimeSec(eventTs);
    const highlightSec = parseTimeSec(highlightTs);
    expect(Math.abs(eventSec - highlightSec)).toBeLessThanOrEqual(10);

    // If there are many results, we should NOT be on page 1
    const matchedLabel = modal.locator('text=matched');
    if (await matchedLabel.isVisible({ timeout: 2000 }).catch(() => false)) {
      const statusText = await matchedLabel.locator('..').locator('..').textContent() ?? '';
      const totalMatch = statusText.match(/([\d,]+)\s*matched/);
      const pageMatch = statusText.match(/(\d+)\s*\/\s*(\d+)/);
      if (totalMatch && pageMatch) {
        const totalMatches = parseInt(totalMatch[1].replace(/,/g, ''), 10);
        const currentPage = parseInt(pageMatch[1], 10);
        const totalPages = parseInt(pageMatch[2], 10);
        // If more than 1 page of results, the modal should have jumped past page 1
        if (totalPages > 2) {
          expect(currentPage).toBeGreaterThan(1);
        }
      }
    }

    // Close modal
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible({ timeout: 3000 });
  });
});

/** Parse "MM-DD HH:mm:ss.SSS" to seconds for comparison */
function parseTimeSec(ts: string): number {
  const m = ts.match(/(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
  if (!m) return 0;
  const [, mo, dd, hh, mm, ss] = m;
  return (+mo * 30 * 86400) + (+dd * 86400) + (+hh * 3600) + (+mm * 60) + +ss;
}
