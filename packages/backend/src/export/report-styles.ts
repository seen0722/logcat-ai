/**
 * Shared brand CSS for all HTML report exports.
 * Matches the Logcat AI frontend design system:
 * - DM Serif Display + DM Sans + SF Mono
 * - Deep navy palette (#0c1222)
 * - Warm gold (#d4a06a) + Accent blue (#4f8ff7)
 */

export interface ReportTheme {
  /** Primary accent color for this report type */
  accent: string;
  accentLight: string;
  accentGlow: string;
  /** Report type label shown in header */
  reportType: string;
}

export const THEME_GENERAL: ReportTheme = {
  accent: '#4f8ff7',
  accentLight: '#7cb3ff',
  accentGlow: 'rgba(79,143,247,0.12)',
  reportType: 'Analysis Report',
};

export const THEME_POWER: ReportTheme = {
  accent: '#4f8ff7',
  accentLight: '#7cb3ff',
  accentGlow: 'rgba(79,143,247,0.12)',
  reportType: 'Power Report',
};

export const THEME_TELEPHONY: ReportTheme = {
  accent: '#d4a06a',
  accentLight: '#e8c9a0',
  accentGlow: 'rgba(212,160,106,0.12)',
  reportType: 'Telephony Report',
};

/**
 * Generate the shared <style> block for HTML reports.
 */
export function getReportCSS(theme: ReportTheme): string {
  return `
<style>
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=DM+Serif+Display&display=swap');
:root {
  --bg: #0c1222;
  --surface: #131b2e;
  --surface2: #1a2540;
  --surface3: #223050;
  --border: #243049;
  --border-subtle: #1c2a42;
  --text: #e4e4e7;
  --text-dim: #9ca3af;
  --text-muted: #6b7280;
  --accent: ${theme.accent};
  --accent-light: ${theme.accentLight};
  --accent-glow: ${theme.accentGlow};
  --warm: #d4a06a;
  --warm-light: #e8c9a0;
  --warm-glow: rgba(212,160,106,0.12);
  --red: #ef4444;
  --red-bg: rgba(239,68,68,0.1);
  --amber: #f59e0b;
  --amber-bg: rgba(245,158,11,0.1);
  --green: #22c55e;
  --green-bg: rgba(34,197,94,0.1);
  --cyan: #06b6d4;
  --font-display: 'DM Serif Display', Georgia, serif;
  --font-sans: 'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  --radius: 14px;
  --radius-sm: 8px;
  --shadow: 0 4px 12px rgba(12,18,34,0.3), 0 1px 3px rgba(12,18,34,0.2);
  --shadow-lg: 0 12px 28px rgba(12,18,34,0.4), 0 4px 10px rgba(12,18,34,0.2);
}
* { margin: 0; padding: 0; box-sizing: border-box; }
html { scroll-behavior: smooth; scroll-padding-top: 80px; }
body {
  font-family: var(--font-sans);
  background: var(--bg);
  color: var(--text);
  line-height: 1.7;
  font-size: 14px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

/* Layout */
.page { display: flex; min-height: 100vh; }
nav.toc {
  position: fixed; top: 0; left: 0;
  width: 240px; height: 100vh;
  background: var(--surface);
  border-right: 1px solid var(--border);
  overflow-y: auto; padding: 24px 16px;
  z-index: 100;
}
nav.toc h2 {
  font-family: var(--font-display);
  font-size: 15px; font-weight: 400;
  color: var(--text); margin-bottom: 20px;
}
nav.toc h2 span { color: var(--warm); }
nav.toc a {
  display: block; padding: 6px 12px; margin: 2px 0;
  font-size: 12px; color: var(--text-muted);
  text-decoration: none; border-radius: var(--radius-sm);
  transition: all 0.15s;
}
nav.toc a:hover { background: var(--surface2); color: var(--text); }
nav.toc a.active { background: var(--accent-glow); color: var(--accent); font-weight: 600; }
main {
  margin-left: 240px; max-width: 920px; width: 100%;
  padding: 40px 48px 80px;
}

/* Typography */
h1 {
  font-family: var(--font-display);
  font-size: 28px; font-weight: 400;
  margin-bottom: 4px;
}
h1 span.brand { color: var(--warm); }
h2 {
  font-family: var(--font-display);
  font-size: 20px; font-weight: 400;
  margin: 48px 0 16px;
  padding-bottom: 8px; border-bottom: 1px solid var(--border);
  scroll-margin-top: 24px;
}
h3 {
  font-family: var(--font-display);
  font-size: 16px; font-weight: 400;
  margin: 24px 0 10px; color: var(--text);
}
p { margin-bottom: 8px; }
code, .mono {
  font-family: var(--font-mono);
  font-size: 12px;
}

/* Header */
.report-header {
  margin-bottom: 40px;
  padding-bottom: 20px;
  border-bottom: 1px solid var(--border);
}
.report-header .subtitle {
  color: var(--text-dim);
  font-size: 13px; line-height: 1.8;
}
.report-header .type-badge {
  display: inline-block;
  font-size: 10px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 1.5px;
  color: var(--accent);
  background: var(--accent-glow);
  padding: 4px 12px; border-radius: var(--radius-sm);
  margin-bottom: 12px;
}

/* Cards */
.card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px;
  margin: 12px 0;
  box-shadow: var(--shadow);
}
.card-grid { display: grid; gap: 12px; margin: 12px 0; }
.card-grid-2 { grid-template-columns: repeat(2, 1fr); }
.card-grid-3 { grid-template-columns: repeat(3, 1fr); }
.card-grid-4 { grid-template-columns: repeat(4, 1fr); }
.metric-card {
  background: var(--surface);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius);
  padding: 16px;
}
.metric-card .label {
  font-size: 10px; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: 1px;
  margin-bottom: 6px;
}
.metric-card .value {
  font-size: 22px; font-weight: 700;
}
.metric-card .sub {
  font-size: 11px; color: var(--text-muted); margin-top: 2px;
}

/* Tables */
table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 13px; }
th {
  text-align: left; padding: 10px 12px;
  font-size: 10px; text-transform: uppercase; letter-spacing: 1px;
  color: var(--text-muted); font-weight: 600;
  background: var(--surface);
  border-bottom: 2px solid var(--border);
}
td {
  padding: 10px 12px;
  border-bottom: 1px solid var(--border-subtle);
  vertical-align: top;
}
tr:hover td { background: var(--surface2); }

/* Badges */
.badge {
  display: inline-block; font-size: 10px; font-weight: 600;
  padding: 3px 10px; border-radius: var(--radius-sm);
}
.badge-critical { background: var(--red-bg); color: var(--red); }
.badge-warning { background: var(--amber-bg); color: var(--amber); }
.badge-ok { background: var(--green-bg); color: var(--green); }
.badge-info { background: var(--accent-glow); color: var(--accent); }

/* Findings */
.finding {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 20px; margin: 10px 0;
}
.finding-header { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
.finding-title { font-weight: 600; font-size: 14px; }
.finding-body { font-size: 13px; color: var(--text-dim); }
.finding-body dt { font-weight: 600; color: var(--text); margin-top: 8px; }

/* Blockquote */
blockquote {
  border-left: 3px solid var(--accent);
  padding: 12px 16px; margin: 12px 0;
  background: var(--accent-glow);
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
  font-size: 13px; color: var(--text-dim);
}
blockquote strong { color: var(--text); }

/* Code */
pre, .code-block {
  padding: 12px 16px;
  background: var(--bg);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 12px; color: var(--text-dim);
  overflow-x: auto; white-space: pre-wrap;
  word-break: break-all; line-height: 1.6;
}

/* Progress bars */
.bar-track {
  height: 6px; background: var(--surface2);
  border-radius: 3px; overflow: hidden;
}
.bar-fill { height: 100%; border-radius: 3px; }

/* Severity colors */
.text-red { color: var(--red); }
.text-amber { color: var(--amber); }
.text-green { color: var(--green); }
.text-accent { color: var(--accent); }
.text-warm { color: var(--warm); }
.text-muted { color: var(--text-muted); }
.text-dim { color: var(--text-dim); }
.font-bold { font-weight: 700; }
.font-mono { font-family: var(--font-mono); }

/* Insight cards (for general report) */
.insight-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 16px; margin-bottom: 10px;
  background: var(--surface);
  box-shadow: var(--shadow);
}
.insight-card.critical { border-left: 4px solid var(--red); }
.insight-card.warning { border-left: 4px solid var(--amber); }
.insight-card.info { border-left: 4px solid var(--green); }
.insight-desc { color: var(--text-dim); font-size: 13px; }
.insight-desc-line { font-size: 13px; line-height: 1.6; }
.detail-section { margin-top: 12px; }
.detail-label {
  font-size: 10px; color: var(--text-muted);
  text-transform: uppercase; letter-spacing: 1px;
  margin-bottom: 4px;
}
.selinux-rule {
  display: block; padding: 10px 14px;
  background: rgba(212,160,106,0.08);
  border: 1px solid rgba(212,160,106,0.2);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 12px; color: var(--warm-light);
}
.debug-commands { display: flex; flex-direction: column; gap: 4px; }
.debug-cmd {
  display: block; padding: 8px 12px;
  background: var(--green-bg);
  border: 1px solid rgba(34,197,94,0.15);
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  font-size: 12px; color: #86efac;
}

/* Deep analysis block */
.deep-analysis {
  margin-top: 12px; padding: 16px;
  background: var(--accent-glow);
  border: 1px solid rgba(79,143,247,0.2);
  border-radius: var(--radius);
}
.da-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
.da-title { color: var(--accent); font-weight: 500; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
.da-field { margin-bottom: 10px; }
.da-field:last-child { margin-bottom: 0; }
.da-field-label { font-size: 10px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 2px; }
.da-field-text { color: var(--text-dim); font-size: 13px; line-height: 1.6; }
.component-tag {
  font-size: 10px; background: var(--surface2);
  color: var(--text-dim); padding: 2px 8px;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
}

/* Footer */
.footer {
  margin-top: 48px; padding-top: 16px;
  border-top: 1px solid var(--border);
  color: var(--text-muted); font-size: 11px;
}

/* Scroll spy */
h2[id]:target { color: var(--accent); }

/* Print */
@media print {
  nav.toc { display: none; }
  main { margin-left: 0; }
  body { background: white; color: #1a1a2e; }
  .card, .finding, .metric-card { break-inside: avoid; border-color: #ddd; }
  .badge { border: 1px solid currentColor; }
}
@media (max-width: 900px) {
  nav.toc { display: none; }
  main { margin-left: 0; padding: 24px 16px; }
  .card-grid-3, .card-grid-4 { grid-template-columns: repeat(2, 1fr); }
}
</style>`;
}

/**
 * Generate the scroll-spy JavaScript for TOC highlighting.
 */
export function getReportScript(): string {
  return `
<script>
const sections = document.querySelectorAll('h2[id]');
const tocLinks = document.querySelectorAll('nav.toc a');
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      tocLinks.forEach(a => a.classList.remove('active'));
      const active = document.querySelector('nav.toc a[href="#' + entry.target.id + '"]');
      if (active) active.classList.add('active');
    }
  });
}, { rootMargin: '-20% 0px -70% 0px' });
sections.forEach(s => observer.observe(s));
</script>`;
}

/** Escape HTML special characters */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Format a Date to a display string */
export function formatDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toISOString().slice(0, 19).replace('T', ' ');
}
