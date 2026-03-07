import { useState, useEffect } from 'react';

interface Section {
  id: string;
  label: string;
  icon: string;
}

interface Props {
  sections: Section[];
}

export default function SectionNav({ sections }: Props) {
  const [activeId, setActiveId] = useState<string>('');
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        // Find the first section that is intersecting from top
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: '-80px 0px -60% 0px', threshold: 0.1 },
    );

    for (const s of sections) {
      const el = document.getElementById(s.id);
      if (el) observer.observe(el);
    }

    return () => observer.disconnect();
  }, [sections]);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <>
      {/* Desktop: floating right-side nav (xl+) */}
      <nav className="fixed right-4 top-1/2 -translate-y-1/2 z-40 hidden xl:block">
        <div className="bg-surface-card/90 backdrop-blur border border-border rounded-lg shadow-lg">
          {/* Toggle button */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full px-2 py-1.5 text-gray-500 hover:text-gray-300 transition-colors border-b border-border flex items-center justify-center"
            title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
          >
            <svg className={`w-3.5 h-3.5 transition-transform ${collapsed ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>

          <div className="py-1">
            {sections.map((s) => {
              const isActive = activeId === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => scrollTo(s.id)}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-xs transition-colors ${
                    isActive
                      ? 'text-indigo-400 bg-indigo-500/10'
                      : 'text-gray-500 hover:text-gray-300 hover:bg-surface-hover'
                  }`}
                  title={s.label}
                >
                  <span className="w-4 text-center shrink-0">{s.icon}</span>
                  {!collapsed && <span className="truncate">{s.label}</span>}
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Medium screens: bottom bar (md to xl) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 hidden md:flex xl:hidden bg-surface-card/95 backdrop-blur border-t border-border shadow-lg">
        <div className="flex items-center justify-center gap-1 px-4 py-1.5 mx-auto overflow-x-auto scrollbar-hide">
          {sections.map((s) => {
            const isActive = activeId === s.id;
            return (
              <button
                key={s.id}
                onClick={() => scrollTo(s.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs whitespace-nowrap transition-colors relative ${
                  isActive
                    ? 'text-indigo-400'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                <span className="text-sm">{s.icon}</span>
                <span>{s.label}</span>
                {isActive && (
                  <span className="absolute bottom-0 left-2 right-2 h-0.5 bg-indigo-400 rounded-full" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
}
