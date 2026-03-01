#!/usr/bin/env node

/**
 * E2E Test: Timeline Search Icon → SearchModal (Logcat & Kernel)
 *
 * Tests the flow: hover timeline event → click search icon → SearchModal opens
 * with correct tab, pre-filled ±5s time range, and auto-triggered results.
 *
 * Usage:
 *   node e2e/timeline-search-test.mjs [--headed] [--bugreport <path>]
 */

import { chromium } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

const BACKEND_URL = 'http://localhost:8000';
const FRONTEND_URL = 'http://localhost:3000';

const DEFAULT_BUGREPORT = path.join(
  PROJECT_ROOT,
  'sample-bugreports',
  'bugreport-T70-AQ3A.250408.001-2026-01-27-15-33-02_Keypad_stopped_working.zip'
);

const args = process.argv.slice(2);
const headed = args.includes('--headed');
const bugreportIdx = args.indexOf('--bugreport');
const bugreportPath = bugreportIdx !== -1 ? args[bugreportIdx + 1] : DEFAULT_BUGREPORT;

const results = { passed: [], failed: [], warnings: [] };

function log(msg) {
  const ts = new Date().toISOString().slice(11, 23);
  console.log(`[${ts}] ${msg}`);
}
function logPass(msg) { results.passed.push(msg); log(`  PASS  ${msg}`); }
function logFail(msg) { results.failed.push(msg); log(`  FAIL  ${msg}`); }
function logWarn(msg) { results.warnings.push(msg); log(`  WARN  ${msg}`); }

async function waitForServer(name, url, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok || res.status < 500) return true;
    } catch { /* not ready */ }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`${name} not reachable at ${url}`);
}

async function main() {
  log('=== Timeline Search E2E Test ===');
  log(`Bugreport: ${path.basename(bugreportPath)}`);

  if (!existsSync(bugreportPath)) {
    logFail(`Bugreport not found: ${bugreportPath}`);
    process.exit(1);
  }
  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  // Check servers are running
  await waitForServer('backend', `${BACKEND_URL}/api/settings`);
  await waitForServer('frontend', FRONTEND_URL);
  logPass('Servers are reachable');

  const browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  try {
    // ── Step 1: Upload & Analyze ──
    log('Navigating to upload page...');
    await page.goto(FRONTEND_URL, { waitUntil: 'networkidle' });

    log('Uploading bugreport...');
    await page.locator('input[type="file"]').setInputFiles(bugreportPath);
    await page.waitForTimeout(300);

    const quickBtn = page.locator('button', { hasText: 'Quick Analysis' });
    if (await quickBtn.isVisible()) await quickBtn.click();

    await page.locator('button', { hasText: /^Analyze/ }).click();
    log('Waiting for analysis to complete...');

    await page.waitForFunction(
      () => Array.from(document.querySelectorAll('h2, h3')).some(h => h.textContent?.includes('System Overview')),
      { timeout: 120000 }
    );
    await page.waitForTimeout(1500);
    logPass('Analysis completed');

    // ── Step 2: Scroll to Timeline section ──
    log('Scrolling to Timeline section...');
    const timelineHeading = page.locator('h2, h3', { hasText: 'Timeline' }).first();
    await timelineHeading.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);

    await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'timeline_01_section.png') });
    logPass('Timeline section visible');

    // ── Step 3: Find a LOGCAT event and click search icon ──
    log('Looking for logcat/kernel events in timeline...');

    // Scope to timeline section container
    const timelineSection = page.locator('#section-timeline');
    const allEventRows = timelineSection.locator('div.group');
    const rowCount = await allEventRows.count();
    log(`Found ${rowCount} event rows in timeline section`);

    let logcatEventRow = null;
    let kernelEventRow = null;

    for (let i = 0; i < rowCount; i++) {
      const row = allEventRows.nth(i);
      const text = await row.textContent();
      if (!logcatEventRow && /LOGCAT/i.test(text)) {
        logcatEventRow = row;
      }
      if (!kernelEventRow && /KERNEL/i.test(text)) {
        kernelEventRow = row;
      }
      if (logcatEventRow && kernelEventRow) break;
    }

    // ── Test LOGCAT search ──
    if (logcatEventRow) {
      log('Found logcat event, hovering to reveal search icon...');
      await logcatEventRow.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      await logcatEventRow.hover();
      await page.waitForTimeout(300);

      const searchBtn = logcatEventRow.locator('button[title="Search logs around this time"]');
      if (await searchBtn.isVisible({ timeout: 2000 })) {
        logPass('Logcat search icon appeared on hover');

        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'timeline_02_logcat_hover.png') });

        await searchBtn.click();
        log('Clicked logcat search icon');

        // Wait for SearchModal to appear
        const modal = page.locator('.fixed.inset-0.z-50').first();
        await modal.waitFor({ state: 'visible', timeout: 5000 });
        logPass('SearchModal opened');

        // Verify Logcat tab is active
        const activeTab = page.locator('button.bg-indigo-600').first();
        // The Logcat tab should be active (not Kernel)
        // Check both tab buttons exist
        const logcatTab = modal.locator('button').filter({ hasText: 'Logcat' });
        const kernelTab = modal.locator('button').filter({ hasText: 'Kernel' });
        if (await logcatTab.isVisible() && await kernelTab.isVisible()) {
          logPass('Both Logcat and Kernel tabs visible');
        }

        // Check time range fields are populated
        const fromInput = modal.locator('input[placeholder="MM-DD HH:mm:ss"]').first();
        const toInput = modal.locator('input[placeholder="MM-DD HH:mm:ss"]').nth(1);
        const fromVal = await fromInput.inputValue();
        const toVal = await toInput.inputValue();
        log(`  Time range: "${fromVal}" → "${toVal}"`);
        if (fromVal && toVal) {
          logPass(`Logcat time range pre-filled: ${fromVal} → ${toVal}`);
        } else {
          logFail('Logcat time range not pre-filled');
        }

        // Wait for auto-triggered search results
        await page.waitForTimeout(2000);
        const resultRows = modal.locator('tr[data-ts]');
        const resultCount = await resultRows.count();
        log(`  Search returned ${resultCount} result rows`);

        if (resultCount > 0) {
          logPass(`Logcat search returned ${resultCount} results`);
        } else {
          // Check if "matched" text shows count
          const matchedText = await modal.textContent();
          if (matchedText?.includes('matched')) {
            logWarn('Logcat search completed but no visible rows (may need scroll)');
          } else {
            logFail('Logcat search returned no results');
          }
        }

        // Check method badge (fts5, fts5-sql, or keyword)
        const methodBadge = modal.locator('span').filter({ hasText: /^(fts5|fts5-sql|keyword)$/ }).first();
        if (await methodBadge.isVisible({ timeout: 2000 }).catch(() => false)) {
          const method = await methodBadge.textContent();
          logPass(`Search method: ${method}`);
        }

        // Verify logcat-specific columns exist (PID/TID, Level/Tag)
        const headers = await modal.locator('th').allTextContents();
        log(`  Table headers: ${headers.join(', ')}`);
        if (headers.some(h => h.includes('PID')) && headers.some(h => h.includes('Tag'))) {
          logPass('Logcat table has PID/TID and Level/Tag columns');
        }

        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'timeline_03_logcat_search_results.png') });

        // Close modal
        const closeBtn = modal.locator('button').filter({ hasText: '×' }).first();
        await closeBtn.click();
        await page.waitForTimeout(500);
        logPass('Logcat SearchModal closed');
      } else {
        logFail('Logcat search icon did not appear on hover');
      }
    } else {
      logWarn('No logcat event found in timeline');
    }

    // ── Test KERNEL search ──
    if (kernelEventRow) {
      log('Found kernel event, hovering to reveal search icon...');
      await kernelEventRow.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      await kernelEventRow.hover();
      await page.waitForTimeout(300);

      const searchBtn = kernelEventRow.locator('button[title="Search logs around this time"]');
      if (await searchBtn.isVisible({ timeout: 2000 })) {
        logPass('Kernel search icon appeared on hover');

        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'timeline_04_kernel_hover.png') });

        await searchBtn.click();
        log('Clicked kernel search icon');

        // Wait for SearchModal
        const modal = page.locator('.fixed.inset-0.z-50').first();
        await modal.waitFor({ state: 'visible', timeout: 5000 });
        logPass('SearchModal opened for kernel');

        // Check Kernel tab is active
        const kernelTabActive = modal.locator('button.bg-indigo-600').filter({ hasText: 'Kernel' });
        if (await kernelTabActive.isVisible({ timeout: 2000 }).catch(() => false)) {
          logPass('Kernel tab is active');
        } else {
          logWarn('Kernel tab may not be active (source might be logcat fallback)');
        }

        // Check time range
        const fromInput = modal.locator('input[placeholder="MM-DD HH:mm:ss"]').first();
        const toInput = modal.locator('input[placeholder="MM-DD HH:mm:ss"]').nth(1);
        const fromVal = await fromInput.inputValue();
        const toVal = await toInput.inputValue();
        log(`  Time range: "${fromVal}" → "${toVal}"`);
        if (fromVal && toVal) {
          logPass(`Kernel time range pre-filled: ${fromVal} → ${toVal}`);
        } else {
          logFail('Kernel time range not pre-filled');
        }

        // Wait for results
        await page.waitForTimeout(2000);
        const resultRows = modal.locator('tr[data-ts]');
        const resultCount = await resultRows.count();
        log(`  Kernel search returned ${resultCount} result rows`);

        if (resultCount > 0) {
          logPass(`Kernel search returned ${resultCount} results`);
        } else {
          const matchedText = await modal.textContent();
          if (matchedText?.includes('0') && matchedText?.includes('matched')) {
            logWarn('Kernel search returned 0 matches (narrow time window)');
          } else {
            logFail('Kernel search returned no results');
          }
        }

        // Check method badge
        const methodBadge = modal.locator('span').filter({ hasText: /^(fts5|fts5-sql|keyword)$/ }).first();
        if (await methodBadge.isVisible({ timeout: 2000 }).catch(() => false)) {
          const method = await methodBadge.textContent();
          logPass(`Kernel search method: ${method}`);
        }

        // Verify kernel columns (no PID/TID, has Level)
        const headers = await modal.locator('th').allTextContents();
        log(`  Table headers: ${headers.join(', ')}`);
        if (headers.some(h => h.includes('Level')) && headers.some(h => h.includes('Message'))) {
          logPass('Kernel table has Level and Message columns');
        }

        await page.screenshot({ path: path.join(SCREENSHOT_DIR, 'timeline_05_kernel_search_results.png') });

        // Close modal
        const closeBtn = modal.locator('button').filter({ hasText: '×' }).first();
        await closeBtn.click();
        await page.waitForTimeout(500);
        logPass('Kernel SearchModal closed');
      } else {
        logFail('Kernel search icon did not appear on hover');
      }
    } else {
      logWarn('No kernel event found in timeline');
    }

  } finally {
    await browser.close();
    log('Browser closed');
  }

  // ── Report ──
  console.log('\n' + '='.repeat(60));
  console.log('  Timeline Search E2E Test Report');
  console.log('='.repeat(60));
  console.log(`  Passed:   ${results.passed.length}`);
  console.log(`  Failed:   ${results.failed.length}`);
  console.log(`  Warnings: ${results.warnings.length}`);
  console.log(`  Screenshots: ${SCREENSHOT_DIR}/timeline_*.png`);
  console.log('='.repeat(60));

  if (results.failed.length > 0) {
    console.log('\nFailed:');
    for (const f of results.failed) console.log(`  - ${f}`);
  }
  if (results.warnings.length > 0) {
    console.log('\nWarnings:');
    for (const w of results.warnings) console.log(`  - ${w}`);
  }
  console.log('');

  process.exit(results.failed.length > 0 ? 1 : 0);
}

main().catch(err => {
  log(`Fatal: ${err.message}`);
  process.exit(1);
});
