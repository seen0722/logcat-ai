import { useState, useRef, DragEvent } from 'react';
import { AnalysisMode, QUICK_TAGS, QuickTag } from '../lib/types';

interface Props {
  onStart: (file: File, mode: AnalysisMode, description?: string) => void;
  error: string | null;
}

export default function UploadZone({ onStart, error }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState('');
  const [selectedTags, setSelectedTags] = useState<Set<QuickTag>>(new Set());
  const [mode, setMode] = useState<AnalysisMode>('quick');
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped?.name.endsWith('.zip')) {
      setFile(dropped);
    }
  };

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected && selected.name.endsWith('.zip')) setFile(selected);
  };

  const toggleTag = (tag: QuickTag) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      next.has(tag) ? next.delete(tag) : next.add(tag);
      return next;
    });
  };

  const handleSubmit = () => {
    if (!file) return;
    const tags = [...selectedTags].join(', ');
    const fullDesc = [description, tags ? `Tags: ${tags}` : ''].filter(Boolean).join('\n');
    onStart(file, mode, fullDesc || undefined);
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold">Logcat AI</h1>
        <p className="text-gray-400">AI-powered bugreport.zip analyzer for Android</p>
      </div>

      {/* Drop Zone */}
      <div
        className={`card border-2 border-dashed cursor-pointer text-center py-12 transition-colors ${
          dragging ? 'border-indigo-500 bg-indigo-500/5' : 'border-border hover:border-gray-500'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          onChange={handleSelect}
        />
        {file ? (
          <div className="space-y-1">
            <p className="text-lg font-medium text-white">{file.name}</p>
            <p className="text-sm text-gray-400">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-4xl text-gray-500">
              <svg className="w-12 h-12 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
            </div>
            <p className="text-gray-300">Drop bugreport.zip here or click to browse</p>
            <p className="text-xs text-gray-500">Max 200 MB</p>
          </div>
        )}
      </div>

      {/* Description */}
      <div className="space-y-2">
        <label className="text-sm text-gray-400">Problem description (optional)</label>
        <textarea
          className="w-full bg-surface-card border border-border rounded-lg p-3 text-sm text-gray-200 placeholder-gray-500 resize-none focus:outline-none focus:border-border-focus"
          rows={3}
          placeholder="e.g. App freezes on launch after update..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>

      {/* Quick Tags */}
      <div className="space-y-2">
        <label className="text-sm text-gray-400">Quick tags (optional)</label>
        <div className="flex flex-wrap gap-2">
          {QUICK_TAGS.map((tag) => (
            <button
              key={tag}
              onClick={() => toggleTag(tag)}
              className={`px-3 py-1 text-sm rounded-full border transition-colors ${
                selectedTags.has(tag)
                  ? 'bg-indigo-600 border-indigo-500 text-white'
                  : 'bg-surface-card border-border text-gray-400 hover:border-gray-500'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Analysis Mode */}
      <div className="flex gap-3">
        <button
          className={`flex-1 card text-center py-3 cursor-pointer transition-colors ${
            mode === 'quick' ? 'border-indigo-500 bg-indigo-500/10' : 'hover:bg-surface-hover'
          }`}
          onClick={() => setMode('quick')}
        >
          <div className="font-medium">Quick Analysis</div>
          <div className="text-xs text-gray-400 mt-1">Rule-based, &lt; 5s, no LLM</div>
        </button>
        <button
          className={`flex-1 card text-center py-3 cursor-pointer transition-colors ${
            mode === 'deep' ? 'border-indigo-500 bg-indigo-500/10' : 'hover:bg-surface-hover'
          }`}
          onClick={() => setMode('deep')}
        >
          <div className="font-medium">Deep Analysis</div>
          <div className="text-xs text-gray-400 mt-1">AI-powered, 30s-2min</div>
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!file}
        className="w-full py-3 rounded-lg font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-indigo-600 hover:bg-indigo-700 text-white"
      >
        Analyze {file ? file.name : 'bugreport.zip'}
      </button>
    </div>
  );
}
