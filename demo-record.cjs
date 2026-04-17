'use strict';
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const BASE_URL = process.env.QA_BASE_URL || 'http://localhost:3000';
const VIDEO_DIR = path.join(__dirname, 'screenshots');
const OUTPUT_NAME = 'demo-upload-analysis.webm';
const REHEARSAL = process.argv.includes('--rehearse');
const BUGREPORT_PATH = path.join(__dirname, 'sample-bugreports', 'bugreport-T70-AQ3A.250408.001-2026-01-27-15-33-02_Keypad_stopped_working.zip');

// Timestamp tracking for narration sync
let recordingStartTime = 0;
const narrationMarkers = [];

// Pre-generated audio durations (loaded before recording)
const AUDIO_DIR = path.join(VIDEO_DIR, 'narration-audio');
function getAudioDuration(segmentIndex) {
  const file = path.join(AUDIO_DIR, `segment-${String(segmentIndex).padStart(2, '0')}.mp3`);
  if (!fs.existsSync(file)) return 0;
  try {
    const out = execFileSync('ffprobe', ['-v', 'quiet', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
    return parseFloat(out.trim()) || 0;
  } catch { return 0; }
}
let narrationIndex = 0;

// --- Helper functions ---

async function injectCursor(page) {
  await page.evaluate(() => {
    if (document.getElementById('demo-cursor')) return;
    const cursor = document.createElement('div');
    cursor.id = 'demo-cursor';
    cursor.innerHTML = `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M5 3L19 12L12 13L9 20L5 3Z" fill="white" stroke="black" stroke-width="1.5" stroke-linejoin="round"/>
    </svg>`;
    cursor.style.cssText = `
      position: fixed; z-index: 999999; pointer-events: none;
      width: 24px; height: 24px;
      transition: left 0.15s ease-out, top 0.15s ease-out;
      filter: drop-shadow(1px 1px 2px rgba(0,0,0,0.3));
    `;
    cursor.style.left = '0px';
    cursor.style.top = '0px';
    document.body.appendChild(cursor);
    document.addEventListener('mousemove', (e) => {
      cursor.style.left = e.clientX + 'px';
      cursor.style.top = e.clientY + 'px';
    });
  });
}

async function injectSubtitleBar(page) {
  await page.evaluate(() => {
    if (document.getElementById('demo-subtitle')) return;
    const bar = document.createElement('div');
    bar.id = 'demo-subtitle';
    bar.style.cssText = `
      position: fixed; bottom: 0; left: 0; right: 0; z-index: 999998;
      text-align: center; padding: 14px 24px;
      background: rgba(0, 0, 0, 0.8);
      color: white; font-family: -apple-system, "Segoe UI", sans-serif;
      font-size: 17px; font-weight: 500; letter-spacing: 0.3px;
      transition: opacity 0.3s;
      pointer-events: none;
    `;
    bar.textContent = '';
    bar.style.opacity = '0';
    document.body.appendChild(bar);
  });
}

async function showSubtitle(page, text, narration) {
  await page.evaluate((t) => {
    const bar = document.getElementById('demo-subtitle');
    if (!bar) return;
    if (t) {
      bar.textContent = t;
      bar.style.opacity = '1';
    } else {
      bar.style.opacity = '0';
    }
  }, text);
  if (text) {
    const elapsed = (Date.now() - recordingStartTime) / 1000;
    if (narration) {
      const idx = narrationIndex++;
      const audioDur = getAudioDuration(idx);
      narrationMarkers.push({ time: elapsed, subtitle: text, narration, audioDuration: audioDur });
      // Wait for narration audio to finish (minus ~1s for visual actions that follow)
      if (audioDur > 1) {
        const waitMs = Math.max(600, (audioDur - 1) * 1000);
        console.log(`  [${String(idx).padStart(2, '0')}] ${elapsed.toFixed(1)}s subtitle, waiting ${(waitMs/1000).toFixed(1)}s for ${audioDur.toFixed(1)}s narration`);
        await page.waitForTimeout(waitMs);
      } else {
        await page.waitForTimeout(600);
      }
    } else {
      await page.waitForTimeout(600);
    }
  }
}

async function moveAndClick(page, locator, label, opts = {}) {
  const { postClickDelay = 800, ...clickOpts } = opts;
  const el = typeof locator === 'string' ? page.locator(locator).first() : locator;
  const visible = await el.isVisible().catch(() => false);
  if (!visible) {
    console.error(`WARNING: moveAndClick skipped - "${label}" not visible`);
    return false;
  }
  try {
    await el.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const box = await el.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 12 });
      await page.waitForTimeout(400);
    }
    await el.click(clickOpts);
  } catch (e) {
    console.error(`WARNING: moveAndClick failed on "${label}": ${e.message}`);
    return false;
  }
  await page.waitForTimeout(postClickDelay);
  return true;
}

async function typeSlowly(page, locator, text, label, charDelay = 30) {
  const el = typeof locator === 'string' ? page.locator(locator).first() : locator;
  const visible = await el.isVisible().catch(() => false);
  if (!visible) {
    console.error(`WARNING: typeSlowly skipped - "${label}" not visible`);
    return false;
  }
  await moveAndClick(page, el, label);
  await el.fill('');
  await el.pressSequentially(text, { delay: charDelay });
  await page.waitForTimeout(500);
  return true;
}

async function ensureVisible(page, locator, label) {
  const el = typeof locator === 'string' ? page.locator(locator).first() : locator;
  const visible = await el.isVisible().catch(() => false);
  if (!visible) {
    console.error(`REHEARSAL FAIL: "${label}" not found`);
    const found = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('button, input, select, textarea, a, h1, h2'))
        .filter(el => el.offsetParent !== null)
        .map(el => `${el.tagName}[${el.type || ''}] "${el.textContent?.trim().substring(0, 50)}"`)
        .join('\n  ');
    });
    console.error('  Visible elements:\n  ' + found);
    return false;
  }
  console.log(`REHEARSAL OK: "${label}"`);
  return true;
}

async function panElements(page, selector, maxCount = 6) {
  const elements = await page.locator(selector).all();
  for (let i = 0; i < Math.min(elements.length, maxCount); i++) {
    try {
      const box = await elements[i].boundingBox();
      if (box && box.y > 0 && box.y < 680) {
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 8 });
        await page.waitForTimeout(500);
      }
    } catch (e) {
      console.warn(`WARNING: panElements skipped element ${i}: ${e.message}`);
    }
  }
}

async function smoothScroll(page, targetY) {
  await page.evaluate((y) => {
    window.scrollTo({ top: y, behavior: 'smooth' });
  }, targetY);
  await page.waitForTimeout(1500);
}

async function scrollToSection(page, sectionId) {
  // Use evaluate to scroll to element even if not in viewport
  const found = await page.evaluate((id) => {
    const el = document.getElementById(id);
    if (!el) return false;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return true;
  }, sectionId);
  if (!found) {
    console.warn(`WARNING: section "${sectionId}" not found in DOM`);
    return false;
  }
  await page.waitForTimeout(1200);
  return true;
}

// --- Main ---

(async () => {
  const browser = await chromium.launch({ headless: true });

  // ===== REHEARSAL =====
  if (REHEARSAL) {
    console.log('=== REHEARSAL MODE ===');
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();

    // Phase 1: Upload page
    await page.goto(BASE_URL);
    await page.waitForTimeout(2000);

    // Check if landing page shows (button text is "Start Analyzing")
    const hasLanding = await page.locator('button:has-text("Start Analyzing")').isVisible().catch(() => false);
    if (hasLanding) {
      console.log('REHEARSAL OK: Landing page detected');
      await page.locator('button:has-text("Start Analyzing")').click();
      await page.waitForTimeout(1500);
    }

    let allOk = true;
    const check = async (sel, label) => {
      if (!await ensureVisible(page, sel, label)) allOk = false;
    };

    await check('h1:has-text("Logcat")', 'Upload heading');
    await check('text=Drop bugreport.zip', 'Drop zone text');
    await check('textarea', 'Description textarea');
    await check('text=Quick Analysis', 'Quick Analysis button');
    await check('text=Deep Analysis', 'Deep Analysis button');
    await check('button:has-text("ANR")', 'ANR tag');
    await check('button:has-text("Crash")', 'Crash tag');

    // Upload a file and check result page
    console.log('\n--- Uploading file for result page check ---');
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(BUGREPORT_PATH);
    await page.waitForTimeout(1000);

    await check('button:has-text("Analyze")', 'Analyze button');

    // Submit
    await page.locator('button:has-text("Analyze")').click();
    console.log('Waiting for analysis to complete...');

    // Wait for result page
    await page.waitForSelector('#section-overview', { timeout: 60000 });
    await page.waitForTimeout(2000);

    await check('#section-overview', 'Overview section');
    await check('#section-insights', 'Insights section');
    await check('#section-timeline', 'Timeline section');

    const hasPower = await page.locator('#section-power').isVisible().catch(() => false);
    console.log(`Power section: ${hasPower ? 'FOUND' : 'not present'}`);

    const hasTelephony = await page.locator('#section-telephony').isVisible().catch(() => false);
    console.log(`Telephony section: ${hasTelephony ? 'FOUND' : 'not present'}`);

    const hasAnr = await page.locator('#section-anr').isVisible().catch(() => false);
    console.log(`ANR section: ${hasAnr ? 'FOUND' : 'not present'}`);

    await check('button:has-text("Search")', 'Search button');
    await check('button:has-text("History")', 'History button');
    await check('button:has-text("New Analysis")', 'New Analysis button');

    if (!allOk) {
      console.error('\nREHEARSAL FAILED - fix selectors before recording');
    } else {
      console.log('\nREHEARSAL PASSED - all selectors verified');
    }

    await context.close();
    await browser.close();
    return;
  }

  // ===== RECORDING =====
  console.log('=== RECORDING MODE ===');
  const context = await browser.newContext({
    recordVideo: { dir: VIDEO_DIR, size: { width: 1440, height: 900 } },
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  try {
    recordingStartTime = Date.now();

    // --- Step 1: Landing / Upload Page ---
    await page.goto(BASE_URL);
    await page.waitForTimeout(1500);
    await injectCursor(page);
    await injectSubtitleBar(page);

    // Skip landing if present (button text is "Start Analyzing")
    const hasLanding = await page.locator('button:has-text("Start Analyzing")').isVisible().catch(() => false);
    if (hasLanding) {
      await showSubtitle(page, 'Logcat AI - Android Bugreport Analyzer',
        'Welcome to Logcat AI, an AI-powered bugreport analyzer built for Android BSP engineers. Let\'s walk through a complete analysis workflow.');
      await panElements(page, '[class*="bg-surface-card"]', 4);
      await moveAndClick(page, 'button:has-text("Start Analyzing")', 'Start Analyzing button', { postClickDelay: 1500 });
      await injectCursor(page);
      await injectSubtitleBar(page);
    }

    await showSubtitle(page, 'Step 1 - Upload a bugreport.zip file',
      'Start by uploading a bugreport zip file. You can drag and drop, or click to browse. The tool accepts zip, text, and log files.');

    // Pan over the upload zone
    await page.mouse.move(720, 250, { steps: 10 });
    await page.waitForTimeout(500);

    // Upload file via input
    const fileInput = page.locator('input[type="file"]');
    await fileInput.setInputFiles(BUGREPORT_PATH);
    await page.waitForTimeout(1000);

    // --- Step 2: Describe and tag ---
    await showSubtitle(page, 'Step 2 - Describe the issue and apply quick tags',
      'Add a problem description to help the analyzer focus on relevant areas. Quick tags like ANR and Crash help prioritize the analysis.');

    await typeSlowly(page, 'textarea', 'Keypad stopped working after reboot', 'Problem description', 28);
    await page.waitForTimeout(500);

    await moveAndClick(page, 'button:has-text("ANR")', 'ANR tag', { postClickDelay: 400 });
    await moveAndClick(page, 'button:has-text("Crash")', 'Crash tag', { postClickDelay: 400 });

    // --- Step 3: Analysis mode ---
    await showSubtitle(page, 'Step 3 - Choose analysis mode',
      'Two modes are available. Quick Analysis uses rule-based detection and finishes in under 5 seconds. Deep Analysis adds AI-powered root cause analysis, taking 30 seconds to 2 minutes.');

    // Hover Deep Analysis briefly to show the option
    const deepBtn = page.locator('text=Deep Analysis').first();
    const deepBox = await deepBtn.boundingBox();
    if (deepBox) {
      await page.mouse.move(deepBox.x + deepBox.width / 2, deepBox.y + deepBox.height / 2, { steps: 10 });
      await page.waitForTimeout(1200);
    }
    // Select Quick
    await moveAndClick(page, 'text=Quick Analysis', 'Quick Analysis select', { postClickDelay: 600 });

    // --- Step 4: Start ---
    await showSubtitle(page, 'Step 4 - Start analysis',
      'Let\'s run a Quick Analysis on this T70 bugreport.');
    await moveAndClick(page, 'button:has-text("Analyze")', 'Analyze button', { postClickDelay: 500 });

    // --- Step 5: Progress pipeline ---
    await showSubtitle(page, 'Step 5 - Pipeline: Unpack → Parse → Analyze',
      'The pipeline extracts the zip, parses logcat, kernel, ANR traces, and dumpsys sections, then runs anomaly detection and health scoring.');

    // Wait for result
    console.log('Waiting for analysis result...');
    await page.waitForSelector('#section-overview', { timeout: 120000 });
    await page.waitForSelector('#section-timeline', { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);

    await injectCursor(page);
    await injectSubtitleBar(page);

    // --- Step 6: System Overview ---
    await showSubtitle(page, 'Step 6 - System Overview',
      'The overview shows device model, Android version, build type, and uptime. The health score combines four dimensions: stability, memory, responsiveness, and kernel.');

    // Pan over the overview while narration plays
    await page.mouse.move(400, 200, { steps: 8 });
    await page.waitForTimeout(500);
    await page.mouse.move(800, 200, { steps: 8 });
    await page.waitForTimeout(500);
    await page.mouse.move(300, 380, { steps: 8 });
    await page.waitForTimeout(600);
    await page.mouse.move(700, 380, { steps: 8 });
    await page.waitForTimeout(600);

    // Scroll down to resource cards
    await smoothScroll(page, 500);

    // --- Step 7: Power Overview ---
    const hasPower = await page.evaluate(() => !!document.getElementById('section-power'));
    if (hasPower) {
      await scrollToSection(page, 'section-power');
      await showSubtitle(page, 'Step 7 - Power Management',
        'Power analysis shows Deep Doze discharge rate, battery statistics, kernel wakelocks, and suspend stats. Doze settings are compared against AOSP defaults.');

      await panElements(page, '#section-power [class*="rounded"]', 4);

      const showDetailsBtn = page.locator('#section-power button:has-text("Show details")').first();
      if (await showDetailsBtn.isVisible().catch(() => false)) {
        await moveAndClick(page, showDetailsBtn, 'Power Show details', { postClickDelay: 1200 });
        await smoothScroll(page, await page.evaluate(() => document.documentElement.scrollTop + 300));
      }
    }

    // --- Step 8: Telephony Overview ---
    const hasTelephony = await page.evaluate(() => !!document.getElementById('section-telephony'));
    if (hasTelephony) {
      await scrollToSection(page, 'section-telephony');
      await showSubtitle(page, 'Step 8 - Telephony',
        'Telephony analysis covers voice state, out-of-service events, RIL errors, signal strength, and RAT changes. OOS duration helps diagnose connectivity issues.');
      await panElements(page, '#section-telephony [class*="rounded"]', 4);
    }

    // --- Step 9: Insight Cards ---
    await scrollToSection(page, 'section-insights');
    await showSubtitle(page, 'Step 9 - Insight Cards',
      'Insights are ranked by severity. Each card shows anomaly type, source, timestamp, and log snippet. You can filter by severity level.');

    // Expand a critical insight card
    const insightCard = page.locator('#section-insights .border-l-4 .cursor-pointer').first();
    if (await insightCard.isVisible().catch(() => false)) {
      await moveAndClick(page, insightCard, 'First insight card header', { postClickDelay: 1200 });
      await smoothScroll(page, await page.evaluate(() => document.documentElement.scrollTop + 200));
      await page.waitForTimeout(1000);
    }

    // --- Step 10: ANR Detail ---
    const hasAnr = await page.evaluate(() => !!document.getElementById('section-anr'));
    if (hasAnr) {
      await scrollToSection(page, 'section-anr');
      await showSubtitle(page, 'Step 10 - ANR Analysis',
        'Each ANR is classified into one of 18 types, such as lock contention, binder timeout, or IO on main thread. Blocking chains and HAL targets help BSP engineers find the root cause.');
      await panElements(page, '#section-anr [class*="card"], #section-anr details', 3);
    }

    // --- Step 11: Timeline ---
    const timelineExists = await page.evaluate(() => !!document.getElementById('section-timeline'));
    if (timelineExists) {
      await scrollToSection(page, 'section-timeline');
      await showSubtitle(page, 'Step 11 - Timeline',
        'The timeline shows events in chronological order, filterable by source and severity. Click the search icon to jump into the Log Viewer with a time window around that event.');
      await panElements(page, '#section-timeline [class*="cursor-pointer"]', 4);
    }

    // --- Step 12: Search / Log Viewer ---
    await showSubtitle(page, 'Step 12 - Log Viewer',
      'Full-text search across all logcat and kernel entries. Virtual scrolling handles up to 50,000 entries with live filtering by level, PID, buffer, and tag.');
    await smoothScroll(page, 0);
    await page.waitForTimeout(1000);

    const searchVisible = await page.locator('button:has-text("Search")').first().isVisible().catch(() => false);
    if (searchVisible) {
      await moveAndClick(page, 'button:has-text("Search")', 'Search button', { postClickDelay: 2000 });
    } else {
      await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent.trim() === 'Search');
        if (btn) btn.click();
      });
      await page.waitForTimeout(2000);
    }

    // Browse search modal
    await page.mouse.move(720, 300, { steps: 8 });
    await page.waitForTimeout(800);
    await page.mouse.move(720, 500, { steps: 8 });
    await page.waitForTimeout(1200);

    // Close
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);

    // --- End ---
    await showSubtitle(page, 'Logcat AI - AI-powered Android Bugreport Analysis',
      'That covers the complete workflow. From upload to insights, power, telephony, and log search, all in one tool. Try it on your next bugreport.');
    await showSubtitle(page, '');
    await page.waitForTimeout(1000);

  } catch (err) {
    console.error('DEMO ERROR:', err.message);
  } finally {
    await context.close();
    const video = page.video();
    if (video) {
      const src = await video.path();
      const dest = path.join(VIDEO_DIR, OUTPUT_NAME);
      try {
        fs.copyFileSync(src, dest);
        console.log('Video saved:', dest);
      } catch (e) {
        console.error('ERROR: Failed to copy video:', e.message);
        console.error('  Source:', src);
        console.error('  Destination:', dest);
      }
    }

    // Save narration markers for audio post-processing
    if (narrationMarkers.length > 0) {
      const markersPath = path.join(VIDEO_DIR, 'narration-markers.json');
      fs.writeFileSync(markersPath, JSON.stringify(narrationMarkers, null, 2));
      console.log(`Narration markers saved: ${markersPath} (${narrationMarkers.length} segments)`);
    }

    await browser.close();
  }
})();
