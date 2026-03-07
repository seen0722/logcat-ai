import { test, expect } from '../fixtures/analysis.fixture.js';

test.describe('Section Navigation', () => {
  test('nav is visible at xl viewport', async ({ analysisPage }) => {
    const page = analysisPage;

    // Config sets viewport to 1440×900 which is >= xl (1280px)
    // Desktop side nav is visible at xl+
    const nav = page.locator('nav.fixed.right-4');
    await expect(nav).toBeVisible({ timeout: 5000 });
  });

  test('clicking nav item scrolls to section', async ({ analysisPage }) => {
    const page = analysisPage;

    // First scroll to top to establish baseline
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(300);

    // Expand nav if collapsed
    const expandBtn = page.locator('nav.fixed button[title="Expand navigation"]');
    if (await expandBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await expandBtn.click();
      await page.waitForTimeout(300);
    }

    // Click on "Insights" nav link
    const insightsLink = page.locator('nav.fixed button[title="Insights"]');
    if (await insightsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await insightsLink.click();
      await page.waitForTimeout(800);

      // Insights section should be near the top of viewport
      const insightsSection = page.locator('#section-insights');
      const box = await insightsSection.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        // Section top should be within upper portion of viewport (allow some header offset)
        expect(box.y).toBeLessThan(350);
      }
    }

    // Click on "Timeline" nav link
    const timelineLink = page.locator('nav.fixed button[title="Timeline"]');
    if (await timelineLink.isVisible({ timeout: 2000 }).catch(() => false)) {
      await timelineLink.click();
      await page.waitForTimeout(800);

      const timelineSection = page.locator('#section-timeline');
      const box = await timelineSection.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.y).toBeLessThan(350);
      }
    }
  });
});
