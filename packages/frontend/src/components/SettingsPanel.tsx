import { useState, useEffect, useCallback } from 'react';
import { fetchProviders, switchProvider } from '../lib/api';

interface ProviderInfo {
  type: string;
  available: boolean;
  model: string;
  error?: string;
}

interface Props {
  onClose: () => void;
}

const PROVIDER_LABELS: Record<string, string> = {
  ollama: 'Ollama',
  openai: 'OpenAI',
  gemini: 'Gemini',
  anthropic: 'Anthropic',
};

export default function SettingsPanel({ onClose }: Props) {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [active, setActive] = useState('');
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  // Form state for active provider config
  const [editModel, setEditModel] = useState('');
  const [editApiKey, setEditApiKey] = useState('');
  const [editBaseUrl, setEditBaseUrl] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');

  const loadProviders = useCallback(async () => {
    try {
      const data = await fetchProviders();
      setProviders(data.providers);
      setActive(data.active);
      // Populate form with active provider's current values
      const activeProv = data.providers.find((p) => p.type === data.active);
      if (activeProv) {
        setEditModel(activeProv.model || '');
        setEditApiKey('');
        setEditBaseUrl('');
      }
    } finally {
      setLoading(false);
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    loadProviders();
  }, [loadProviders]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  async function handleSelectProvider(type: string) {
    if (type === active) return;
    try {
      await switchProvider(type);
      setActive(type);
      const prov = providers.find((p) => p.type === type);
      setEditModel(prov?.model || '');
      setEditApiKey('');
      setEditBaseUrl('');
      setSaveMsg('');
      // Re-fetch to update status
      setChecking(true);
      await loadProviders();
    } catch {
      // ignore
    }
  }

  async function handleRefresh() {
    setChecking(true);
    await loadProviders();
  }

  async function handleSave() {
    setSaving(true);
    setSaveMsg('');
    try {
      const opts: { apiKey?: string; model?: string; baseUrl?: string } = {};
      if (editModel.trim()) opts.model = editModel.trim();
      if (editApiKey.trim()) opts.apiKey = editApiKey.trim();
      if (editBaseUrl.trim()) opts.baseUrl = editBaseUrl.trim();
      await switchProvider(active, opts);
      setSaveMsg('Saved');
      setChecking(true);
      await loadProviders();
    } catch {
      setSaveMsg('Save failed');
    } finally {
      setSaving(false);
    }
  }

  const needsApiKey = active !== 'ollama';

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex justify-end" onClick={onClose}>
      <div
        className="w-full max-w-lg bg-[#0d1117] border-l border-gray-700/60 h-full overflow-y-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700/60 shrink-0">
          <h2 className="text-lg font-semibold text-gray-100">LLM Settings</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={checking}
              className="text-gray-400 hover:text-white w-8 h-8 flex items-center justify-center rounded hover:bg-gray-700/50 transition-colors disabled:opacity-40"
              title="Refresh status"
            >
              <svg className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-white text-2xl leading-none w-8 h-8 flex items-center justify-center rounded hover:bg-gray-700/50 transition-colors"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full" />
            </div>
          ) : (
            <>
              {/* Provider Cards */}
              <div className="space-y-2">
                {providers.map((prov) => (
                  <div
                    key={prov.type}
                    onClick={() => handleSelectProvider(prov.type)}
                    className={`rounded-lg border p-4 cursor-pointer transition-colors ${
                      prov.type === active
                        ? 'border-indigo-500/60 bg-indigo-500/5'
                        : 'border-gray-700/60 bg-[#161b22] hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {/* Status indicator */}
                        {checking ? (
                          <div className="w-2.5 h-2.5 rounded-full border-2 border-gray-500 border-t-transparent animate-spin" />
                        ) : prov.available ? (
                          <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_6px_rgba(34,197,94,0.4)]" />
                        ) : (
                          <div className="w-2.5 h-2.5 rounded-full bg-red-500 shadow-[0_0_6px_rgba(239,68,68,0.4)]" />
                        )}
                        <span className="font-medium text-gray-100">
                          {PROVIDER_LABELS[prov.type] || prov.type}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {prov.model && (
                          <span className="text-xs text-gray-500">{prov.model}</span>
                        )}
                        {prov.type === active && (
                          <span className="text-xs bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full font-medium">
                            Active
                          </span>
                        )}
                      </div>
                    </div>
                    {!prov.available && prov.error && (
                      <p className="text-xs text-red-400/80 mt-2 ml-5.5">{prov.error}</p>
                    )}
                  </div>
                ))}
              </div>

              {/* Active Provider Configuration */}
              <div className="border border-gray-700/60 rounded-lg p-4 bg-[#161b22]">
                <h3 className="text-sm font-medium text-gray-300 mb-3">
                  Configure {PROVIDER_LABELS[active] || active}
                </h3>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Model</label>
                    <input
                      type="text"
                      value={editModel}
                      onChange={(e) => setEditModel(e.target.value)}
                      placeholder="e.g. gpt-4o, gemini-pro, llama3"
                      className="w-full bg-[#0d1117] border border-gray-700/60 rounded-md px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500/60"
                    />
                  </div>
                  {needsApiKey && (
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">API Key</label>
                      <input
                        type="password"
                        value={editApiKey}
                        onChange={(e) => setEditApiKey(e.target.value)}
                        placeholder="Leave empty to keep current key"
                        className="w-full bg-[#0d1117] border border-gray-700/60 rounded-md px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500/60"
                      />
                    </div>
                  )}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Base URL</label>
                    <input
                      type="text"
                      value={editBaseUrl}
                      onChange={(e) => setEditBaseUrl(e.target.value)}
                      placeholder={active === 'ollama' ? 'http://localhost:11434' : 'Leave empty for default'}
                      className="w-full bg-[#0d1117] border border-gray-700/60 rounded-md px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:border-indigo-500/60"
                    />
                  </div>
                  <div className="flex items-center gap-3 pt-1">
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="px-4 py-1.5 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded-md transition-colors disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                    {saveMsg && (
                      <span className={`text-xs ${saveMsg === 'Saved' ? 'text-green-400' : 'text-red-400'}`}>
                        {saveMsg}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
