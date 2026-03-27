import { useState, useRef, useEffect } from 'react';
import { downloadExport } from '../lib/api';

interface Props {
  uploadId: string;
  hasPowerData?: boolean;
  hasTelephonyData?: boolean;
}

export default function ExportMenu({ uploadId, hasPowerData, hasTelephonyData }: Props) {
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
          open ? 'border-accent/50 ring-1 ring-accent/30 bg-accent/5 text-accent' : 'border-accent/50 text-accent hover:bg-accent/10'
        }`}
      >
        Export
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-48 bg-surface border border-border rounded-lg shadow-xl z-10 animate-in fade-in duration-150">
          <button
            onClick={() => { downloadExport(uploadId, 'html'); setOpen(false); }}
            className={`w-full text-left px-4 py-2.5 text-sm hover:bg-surface-hover rounded-t-lg transition-colors ${!hasPowerData && !hasTelephonyData ? 'rounded-b-lg' : ''}`}
          >
            Analysis Report
          </button>
          {hasPowerData && (
            <button
              onClick={() => { downloadExport(uploadId, 'power-html'); setOpen(false); }}
              className={`w-full text-left px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors border-t border-border ${!hasTelephonyData ? 'rounded-b-lg' : ''}`}
            >
              Power Report
            </button>
          )}
          {hasTelephonyData && (
            <button
              onClick={() => { downloadExport(uploadId, 'telephony-html'); setOpen(false); }}
              className="w-full text-left px-4 py-2.5 text-sm hover:bg-surface-hover transition-colors border-t border-border"
            >
              Telephony Report
            </button>
          )}
          <button
            onClick={() => { downloadExport(uploadId, 'json'); setOpen(false); }}
            className="w-full text-left px-4 py-2.5 text-xs text-gray-500 hover:bg-surface-hover rounded-b-lg transition-colors border-t border-border"
          >
            Raw JSON
          </button>
        </div>
      )}
    </div>
  );
}
