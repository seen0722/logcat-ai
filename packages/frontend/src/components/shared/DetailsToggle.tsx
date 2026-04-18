import { IconChevronDown } from '../Icons';

interface DetailsToggleProps {
  expanded: boolean;
  onToggle: () => void;
  sectionCount?: number;
  expandLabel?: string;
  collapseLabel?: string;
}

export default function DetailsToggle({
  expanded,
  onToggle,
  sectionCount,
  expandLabel,
  collapseLabel,
}: DetailsToggleProps) {
  const showLabel = expandLabel
    ?? (sectionCount ? `Show details (${sectionCount} sections)` : 'Show details');
  const hideLabel = collapseLabel ?? 'Hide details';

  return (
    <div className="flex justify-center">
      <button
        onClick={onToggle}
        aria-expanded={expanded}
        className="inline-flex items-center gap-1.5 text-xs text-accent hover:text-accent-light transition-colors"
      >
        <IconChevronDown className={`w-3 h-3 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
        {expanded ? hideLabel : showLabel}
      </button>
    </div>
  );
}
