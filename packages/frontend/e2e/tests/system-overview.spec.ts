import { test, expect } from '../fixtures/analysis.fixture.js';

test.describe('System Overview', () => {
  test('displays device metadata', async ({ analysisPage }) => {
    const overview = analysisPage.locator('#section-overview');

    // Check that key metadata labels are present
    for (const label of ['Device', 'Android', 'Build']) {
      await expect(overview.locator(`text=${label}`).first()).toBeVisible();
    }
  });

  test('HW & SW details toggle works', async ({ analysisPage }) => {
    const overview = analysisPage.locator('#section-overview');

    const showBtn = overview.locator('button', { hasText: /Show HW & SW details/ });
    // If there are HW/SW details to show
    if (await showBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await showBtn.click();

      // Should now show "Hide HW & SW details"
      await expect(overview.locator('button', { hasText: /Hide HW & SW details/ })).toBeVisible();

      // Some detail labels should appear
      const detailLabels = ['Platform', 'Hardware', 'Kernel'];
      let found = 0;
      for (const label of detailLabels) {
        if (await overview.locator(`text=${label}`).first().isVisible({ timeout: 1000 }).catch(() => false)) {
          found++;
        }
      }
      expect(found).toBeGreaterThan(0);

      // Toggle back
      await overview.locator('button', { hasText: /Hide HW & SW details/ }).click();
      await expect(showBtn).toBeVisible();
    }
  });

  test('health score overall ring is present', async ({ analysisPage }) => {
    const overview = analysisPage.locator('#section-overview');
    await expect(overview.locator('text=Overall')).toBeVisible();
  });
});
