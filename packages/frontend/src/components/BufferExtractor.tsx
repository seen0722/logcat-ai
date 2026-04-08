import { useState, useCallback } from 'react';
import JSZip from 'jszip';
import { downloadBlob } from '../lib/export-utils';

interface BufferSection {
  name: string;
  buffer: string;
  size: number;
  content: string;
}

const BUFFER_MAP: Record<string, string> = {
  'SYSTEM LOG': 'system',
  'MAIN LOG': 'main',
  'EVENT LOG': 'events',
  'CRASH LOG': 'crash',
  'RADIO LOG': 'radio',
  'KERNEL LOG': 'kernel',
};

function extractBuffers(content: string): BufferSection[] {
  const sections: BufferSection[] = [];
  // Collect all section headers with their position (start of header line)
  const headers: { name: string; headerStart: number; contentStart: number }[] = [];

  const re = /^------\s+(.+?)\s+\((.+?)\)\s+------$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    headers.push({ name: m[1], headerStart: m.index, contentStart: m.index + m[0].length });
  }

  for (let i = 0; i < headers.length; i++) {
    const name = headers[i].name;
    const start = headers[i].contentStart;
    // Content ends where the next header line begins
    const end = i + 1 < headers.length ? headers[i + 1].headerStart : content.length;
    const sectionContent = content.slice(start, end).trim();

    // Check if this is a duration-only line (e.g. "0.031s was the duration of 'STATS LOG'")
    if (sectionContent.length < 100 && /was the duration/.test(sectionContent)) continue;
    if (sectionContent.length === 0) continue;

    const bufferKey = Object.keys(BUFFER_MAP).find((k) => name.toUpperCase().includes(k));
    if (bufferKey) {
      sections.push({
        name,
        buffer: BUFFER_MAP[bufferKey],
        size: sectionContent.length,
        content: sectionContent,
      });
    }
  }

  const merged = new Map<string, BufferSection>();
  for (const s of sections) {
    const existing = merged.get(s.buffer);
    if (existing) {
      existing.content += '\n' + s.content;
      existing.size = existing.content.length;
    } else {
      merged.set(s.buffer, { ...s });
    }
  }

  const result = Array.from(merged.values());

  // Build "all" = all logcat buffers merged (excluding kernel), sorted by timestamp
  const logcatBuffers = result.filter((s) => s.buffer !== 'kernel');
  if (logcatBuffers.length > 1) {
    // Merge all logcat lines and sort by timestamp (MM-DD HH:mm:ss.SSS)
    const allLines: string[] = [];
    for (const buf of logcatBuffers) {
      for (const line of buf.content.split('\n')) {
        // Skip "beginning of" markers
        if (line.startsWith('---------')) continue;
        if (line.trim()) allLines.push(line);
      }
    }
    allLines.sort((a, b) => {
      const ta = a.slice(0, 18);
      const tb = b.slice(0, 18);
      return ta < tb ? -1 : ta > tb ? 1 : 0;
    });
    const allContent = allLines.join('\n');
    result.unshift({
      name: 'All Logcat Buffers',
      buffer: 'all',
      size: allContent.length,
      content: allContent,
    });
  }

  return result;
}

interface Props {
  onClose: () => void;
}

export default function BufferExtractor({ onClose }: Props) {
  const [sections, setSections] = useState<BufferSection[]>([]);
  const [filename, setFilename] = useState('');
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState('');

  const handleFile = useCallback(async (file: File) => {
    setError('');
    setParsing(true);
    setSections([]);
    setFilename(file.name);

    try {
      if (file.name.endsWith('.zip')) {
        const zip = await JSZip.loadAsync(file);
        let bugreportContent = '';
        for (const [name, zipEntry] of Object.entries(zip.files)) {
          if (name.includes('bugreport') && name.endsWith('.txt') && !zipEntry.dir) {
            bugreportContent = await zipEntry.async('string');
            break;
          }
        }
        if (!bugreportContent) {
          for (const [name, zipEntry] of Object.entries(zip.files)) {
            if (name.endsWith('.txt') && !zipEntry.dir) {
              const txt = await zipEntry.async('string');
              if (txt.includes('------') && txt.includes('LOG')) {
                bugreportContent = txt;
                break;
              }
            }
          }
        }
        if (!bugreportContent) {
          setError('No bugreport text file found in ZIP');
          setParsing(false);
          return;
        }
        setSections(extractBuffers(bugreportContent));
      } else {
        const content = await file.text();
        setSections(extractBuffers(content));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse file');
    } finally {
      setParsing(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleDownload = (section: BufferSection) => {
    const base = filename.replace(/\.zip$/i, '').replace(/\.txt$/i, '');
    downloadBlob(section.content, `${base}-${section.buffer}.txt`, 'text/plain;charset=utf-8');
  };

  const handleDownloadAll = () => {
    for (const s of sections) handleDownload(s);
  };

  function formatSize(bytes: number): string {
    if (bytes > 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    if (bytes > 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${bytes} B`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-surface border border-border rounded-2xl shadow-2xl w-full max-w-lg mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Extract Log Buffers</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-300 text-xl leading-none">&times;</button>
        </div>

        {sections.length === 0 && (
          <div
            onDrop={handleDrop}
            onDragOver={(e) => e.preventDefault()}
            className="border-2 border-dashed border-border rounded-xl p-8 text-center cursor-pointer hover:border-accent/50 transition-colors"
            onClick={() => {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = '.zip,.txt,.log';
              input.onchange = (e) => {
                const file = (e.target as HTMLInputElement).files?.[0];
                if (file) handleFile(file);
              };
              input.click();
            }}
          >
            {parsing ? (
              <div className="flex items-center justify-center gap-2 text-accent">
                <span className="w-4 h-4 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                Parsing {filename}...
              </div>
            ) : (
              <>
                <p className="text-gray-400">Drop bugreport.zip here or click to select</p>
                <p className="text-xs text-gray-600 mt-1">Extracts logcat/kernel buffers as .txt files — runs entirely in browser</p>
              </>
            )}
          </div>
        )}

        {error && <p className="text-sm text-red-400 mt-3">{error}</p>}

        {sections.length > 0 && (
          <div className="mt-2">
            <p className="text-xs text-gray-500 mb-3">{filename} — {sections.length} buffers found</p>
            <div className="space-y-1.5">
              {sections.map((s) => (
                <button
                  key={s.buffer}
                  onClick={() => handleDownload(s)}
                  className="w-full flex items-center justify-between px-4 py-2.5 bg-surface-hover hover:bg-accent/10 rounded-lg transition-colors group"
                >
                  <span className="font-mono text-sm">{s.buffer}</span>
                  <span className="text-xs text-gray-500 group-hover:text-accent transition-colors">
                    {formatSize(s.size)}
                  </span>
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleDownloadAll}
                className="flex-1 py-2 text-sm font-medium text-accent border border-accent/30 rounded-lg hover:bg-accent/10 transition-colors"
              >
                Download All
              </button>
              <button
                onClick={() => { setSections([]); setFilename(''); }}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-300 transition-colors"
              >
                Reset
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
