import { useMemo, useState } from 'react';
import { groupRows, type GroupDimension } from '../../creative/aggregate.ts';
import { formatMetric, metricValue, METRIC_BY_ID } from '../../creative/metrics.ts';
import { FORMAT_META, isVideoFormat } from '../../creative/format.ts';
import type { BaseMetrics, CreativeGroup } from '../../creative/types.ts';
import { IconClose, IconPlay } from './icons.tsx';

interface DrillInProps {
  group: CreativeGroup;
  metricIds: string[];
  currency: string;
  benchmark?: BaseMetrics;
  onClose: () => void;
}

type SplitDim = Extract<GroupDimension, 'campaign' | 'adset' | 'geo'>;

const SPLITS: { id: SplitDim; label: string }[] = [
  { id: 'campaign', label: 'Campaign' },
  { id: 'adset', label: 'Ad set' },
  { id: 'geo', label: 'Geo' },
];

export function DrillIn({ group, metricIds, currency, benchmark, onClose }: DrillInProps) {
  const hasGeo = group.geoCount > 0;
  const [split, setSplit] = useState<SplitDim>('campaign');

  const sub = useMemo(() => {
    const def = METRIC_BY_ID[metricIds[0]];
    const rows = groupRows(group.rows, split);
    rows.sort(
      (a, b) =>
        (def ? metricValue(def, b, benchmark) ?? 0 : 0) - (def ? metricValue(def, a, benchmark) ?? 0 : 0),
    );
    return rows;
  }, [group.rows, split, metricIds, benchmark]);

  const isVideo = isVideoFormat(group.format);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <aside className="relative w-full max-w-xl h-full bg-bg border-l border-border shadow-2xl shadow-black/50 flex flex-col">
        <div className="flex items-start gap-3 p-4 border-b border-border-subtle">
          <div className="relative w-16 h-16 rounded-lg overflow-hidden bg-black/40 shrink-0">
            {group.thumbnailUrl ? (
              <img src={group.thumbnailUrl} alt="" className="w-full h-full object-contain" />
            ) : null}
            {isVideo && (
              <span className="absolute inset-0 grid place-items-center">
                <IconPlay className="w-4 h-4 text-white/90" />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold text-text leading-snug" title={group.label}>
              {group.label}
            </div>
            <div className="text-[11.5px] text-text-tertiary mt-0.5">
              {FORMAT_META[group.format].label} · {group.adCount} ad{group.adCount === 1 ? '' : 's'} ·{' '}
              {group.campaignCount} campaign{group.campaignCount === 1 ? '' : 's'}
              {group.geoCount > 1 ? ` · ${group.geoCount} geos` : ''}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 grid place-items-center rounded-md border border-border bg-surface text-text-tertiary hover:text-text"
          >
            <IconClose className="w-4 h-4" />
          </button>
        </div>

        {/* Totals strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border-subtle border-b border-border-subtle">
          {metricIds.slice(0, 4).map((id) => {
            const def = METRIC_BY_ID[id];
            if (!def) return null;
            return (
              <div key={id} className="bg-bg px-3 py-2.5">
                <div className="text-[10.5px] text-text-tertiary">{def.label}</div>
                <div className="text-[14px] font-bold text-text tabular-nums">
                  {formatMetric(metricValue(def, group, benchmark), def.unit, currency)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Split selector */}
        <div className="flex items-center gap-1 px-4 py-2.5 border-b border-border-subtle">
          <span className="text-[11.5px] text-text-tertiary mr-1">Split by</span>
          {SPLITS.map((s) => {
            const disabled = s.id === 'geo' && !hasGeo;
            return (
              <button
                key={s.id}
                type="button"
                disabled={disabled}
                onClick={() => setSplit(s.id)}
                title={disabled ? 'Enable “Segment by geo” to split by country' : undefined}
                className={`h-7 px-2.5 rounded-md text-[12px] font-medium transition-colors ${
                  split === s.id
                    ? 'bg-accent-muted text-text'
                    : disabled
                      ? 'text-text-tertiary/40 cursor-not-allowed'
                      : 'text-text-secondary hover:bg-surface-hover hover:text-text'
                }`}
              >
                {s.label}
              </button>
            );
          })}
        </div>

        {/* Breakdown table */}
        <div className="flex-1 overflow-y-auto">
          <table className="w-full border-collapse">
            <thead className="sticky top-0 bg-surface">
              <tr>
                <th className="text-left text-[10.5px] font-semibold uppercase tracking-wider text-text-tertiary px-4 py-2">
                  {SPLITS.find((s) => s.id === split)?.label}
                </th>
                {metricIds.map((id) => {
                  const def = METRIC_BY_ID[id];
                  if (!def) return null;
                  return (
                    <th key={id} className="text-right text-[10.5px] font-semibold uppercase tracking-wider text-text-tertiary px-3 py-2">
                      {def.short}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sub.map((g) => (
                <tr key={g.key} className="border-t border-border-subtle hover:bg-surface-hover">
                  <td className="px-4 py-2 text-[12px] text-text max-w-[18rem] truncate" title={g.label}>
                    {g.label}
                  </td>
                  {metricIds.map((id) => {
                    const def = METRIC_BY_ID[id];
                    if (!def) return null;
                    return (
                      <td key={id} className="text-right px-3 py-2 text-[12px] font-semibold text-text tabular-nums">
                        {formatMetric(metricValue(def, g, benchmark), def.unit, currency)}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
          {!hasGeo && (
            <div className="px-4 py-3 text-[11px] text-text-tertiary">
              Tip: turn on <span className="text-text-secondary">Segment by geo</span> in the toolbar to split this
              creative by country.
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}
