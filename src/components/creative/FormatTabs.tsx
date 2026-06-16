import type { CreativeFormat } from '../../creative/types.ts';

export type FormatFilter = 'all' | CreativeFormat;

const TABS: { id: FormatFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'ugc', label: 'UGC' },
  { id: 'egc', label: 'EGC' },
  { id: 'motion', label: 'Motion' },
  { id: 'static', label: 'Static' },
];

interface FormatTabsProps {
  value: FormatFilter;
  counts: Record<FormatFilter, number>;
  onChange: (value: FormatFilter) => void;
}

export function FormatTabs({ value, counts, onChange }: FormatTabsProps) {
  return (
    <div className="inline-flex items-center p-0.5 rounded-lg border border-border bg-surface">
      {TABS.map((tab) => {
        const active = value === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[12.5px] font-medium transition-colors ${
              active ? 'bg-surface-raised text-text shadow-sm' : 'text-text-tertiary hover:text-text-secondary'
            }`}
          >
            {tab.label}
            <span className={`text-[11px] tabular-nums ${active ? 'text-text-secondary' : 'text-text-tertiary'}`}>
              {counts[tab.id] ?? 0}
            </span>
          </button>
        );
      })}
    </div>
  );
}
