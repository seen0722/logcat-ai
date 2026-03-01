import { test, expect } from '../fixtures/analysis.fixture.js';

test.describe('Upload & Analysis Result', () => {
  test('result page has all required sections', async ({ analysisPage }) => {
    const page = analysisPage;

    // System Overview
    await expect(page.locator('#section-overview')).toBeVisible();
    await expect(page.locator('h2', { hasText: 'System Overview' })).toBeVisible();

    // Insights
    await expect(page.locator('#section-insights')).toBeVisible();
    await expect(page.locator('h2', { hasText: 'Insights' })).toBeVisible();

    // Timeline
    await expect(page.locator('#section-timeline')).toBeVisible();
    await expect(page.locator('h2', { hasText: 'Timeline' })).toBeVisible();
  });

  test('header buttons are present', async ({ analysisPage }) => {
    const page = analysisPage;

    await expect(page.locator('button', { hasText: 'Search' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'History' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Export' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'New Analysis' })).toBeVisible();
  });

  test('health score dimensions are displayed', async ({ analysisPage }) => {
    const page = analysisPage;
    const overview = page.locator('#section-overview');

    for (const dim of ['Stability', 'Memory', 'Response', 'Kernel']) {
      await expect(overview.locator(`text=${dim}`).first()).toBeVisible();
    }
  });

  test('upload page has correct elements', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // May land on landing page first — click through if so
    const startBtn = page.locator('button', { hasText: 'Start Analyzing' });
    if (await startBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await startBtn.click();
      await page.waitForLoadState('networkidle');
    }

    // Title
    await expect(page.locator('h1')).toContainText('Logcat AI');

    // File input
    await expect(page.locator('input[type="file"]')).toBeAttached();

    // Analysis mode buttons
    await expect(page.locator('button', { hasText: 'Quick Analysis' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Deep Analysis' })).toBeVisible();
  });

  test('landing page shows features and navigates to upload', async ({ page }) => {
    // Clear skipLanding to see landing page
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('skipLanding'));
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Hero
    await expect(page.locator('h1')).toContainText('Logcat AI');
    await expect(page.locator('text=AI-powered bugreport.zip analyzer')).toBeVisible();

    // Feature cards
    await expect(page.locator('text=ANR Deep Analysis')).toBeVisible();
    await expect(page.locator('text=Health Score')).toBeVisible();
    await expect(page.locator('text=Full-text Search & AI Chat')).toBeVisible();
    await expect(page.locator('text=Power Management')).toBeVisible();

    // Supported formats
    await expect(page.locator('text=bugreport.zip')).toBeVisible();

    // CTA navigates to upload
    await page.locator('button', { hasText: 'Start Analyzing' }).click();
    await page.waitForLoadState('networkidle');
    await expect(page.locator('input[type="file"]')).toBeAttached();
  });
});
