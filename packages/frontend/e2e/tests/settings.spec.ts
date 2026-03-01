import { test, expect } from '../fixtures/analysis.fixture.js';

test.describe('Settings Panel', () => {
  test('opens and shows provider content', async ({ analysisPage }) => {
    const page = analysisPage;

    // Click settings gear button
    const settingsBtn = page.locator('button[title="LLM Settings"]');
    await settingsBtn.click();

    // Settings panel heading should appear
    const panel = page.locator('.fixed.inset-0.z-50');
    await expect(panel.locator('h2', { hasText: 'LLM Settings' })).toBeVisible({ timeout: 5000 });

    // Wait for loading spinner to disappear (providers API can take 1-2s)
    const spinner = panel.locator('.animate-spin');
    await spinner.waitFor({ state: 'hidden', timeout: 15_000 }).catch(() => {});

    // After loading, provider labels should be visible
    const providerLabels = ['Ollama', 'OpenAI', 'Gemini', 'Anthropic'];
    let found = 0;
    for (const label of providerLabels) {
      if (await panel.locator(`text=${label}`).first().isVisible({ timeout: 2000 }).catch(() => false)) {
        found++;
      }
    }
    expect(found).toBeGreaterThan(0);

    // Close with X button
    await panel.locator('button', { hasText: '\u00d7' }).click();
    await expect(panel).not.toBeVisible({ timeout: 3000 });
  });
});
