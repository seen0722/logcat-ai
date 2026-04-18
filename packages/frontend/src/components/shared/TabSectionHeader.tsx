import React, { type ReactNode } from 'react';

interface TabSectionHeaderProps {
  title: string;
  gradient: string;
  borderColor: string;
  badges?: ReactNode;
  rightContent?: ReactNode;
  children?: ReactNode;
}

/**
 * Unified hero header for Power/Telephony/Tags tabs.
 * Provides consistent layout: gradient banner with title + badges (left) and key metric (right).
 * `children` renders below the header row (e.g., metric cards, banners).
 */
function TabSectionHeaderInner({ title, gradient, borderColor, badges, rightContent, children }: TabSectionHeaderProps) {
  return (
    <div className="card p-0 overflow-hidden">
      <div className={`bg-gradient-to-r ${gradient} border-b ${borderColor} p-5`}>
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-display text-lg text-gray-100 mb-1">{title}</h2>
            {badges && (
              <div className="flex flex-wrap items-center gap-2">
                {badges}
              </div>
            )}
          </div>
          {rightContent && (
            <div className="text-right shrink-0">
              {rightContent}
            </div>
          )}
        </div>
      </div>
      {children && (
        <div className="p-5 pt-4">
          {children}
        </div>
      )}
    </div>
  );
}

export default React.memo(TabSectionHeaderInner);
