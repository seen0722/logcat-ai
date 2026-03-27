/**
 * Custom icon library for Logcat AI.
 * All icons are hand-drawn SVGs matching the brand design system.
 * Consistent: 24x24 viewBox, stroke-based, currentColor.
 */

interface IconProps {
  className?: string;
  size?: number;
}

const defaults = { size: 24 };

// ── Brand Logo ──

export function IconLogoMark({ className, size = 28 }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 512 512" fill="none">
      <rect width="512" height="512" rx="108" fill="rgb(var(--color-surface-card))" stroke="rgb(var(--color-border))" strokeWidth="8"/>
      <path d="M100,160 L200,256 L100,352" stroke="rgb(var(--color-border))" strokeWidth="36" strokeLinecap="round" strokeLinejoin="round"/>
      <rect x="230" y="238" width="200" height="36" rx="18" fill="rgb(var(--color-warm))" opacity="0.95"/>
      <path d="M388,96 C392,120 400,128 424,132 C400,136 392,144 388,168 C384,144 376,136 352,132 C376,128 384,120 388,96Z" fill="rgb(var(--color-accent))"/>
    </svg>
  );
}

export function IconSun({ className, size = defaults.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

export function IconMoon({ className, size = defaults.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

// ── Navigation & UI ──

export function IconSettings({ className, size = defaults.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      {/* AI sparkle — 4-pointed star with smaller companion */}
      <path d="M12 2C12.5 7 17 7.5 22 8C17 8.5 12.5 9 12 14C11.5 9 7 8.5 2 8C7 7.5 11.5 7 12 2Z" />
      <path d="M17 14C17.3 16.5 19.5 16.8 22 17C19.5 17.2 17.3 17.5 17 20C16.7 17.5 14.5 17.2 12 17C14.5 16.8 16.7 16.5 17 14Z" />
    </svg>
  );
}

export function IconMenu({ className, size = defaults.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="12" cy="12" r="1.5" />
      <circle cx="12" cy="19" r="1.5" />
    </svg>
  );
}

export function IconChevronDown({ className, size = defaults.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function IconChevronLeft({ className, size = defaults.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 6l-6 6 6 6" />
    </svg>
  );
}

export function IconClose({ className, size = defaults.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function IconSearch({ className, size = defaults.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M15.5 15.5L21 21" />
    </svg>
  );
}

export function IconUpload({ className, size = defaults.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 16V4m0 0l-4 4m4-4l4 4" />
      <path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
    </svg>
  );
}

export function IconCheck({ className, size = defaults.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" strokeWidth={1.5} />
      <path d="M8 12l3 3 5-5" />
    </svg>
  );
}

export function IconRefresh({ className, size = defaults.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12a8 8 0 0114.5-4.5M20 12a8 8 0 01-14.5 4.5" />
      <path d="M18.5 3.5v4h-4M5.5 20.5v-4h4" />
    </svg>
  );
}

// ── Landing Page Feature Icons ──

export function IconWarningTriangle({ className, size = defaults.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3L2 20h20L12 3z" />
      <path d="M12 10v4m0 3h.01" />
    </svg>
  );
}

export function IconBarChart({ className, size = defaults.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <rect x="3" y="14" width="4" height="7" rx="1" />
      <rect x="10" y="8" width="4" height="13" rx="1" />
      <rect x="17" y="3" width="4" height="18" rx="1" />
    </svg>
  );
}

export function IconLightning({ className, size = defaults.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
    </svg>
  );
}

// ── Section Nav Icons ──

export function IconOverview({ className, size = defaults.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="4" rx="1" />
      <rect x="13" y="9" width="8" height="2" rx="1" />
      <rect x="3" y="13" width="18" height="2" rx="1" />
      <rect x="3" y="17" width="12" height="2" rx="1" />
      <rect x="3" y="21" width="8" height="0" rx="0" />
    </svg>
  );
}

export function IconTag({ className, size = defaults.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h7l9 9-7 7-9-9V4z" />
      <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconBattery({ className, size = defaults.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="16" height="12" rx="2" />
      <path d="M21 10v4" strokeWidth={2} />
      <rect x="5" y="8" width="5" height="8" rx="1" fill="currentColor" opacity="0.3" />
    </svg>
  );
}

export function IconSignal({ className, size = defaults.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M4 20h2V14H4zm5 0h2V10H9zm5 0h2V6h-2zm5 0h2V2h-2z" />
    </svg>
  );
}

export function IconBrain({ className, size = defaults.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3c-2 0-3.5 1-4 2.5C6.5 5 5 6 5 8c0 1.5.5 2.5 1.5 3C6 12 6 13.5 7 15c.5.8 1.5 1.5 2.5 1.5" />
      <path d="M12 3c2 0 3.5 1 4 2.5C17.5 5 19 6 19 8c0 1.5-.5 2.5-1.5 3C18 12 18 13.5 17 15c-.5.8-1.5 1.5-2.5 1.5" />
      <path d="M12 16.5V21m-3-4.5c1 1 2 1.5 3 1.5s2-.5 3-1.5" />
      <circle cx="9.5" cy="9" r="0.5" fill="currentColor" />
      <circle cx="14.5" cy="9" r="0.5" fill="currentColor" />
    </svg>
  );
}

export function IconLightbulb({ className, size = defaults.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18h6m-5 2h4" />
      <path d="M12 2a7 7 0 00-4 12.7V17h8v-2.3A7 7 0 0012 2z" />
    </svg>
  );
}

export function IconStopwatch({ className, size = defaults.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2.5 2.5M10 2h4M19 5l-1.5 1.5" />
    </svg>
  );
}

export function IconChat({ className, size = defaults.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 6a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H8l-4 4V6z" />
      <path d="M8 9h8M8 12h5" strokeWidth={1.5} />
    </svg>
  );
}

export function IconANR({ className, size = defaults.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
      <path d="M8 2l1 2m6-2l-1 2" />
    </svg>
  );
}

// ── Metric Card Icons ──

export function IconSleep({ className, size = defaults.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 14.5A8.38 8.38 0 019.5 4 9 9 0 1020 14.5z" />
    </svg>
  );
}

export function IconZap({ className, size = defaults.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
    </svg>
  );
}

export function IconNoService({ className, size = defaults.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <path d="M4 20h2V14H4zm5 0h2V10H9zm5 0h2V6h-2zm5 0h2V2h-2z" opacity="0.3" />
      <path d="M3 3l18 18" strokeWidth={2} />
    </svg>
  );
}

export function IconAntenna({ className, size = defaults.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 14V4" />
      <path d="M8 7c0-2.2 1.8-4 4-4s4 1.8 4 4" />
      <path d="M5 10c0-3.9 3.1-7 7-7s7 3.1 7 7" />
      <circle cx="12" cy="16" r="2" fill="currentColor" opacity="0.3" />
      <path d="M8 20h8" />
    </svg>
  );
}

// ── Link / Arrow ──

export function IconExternalLink({ className, size = defaults.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M7 17L17 7M17 7H10M17 7v7" />
    </svg>
  );
}

export function IconExpand({ className, size = defaults.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function IconCollapse({ className, size = defaults.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
      <path d="M6 15l6-6 6 6" />
    </svg>
  );
}

export function IconDelete({ className, size = defaults.size }: IconProps) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
