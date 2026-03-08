import { useState, useRef, useEffect } from 'react';
import { downloadExport } from '../lib/api';

interface Props {
  uploadId: string;
  hasPowerData?: boolean;
}

export default function ExportMenu({ uploadId, hasPowerData }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className={`px-3 py-1.5 text-sm border rounded-lg transition-colors ${
          open ? 'border-indigo-500/50 ring-1 ring-indigo-500/30 bg-indigo-500/5 text-indigo-400' : 'border-indigo-500/50 text-indigo-400 hover:bg-indigo-500/10'
        }`}
      >
        Export
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-44 bg-surface border border-border rounded-lg shadow-xl z-10 animate-in fade-in duration-150">
          <button
            onClick={() => { downloadExport(uploadId, 'json'); setOpen(false); }}
            className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-hover rounded-t-lg transition-colors"
          >
            Export as JSON
          </button>
          <button
            onClick={() => { downloadExport(uploadId, 'html'); setOpen(false); }}
            className={`w-full text-left px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors border-t border-border ${hasPowerData ? '' : 'rounded-b-lg'}`}
          >
            Export as HTML
          </button>
          {hasPowerData && (
            <button
              onClick={() => { downloadExport(uploadId, 'power-html'); setOpen(false); }}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-hover rounded-b-lg transition-colors border-t border-border text-indigo-400"
            >
              Power Report
            </button>
          )}
        </div>
      )}
    </div>
  );
}
