import React, { type ReactNode } from 'react';

interface MetricCardProps {
  label: string;
  value: ReactNode;
  sub?: string;
  color?: string;
  icon: ReactNode;
  highlight?: boolean;
}

function MetricCardInner({ label, value, sub, color, icon, highlight }: MetricCardProps) {
  return (
    <div className={`bg-surface rounded-xl p-4 space-y-1 border ${highlight ? 'border-red-500/30' : 'border-border/50'}`}>
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-2xl font-display tracking-tight leading-none ${color || 'text-gray-200'}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-600">{sub}</div>}
    </div>
  );
}

export default React.memo(MetricCardInner);
