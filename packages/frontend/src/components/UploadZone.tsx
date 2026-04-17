import { useState, useRef, useEffect, DragEvent } from 'react';
import { AnalysisMode, QUICK_TAGS, QuickTag } from '../lib/types';
import { fetchProviders } from '../lib/api';
import { IconCheck, IconUpload } from './Icons';

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
  const [hasLlm, setHasLlm] = useState<boolean | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchProviders()
      .then((data) => setHasLlm(data.providers.some((p) => p.available)))
      .catch(() => setHasLlm(false));
  }, []);

  const ACCEPTED_EXTENSIONS = ['.zip', '.txt', '.log'];

  const isAcceptedFile = (name: string) => {
    const ext = name.slice(name.lastIndexOf('.')).toLowerCase();
    return ACCEPTED_EXTENSIONS.includes(ext);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped && isAcceptedFile(dropped.name)) {
      setFile(dropped);
    }
  };

  const handleSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected && isAcceptedFile(selected.name)) setFile(selected);
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
      <div className="text-center space-y-3">
        <h1 className="font-display text-3xl">
          Logcat <span className="text-warm">AI</span>
        </h1>
        <p className="text-gray-400 font-light">AI-powered bugreport.zip analyzer for Android</p>
      </div>

      {/* Drop Zone */}
      <div
        className={`card border-2 border-dashed cursor-pointer text-center py-12 transition-all duration-300 ${
          dragging ? 'border-accent bg-accent/5 scale-[1.01] shadow-glow'
          : file ? 'border-accent/50 bg-accent/5'
          : 'border-border hover:border-gray-500 hover:bg-surface-hover/30'
        }`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".zip,.txt,.log"
          className="hidden"
          onChange={handleSelect}
        />
        {file ? (
          <div className="space-y-1">
            <IconCheck className="w-8 h-8 mx-auto text-green-400 mb-1" />
            <p className="text-lg font-medium text-gray-200">{file.name}</p>
            <p className="text-sm text-gray-400">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-4xl text-gray-500">
              <IconUpload className="w-12 h-12 mx-auto" />
            </div>
            <p className="text-gray-300">Drop bugreport.zip, logcat.txt, or dmesg.log here</p>
            <p className="text-xs text-gray-500">Max 200 MB</p>
          </div>
        )}
      </div>

      {/* Description */}
      <div className="space-y-2">
        <label className="text-sm text-gray-400">Problem description (optional)</label>
        <textarea
          className="w-full bg-surface-card border border-border rounded-xl p-3 text-sm text-gray-200 placeholder-gray-500 resize-none focus:outline-none focus:border-border-focus transition-colors"
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
              className={`px-3 py-1 text-sm rounded-full border transition-all duration-200 ${
                selectedTags.has(tag)
                  ? 'bg-accent border-accent text-white shadow-glow'
                  : 'bg-surface-card border-border text-gray-400 hover:border-gray-500 hover:text-gray-300'
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
          className={`flex-1 card text-center py-3.5 cursor-pointer transition-all duration-300 ${
            mode === 'quick'
              ? 'border-accent bg-accent/10 ring-1 ring-accent/30 shadow-glow'
              : 'border-border hover:bg-surface-hover opacity-60 hover:opacity-100'
          }`}
          onClick={() => setMode('quick')}
        >
          <div className={`font-medium ${mode === 'quick' ? 'text-accent-light' : ''}`}>Quick Analysis</div>
          <div className="text-xs text-gray-400 mt-1">Rule-based, &lt; 5s, no LLM</div>
        </button>
        <button
          className={`flex-1 card text-center py-3.5 transition-all duration-300 ${
            hasLlm === false
              ? 'border-border opacity-40 cursor-not-allowed'
              : mode === 'deep'
                ? 'border-accent bg-accent/10 ring-1 ring-accent/30 shadow-glow cursor-pointer'
                : 'border-border hover:bg-surface-hover opacity-60 hover:opacity-100 cursor-pointer'
          }`}
          onClick={() => { if (hasLlm !== false) setMode('deep'); }}
          title={hasLlm === false ? 'No LLM provider configured. Open LLM Settings to set up a provider.' : undefined}
        >
          <div className={`font-medium ${mode === 'deep' ? 'text-accent-light' : ''}`}>Deep Analysis</div>
          <div className="text-xs text-gray-400 mt-1">
            {hasLlm === false ? 'No LLM configured' : 'AI-powered, 30s-2min'}
          </div>
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-red-400 text-sm flex items-start gap-2">
          <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
          </svg>
          <span>{error}</span>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!file}
        className="w-full py-3.5 rounded-xl font-semibold transition-all duration-300 disabled:opacity-40 disabled:cursor-not-allowed bg-warm hover:bg-warm-dark text-surface hover:shadow-warm-glow active:scale-[0.99]"
      >
        {file ? `Analyze ${file.name}` : 'Select a file to analyze'}
      </button>
    </div>
  );
}
