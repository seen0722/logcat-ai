import { useEffect, useState } from 'react';
import { IconWarningTriangle, IconBarChart, IconSearch, IconLightning, IconBrain, IconSignal } from './Icons';

interface Props {
  onStart: () => void;
  onViewHistory: () => void;
}

const FEATURES = [
  {
    icon: <IconWarningTriangle className="w-5 h-5" />,
    title: 'ANR Deep Analysis',
    desc: '18 ANR case types with lock graph visualization',
    color: 'text-red-400',
    accent: '#f87171',
  },
  {
    icon: <IconBarChart className="w-5 h-5" />,
    title: 'Health Scoring',
    desc: '4-dimension weighted scoring with decay',
    color: 'text-emerald-400',
    accent: '#34d399',
  },
  {
    icon: <IconSearch className="w-5 h-5" />,
    title: 'FTS5 Log Search',
    desc: 'Instant full-text search across all entries',
    color: 'text-accent-light',
    accent: '#4f8ff7',
  },
  {
    icon: <IconLightning className="w-5 h-5" />,
    title: 'Power Analysis',
    desc: 'Deep Doze rate, wakelocks, suspend stats',
    color: 'text-warm',
    accent: '#d4a06a',
  },
  {
    icon: <IconSignal className="w-5 h-5" />,
    title: 'Telephony',
    desc: 'OOS detection, RIL errors, signal tracking',
    color: 'text-cyan-400',
    accent: '#22d3ee',
  },
  {
    icon: <IconBrain className="w-5 h-5" />,
    title: 'AI Chat',
    desc: 'Follow-up Q&A with tool-calling agents',
    color: 'text-violet-400',
    accent: '#a78bfa',
  },
];

/** Animated terminal-like log lines for the hero visual */
const LOG_LINES = [
  { level: 'E', tag: 'ActivityManager', msg: 'ANR in com.vendor.keypad (Binder:main)', color: '#f87171' },
  { level: 'W', tag: 'PowerManager', msg: 'Wakelock held: *alarm* for 45m', color: '#fbbf24' },
  { level: 'E', tag: 'lowmemorykiller', msg: 'Kill process 3847 (score_adj 906)', color: '#f87171' },
  { level: 'W', tag: 'RIL', msg: 'REQUEST_SETUP_DATA_CALL timeout, OOS 3 times', color: '#fbbf24' },
  { level: 'E', tag: 'Watchdog', msg: 'Blocked in handler on foreground thread', color: '#f87171' },
  { level: 'D', tag: 'DeviceIdle', msg: 'Deep Doze discharge: 75.6 mAh/h (ideal <20)', color: '#34d399' },
  { level: 'I', tag: 'Logcat AI', msg: 'Health 68/100 | 4 critical | 27 insights', color: '#d4a06a' },
  { level: 'I', tag: 'Logcat AI', msg: 'Power / Telephony / ANR reports ready', color: '#d4a06a' },
];

export default function LandingPage({ onStart, onViewHistory }: Props) {
  const [mounted, setMounted] = useState(false);
  const [visibleLines, setVisibleLines] = useState(0);

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
    // Stagger log lines appearance
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < LOG_LINES.length; i++) {
      timers.push(setTimeout(() => setVisibleLines(i + 1), 800 + i * 200));
    }
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 sm:px-6 py-12 relative overflow-hidden">
      {/* Background gradient mesh */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/4 left-1/3 w-[500px] h-[500px] bg-accent/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-1/3 right-1/4 w-[400px] h-[400px] bg-warm/8 rounded-full blur-[100px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-surface-card/50 rounded-full blur-[80px]" />
        {/* Subtle grid overlay */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'linear-gradient(rgba(79,143,247,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(79,143,247,0.3) 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
      </div>

      {/* Hero Section */}
      <div className={`text-center space-y-4 mb-10 relative transition-all duration-700 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
        <h1 className="font-display text-5xl sm:text-6xl md:text-7xl tracking-tight">
          <span className="text-gray-100">Logcat </span>
          <span className="text-warm">AI</span>
        </h1>
        <p className="text-base sm:text-lg text-gray-400 max-w-lg mx-auto leading-relaxed font-light">
          AI-powered <span className="text-gray-200 font-medium">bugreport.zip</span> analyzer
          <br className="hidden sm:block" />
          <span className="sm:hidden"> </span>for Android BSP engineers
        </p>
      </div>

      {/* Terminal Preview — the visual hook */}
      <div className={`w-full max-w-2xl mb-10 relative transition-all duration-700 delay-200 ease-out ${mounted ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-8 scale-95'}`}>
        <div className="rounded-2xl overflow-hidden border border-border/60 shadow-elevated bg-[#0a0e18]">
          {/* Title bar */}
          <div className="flex items-center gap-2 px-4 py-2.5 bg-surface-card/80 border-b border-border/40">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-red-500/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/60" />
              <div className="w-2.5 h-2.5 rounded-full bg-green-500/60" />
            </div>
            <span className="text-[11px] text-gray-500 ml-2 font-mono">logcat-ai — bugreport analysis</span>
          </div>
          {/* Log content */}
          <div className="p-4 font-mono text-[11px] sm:text-xs leading-[1.7] space-y-0.5 h-[200px] sm:h-[220px] overflow-hidden">
            {LOG_LINES.map((line, i) => (
              <div
                key={i}
                className="flex gap-0 transition-all duration-300"
                style={{
                  opacity: i < visibleLines ? 1 : 0,
                  transform: i < visibleLines ? 'translateX(0)' : 'translateX(-8px)',
                }}
              >
                <span className="text-gray-600 shrink-0 w-[110px] sm:w-[130px]">02-26 {String(7 + Math.floor(i / 3)).padStart(2, '0')}:{String(10 + i * 7).padStart(2, '0')}:04</span>
                <span className="shrink-0 w-4 text-center font-bold" style={{ color: line.color }}>{line.level}</span>
                <span className="text-gray-500 shrink-0 ml-1">{'/'}</span>
                <span className="text-gray-300 shrink-0 mr-1">{line.tag}</span>
                <span className="text-gray-500 truncate">: {line.msg}</span>
              </div>
            ))}
            {/* Blinking cursor */}
            {visibleLines >= LOG_LINES.length && (
              <div className="flex items-center gap-1 mt-2">
                <span className="text-warm font-bold">{'>'}</span>
                <span className="text-warm animate-pulse">_</span>
              </div>
            )}
          </div>
        </div>
        {/* Floating badge overlays */}
        <div className={`absolute -right-3 -top-3 sm:right-[-18px] sm:top-10 transition-all duration-500 delay-[1200ms] ${mounted ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'}`}>
          <div className="bg-red-500/15 border border-red-500/30 rounded-xl px-3 py-1.5 backdrop-blur-sm shadow-card">
            <span className="text-red-400 text-xs font-semibold">4 Critical</span>
          </div>
        </div>
        <div className={`absolute -left-3 -bottom-5 sm:left-[-18px] sm:-bottom-4 transition-all duration-500 delay-[1500ms] ${mounted ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}`}>
          <div className="bg-surface-card/90 border border-border/60 rounded-xl px-3 py-1.5 backdrop-blur-sm shadow-card">
            <span className="text-gray-300 text-xs">Health <span className="text-warm font-display text-sm font-bold">68</span><span className="text-gray-500">/100</span></span>
          </div>
        </div>
      </div>

      {/* CTA Buttons */}
      <div className={`flex items-center justify-center gap-4 mb-14 relative transition-all duration-700 delay-300 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <button
          onClick={onStart}
          className="btn-warm text-base px-8 py-3.5 shadow-warm-glow"
        >
          Start Analyzing
        </button>
        <button
          onClick={onViewHistory}
          className="btn-ghost text-base px-8 py-3.5"
        >
          View History
        </button>
      </div>

      {/* Feature Grid — concise */}
      <div className={`grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 max-w-2xl w-full mb-10 relative transition-all duration-700 delay-500 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
        {FEATURES.map((f, i) => (
          <div
            key={f.title}
            className="group bg-surface-card/40 border border-border/40 rounded-xl p-4 transition-all duration-300 hover:bg-surface-card/70 hover:border-border hover:-translate-y-0.5"
            style={{ transitionDelay: mounted ? `${600 + i * 80}ms` : '0ms' }}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span className={f.color}>{f.icon}</span>
              <h3 className="text-sm font-semibold text-gray-200">{f.title}</h3>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>

      {/* Supported Formats */}
      <p className={`text-xs text-gray-600 relative transition-all duration-700 delay-700 ease-out ${mounted ? 'opacity-100' : 'opacity-0'}`}>
        Supports{' '}
        <span className="text-gray-500">.zip</span>
        {' \u00B7 '}
        <span className="text-gray-500">.txt</span>
        {' \u00B7 '}
        <span className="text-gray-500">.log</span>
        <span className="text-gray-700 mx-2">|</span>
        <span className="text-gray-500">Ollama {'\u00B7'} OpenAI {'\u00B7'} Gemini {'\u00B7'} Anthropic</span>
      </p>
    </div>
  );
}
