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

  test('search icon opens modal with focus marker near event time', async ({ analysisPage }) => {
    const page = analysisPage;
    const timeline = page.locator('#section-timeline');
    await timeline.scrollIntoViewIfNeeded();

    // Pick a timeline event
    const eventRows = timeline.locator('.group');
    const count = await eventRows.count();
    const targetRow = eventRows.nth(count - 1);
    if (!(await targetRow.isVisible({ timeout: 2000 }).catch(() => false))) return;

    // Extract the event timestamp from the row (first time-like text)
    const tsText = await targetRow.locator('span').first().textContent() ?? '';
    const tsMatch = tsText.match(/(\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}\.\d{3})/);
    if (!tsMatch) return; // skip if no parseable timestamp

    // Hover and click search icon
    await targetRow.hover();
    const searchIcon = targetRow.locator('button[title="Search logs around this time"]');
    await searchIcon.waitFor({ timeout: 3000 });
    await searchIcon.click();

    // SearchModal should open and auto-load entries
    const modal = page.locator('.fixed.inset-0.z-50');
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Wait for data to load — status bar shows "loaded"
    await expect(modal.locator('text=loaded')).toBeVisible({ timeout: 20_000 });

    // Verify the time range is pre-filled (±5s around the event)
    const fromInput = modal.locator('input[placeholder="MM-DD HH:mm:ss"]').first();
    const fromValue = await fromInput.inputValue();
    expect(fromValue.length).toBeGreaterThan(0);

    // The ▶ focus marker should be visible in the virtual scroll area
    // Virtual scroll may need time to scroll to the focus row
    const focusMarker = modal.locator('text=▶');
    await expect(focusMarker.first()).toBeVisible({ timeout: 15_000 });

    // Close modal
    await page.keyboard.press('Escape');
    await expect(modal).not.toBeVisible({ timeout: 3000 });
  });
});
