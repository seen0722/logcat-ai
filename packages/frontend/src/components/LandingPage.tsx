import { useEffect, useState } from 'react';

interface Props {
  onStart: () => void;
  onViewHistory: () => void;
}

const FEATURES = [
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
      </svg>
    ),
    title: 'ANR Deep Analysis',
    desc: '18 ANR case types \u2014 deadlock, binder timeout, IO on main thread, and more. Lock graph visualization with automatic vendor HAL target identification.',
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    border: 'border-red-500/20',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
    title: 'Health Score',
    desc: '4-dimension scoring: Stability, Memory, Responsiveness, Kernel. Frequency-decay mechanism prevents repeated events from flooding the score.',
    color: 'text-emerald-400',
    bg: 'bg-emerald-500/10',
    border: 'border-emerald-500/20',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
      </svg>
    ),
    title: 'Full-text Search & AI Chat',
    desc: 'FTS5 instant search across logcat and kernel entries. LLM follow-up dialogue with Ollama, OpenAI, Gemini, or Anthropic.',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/20',
  },
  {
    icon: (
      <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
      </svg>
    ),
    title: 'Power Management',
    desc: 'Deep Doze discharge rate, kernel wakelocks, alarm wakeups, suspend stats. Doze settings diff against AOSP defaults.',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/20',
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
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-purple-600/[.12] rounded-full blur-3xl" />
      </div>

      {/* Hero */}
      <div className={`text-center space-y-4 mb-14 relative transition-all duration-700 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight">
          <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-indigo-400 bg-clip-text text-transparent">
            Logcat AI
          </span>
        </h1>
        <p className="text-lg text-gray-400 max-w-xl mx-auto leading-relaxed">
          AI-powered <span className="text-gray-300 font-medium">bugreport.zip</span> analyzer for Android BSP engineers
        </p>
        <div className={`flex items-center justify-center gap-3 pt-6 transition-all duration-700 delay-200 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <button
            onClick={onStart}
            className="px-7 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-semibold transition-all hover:shadow-lg hover:shadow-indigo-500/25 active:scale-[0.98]"
          >
            Start Analyzing
          </button>
          <button
            onClick={onViewHistory}
            className="px-7 py-3 border border-gray-700 text-gray-400 hover:text-gray-200 hover:border-gray-500 hover:bg-white/5 rounded-xl font-medium transition-all"
          >
            View History
          </button>
        </div>
      </div>

      {/* Feature Cards */}
      <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 max-w-3xl w-full mb-14 relative transition-all duration-700 delay-300 ease-out ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}>
        {FEATURES.map((f, i) => (
          <div
            key={f.title}
            className={`${f.bg} border ${f.border} rounded-xl p-5 space-y-2 transition-all duration-500 hover:scale-[1.02] hover:shadow-lg`}
            style={{ transitionDelay: mounted ? `${400 + i * 80}ms` : '0ms' }}
          >
            <div className="flex items-center gap-3">
              <span className={f.color}>{f.icon}</span>
              <h3 className="font-semibold text-gray-100">{f.title}</h3>
            </div>
            <p className="text-sm text-gray-300/80 leading-relaxed">{f.desc}</p>
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
