import { formatMetric, metricValue, rateMetric, METRIC_BY_ID, RATING_DOT, RATING_TEXT } from '../../creative/metrics.ts';
import { FORMAT_META, isVideoFormat } from '../../creative/format.ts';
import type { BaseMetrics, CreativeGroup } from '../../creative/types.ts';
import { IconPlay } from './icons.tsx';

interface CreativeTableProps {
  groups: CreativeGroup[];
  metricIds: string[];
  currency: string;
  sortMetricId: string;
  sortDir: 'asc' | 'desc';
  onSort: (metricId: string) => void;
  /** Account-average base metrics; KPI cells are colored relative to these. */
  benchmark?: BaseMetrics;
  copyKind?: 'primaryText' | 'headline';
  onOpen?: (group: CreativeGroup) => void;
}

export function CreativeTable({ groups, metricIds, currency, sortMetricId, sortDir, onSort, benchmark, copyKind, onOpen }: CreativeTableProps) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-surface">
            <th className="sticky left-0 bg-surface text-left text-[11px] font-semibold uppercase tracking-wider text-text-tertiary px-3 py-2.5 w-[40%]">
              {copyKind === 'headline' ? 'Headline' : copyKind === 'primaryText' ? 'Primary text' : 'Creative'}
            </th>
            {metricIds.map((id) => {
              const def = METRIC_BY_ID[id];
              if (!def) return null;
              const active = sortMetricId === id;
              return (
                <th key={id} className="text-right px-3 py-2.5">
                  <button
                    type="button"
                    onClick={() => onSort(id)}
                    className={`inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider transition-colors ${
                      active ? 'text-text' : 'text-text-tertiary hover:text-text-secondary'
                    }`}
                  >
                    {def.short}
                    {active && <span className="text-[9px]">{sortDir === 'desc' ? '▼' : '▲'}</span>}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const isVideo = isVideoFormat(g.format);
            return (
              <tr
                key={g.key}
                onClick={onOpen ? () => onOpen(g) : undefined}
                className={`border-t border-border-subtle hover:bg-surface-hover transition-colors ${onOpen ? 'cursor-pointer' : ''}`}
              >
                <td className="sticky left-0 bg-bg px-3 py-2">
                  <div className="flex items-center gap-2.5">
                    <div className="relative w-11 h-11 rounded-md overflow-hidden bg-black/40 shrink-0">
                      {g.thumbnailUrl ? (
                        <img src={g.thumbnailUrl} alt="" loading="lazy" className="w-full h-full object-contain" />
                      ) : null}
                      {isVideo && !copyKind && (
                        <span className="absolute inset-0 grid place-items-center">
                          <IconPlay className="w-3 h-3 text-white/90" />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div
                        className={`text-[12.5px] font-medium text-text max-w-[30rem] ${copyKind ? 'line-clamp-2 whitespace-normal' : 'truncate'}`}
                        title={g.label}
                      >
                        {g.label}
                      </div>
                      <div className="text-[11px] text-text-tertiary truncate">
                        {FORMAT_META[g.format].label} · {g.sublabel}
                      </div>
                    </div>
                  </div>
                </td>
                {metricIds.map((id) => {
                  const def = METRIC_BY_ID[id];
                  if (!def) return null;
                  const rating = benchmark ? rateMetric(def, metricValue(def, g, benchmark), def.compute(benchmark)) : null;
                  return (
                    <td key={id} className={`text-right px-3 py-2 text-[12.5px] font-semibold tabular-nums ${rating ? RATING_TEXT[rating] : 'text-text'}`}>
                      <span className="inline-flex items-center justify-end gap-1.5">
                        {rating && <span className={`w-1.5 h-1.5 rounded-full ${RATING_DOT[rating]}`} />}
                        {formatMetric(metricValue(def, g, benchmark), def.unit, currency)}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
