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
