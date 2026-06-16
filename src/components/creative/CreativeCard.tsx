import { formatMetric, metricValue, rateMetric, METRIC_BY_ID, RATING_DOT, RATING_TEXT } from '../../creative/metrics.ts';
import { FORMAT_META, isVideoFormat } from '../../creative/format.ts';
import type { BaseMetrics, CreativeGroup } from '../../creative/types.ts';
import { IconPlay } from './icons.tsx';

interface CreativeCardProps {
  group: CreativeGroup;
  metricIds: string[];
  currency: string;
  rank: number;
  /** Account-average base metrics; KPI values are colored relative to these. */
  benchmark?: BaseMetrics;
  /** When set, render a copy-forward tile instead of a thumbnail tile. */
  copyKind?: 'primaryText' | 'headline';
  /** When set, clicking the card opens the drill-in instead of the permalink. */
  onOpen?: (group: CreativeGroup) => void;
}

const FORMAT_PILL: Record<string, string> = {
  ugc: 'bg-[oklch(30%_0.08_275)] text-[oklch(82%_0.12_275)]',
  egc: 'bg-[oklch(30%_0.08_150)] text-[oklch(82%_0.12_150)]',
  static: 'bg-[oklch(30%_0.05_210)] text-[oklch(82%_0.1_210)]',
  motion: 'bg-[oklch(30%_0.08_330)] text-[oklch(82%_0.12_330)]',
};

function MetricList({ group, metricIds, currency, benchmark }: Omit<CreativeCardProps, 'rank' | 'copyKind'>) {
  const primary = metricIds[0];
  const rest = metricIds.slice(1);
  const primaryDef = primary ? METRIC_BY_ID[primary] : undefined;
  const primaryRating = primaryDef && benchmark
    ? rateMetric(primaryDef, metricValue(primaryDef, group, benchmark), primaryDef.compute(benchmark))
    : null;
  return (
    <>
      {primaryDef && (
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-[11px] text-text-tertiary inline-flex items-center gap-1.5">
            {primaryRating && <span className={`w-1.5 h-1.5 rounded-full ${RATING_DOT[primaryRating]}`} />}
            {primaryDef.label}
          </span>
          <span className={`text-[15px] font-bold tabular-nums ${primaryRating ? RATING_TEXT[primaryRating] : 'text-text'}`}>
            {formatMetric(metricValue(primaryDef, group, benchmark), primaryDef.unit, currency)}
          </span>
        </div>
      )}
      <div className="space-y-1.5">
        {rest.map((id) => {
          const def = METRIC_BY_ID[id];
          if (!def) return null;
          const rating = benchmark ? rateMetric(def, metricValue(def, group, benchmark), def.compute(benchmark)) : null;
          return (
            <div key={id} className="flex items-center justify-between">
              <span className="text-[11.5px] text-text-secondary inline-flex items-center gap-1.5">
                {rating && <span className={`w-1.5 h-1.5 rounded-full ${RATING_DOT[rating]}`} />}
                {def.label}
              </span>
              <span className={`text-[12.5px] font-semibold tabular-nums ${rating ? RATING_TEXT[rating] : 'text-text'}`}>
                {formatMetric(metricValue(def, group, benchmark), def.unit, currency)}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}

export function CreativeCard({ group, metricIds, currency, rank, benchmark, copyKind, onOpen }: CreativeCardProps) {
  const isVideo = isVideoFormat(group.format);
  const className =
    'group rounded-xl border border-border bg-surface overflow-hidden hover:border-border hover:bg-surface-hover transition-colors';

  const copyCard = (
    <>
      <div className="p-3.5 border-b border-border-subtle min-h-[8.5rem] flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <span className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold bg-accent-muted text-accent-hover">
            {copyKind === 'headline' ? 'Headline' : 'Primary text'}
          </span>
          <span className="text-[11px] font-bold text-text-tertiary tabular-nums">#{rank}</span>
        </div>
        <p
          className={`text-text leading-snug ${copyKind === 'headline' ? 'text-[15px] font-semibold' : 'text-[12.5px]'} line-clamp-5`}
          title={group.label}
        >
          {group.label}
        </p>
      </div>
      <div className="p-3">
        <div className="flex items-center gap-2 mb-2.5">
          {group.thumbnailUrl && (
            <span className="w-5 h-5 rounded overflow-hidden bg-black/40 shrink-0">
              <img src={group.thumbnailUrl} alt="" loading="lazy" className="w-full h-full object-cover" />
            </span>
          )}
          <span className="text-[11px] text-text-tertiary truncate">
            {group.adCount} ad{group.adCount === 1 ? '' : 's'} · {FORMAT_META[group.format].label}
          </span>
        </div>
        <MetricList group={group} metricIds={metricIds} currency={currency} benchmark={benchmark} />
      </div>
    </>
  );

  const mediaCard = (
    <>
      <div className="relative aspect-square bg-black/40 overflow-hidden">
        {group.thumbnailUrl ? (
          <img src={group.thumbnailUrl} alt={group.label} loading="lazy" className="w-full h-full object-contain" />
        ) : (
          <div className="w-full h-full grid place-items-center text-text-tertiary text-[11px]">No preview</div>
        )}
        <span className={`absolute top-2 left-2 px-1.5 py-0.5 rounded-md text-[10px] font-semibold backdrop-blur-sm ${FORMAT_PILL[group.format]}`}>
          {FORMAT_META[group.format].label}
        </span>
        <span className="absolute top-2 right-2 w-5 h-5 rounded-md grid place-items-center text-[10px] font-bold text-white bg-black/55 backdrop-blur-sm">
          {rank}
        </span>
        {isVideo && (
          <span className="absolute inset-0 grid place-items-center pointer-events-none">
            <span className="w-10 h-10 rounded-full bg-black/45 backdrop-blur-sm grid place-items-center">
              <IconPlay className="w-4 h-4 text-white ml-0.5" />
            </span>
          </span>
        )}
      </div>
      <div className="p-3">
        <div className="text-[13px] font-semibold text-text truncate" title={group.label}>
          {group.label}
        </div>
        <div className="text-[11px] text-text-tertiary truncate mb-2.5">{group.sublabel}</div>
        <MetricList group={group} metricIds={metricIds} currency={currency} benchmark={benchmark} />
      </div>
    </>
  );

  const card = copyKind ? copyCard : mediaCard;

  if (onOpen) {
    return (
      <button type="button" onClick={() => onOpen(group)} className={`block w-full text-left ${className}`}>
        {card}
      </button>
    );
  }
  if (group.permalink && !copyKind) {
    return (
      <a href={group.permalink} target="_blank" rel="noreferrer" className={`block ${className}`}>
        {card}
      </a>
    );
  }
  return <div className={className}>{card}</div>;
}
