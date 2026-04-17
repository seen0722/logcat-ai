import { useState } from 'react';
import { Outlet, useNavigate } from 'react-router';
import { useAnalysisContext } from '../contexts/AnalysisContext';
import { useComparison } from '../hooks/useComparison';
import { useTheme } from '../hooks/useTheme';
import { IconSettings, IconMenu, IconLogoMark, IconSun, IconMoon } from '../components/Icons';
import ExportMenu from '../components/ExportMenu';
import HistoryPanel from '../components/HistoryPanel';
import SettingsPanel from '../components/SettingsPanel';
import { downloadExport } from '../lib/api';

export default function AppLayout() {
  const { uploadId, result, analyzing } = useAnalysisContext();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const { compare, loading: compareLoading, error: compareError, reset: resetComparison } = useComparison();

  const [showHeaderMenu, setShowHeaderMenu] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [compareMode, setCompareMode] = useState(false);

  const isResult = !!result && !analyzing;

  const handleNewAnalysis = () => {
    navigate('/');
  };

  const handleSearch = () => {
    if (uploadId) navigate(`/analysis/${uploadId}/search`);
  };

  const handleHistory = () => {
    setShowHistory(true);
  };

  const handleExportJson = () => {
    if (uploadId) downloadExport(uploadId, 'json');
  };

  return (
    <div className="min-h-screen p-6 md:p-10">
      {/* Header */}
      {!analyzing && (
        <div className="sticky top-0 z-30 -mx-6 md:-mx-10 px-6 md:px-10 py-3 mb-6 glass">
          <div className="flex items-center justify-between max-w-5xl mx-auto">
            <div className="flex items-center gap-3">
              <IconLogoMark size={28} />
              <h1 className="font-display text-xl">
                Logcat <span className="text-warm">AI</span>
              </h1>
              {isResult && result && (
                result.deepAnalysisOverview
                  ? <span className="text-[10px] font-semibold uppercase tracking-wider text-accent bg-accent/10 px-2 py-0.5 rounded border border-accent/20">AI Deep</span>
                  : <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-500 bg-surface px-2 py-0.5 rounded border border-border/50">Quick</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {uploadId && isResult && (
                <>
                  <button
                    onClick={() => setCompareMode(true)}
                    className="hidden sm:inline-flex btn-outline text-sm px-3 py-1.5"
                  >
                    Compare
                  </button>
                  <button
                    onClick={handleSearch}
                    className="hidden sm:inline-flex btn-outline text-sm px-3 py-1.5"
                  >
                    Search
                  </button>
                </>
              )}
              {uploadId && <span className="hidden sm:inline-flex"><ExportMenu uploadId={uploadId} hasPowerData={!!result?.powerStatus?.batteryStats} hasTelephonyData={!!result?.telephonyStatus?.serviceState} /></span>}
              <button
                onClick={toggleTheme}
                className="hidden sm:inline-flex btn-ghost text-sm px-3 py-1.5"
                title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              >
                {theme === 'dark' ? <IconSun className="w-4 h-4" /> : <IconMoon className="w-4 h-4" />}
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="hidden sm:inline-flex btn-ghost text-sm px-3 py-1.5"
                title="LLM Settings"
              >
                <IconSettings className="w-4 h-4" />
              </button>
              <button
                onClick={handleHistory}
                className="hidden sm:inline-flex btn-ghost text-sm px-3 py-1.5"
              >
                History
              </button>
              <button
                onClick={handleNewAnalysis}
                className="hidden sm:inline-flex btn-primary text-sm px-3 py-1.5"
              >
                New Analysis
              </button>
              {/* Mobile: overflow menu */}
              <div className="relative sm:hidden">
                <button
                  onClick={() => setShowHeaderMenu(!showHeaderMenu)}
                  className="btn-ghost px-2 py-1.5 text-sm"
                >
                  <IconMenu className="w-5 h-5" />
                </button>
                {showHeaderMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowHeaderMenu(false)} />
                    <div className="absolute right-0 top-full mt-1 z-50 w-44 glass rounded-xl shadow-elevated py-1.5">
                      {uploadId && isResult && (
                        <>
                          <button
                            onClick={() => { setShowHeaderMenu(false); setCompareMode(true); }}
                            className="w-full text-left px-4 py-2.5 text-sm text-accent hover:bg-surface-hover transition-colors"
                          >
                            Compare
                          </button>
                          <button
                            onClick={() => { setShowHeaderMenu(false); handleSearch(); }}
                            className="w-full text-left px-4 py-2.5 text-sm text-accent hover:bg-surface-hover transition-colors"
                          >
                            Search
                          </button>
                          <button
                            onClick={() => { setShowHeaderMenu(false); handleExportJson(); }}
                            className="w-full text-left px-4 py-2.5 text-sm text-accent hover:bg-surface-hover transition-colors border-b border-border"
                          >
                            Export
                          </button>
                        </>
                      )}
                      <button
                        onClick={() => { setShowHeaderMenu(false); toggleTheme(); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-surface-hover transition-colors"
                      >
                        {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                      </button>
                      <button
                        onClick={() => { setShowHeaderMenu(false); setShowSettings(true); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-surface-hover transition-colors"
                      >
                        Settings
                      </button>
                      <button
                        onClick={() => { setShowHeaderMenu(false); handleHistory(); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-surface-hover transition-colors"
                      >
                        History
                      </button>
                      <button
                        onClick={() => { setShowHeaderMenu(false); handleNewAnalysis(); }}
                        className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-surface-hover transition-colors"
                      >
                        New Analysis
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Child route content */}
      <Outlet />

      {/* Settings Panel */}
      {showSettings && (
        <SettingsPanel onClose={() => setShowSettings(false)} />
      )}

      {/* History Panel (normal mode) */}
      {showHistory && !compareMode && (
        <HistoryPanel
          onLoad={(id) => {
            setShowHistory(false);
            navigate(`/analysis/${id}`);
          }}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* Compare mode: select another analysis from history */}
      {compareMode && (
        <HistoryPanel
          excludeId={uploadId ?? undefined}
          onLoad={async (otherId) => {
            setCompareMode(false);
            if (uploadId) {
              await compare(uploadId, otherId);
              navigate(`/compare/${uploadId}/${otherId}`);
            }
          }}
          onClose={() => setCompareMode(false)}
        />
      )}

      {/* Comparison loading indicator */}
      {compareLoading && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center">
          <div className="glass rounded-xl px-8 py-6 text-center shadow-elevated">
            <div className="animate-spin w-8 h-8 border-2 border-accent border-t-transparent rounded-full mx-auto mb-3" />
            <p className="text-gray-300">Comparing analyses...</p>
          </div>
        </div>
      )}

      {/* Comparison error */}
      {compareError && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center" onClick={resetComparison}>
          <div className="glass rounded-xl px-8 py-6 text-center max-w-md border-red-900/50 shadow-elevated" onClick={(e) => e.stopPropagation()}>
            <p className="text-red-400 mb-4">{compareError}</p>
            <button
              onClick={() => { resetComparison(); if (uploadId) navigate(`/analysis/${uploadId}`); }}
              className="btn-ghost text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
