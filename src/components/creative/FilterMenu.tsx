import { useMemo, useState } from 'react';
import { Popover } from './Popover.tsx';
import { IconCheck, IconFilter, IconSearch } from './icons.tsx';

export interface FilterState {
  campaigns: Set<string>;
  adsets: Set<string>;
}

interface FilterMenuProps {
  campaigns: string[];
  adsets: string[];
  value: FilterState;
  onChange: (next: FilterState) => void;
  /** Optional default-on exclusion toggle (e.g. hide noisy Meta campaigns). */
  defaultExclusion?: { label: string; active: boolean; onToggle: () => void };
}

type Tab = 'campaign' | 'adset';

/**
 * Multi-select filter for scoping the dataset to specific campaigns and/or ad
 * sets. Each facet is an OR within itself; the two facets are AND'd together.
 * (Ad-name filtering is handled by the toolbar search box.)
 */
export function FilterMenu({ campaigns, adsets, value, onChange, defaultExclusion }: FilterMenuProps) {
  const [tab, setTab] = useState<Tab>('campaign');
  const [query, setQuery] = useState('');

  const active = value.campaigns.size + value.adsets.size;
  const options = tab === 'campaign' ? campaigns : adsets;
  const selected = tab === 'campaign' ? value.campaigns : value.adsets;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
    return list.slice(0, 300);
  }, [options, query]);

  const toggle = (name: string) => {
    const next: FilterState = {
      campaigns: new Set(value.campaigns),
      adsets: new Set(value.adsets),
    };
    const target = tab === 'campaign' ? next.campaigns : next.adsets;
    if (target.has(name)) target.delete(name);
    else target.add(name);
    onChange(next);
  };

  return (
    <Popover
      label={
        <span className="inline-flex items-center gap-1.5">
          <IconFilter className="w-3.5 h-3.5 text-text-tertiary" />
          Filter
          {active > 0 && (
            <span className="ml-0.5 inline-grid place-items-center min-w-[16px] h-4 px-1 rounded-full bg-accent text-[10px] font-bold text-white tabular-nums">
              {active}
            </span>
          )}
        </span>
      }
      panelClassName="w-72"
    >
      {() => (
        <div>
          {defaultExclusion && (
            <button
              type="button"
              onClick={defaultExclusion.onToggle}
              className="w-full flex items-center gap-2 text-left px-2 py-1.5 mb-1 rounded-md border border-border-subtle bg-surface text-[12px] text-text-secondary hover:bg-surface-hover hover:text-text transition-colors"
            >
              <span
                className={`shrink-0 w-4 h-4 grid place-items-center rounded border ${
                  defaultExclusion.active ? 'bg-accent border-accent text-white' : 'border-border bg-surface'
                }`}
              >
                {defaultExclusion.active && <IconCheck className="w-3 h-3" />}
              </span>
              <span className="truncate">{defaultExclusion.label}</span>
            </button>
          )}
          <div className="flex items-center gap-1 p-0.5 mb-1 rounded-md bg-surface border border-border-subtle">
            {(
              [
                { id: 'campaign', label: 'Campaigns', n: value.campaigns.size },
                { id: 'adset', label: 'Ad sets', n: value.adsets.size },
              ] as { id: Tab; label: string; n: number }[]
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  setTab(t.id);
                  setQuery('');
                }}
                className={`flex-1 inline-flex items-center justify-center gap-1 h-7 rounded text-[12px] font-medium transition-colors ${
                  tab === t.id ? 'bg-surface-raised text-text' : 'text-text-tertiary hover:text-text-secondary'
                }`}
              >
                {t.label}
                {t.n > 0 && <span className="text-accent-hover tabular-nums">{t.n}</span>}
              </button>
            ))}
          </div>

          <div className="relative mb-1">
            <IconSearch className="w-3.5 h-3.5 text-text-tertiary absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`Search ${tab === 'campaign' ? 'campaigns' : 'ad sets'}…`}
              className="h-8 w-full pl-8 pr-2.5 rounded-md border border-border bg-surface text-[12.5px] text-text placeholder:text-text-tertiary focus:outline-none focus:border-accent-muted"
            />
          </div>

          <div className="max-h-[16rem] overflow-y-auto -mx-0.5 px-0.5">
            {filtered.length === 0 ? (
              <div className="px-2.5 py-3 text-[12px] text-text-tertiary text-center">No matches</div>
            ) : (
              filtered.map((name) => {
                const on = selected.has(name);
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => toggle(name)}
                    className="w-full flex items-center gap-2 text-left px-2 py-1.5 rounded-md text-[12.5px] text-text-secondary hover:bg-surface-hover hover:text-text transition-colors"
                  >
                    <span
                      className={`shrink-0 w-4 h-4 grid place-items-center rounded border ${
                        on ? 'bg-accent border-accent text-white' : 'border-border bg-surface'
                      }`}
                    >
                      {on && <IconCheck className="w-3 h-3" />}
                    </span>
                    <span className="truncate" title={name}>
                      {name}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {active > 0 && (
            <div className="mt-1 pt-1 border-t border-border-subtle">
              <button
                type="button"
                onClick={() => onChange({ campaigns: new Set(), adsets: new Set() })}
                className="w-full text-left px-2.5 py-1.5 rounded-md text-[12px] text-text-tertiary hover:bg-surface-hover hover:text-text"
              >
                Clear all filters ({active})
              </button>
            </div>
          )}
        </div>
      )}
    </Popover>
  );
}
