# Landing Page Design

## Context

Logcat AI currently drops users directly into the UploadZone. There is no introduction for new visitors or external audiences. We need a Landing Page that serves both internal onboarding and open-source promotion.

## Decision: Phase-based (no router)

Add a `landing` phase to the existing `phase` state machine in `useAnalysis`. No React Router — keeps the architecture simple and consistent.

Flow: `landing → upload → analyzing → result`

## Page Structure

```
┌─────────────────────────────────────────────────┐
│  Hero                                           │
│    Logcat AI                                    │
│    AI-powered bugreport.zip analyzer            │
│    for Android BSP engineers                    │
│                                                 │
│    [ Start Analyzing → ]   [ View History ]     │
│                                                 │
│  Feature Cards (2×2 grid, 1-col on mobile)      │
│    ┌──────────────┐  ┌──────────────┐           │
│    │ ANR Deep     │  │ Health Score │           │
│    │ Analysis     │  │ 4 Dimensions │           │
│    └──────────────┘  └──────────────┘           │
│    ┌──────────────┐  ┌──────────────┐           │
│    │ FTS5 Search  │  │ Power Mgmt   │           │
│    │ + AI Chat    │  │ Analysis     │           │
│    └──────────────┘  └──────────────┘           │
│                                                 │
│  Supported Formats                              │
│    bugreport.zip · logcat.txt · dmesg.log       │
└─────────────────────────────────────────────────┘
```

## Feature Cards Content

| Card | Title | Description |
|------|-------|-------------|
| 1 | ANR Deep Analysis | 18 ANR case types (deadlock, binder timeout, IO on main thread...). Lock graph visualization, auto-identify vendor HAL targets |
| 2 | Health Score | 4 dimensions: Stability / Memory / Responsiveness / Kernel. Frequency-decay scoring prevents repeated events from flooding |
| 3 | Full-text Search & AI Chat | FTS5 instant search across logcat + kernel entries. LLM follow-up dialogue, supports Ollama / OpenAI / Gemini / Anthropic |
| 4 | Power Management | Deep Doze discharge rate, kernel wakelocks, alarm wakeups, suspend stats. Doze settings diff vs AOSP defaults |

## Visual Style

- Dark theme matching existing UI (`bg-surface-card`, `border-border`)
- Emoji icons on cards (no extra SVG assets)
- Title: `text-gray-100`, description: `text-gray-400`
- 2×2 grid at md+, 1-column stack on mobile

## Skip Logic

- First visit: show landing page
- "Start Analyzing" sets `localStorage.skipLanding = '1'` and transitions to `upload`
- Subsequent visits: skip directly to `upload`
- "New Analysis" button in result header goes to `upload` (not landing)

## Files Changed

| File | Action |
|------|--------|
| `components/LandingPage.tsx` | New: landing page component |
| `App.tsx` | Add `landing` phase branch |
| `hooks/useAnalysis.ts` | Initial phase reads `skipLanding` from localStorage |
| E2E tests | Minor adjustments for landing page skip |

## Not in Scope

- React Router
- Animated transitions between landing and upload
- Screenshot/demo GIF assets
