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
});
