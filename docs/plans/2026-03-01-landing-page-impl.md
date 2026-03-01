# Landing Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a landing page that introduces Logcat AI's features to new visitors before showing the upload form.

**Architecture:** New `landing` phase in the existing `useAnalysis` state machine. A `LandingPage.tsx` component renders hero + 4 feature cards. `localStorage.skipLanding` lets returning users bypass the landing page.

**Tech Stack:** React 19, Tailwind CSS 3.4, existing dark theme tokens (`bg-surface-card`, `border-border`, etc.)

**Design doc:** `docs/plans/2026-03-01-landing-page-design.md`

---

### Task 1: Add `landing` phase to useAnalysis hook

**Files:**
- Modify: `packages/frontend/src/hooks/useAnalysis.ts`

**Step 1: Update AppPhase type and initial state**

In `packages/frontend/src/hooks/useAnalysis.ts`, change:

```typescript
// Before:
export type AppPhase = 'upload' | 'analyzing' | 'result';

export function useAnalysis() {
  const [phase, setPhase] = useState<AppPhase>('upload');
```

To:

```typescript
// After:
export type AppPhase = 'landing' | 'upload' | 'analyzing' | 'result';

function getInitialPhase(): AppPhase {
  try {
    if (localStorage.getItem('skipLanding') === '1') return 'upload';
  } catch {}
  return 'landing';
}

export function useAnalysis() {
  const [phase, setPhase] = useState<AppPhase>(getInitialPhase);
```

No other changes to this file. The `reset()` function already sets phase to `'upload'`, which is correct (we don't want "New Analysis" to go back to landing).

**Step 2: Verify the hook compiles**

Run: `npx tsc --noEmit -p packages/frontend/tsconfig.json 2>&1 | head -20`

Expected: TypeScript errors about App.tsx not handling `'landing'` phase (or clean if App.tsx hasn't been updated yet — the switch is not exhaustive). Either way, no errors in `useAnalysis.ts` itself.

**Step 3: Commit**

```bash
git add packages/frontend/src/hooks/useAnalysis.ts
git commit -m "feat(frontend): add landing phase to useAnalysis hook"
```

---

### Task 2: Create LandingPage component

**Files:**
- Create: `packages/frontend/src/components/LandingPage.tsx`

**Step 1: Write the component**

Create `packages/frontend/src/components/LandingPage.tsx`:

```tsx
interface Props {
  onStart: () => void;
  onViewHistory: () => void;
}

const FEATURES = [
  {
    icon: '\u26A0\uFE0F',
    title: 'ANR Deep Analysis',
    desc: '18 ANR case types — deadlock, binder timeout, IO on main thread, and more. Lock graph visualization with automatic vendor HAL target identification.',
  },
  {
    icon: '\uD83D\uDCCA',
    title: 'Health Score',
    desc: '4-dimension scoring: Stability, Memory, Responsiveness, Kernel. Frequency-decay mechanism prevents repeated events from flooding the score.',
  },
  {
    icon: '\uD83D\uDD0D',
    title: 'Full-text Search & AI Chat',
    desc: 'FTS5 instant search across logcat and kernel entries. LLM follow-up dialogue with Ollama, OpenAI, Gemini, or Anthropic.',
  },
  {
    icon: '\uD83D\uDD0B',
    title: 'Power Management',
    desc: 'Deep Doze discharge rate, kernel wakelocks, alarm wakeups, suspend stats. Doze settings diff against AOSP defaults.',
  },
];

export default function LandingPage({ onStart, onViewHistory }: Props) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16">
      {/* Hero */}
      <div className="text-center space-y-4 mb-12">
        <h1 className="text-4xl md:text-5xl font-bold">Logcat AI</h1>
        <p className="text-lg text-gray-400 max-w-xl mx-auto">
          AI-powered bugreport.zip analyzer for Android BSP engineers
        </p>
        <div className="flex items-center justify-center gap-3 pt-4">
          <button
            onClick={onStart}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-medium transition-colors"
          >
            Start Analyzing
          </button>
          <button
            onClick={onViewHistory}
            className="px-6 py-2.5 border border-border text-gray-400 hover:text-gray-200 hover:bg-surface-hover rounded-lg font-medium transition-colors"
          >
            View History
          </button>
        </div>
      </div>

      {/* Feature Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl w-full mb-12">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="bg-surface-card border border-border rounded-lg p-5 space-y-2"
          >
            <div className="flex items-center gap-2">
              <span className="text-xl">{f.icon}</span>
              <h3 className="font-semibold text-gray-100">{f.title}</h3>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>

      {/* Supported Formats */}
      <p className="text-sm text-gray-500">
        Supports <span className="text-gray-400">bugreport.zip</span>
        {' \u00B7 '}
        <span className="text-gray-400">logcat.txt</span>
        {' \u00B7 '}
        <span className="text-gray-400">dmesg.log</span>
      </p>
    </div>
  );
}
```

**Step 2: Verify it compiles**

Run: `npx tsc --noEmit -p packages/frontend/tsconfig.json 2>&1 | head -5`

Expected: No errors in LandingPage.tsx (may have errors in App.tsx since we haven't wired it yet).

**Step 3: Commit**

```bash
git add packages/frontend/src/components/LandingPage.tsx
git commit -m "feat(frontend): add LandingPage component"
```

---

### Task 3: Wire LandingPage into App.tsx

**Files:**
- Modify: `packages/frontend/src/App.tsx`

**Step 1: Add import and landing phase branch**

Add import at top of `App.tsx`:

```typescript
import LandingPage from './components/LandingPage';
```

In the JSX, add the `landing` phase branch **before** the existing `{phase === 'upload' && ...}` block:

```tsx
{/* Landing Phase */}
{phase === 'landing' && (
  <LandingPage
    onStart={() => {
      try { localStorage.setItem('skipLanding', '1'); } catch {}
      reset();
    }}
    onViewHistory={() => setShowHistory(true)}
  />
)}
```

Also update the header visibility condition from `{phase !== 'upload' && (` to:

```tsx
{phase !== 'upload' && phase !== 'landing' && (
```

**Step 2: Verify it compiles and runs**

Run: `npx tsc --noEmit -p packages/frontend/tsconfig.json`

Expected: Clean — no errors.

Then visually verify by opening `http://localhost:3000` in a **private/incognito window** (no localStorage). You should see the Landing Page. Click "Start Analyzing" → should go to UploadZone. Refresh → should skip to UploadZone (skipLanding is set).

**Step 3: Commit**

```bash
git add packages/frontend/src/App.tsx
git commit -m "feat(frontend): wire LandingPage into App phase machine"
```

---

### Task 4: Fix E2E tests for landing page

**Files:**
- Modify: `packages/frontend/e2e/global-setup.ts`
- Modify: `packages/frontend/e2e/fixtures/analysis.fixture.ts`
- Modify: `packages/frontend/e2e/tests/upload-analysis.spec.ts`
- Modify: `packages/frontend/e2e/tests/history.spec.ts`

The landing page breaks E2E tests because:
1. `analysisPage` fixture clicks "View History" — this button exists on the landing page too, so it should still work
2. `upload-analysis.spec.ts` test "upload page has correct elements" navigates to `/` and expects the upload form — but now sees the landing page first
3. `history.spec.ts` test "clicking history item loads analysis result" navigates to `/` and expects upload page

**Step 1: Update global-setup to set skipLanding via localStorage**

In `global-setup.ts`, we use the backend API directly (no browser), so no change needed there.

**Step 2: Update analysis fixture to handle landing page**

In `packages/frontend/e2e/fixtures/analysis.fixture.ts`, the fixture navigates to `/` and clicks "View History". The landing page also has a "View History" button, so the existing `viewHistoryBtn` locator should work. No change needed here.

**Step 3: Update upload-analysis.spec.ts**

The test "upload page has correct elements" needs to first pass through the landing page. Change:

```typescript
test('upload page has correct elements', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Title
    await expect(page.locator('h1')).toContainText('Logcat AI');

    // File input
    await expect(page.locator('input[type="file"]')).toBeAttached();

    // Analysis mode buttons
    await expect(page.locator('button', { hasText: 'Quick Analysis' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Deep Analysis' })).toBeVisible();
  });
```

To:

```typescript
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
```

Add a new test for the landing page itself:

```typescript
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
```

**Step 4: Update history.spec.ts**

The test "clicking history item loads analysis result" navigates to `/` and clicks "View History". The landing page also has this button, so it should work. But verify the locator matches — the landing page button text is exactly "View History", same as the upload page footer. No change needed.

**Step 5: Run e2e tests**

Run: `npm run e2e -w packages/frontend`

Expected: All 35 tests pass (34 existing + 1 new landing page test).

**Step 6: Commit**

```bash
git add packages/frontend/e2e/tests/upload-analysis.spec.ts
git commit -m "test(e2e): handle landing page in upload-analysis tests"
```

---

### Task 5: Final verification

**Step 1: Run full e2e suite**

```bash
npm run e2e -w packages/frontend
```

Expected: 35 tests pass.

**Step 2: Manual smoke test**

1. Open `http://localhost:3000` in incognito → landing page visible
2. Click "Start Analyzing" → upload page
3. Refresh → upload page (skipLanding set)
4. Open DevTools → `localStorage.removeItem('skipLanding')` → refresh → landing page again
5. Click "View History" on landing page → history panel opens

**Step 3: Commit any remaining fixes and push**

```bash
git push
```
