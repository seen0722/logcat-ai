import { useState, useMemo } from 'react';
import PowerOverview from './PowerOverview';
import TelephonyOverview from './TelephonyOverview';
import TagStats from './TagStats';
import type { PowerParseResult, TelephonyParseResult, TagStat } from '../lib/types';

interface Tab {
  key: string;
  label: string;
}

interface Props {
  powerStatus?: PowerParseResult;
  telephonyStatus?: TelephonyParseResult;
  tagStats?: TagStat[];
  onTagClick?: (tag: string) => void;
}

export default function SystemDetailsTabs({ powerStatus, telephonyStatus, tagStats, onTagClick }: Props) {
  const tabs = useMemo(() => {
    const t: Tab[] = [];
    if (powerStatus) t.push({ key: 'power', label: 'Power' });
    if (telephonyStatus) t.push({ key: 'telephony', label: 'Telephony' });
    if (tagStats && tagStats.length > 0) t.push({ key: 'tags', label: 'Log Tags' });
    return t;
  }, [powerStatus, telephonyStatus, tagStats]);

  const [activeTab, setActiveTab] = useState(() => tabs[0]?.key ?? 'power');

  if (tabs.length === 0) return null;

  // Ensure activeTab is valid if tabs change
  const currentTab = tabs.find(t => t.key === activeTab) ? activeTab : tabs[0].key;

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 mb-4 bg-surface rounded-xl p-1 border border-border/50">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
              currentTab === tab.key
                ? 'bg-surface-card text-gray-100 shadow-sm border border-border/50'
                : 'text-gray-400 hover:text-gray-200 hover:bg-surface-hover/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content — each wrapped with its section id for SectionNav */}
      {currentTab === 'power' && powerStatus && (
        <div id="section-power">
          <PowerOverview powerStatus={powerStatus} />
        </div>
      )}
      {currentTab === 'telephony' && telephonyStatus && (
        <div id="section-telephony">
          <TelephonyOverview telephonyStatus={telephonyStatus} powerStatus={powerStatus} />
        </div>
      )}
      {currentTab === 'tags' && tagStats && tagStats.length > 0 && (
        <div id="section-tags">
          <TagStats tagStats={tagStats} onTagClick={onTagClick} />
        </div>
      )}
    </div>
  );
}
