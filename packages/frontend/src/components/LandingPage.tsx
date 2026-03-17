import { useEffect, useState } from 'react';
import { IconWarningTriangle, IconBarChart, IconSearch, IconLightning } from './Icons';

interface Props {
  onStart: () => void;
  onViewHistory: () => void;
}

const FEATURES = [
  {
    icon: <IconWarningTriangle className="w-6 h-6" />,
    title: 'ANR Deep Analysis',
    desc: '18 ANR case types \u2014 deadlock, binder timeout, IO on main thread, and more. Lock graph visualization with automatic vendor HAL target identification.',
    color: 'text-red-400',
    bg: 'from-red-500/8 to-red-500/3',
    border: 'border-red-500/20',
  },
  {
    icon: <IconBarChart className="w-6 h-6" />,
    title: 'Health Score',
    desc: '4-dimension scoring: Stability, Memory, Responsiveness, Kernel. Frequency-decay mechanism prevents repeated events from flooding the score.',
    color: 'text-emerald-400',
    bg: 'from-emerald-500/8 to-emerald-500/3',
    border: 'border-emerald-500/20',
  },
  {
    icon: <IconSearch className="w-6 h-6" />,
    title: 'Full-text Search & AI Chat',
    desc: 'FTS5 instant search across logcat and kernel entries. LLM follow-up dialogue with Ollama, OpenAI, Gemini, or Anthropic.',
    color: 'text-accent-light',
    bg: 'from-accent/8 to-accent/3',
    border: 'border-accent/20',
  },
  {
    icon: <IconLightning className="w-6 h-6" />,
    title: 'Power Management',
    desc: 'Deep Doze discharge rate, kernel wakelocks, alarm wakeups, suspend stats. Doze settings diff against AOSP defaults.',
    color: 'text-warm',
    bg: 'from-warm/8 to-warm/3',
    border: 'border-warm/20',
  },
];

export default function LandingPage({ onStart, onViewHistory }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true));
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-16 relative overflow-hidden">
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

      {/* Hero */}
      <div className={`text-center space-y-5 mb-16 relative transition-all duration-700 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
        <h1 className="font-display text-5xl md:text-6xl tracking-tight">
          <span className="text-gray-100">Logcat </span>
          <span className="text-warm">AI</span>
        </h1>
        <p className="text-lg text-gray-400 max-w-xl mx-auto leading-relaxed font-light">
          AI-powered <span className="text-gray-200 font-medium">bugreport.zip</span> analyzer for Android BSP engineers
        </p>
        <div className={`flex items-center justify-center gap-4 pt-8 transition-all duration-700 delay-200 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <button
            onClick={onStart}
            className="btn-warm text-base px-8 py-3.5"
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
      </div>

      {/* Feature Cards */}
      <div className={`grid grid-cols-1 md:grid-cols-2 gap-5 max-w-3xl w-full mb-16 relative transition-all duration-700 delay-300 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
        {FEATURES.map((f, i) => (
          <div
            key={f.title}
            className={`bg-gradient-to-br ${f.bg} border ${f.border} rounded-xl p-6 space-y-3 transition-all duration-500 hover:-translate-y-1 hover:shadow-card-hover`}
            style={{ transitionDelay: mounted ? `${400 + i * 100}ms` : '0ms' }}
          >
            <div className="flex items-center gap-3">
              <span className={f.color}>{f.icon}</span>
              <h3 className="font-display text-lg text-gray-100">{f.title}</h3>
            </div>
            <p className="text-sm text-gray-400 leading-relaxed">{f.desc}</p>
          </div>
        ))}
      </div>

      {/* Supported Formats */}
      <p className={`text-sm text-gray-500 relative transition-all duration-700 delay-700 ease-out ${mounted ? 'opacity-100' : 'opacity-0'}`}>
        Supports <span className="text-gray-400 font-medium">bugreport.zip</span>
        {' \u00B7 '}
        <span className="text-gray-400 font-medium">logcat.txt</span>
        {' \u00B7 '}
        <span className="text-gray-400 font-medium">dmesg.log</span>
      </p>
    </div>
  );
}
