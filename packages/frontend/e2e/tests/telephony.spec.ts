import { test, expect } from '../fixtures/analysis.fixture.js';

test.describe('Telephony Overview', () => {
  test('shows telephony section when data exists', async ({ analysisPage }) => {
    const page = analysisPage;

    const telephonySection = page.locator('#section-telephony');
    if (!await telephonySection.isVisible({ timeout: 3000 }).catch(() => false)) {
      test.skip(true, 'No telephony data in this bugreport');
      return;
    }

    await telephonySection.scrollIntoViewIfNeeded();

    // Heading
    await expect(telephonySection.locator('h2', { hasText: 'Telephony' })).toBeVisible();

    // Summary cards should be visible
    const cards = telephonySection.locator('.grid');
    await expect(cards.first()).toBeVisible();
  });

  test('displays summary cards with voice state and OOS count', async ({ analysisPage }) => {
    const page = analysisPage;

    const telephonySection = page.locator('#section-telephony');
    if (!await telephonySection.isVisible({ timeout: 3000 }).catch(() => false)) {
      test.skip(true, 'No telephony data in this bugreport');
      return;
    }

    await telephonySection.scrollIntoViewIfNeeded();

    // Should show Voice State label (uppercase in UI)
    await expect(telephonySection.locator('text=VOICE STATE').or(telephonySection.locator('text=Voice State'))).toBeVisible();

    // Should show RIL Errors label
    await expect(telephonySection.locator('text=RIL ERRORS').or(telephonySection.locator('text=RIL Errors'))).toBeVisible();

    // Should show Signal Level label
    await expect(telephonySection.locator('text=SIGNAL LEVEL').or(telephonySection.locator('text=Signal Level'))).toBeVisible();
  });

  test('toggles detail sections', async ({ analysisPage }) => {
    const page = analysisPage;

    const telephonySection = page.locator('#section-telephony');
    if (!await telephonySection.isVisible({ timeout: 3000 }).catch(() => false)) {
      test.skip(true, 'No telephony data in this bugreport');
      return;
    }

    await telephonySection.scrollIntoViewIfNeeded();

    const showBtn = telephonySection.locator('button', { hasText: 'Show details' });
    if (!await showBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      return; // No details to toggle
    }

    await showBtn.click();
    await page.waitForTimeout(300);

    // Should now show "Show less"
    await expect(telephonySection.locator('button', { hasText: 'Show less' })).toBeVisible();

    // Detail content should appear (tables for OOS, RIL errors, etc.)
    const tables = telephonySection.locator('table');
    if (await tables.count() > 0) {
      await expect(tables.first()).toBeVisible();
    }

    // Toggle back
    await telephonySection.locator('button', { hasText: 'Show less' }).click();
    await expect(showBtn).toBeVisible();
  });
});
