#!/usr/bin/env node

/**
 * E2E Screenshot Test for Logcat AI Frontend
 *
 * Automatically starts backend + frontend dev servers, uploads a sample bugreport,
 * waits for analysis to complete, takes scrolling screenshots of the result page,
 * validates key sections exist, and cleans up server processes.
 *
 * Usage:
 *   node e2e/screenshot-test.mjs [--bugreport <path>] [--headed] [--no-cleanup]
 *
 * Options:
 *   --bugreport <path>  Path to bugreport zip (default: Keypad sample)
 *   --headed            Run browser in headed mode (visible)
 *   --no-cleanup        Don't kill servers on exit (for debugging)
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '../../..');
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

const BACKEND_PORT = 8000;
const FRONTEND_PORT = 3000;
const BACKEND_URL = `http://localhost:${BACKEND_PORT}`;
const FRONTEND_URL = `http://localhost:${FRONTEND_PORT}`;

const DEFAULT_BUGREPORT = path.join(
  PROJECT_ROOT,
  'sample-bugreports',
  'bugreport-T70-AQ3A.250408.001-2026-01-27-15-33-02_Keypad_stopped_working.zip'
);

// Parse CLI args
const args = process.argv.slice(2);
const headed = args.includes('--headed');
const noCleanup = args.includes('--no-cleanup');
const bugreportIdx = args.indexOf('--bugreport');
const bugreportPath = bugreportIdx !== -1 ? args[bugreportIdx + 1] : DEFAULT_BUGREPORT;

// Key sections to validate on the result page
const REQUIRED_SECTIONS = [
  'System Overview',
  'Insights',
  'Timeline',
];

// Additional sections that are expected but not strictly required
const OPTIONAL_SECTIONS = [
  'Health Score',       // Part of System Overview card
  'Ask Follow-up',     // Chat panel heading or placeholder
  'Power Overview',    // Only if power data present
  'Deep Analysis',     // Only if LLM ran
];

const childProcesses = [];
const results = { passed: [], failed: [], warnings: [] };

function log(msg) {
  const timestamp = new Date().toISOString().slice(11, 23);
  console.log(`[${timestamp}] ${msg}`);
}

function logPass(msg) {
  results.passed.push(msg);
  log(`  PASS  ${msg}`);
}

function logFail(msg) {
  results.failed.push(msg);
  log(`  FAIL  ${msg}`);
}

function logWarn(msg) {
  results.warnings.push(msg);
  log(`  WARN  ${msg}`);
}

/**
 * Start a dev server as a child process
 */
function startServer(name, command, args, cwd, env = {}) {
  return new Promise((resolve) => {
    log(`Starting ${name}...`);
    const proc = spawn(command, args, {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: false,
    });

    childProcesses.push({ name, proc });

    let output = '';
    proc.stdout.on('data', (data) => {
      output += data.toString();
    });
    proc.stderr.on('data', (data) => {
      output += data.toString();
    });
    proc.on('error', (err) => {
      log(`${name} failed to start: ${err.message}`);
    });

    // Don't wait for output, just resolve immediately - we'll poll for readiness
    resolve(proc);
  });
}

/**
 * Poll a URL until it responds (or timeout)
 */
async function waitForServer(name, url, timeoutMs = 60000) {
  const start = Date.now();
  const interval = 1000;
  log(`Waiting for ${name} at ${url}...`);

  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok || res.status < 500) {
        log(`${name} is ready (${Date.now() - start}ms)`);
        return true;
      }
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, interval));
  }

  throw new Error(`${name} did not become ready within ${timeoutMs}ms`);
}

/**
 * Kill all child processes
 */
function cleanup() {
  if (noCleanup) {
    log('Skipping cleanup (--no-cleanup)');
    return;
  }

  for (const { name, proc } of childProcesses) {
    if (!proc.killed) {
      log(`Stopping ${name} (pid ${proc.pid})...`);
      try {
        // Kill the process group to ensure child processes are also terminated
        process.kill(-proc.pid, 'SIGTERM');
      } catch {
        try {
          proc.kill('SIGTERM');
        } catch {
          // Already dead
        }
      }
    }
  }
}

/**
 * Take a full-page scrolling screenshot by capturing viewport-sized chunks
 */
async function takeScrollingScreenshots(page, prefix) {
  const screenshots = [];
  const viewportHeight = page.viewportSize().height;

  // Get total page height
  const totalHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  const chunks = Math.ceil(totalHeight / viewportHeight);

  log(`Page height: ${totalHeight}px, taking ${chunks} viewport screenshots...`);

  for (let i = 0; i < chunks; i++) {
    const scrollY = i * viewportHeight;
    await page.evaluate((y) => window.scrollTo(0, y), scrollY);
    // Brief wait for any lazy rendering
    await page.waitForTimeout(300);

    const filename = `${prefix}_part${i + 1}.png`;
    const filepath = path.join(SCREENSHOT_DIR, filename);
    await page.screenshot({ path: filepath });
    screenshots.push(filepath);
  }

  return screenshots;
}

/**
 * Main test flow
 */
async function main() {
  log('=== Logcat AI E2E Screenshot Test ===');
  log(`Bugreport: ${path.basename(bugreportPath)}`);
  log(`Headed: ${headed}, No-cleanup: ${noCleanup}`);

  // Validate bugreport exists
  if (!existsSync(bugreportPath)) {
    logFail(`Bugreport not found: ${bugreportPath}`);
    process.exit(1);
  }

  // Ensure screenshot directory exists
  mkdirSync(SCREENSHOT_DIR, { recursive: true });

  // Check if servers are already running
  let backendAlreadyRunning = false;
  let frontendAlreadyRunning = false;

  try {
    const res = await fetch(`${BACKEND_URL}/api/settings`, { signal: AbortSignal.timeout(1000) });
    if (res.ok || res.status < 500) backendAlreadyRunning = true;
  } catch { /* not running */ }

  try {
    const res = await fetch(FRONTEND_URL, { signal: AbortSignal.timeout(1000) });
    if (res.ok) frontendAlreadyRunning = true;
  } catch { /* not running */ }

  // Start servers if needed
  if (!backendAlreadyRunning) {
    const backendProc = await startServer(
      'backend',
      'npx', ['tsx', 'watch', 'src/server.ts'],
      path.join(PROJECT_ROOT, 'packages/backend'),
      { NODE_OPTIONS: '--max-old-space-size=4096' }
    );
    // Use process group for cleanup
    try { process.kill(-backendProc.pid, 0); } catch { /* ok */ }
  } else {
    log('Backend already running, skipping start');
  }

  if (!frontendAlreadyRunning) {
    await startServer(
      'frontend',
      'npx', ['vite', '--port', String(FRONTEND_PORT)],
      path.join(PROJECT_ROOT, 'packages/frontend')
    );
  } else {
    log('Frontend already running, skipping start');
  }

  // Wait for servers to be ready
  if (!backendAlreadyRunning) {
    await waitForServer('backend', `${BACKEND_URL}/api/settings`, 90000);
  }
  if (!frontendAlreadyRunning) {
    await waitForServer('frontend', FRONTEND_URL, 60000);
  }

  logPass('Servers are ready');

  // Launch browser
  log('Launching browser...');
  const browser = await chromium.launch({ headless: !headed });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  try {
    // === Step 1: Screenshot upload page ===
    log('Navigating to upload page...');
    await page.goto(FRONTEND_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);

    const uploadScreenshot = path.join(SCREENSHOT_DIR, '01_upload_page.png');
    await page.screenshot({ path: uploadScreenshot });
    logPass(`Upload page screenshot: ${path.basename(uploadScreenshot)}`);

    // Validate upload page has key elements
    const title = await page.textContent('h1');
    if (title && title.includes('Logcat AI')) {
      logPass('Upload page title found: "Logcat AI"');
    } else {
      logFail(`Upload page title unexpected: "${title}"`);
    }

    // === Step 2: Upload bugreport ===
    log('Uploading bugreport...');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(bugreportPath);
    await page.waitForTimeout(500);

    // Screenshot after file selection
    const fileSelectedScreenshot = path.join(SCREENSHOT_DIR, '02_file_selected.png');
    await page.screenshot({ path: fileSelectedScreenshot });
    logPass(`File selected screenshot: ${path.basename(fileSelectedScreenshot)}`);

    // Select Quick Analysis mode and click Analyze
    const quickAnalysisBtn = page.locator('button', { hasText: 'Quick Analysis' });
    if (await quickAnalysisBtn.isVisible()) {
      await quickAnalysisBtn.click();
      log('Selected Quick Analysis mode');
    }

    const analyzeBtn = page.locator('button', { hasText: /^Analyze/ });
    await analyzeBtn.click();
    log('Clicked Analyze button');

    // === Step 3: Wait for analysis to complete ===
    log('Waiting for analysis to complete (up to 120s)...');

    // Screenshot during analysis progress
    await page.waitForTimeout(2000);
    const progressScreenshot = path.join(SCREENSHOT_DIR, '03_analysis_progress.png');
    await page.screenshot({ path: progressScreenshot });
    logPass(`Analysis progress screenshot: ${path.basename(progressScreenshot)}`);

    // Wait for "System Overview" to appear (means result page loaded)
    await page.waitForFunction(
      () => {
        const headings = document.querySelectorAll('h2, h3');
        return Array.from(headings).some((h) => h.textContent?.includes('System Overview'));
      },
      { timeout: 120000 }
    );

    logPass('Analysis completed - result page loaded');

    // Brief wait for all sections to render
    await page.waitForTimeout(1000);

    // === Step 4: Take result page screenshots ===
    log('Taking result page screenshots...');

    // Full page screenshot (Playwright built-in)
    const fullPageScreenshot = path.join(SCREENSHOT_DIR, '04_result_full_page.png');
    await page.screenshot({ path: fullPageScreenshot, fullPage: true });
    logPass(`Full page screenshot: ${path.basename(fullPageScreenshot)}`);

    // Scrolling viewport screenshots
    const scrollScreenshots = await takeScrollingScreenshots(page, '05_result_scroll');
    logPass(`Scrolling screenshots: ${scrollScreenshots.length} parts`);

    // === Step 5: Validate required sections ===
    log('Validating page sections...');
    const pageText = await page.textContent('body');

    for (const section of REQUIRED_SECTIONS) {
      if (pageText && pageText.includes(section)) {
        logPass(`Required section found: "${section}"`);
      } else {
        logFail(`Required section missing: "${section}"`);
      }
    }

    for (const section of OPTIONAL_SECTIONS) {
      if (pageText && pageText.includes(section)) {
        logPass(`Optional section found: "${section}"`);
      } else {
        logWarn(`Optional section not found: "${section}" (may be expected)`);
      }
    }

    // === Step 6: Validate health scores are rendered ===
    const healthLabels = ['Stability', 'Memory', 'Response', 'Kernel'];
    for (const label of healthLabels) {
      if (pageText && pageText.includes(label)) {
        logPass(`Health dimension found: "${label}"`);
      } else {
        logFail(`Health dimension missing: "${label}"`);
      }
    }

    // === Step 7: Screenshot specific sections by scrolling to them ===
    const sectionScreenshots = [
      { name: 'System Overview', filename: '06_system_overview.png' },
      { name: 'Insights', filename: '07_insights.png' },
      { name: 'Timeline', filename: '08_timeline.png' },
    ];

    for (const { name, filename } of sectionScreenshots) {
      const heading = page.locator('h2, h3', { hasText: name }).first();
      if (await heading.isVisible()) {
        await heading.scrollIntoViewIfNeeded();
        await page.waitForTimeout(300);
        const sectionPath = path.join(SCREENSHOT_DIR, filename);
        await page.screenshot({ path: sectionPath });
        logPass(`Section screenshot: ${filename}`);
      } else {
        logWarn(`Could not find heading for section: "${name}"`);
      }
    }

  } finally {
    // Always close browser
    await browser.close();
    log('Browser closed');
  }

  // === Print Report ===
  console.log('\n' + '='.repeat(60));
  console.log('  E2E Screenshot Test Report');
  console.log('='.repeat(60));
  console.log(`  Passed:   ${results.passed.length}`);
  console.log(`  Failed:   ${results.failed.length}`);
  console.log(`  Warnings: ${results.warnings.length}`);
  console.log(`  Screenshots: ${SCREENSHOT_DIR}`);
  console.log('='.repeat(60));

  if (results.failed.length > 0) {
    console.log('\nFailed checks:');
    for (const f of results.failed) {
      console.log(`  - ${f}`);
    }
  }

  if (results.warnings.length > 0) {
    console.log('\nWarnings:');
    for (const w of results.warnings) {
      console.log(`  - ${w}`);
    }
  }

  console.log('');

  // Cleanup
  cleanup();

  // Exit with appropriate code
  if (results.failed.length > 0) {
    log('TEST FAILED');
    process.exit(1);
  } else {
    log('TEST PASSED');
    process.exit(0);
  }
}

// Handle signals for cleanup
process.on('SIGINT', () => {
  log('Interrupted, cleaning up...');
  cleanup();
  process.exit(130);
});

process.on('SIGTERM', () => {
  cleanup();
  process.exit(143);
});

process.on('uncaughtException', (err) => {
  log(`Uncaught error: ${err.message}`);
  cleanup();
  process.exit(1);
});

main().catch((err) => {
  log(`Fatal error: ${err.message}`);
  cleanup();
  process.exit(1);
});
