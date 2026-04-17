import type { ReactNode } from 'react';

interface PowerMetricCardProps {
  label: string;
  value: string;
  sub?: string;
  color?: string;
  icon: ReactNode;
}

export default function PowerMetricCard({ label, value, sub, color, icon }: PowerMetricCardProps) {
  return (
    <div className="bg-surface rounded-xl p-4 space-y-1 border border-border/50">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</span>
      </div>
      <div className={`text-xl font-bold ${color || 'text-gray-200'}`}>{value}</div>
      {sub && <div className="text-[10px] text-gray-600">{sub}</div>}
    </div>
  );
}
