/**
 * Boards = saved analysis lenses. Each board preconfigures the grouping,
 * visible metrics, format filter and sort so a click reframes the whole view.
 * Users can still tweak everything afterwards (boards are starting points).
 *
 * Add a board by appending to BOARDS — it shows up in the sidebar automatically.
 */
import type { CreativeFormat } from './types.ts';
import type { GroupDimension } from './aggregate.ts';

export type IconName =
  | 'grid'
  | 'video'
  | 'layers'
  | 'zap'
  | 'target'
  | 'trending'
  | 'alert'
  | 'type'
  | 'heading'
  | 'concept'
  | 'globe'
  | 'star'
  | 'bolt'
  | 'flag'
  | 'sparkle';

/** Icons offered when creating a custom board. */
export const BOARD_ICON_CHOICES: IconName[] = [
  'grid', 'star', 'bolt', 'flag', 'sparkle', 'target', 'trending', 'zap',
  'video', 'layers', 'alert', 'globe',
];

export interface Board {
  id: string;
  label: string;
  description: string;
  icon: IconName;
  groupBy: GroupDimension;
  metricIds: string[];
  formats: CreativeFormat[] | 'all';
  sortMetricId: string;
  sortDir: 'asc' | 'desc';
  /** Minimum spend (account currency) for a unit to appear — filters noise. */
  minSpend?: number;
  /** User-created boards persist to localStorage and are editable/removable. */
  custom?: boolean;
  /** Optional default campaign / ad-set filters applied when the board opens. */
  filters?: { campaigns: string[]; adsets: string[] };
}

export const BOARDS: Board[] = [
  {
    id: 'top-creatives',
    label: 'Top Creatives',
    description: 'Proven winners with $1k+ spend, ranked by efficiency vs the account average.',
    icon: 'grid',
    groupBy: 'creative',
    metricIds: ['score', 'spend', 'roas', 'cpa', 'daysLive'],
    formats: 'all',
    sortMetricId: 'score',
    sortDir: 'desc',
    minSpend: 1000,
  },
  {
    id: 'video-performance',
    label: 'Video Performance',
    description: 'Hook, hold and completion for video creatives.',
    icon: 'video',
    groupBy: 'creative',
    metricIds: ['spend', 'hookRate', 'holdRate', 'completionRate', 'cpa'],
    formats: ['ugc', 'egc', 'motion'],
    sortMetricId: 'spend',
    sortDir: 'desc',
  },
  {
    id: 'format-breakdown',
    label: 'Format Breakdown',
    description: 'Compare performance across Static, UGC, EGC and Motion.',
    icon: 'layers',
    groupBy: 'format',
    metricIds: ['spend', 'ctr', 'cpc', 'roas', 'cpa', 'hookRate'],
    formats: 'all',
    sortMetricId: 'spend',
    sortDir: 'desc',
  },
  {
    id: 'hooks',
    label: 'Hooks & Hold',
    description: 'Which openers stop the scroll and hold attention.',
    icon: 'zap',
    groupBy: 'creative',
    metricIds: ['hookRate', 'holdRate', 'thruplays', 'avgWatch', 'spend'],
    formats: ['ugc', 'egc', 'motion'],
    sortMetricId: 'hookRate',
    sortDir: 'desc',
    minSpend: 50,
  },
  {
    id: 'copy-primary',
    label: 'Primary Text',
    description: 'Which primary-text copy rides on the best-performing ads.',
    icon: 'type',
    groupBy: 'primaryText',
    metricIds: ['spend', 'ctr', 'linkCtr', 'cpc', 'cpa'],
    formats: 'all',
    sortMetricId: 'spend',
    sortDir: 'desc',
    minSpend: 25,
  },
  {
    id: 'copy-headline',
    label: 'Headlines',
    description: 'Headline performance across creatives that use them.',
    icon: 'heading',
    groupBy: 'headline',
    metricIds: ['spend', 'ctr', 'linkCtr', 'cpc', 'cpa'],
    formats: 'all',
    sortMetricId: 'spend',
    sortDir: 'desc',
    minSpend: 25,
  },
  {
    id: 'whats-working',
    label: "What's Working",
    description: 'Best efficiency among creatives with real spend.',
    icon: 'trending',
    groupBy: 'creative',
    metricIds: ['roas', 'cpa', 'ctr', 'spend'],
    formats: 'all',
    sortMetricId: 'roas',
    sortDir: 'desc',
    minSpend: 100,
  },
  {
    id: 'needs-attention',
    label: 'Needs Attention',
    description: 'High spend, weak efficiency — candidates to cut.',
    icon: 'alert',
    groupBy: 'creative',
    metricIds: ['cpa', 'ctr', 'roas', 'spend'],
    formats: 'all',
    sortMetricId: 'cpa',
    sortDir: 'desc',
    minSpend: 100,
  },
];

export const DEFAULT_BOARD = BOARDS[0];
