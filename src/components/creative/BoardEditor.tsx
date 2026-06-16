import { useMemo, useState } from 'react';
import { BOARD_ICON_CHOICES, type Board, type IconName } from '../../creative/boards.ts';
import { GROUP_DIMENSIONS } from '../../creative/aggregate.ts';
import { METRIC_BY_ID } from '../../creative/metrics.ts';
import type { CreativeFormat } from '../../creative/types.ts';
import { newBoardId } from '../../creative/customBoards.ts';
import { BoardIcon, IconClose } from './icons.tsx';
import { MetricBar } from './MetricBar.tsx';
import { FilterMenu, type FilterState } from './FilterMenu.tsx';

interface BoardEditorProps {
  /** Board being edited, or null to create a new one. */
  initial: Board | null;
  campaigns: string[];
  adsets: string[];
  onSave: (board: Board) => void;
  onDelete?: (id: string) => void;
  onClose: () => void;
}

const FORMAT_OPTIONS: { id: CreativeFormat; label: string }[] = [
  { id: 'ugc', label: 'UGC' },
  { id: 'egc', label: 'EGC' },
  { id: 'static', label: 'Static' },
  { id: 'motion', label: 'Motion' },
];

const ALL_FORMATS: CreativeFormat[] = ['ugc', 'egc', 'static', 'motion'];

function defaults(): Board {
  return {
    id: newBoardId(),
    label: '',
    description: '',
    icon: 'star',
    groupBy: 'creative',
    metricIds: ['spend', 'roas', 'cpa', 'ctr'],
    formats: 'all',
    sortMetricId: 'spend',
    sortDir: 'desc',
    minSpend: 0,
    custom: true,
    filters: { campaigns: [], adsets: [] },
  };
}

export function BoardEditor({ initial, campaigns, adsets, onSave, onDelete, onClose }: BoardEditorProps) {
  const seed = initial ?? defaults();
  const [label, setLabel] = useState(seed.label);
  const [description, setDescription] = useState(seed.description);
  const [icon, setIcon] = useState<IconName>(seed.icon);
  const [groupBy, setGroupBy] = useState(seed.groupBy);
  const [metricIds, setMetricIds] = useState<string[]>(seed.metricIds);
  const [formatSet, setFormatSet] = useState<Set<CreativeFormat>>(
    () => new Set(seed.formats === 'all' ? ALL_FORMATS : seed.formats),
  );
  const [sortMetricId, setSortMetricId] = useState(seed.sortMetricId);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(seed.sortDir);
  const [minSpend, setMinSpend] = useState(String(seed.minSpend ?? 0));
  const [filters, setFilters] = useState<FilterState>({
    campaigns: new Set(seed.filters?.campaigns ?? []),
    adsets: new Set(seed.filters?.adsets ?? []),
  });

  // Sort metric must be one of the visible metrics.
  const sortChoices = metricIds.filter((id) => METRIC_BY_ID[id]);
  const effectiveSort = sortChoices.includes(sortMetricId) ? sortMetricId : sortChoices[0] ?? 'spend';

  const valid = label.trim().length > 0 && metricIds.length > 0;
  const activeFilters = filters.campaigns.size + filters.adsets.size;

  const formatLabel = useMemo(() => {
    if (formatSet.size === 0 || formatSet.size === ALL_FORMATS.length) return 'All formats';
    return FORMAT_OPTIONS.filter((f) => formatSet.has(f.id)).map((f) => f.label).join(', ');
  }, [formatSet]);

  const toggleFormat = (id: CreativeFormat) => {
    setFormatSet((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size > 1) next.delete(id); // never empty
      } else next.add(id);
      return next;
    });
  };

  const save = () => {
    if (!valid) return;
    const formats: Board['formats'] =
      formatSet.size === ALL_FORMATS.length ? 'all' : ALL_FORMATS.filter((f) => formatSet.has(f));
    onSave({
      id: seed.id,
      label: label.trim(),
      description: description.trim() || 'Custom board',
      icon,
      groupBy,
      metricIds,
      formats,
      sortMetricId: effectiveSort,
      sortDir,
      minSpend: Math.max(0, Number(minSpend) || 0),
      custom: true,
      filters: { campaigns: [...filters.campaigns], adsets: [...filters.adsets] },
    });
  };

  const fieldLabel = 'block text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5';
  const inputCls =
    'w-full h-9 px-2.5 rounded-md bg-surface border border-border text-[13px] text-text placeholder:text-text-tertiary focus:outline-none focus:border-accent-muted';

  return (
    <div className="fixed inset-0 z-50 grid place-items-center p-4" role="dialog" aria-modal="true">
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl border border-border bg-surface-raised shadow-2xl shadow-black/50">
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3.5 border-b border-border-subtle bg-surface-raised">
          <h2 className="text-[15px] font-bold text-text">{initial ? 'Edit board' : 'New board'}</h2>
          <button type="button" onClick={onClose} className="w-7 h-7 grid place-items-center rounded-md text-text-tertiary hover:text-text hover:bg-surface-hover">
            <IconClose className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Name + icon */}
          <div>
            <label className={fieldLabel}>Name</label>
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="e.g. Top UGC this month"
                className={inputCls}
              />
            </div>
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              {BOARD_ICON_CHOICES.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => setIcon(name)}
                  className={`w-8 h-8 grid place-items-center rounded-md border transition-colors ${
                    icon === name ? 'border-accent bg-accent-muted text-accent-hover' : 'border-border text-text-tertiary hover:text-text hover:bg-surface-hover'
                  }`}
                  aria-label={name}
                >
                  <BoardIcon name={name} className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={fieldLabel}>Description (optional)</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short note shown under the title"
              className={inputCls}
            />
          </div>

          {/* Group by */}
          <div>
            <label className={fieldLabel}>Group by</label>
            <div className="flex flex-wrap gap-1.5">
              {GROUP_DIMENSIONS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => setGroupBy(d.id)}
                  className={`h-8 px-2.5 rounded-md border text-[12.5px] font-medium transition-colors ${
                    groupBy === d.id ? 'border-accent bg-accent-muted text-text' : 'border-border text-text-secondary hover:bg-surface-hover hover:text-text'
                  }`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          {/* Metrics */}
          <div>
            <label className={fieldLabel}>Metrics</label>
            <MetricBar selected={metricIds} onChange={setMetricIds} />
          </div>

          {/* Sort + min spend */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={fieldLabel}>Sort by</label>
              <div className="flex gap-1.5">
                <select value={effectiveSort} onChange={(e) => setSortMetricId(e.target.value)} className={`${inputCls} flex-1`}>
                  {sortChoices.map((id) => (
                    <option key={id} value={id}>
                      {METRIC_BY_ID[id]?.label ?? id}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
                  className="h-9 px-2.5 rounded-md border border-border bg-surface text-[12.5px] font-medium text-text-secondary hover:text-text hover:bg-surface-hover whitespace-nowrap"
                  title="Toggle direction"
                >
                  {sortDir === 'desc' ? 'High → Low' : 'Low → High'}
                </button>
              </div>
            </div>
            <div>
              <label className={fieldLabel}>Min spend</label>
              <input
                type="number"
                min={0}
                value={minSpend}
                onChange={(e) => setMinSpend(e.target.value)}
                className={inputCls}
              />
            </div>
          </div>

          {/* Formats + filters */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={fieldLabel}>Formats</label>
              <div className="flex gap-1.5">
                {FORMAT_OPTIONS.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => toggleFormat(f.id)}
                    className={`h-9 flex-1 rounded-md border text-[12.5px] font-medium transition-colors ${
                      formatSet.has(f.id) ? 'border-accent bg-accent-muted text-text' : 'border-border text-text-tertiary hover:bg-surface-hover hover:text-text'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
              <div className="mt-1 text-[10.5px] text-text-tertiary">{formatLabel}</div>
            </div>
            <div>
              <label className={fieldLabel}>Default filters</label>
              <FilterMenu campaigns={campaigns} adsets={adsets} value={filters} onChange={setFilters} />
              <div className="mt-1 text-[10.5px] text-text-tertiary">
                {activeFilters > 0 ? `${activeFilters} filter${activeFilters === 1 ? '' : 's'} applied on open` : 'None'}
              </div>
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 flex items-center justify-between px-5 py-3.5 border-t border-border-subtle bg-surface-raised">
          <div>
            {initial && onDelete && (
              <button
                type="button"
                onClick={() => onDelete(initial.id)}
                className="h-9 px-3 rounded-md text-[12.5px] font-medium text-loss-pill-text hover:bg-loss-pill-bg/40 transition-colors"
              >
                Delete board
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="h-9 px-3.5 rounded-md border border-border bg-surface text-[12.5px] font-medium text-text-secondary hover:text-text hover:bg-surface-hover">
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={!valid}
              className={`h-9 px-4 rounded-md text-[12.5px] font-semibold transition-colors ${
                valid ? 'bg-accent text-white hover:bg-accent-hover' : 'bg-surface text-text-tertiary cursor-not-allowed border border-border'
              }`}
            >
              {initial ? 'Save changes' : 'Create board'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
