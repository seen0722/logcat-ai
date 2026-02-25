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
    <nav className="fixed right-4 top-1/2 -translate-y-1/2 z-40 hidden xl:block">
      <div className="bg-surface-card/90 backdrop-blur border border-border rounded-lg shadow-lg">
        {/* Toggle button */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full px-2 py-1.5 text-[10px] text-gray-500 hover:text-gray-300 transition-colors border-b border-border flex items-center justify-center gap-1"
          title={collapsed ? 'Expand navigation' : 'Collapse navigation'}
        >
          {collapsed ? '>' : 'NAV'}
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
  );
}
