import React from 'react';

type BadgeVariant = 'green' | 'amber' | 'red' | 'accent' | 'gray' | 'warm';

const variantStyles: Record<BadgeVariant, string> = {
  green: 'bg-green-500/10 text-green-400 border-green-500/20',
  amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
  red: 'bg-red-500/10 text-red-300 border-red-500/20',
  accent: 'bg-accent/10 text-accent border-accent/20',
  gray: 'bg-gray-500/10 text-gray-400 border-border',
  warm: 'bg-warm/10 text-warm border-warm/20',
};

interface StatusBadgeProps {
  children: React.ReactNode;
  variant: BadgeVariant;
}

function StatusBadgeInner({ children, variant }: StatusBadgeProps) {
  return (
    <span className={`inline-flex items-center px-2.5 py-1 text-xs font-medium rounded-lg border ${variantStyles[variant]}`}>
      {children}
    </span>
  );
}

export default React.memo(StatusBadgeInner);
