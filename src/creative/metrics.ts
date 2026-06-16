/**
 * Metric registry — the single source of truth for every metric the tool can
 * display. Each metric computes its value from *aggregated additive* base
 * metrics, so grouping (by ad, format, campaign, ...) stays mathematically
 * correct: we sum the base fields first, then derive ratios.
 *
 * To add a metric, append one entry here; the chip picker, table, cards and
 * sorting all read from this list automatically.
 */
import type { BaseMetrics, CreativeRow } from './types.ts';

export type MetricUnit = 'currency' | 'number' | 'percent' | 'ratio' | 'seconds' | 'days';
export type MetricGroup = 'spend' | 'efficiency' | 'conversion' | 'engagement' | 'video';

export interface MetricDef {
  id: string;
  label: string;
  short: string;
  unit: MetricUnit;
  group: MetricGroup;
  /** true when higher is better (drives subtle good/bad coloring). */
  higherIsBetter: boolean;
  /**
   * true for rate/efficiency KPIs that are meaningful to benchmark against the
   * account average (CPA, ROAS, CTR, …). Volume metrics (spend, impressions,
   * purchases) are sizes, not quality signals, so they're left uncolored.
   */
  kpi?: boolean;
  compute: (m: BaseMetrics) => number | null;
  /**
   * Some metrics (e.g. Days Live) aren't derivable from summed base metrics
   * and read the group's underlying rows instead. When present, this wins over
   * `compute` wherever rows are available (cards, table, sorting).
   */
  computeRows?: (rows: CreativeRow[]) => number | null;
  /**
   * Benchmark-relative metrics (e.g. Performance Score) need the account
   * average alongside the unit's own metrics. Used when a benchmark is in
   * scope; otherwise the metric renders as "—".
   */
  computeBench?: (m: BaseMetrics, bench: BaseMetrics) => number | null;
}

/** Value of a metric for an aggregated unit (prefers context-aware computes). */
export function metricValue(
  def: MetricDef,
  group: { metrics: BaseMetrics; rows?: CreativeRow[] },
  bench?: BaseMetrics,
): number | null {
  if (def.computeBench) return bench ? def.computeBench(group.metrics, bench) : null;
  if (def.computeRows && group.rows?.length) return def.computeRows(group.rows);
  return def.compute(group.metrics);
}

const safe = (n: number, d: number): number | null => (d > 0 ? n / d : null);

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Performance Score — a composite "is this actually a winner?" rank.
 *
 *   score = efficiency × scale × 100
 *
 *   - efficiency: CPA and ROAS each indexed against the spend-weighted account
 *     average (1 = average, capped at 3 so one outlier can't run away), then
 *     averaged. An ad that spent with zero purchases contributes a 0 CPA index.
 *   - scale: 1 + log10(spend / $1k floor) — proven volume is a multiplier, not
 *     the main event ($1k → 1×, $10k → 2×, $100k → 3×).
 *
 * Calibration: 100 ≈ an account-average performer at $1k spend. Above 100
 * beats the account; below trails it.
 */
const SCORE_SPEND_FLOOR = 1000;
const EFF_CAP = 3;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

function performanceScore(m: BaseMetrics, bench: BaseMetrics): number | null {
  if (m.spend <= 0) return null;
  const cpa = safe(m.spend, m.purchases);
  const benchCpa = safe(bench.spend, bench.purchases);
  const roas = safe(m.purchaseValue, m.spend);
  const benchRoas = safe(bench.purchaseValue, bench.spend);

  const parts: number[] = [];
  if (benchCpa !== null) parts.push(cpa !== null ? clamp(benchCpa / cpa, 0, EFF_CAP) : 0);
  if (benchRoas !== null && benchRoas > 0 && roas !== null) parts.push(clamp(roas / benchRoas, 0, EFF_CAP));
  if (parts.length === 0) return null;

  const efficiency = parts.reduce((a, b) => a + b, 0) / parts.length;
  const scale = 1 + Math.log10(Math.max(m.spend / SCORE_SPEND_FLOOR, 1));
  return Math.round(efficiency * scale * 100);
}

/** Days since the earliest launch among the unit's ads (today counts as 1). */
function daysLive(rows: CreativeRow[]): number | null {
  let earliest = Infinity;
  for (const r of rows) {
    if (!r.createdTime) continue;
    const t = Date.parse(r.createdTime);
    if (Number.isFinite(t) && t < earliest) earliest = t;
  }
  if (!Number.isFinite(earliest)) return null;
  return Math.max(1, Math.ceil((Date.now() - earliest) / DAY_MS));
}

export const METRICS: MetricDef[] = [
  { id: 'spend', label: 'Spend', short: 'Spend', unit: 'currency', group: 'spend', higherIsBetter: true, compute: (m) => m.spend },
  { id: 'impressions', label: 'Impressions', short: 'Impr.', unit: 'number', group: 'spend', higherIsBetter: true, compute: (m) => m.impressions },
  { id: 'reach', label: 'Reach', short: 'Reach', unit: 'number', group: 'spend', higherIsBetter: true, compute: (m) => m.reach },
  { id: 'frequency', label: 'Frequency', short: 'Freq.', unit: 'ratio', group: 'spend', higherIsBetter: false, kpi: true, compute: (m) => safe(m.impressions, m.reach) },
  { id: 'daysLive', label: 'Days Live', short: 'Days', unit: 'days', group: 'spend', higherIsBetter: true, compute: () => null, computeRows: daysLive },

  { id: 'score', label: 'Score', short: 'Score', unit: 'number', group: 'efficiency', higherIsBetter: true, compute: () => null, computeBench: performanceScore },
  { id: 'cpm', label: 'CPM', short: 'CPM', unit: 'currency', group: 'efficiency', higherIsBetter: false, kpi: true, compute: (m) => safe(m.spend * 1000, m.impressions) },
  { id: 'ctr', label: 'CTR', short: 'CTR', unit: 'percent', group: 'efficiency', higherIsBetter: true, kpi: true, compute: (m) => safe(m.clicks, m.impressions) },
  { id: 'linkCtr', label: 'Link CTR', short: 'L.CTR', unit: 'percent', group: 'efficiency', higherIsBetter: true, kpi: true, compute: (m) => safe(m.linkClicks, m.impressions) },
  { id: 'cpc', label: 'CPC', short: 'CPC', unit: 'currency', group: 'efficiency', higherIsBetter: false, kpi: true, compute: (m) => safe(m.spend, m.clicks) },
  { id: 'clicks', label: 'Clicks', short: 'Clicks', unit: 'number', group: 'efficiency', higherIsBetter: true, compute: (m) => m.clicks },

  { id: 'roas', label: 'ROAS', short: 'ROAS', unit: 'ratio', group: 'conversion', higherIsBetter: true, kpi: true, compute: (m) => safe(m.purchaseValue, m.spend) },
  { id: 'purchases', label: 'Purchases', short: 'Purch.', unit: 'number', group: 'conversion', higherIsBetter: true, compute: (m) => m.purchases },
  { id: 'cpa', label: 'CPA', short: 'CPA', unit: 'currency', group: 'conversion', higherIsBetter: false, kpi: true, compute: (m) => safe(m.spend, m.purchases) },
  { id: 'registrations', label: 'Registrations', short: 'Reg.', unit: 'number', group: 'conversion', higherIsBetter: true, compute: (m) => m.registrations },
  { id: 'cpr', label: 'Cost / Reg', short: 'CPR', unit: 'currency', group: 'conversion', higherIsBetter: false, kpi: true, compute: (m) => safe(m.spend, m.registrations) },
  { id: 'cvr', label: 'CVR', short: 'CVR', unit: 'percent', group: 'conversion', higherIsBetter: true, kpi: true, compute: (m) => safe(m.purchases + m.registrations, m.clicks) },
  { id: 'lpv', label: 'Landing Views', short: 'LPV', unit: 'number', group: 'conversion', higherIsBetter: true, compute: (m) => m.landingPageViews },

  { id: 'hookRate', label: 'Hook Rate', short: 'Hook', unit: 'percent', group: 'video', higherIsBetter: true, kpi: true, compute: (m) => safe(m.video3s, m.impressions) },
  { id: 'holdRate', label: 'Hold Rate', short: 'Hold', unit: 'percent', group: 'video', higherIsBetter: true, kpi: true, compute: (m) => safe(m.thruplays, m.impressions) },
  { id: 'videoPlays', label: 'Video Plays', short: 'Plays', unit: 'number', group: 'video', higherIsBetter: true, compute: (m) => m.videoPlays },
  { id: 'thruplays', label: 'Thruplays', short: 'Thru', unit: 'number', group: 'video', higherIsBetter: true, compute: (m) => m.thruplays },
  { id: 'video25', label: '25% Viewed', short: '25%', unit: 'percent', group: 'video', higherIsBetter: true, kpi: true, compute: (m) => safe(m.p25, m.videoPlays) },
  { id: 'video50', label: '50% Viewed', short: '50%', unit: 'percent', group: 'video', higherIsBetter: true, kpi: true, compute: (m) => safe(m.p50, m.videoPlays) },
  { id: 'video75', label: '75% Viewed', short: '75%', unit: 'percent', group: 'video', higherIsBetter: true, kpi: true, compute: (m) => safe(m.p75, m.videoPlays) },
  { id: 'completionRate', label: '100% Viewed', short: 'Compl.', unit: 'percent', group: 'video', higherIsBetter: true, kpi: true, compute: (m) => safe(m.p100, m.videoPlays) },
  { id: 'avgWatch', label: 'Avg Watch', short: 'Watch', unit: 'seconds', group: 'video', higherIsBetter: true, kpi: true, compute: (m) => safe(m.videoWatchSeconds, m.videoPlays) },

  { id: 'engagement', label: 'Post Engagement', short: 'Eng.', unit: 'number', group: 'engagement', higherIsBetter: true, compute: (m) => m.postEngagement },
  { id: 'engagementRate', label: 'Engagement Rate', short: 'ER', unit: 'percent', group: 'engagement', higherIsBetter: true, kpi: true, compute: (m) => safe(m.postEngagement, m.impressions) },
  { id: 'reactions', label: 'Reactions', short: 'React.', unit: 'number', group: 'engagement', higherIsBetter: true, compute: (m) => m.reactions },
  { id: 'comments', label: 'Comments', short: 'Comm.', unit: 'number', group: 'engagement', higherIsBetter: true, compute: (m) => m.comments },
  { id: 'shares', label: 'Shares', short: 'Shares', unit: 'number', group: 'engagement', higherIsBetter: true, compute: (m) => m.shares },
  { id: 'saves', label: 'Saves', short: 'Saves', unit: 'number', group: 'engagement', higherIsBetter: true, compute: (m) => m.saves },
];

export const METRIC_BY_ID: Record<string, MetricDef> = Object.fromEntries(METRICS.map((m) => [m.id, m]));

/** Performance tier of a value relative to the account-average benchmark. */
export type MetricRating = 'good' | 'mid' | 'bad';

/** ±band around the benchmark that counts as "average" (mid). */
const RATING_BAND = 0.15;

/**
 * Rate a metric value against a benchmark (the account-average value for the
 * same metric). Returns null for non-KPI metrics or when either side is
 * missing/zero. Respects higherIsBetter so CPA/CPC (lower = better) flip.
 */
export function rateMetric(def: MetricDef, value: number | null, benchmark: number | null): MetricRating | null {
  if (!def.kpi || value === null || benchmark === null) return null;
  if (!Number.isFinite(value) || !Number.isFinite(benchmark) || benchmark === 0) return null;
  const ratio = value / benchmark;
  const better = def.higherIsBetter ? ratio - 1 : 1 - ratio; // >0 means beats benchmark
  if (better >= RATING_BAND) return 'good';
  if (better <= -RATING_BAND) return 'bad';
  return 'mid';
}

/** Text-color class per rating (good = green, mid = amber, bad = red). */
export const RATING_TEXT: Record<MetricRating, string> = {
  good: 'text-win-pill-text',
  mid: 'text-inconclusive-pill-text',
  bad: 'text-loss-pill-text',
};

/** Dot/background color class per rating. */
export const RATING_DOT: Record<MetricRating, string> = {
  good: 'bg-win-pill-text',
  mid: 'bg-inconclusive-pill-text',
  bad: 'bg-loss-pill-text',
};

export const METRIC_GROUP_LABELS: Record<MetricGroup, string> = {
  spend: 'Spend & reach',
  efficiency: 'Efficiency',
  conversion: 'Conversion',
  video: 'Video',
  engagement: 'Engagement',
};

const NF = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const NF2 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });

export function formatMetric(value: number | null, unit: MetricUnit, currency = 'USD'): string {
  if (value === null || !Number.isFinite(value)) return '—';
  switch (unit) {
    case 'currency': {
      const cf = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        maximumFractionDigits: value >= 100 ? 0 : 2,
      });
      return cf.format(value);
    }
    case 'percent':
      return `${NF2.format(value * 100)}%`;
    case 'ratio':
      return `${NF2.format(value)}×`;
    case 'seconds':
      return `${NF2.format(value)}s`;
    case 'days':
      return `${NF.format(value)}d`;
    case 'number':
    default:
      return NF.format(value);
  }
}
