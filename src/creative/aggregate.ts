/** Grouping + aggregation of creative rows into board-ready units. */
import { classifyFormat } from './format.ts';
import { addMetrics, emptyMetrics } from './types.ts';
import type { CreativeFormat, CreativeGroup, CreativeRow } from './types.ts';

export type GroupDimension =
  | 'ad'
  | 'creative'
  | 'concept'
  | 'format'
  | 'campaign'
  | 'adset'
  | 'geo'
  | 'objective'
  | 'primaryText'
  | 'headline';

export const GROUP_DIMENSIONS: { id: GroupDimension; label: string }[] = [
  { id: 'creative', label: 'Creative (de-duped)' },
  { id: 'concept', label: 'Concept' },
  { id: 'ad', label: 'Ad' },
  { id: 'format', label: 'Format' },
  { id: 'campaign', label: 'Campaign' },
  { id: 'adset', label: 'Ad set' },
  { id: 'geo', label: 'Geo' },
  { id: 'objective', label: 'Objective' },
  { id: 'primaryText', label: 'Primary text' },
  { id: 'headline', label: 'Headline' },
];

/** Copy dimensions are one-to-many (an ad can carry several texts). */
export const COPY_DIMENSIONS: GroupDimension[] = ['primaryText', 'headline'];
export const isCopyDimension = (d: GroupDimension): boolean => COPY_DIMENSIONS.includes(d);

const FORMAT_LABEL: Record<CreativeFormat, string> = {
  ugc: 'UGC',
  egc: 'EGC',
  static: 'Static',
  motion: 'Motion',
};

/**
 * Name-based de-dupe. We collapse creatives by reducing an ad name to its core
 * "identity", which is more reliable than asset IDs (re-boosting a post mints a
 * new video_id each time, so asset grouping splits identical creatives).
 *
 * A common naming convention looks like:
 *   <CreativeIdentity> - <copy variant> - <model/version tokens> - <campaign tokens>
 * e.g. "Creator_Tip_9 - New Copy - v2"
 *      "Boosted post - Alex - Dynamic Identity - [GPT] [Opus]"
 *      "BoostedPost_Jordan - ABO APAC T2"
 *
 * Strategy: tokenize, then drop *anywhere*:
 *   - copy/variant markers (Copy, New, Final, …)
 *   - LLM model names + their version numbers (e.g. GPT 5, Opus 4, Sonnet 4.5)
 *     — these describe "which models this ad mentions", not creative identity
 *   - campaign/audience structure (ABO, CBO, APAC, EMEA, T1/T2, Dynamic Identity)
 *   - aspect ratios / dates / standalone "vN"
 * but KEEP identity numbers (Tip 9, Video 2, Ad 2) so distinct cuts stay split.
 *
 * Result: all "Creator Tip 9" variants → "creator tip 9"; all "Alex" boosted
 * posts → "boosted post alex"; "Jordan"/"Jordan - Copy"/"Jordan - ABO APAC T2"
 * → "boosted post jordan".
 */

// Copy / version-word markers (campaign-agnostic noise), stripped anywhere.
const VARIANT_TOKENS = new Set([
  'copy', 'copies', 'dupe', 'duplicate', 'new', 'old', 'final', 'finals', 'fin',
  'master', 'original', 'orig', 'matched', 'match', 'edit', 'edited', 'cut',
  'recut', 'remix', 'alt', 'version', 'ver', 'variant', 'draft', 'wip',
  'rev', 'revised', 'update', 'updated',
]);
// Campaign / audience / setup descriptors, stripped anywhere.
const CAMPAIGN_TOKENS = new Set([
  'abo', 'cbo', 'apac', 'emea', 'amer', 'latam', 'na', 'eu', 'us', 'uk', 'ww',
  'row', 'dynamic', 'identity',
]);
// LLM model families used as targeting/version noise (optionally with a version
// suffix glued on, e.g. "composer2", "gpt5.5", "opus4.6", "codex5.3").
const MODEL_RE =
  /^(composer|opus|sonnet|sonner|haiku|gpt|chatgpt|codex|claude|gemini|grok|llama|mistral|qwen|deepseek|o\d+)\d*(\.\d+)?$/;
const DECIMAL_RE = /^\d+\.\d+$/; // 4.6, 5.3, 2.5 (model versions)
const INT_RE = /^\d+$/;
const TIER_RE = /^t\d+$/; // t1, t2, t3
const VERSION_NUM_RE = /^v\d+$/; // v2
const PAREN_NUM_RE = /^\(\d+\)$/; // (1)
const DATE_RE = /^\d{6,8}$/; // 20260605
const ASPECT_RE = /^\d{1,2}x\d{1,2}$/; // 1x1, 9x16
// Language tokens stripped only for the looser "Concept" level.
const LANGUAGE_TOKENS = new Set([
  'english', 'spanish', 'french', 'german', 'portuguese', 'italian', 'dutch',
  'japanese', 'korean', 'chinese', 'mandarin', 'cantonese', 'arabic', 'hindi',
  'russian', 'polish', 'swedish', 'danish', 'norwegian', 'finnish', 'turkish',
  'thai', 'vietnamese', 'indonesian', 'hebrew', 'greek', 'czech', 'romanian',
  'eng', 'esp', 'spa', 'fra', 'fre', 'deu', 'ger', 'por', 'ita', 'jpn', 'kor',
  'es', 'fr', 'de', 'pt', 'ja', 'ko', 'zh', 'nl', 'intl',
]);

/** Split into tokens; breaks camelCase (BoostedPost → boosted post) and brackets. */
function tokenize(name: string): string[] {
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[\s_\-|/\\[\],]+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

/**
 * Normalize an ad name to its core creative identity.
 * - level 'creative': drop copy/model/version/campaign noise (the default view).
 * - level 'concept': also drop language tokens, so localized variants merge.
 */
export function normalizeAdName(name: string, level: 'creative' | 'concept'): string {
  const tokens = tokenize(name);
  const out: string[] = [];
  let prevModel = false;
  for (const t of tokens) {
    if (MODEL_RE.test(t)) {
      prevModel = true; // model name itself is noise
      continue;
    }
    if (DECIMAL_RE.test(t)) {
      prevModel = false;
      continue; // 4.6 / 5.3 version
    }
    if (prevModel && INT_RE.test(t)) {
      prevModel = false;
      continue; // integer right after a model = its version ("GPT 5")
    }
    prevModel = false;
    if (VARIANT_TOKENS.has(t)) continue;
    if (CAMPAIGN_TOKENS.has(t)) continue;
    if (TIER_RE.test(t) || VERSION_NUM_RE.test(t) || PAREN_NUM_RE.test(t)) continue;
    if (DATE_RE.test(t) || ASPECT_RE.test(t)) continue;
    if (level === 'concept') {
      let c = t;
      if (c.endsWith('text') && c.length > 4) c = c.slice(0, -4); // SpanishText → spanish
      if (LANGUAGE_TOKENS.has(c)) continue;
    }
    out.push(t);
  }
  return out.join(' ').trim() || name.trim().toLowerCase();
}

export const normalizeConcept = (name: string): string => normalizeAdName(name, 'concept');

/** Name-based identity for the de-duped "Creative" view. */
function creativeKey(row: CreativeRow): { key: string; label: string } {
  return { key: `c:${normalizeAdName(row.adName, 'creative')}`, label: row.adName };
}

function dimensionKey(row: CreativeRow, dim: GroupDimension): { key: string; label: string } {
  switch (dim) {
    case 'creative':
      return creativeKey(row);
    case 'concept': {
      const c = normalizeConcept(row.adName);
      return { key: `c:${c.toLowerCase()}`, label: c };
    }
    case 'format': {
      const f = classifyFormat(row);
      return { key: f, label: FORMAT_LABEL[f] };
    }
    case 'campaign':
      return { key: row.campaignName, label: row.campaignName };
    case 'adset':
      return { key: row.adsetName, label: row.adsetName };
    case 'geo':
      return { key: row.geo ?? '(all)', label: row.geo ?? 'All / no breakdown' };
    case 'objective':
      return { key: row.objective || '(none)', label: row.objective || 'No objective' };
    case 'ad':
    default:
      return { key: row.adId, label: row.adName };
  }
}

export function groupRows(rows: CreativeRow[], dim: GroupDimension): CreativeGroup[] {
  const map = new Map<string, { rows: CreativeRow[]; label: string }>();
  for (const row of rows) {
    const { key, label } = dimensionKey(row, dim);
    const entry = map.get(key);
    if (entry) entry.rows.push(row);
    else map.set(key, { rows: [row], label });
  }

  const groups: CreativeGroup[] = [];
  for (const [key, { rows: groupRowsList, label }] of map) {
    groups.push(buildGroup(key, label, groupRowsList, dim));
  }
  return groups;
}

const uniqueCount = (rows: CreativeRow[], pick: (r: CreativeRow) => string | null): number =>
  new Set(rows.map(pick).filter((v): v is string => !!v)).size;

function makeSublabel(dim: GroupDimension, rows: CreativeRow[], campaigns: number, geos: number): string {
  // Distinct ads (a de-duped creative may include many ads, possibly split by geo).
  const ads = uniqueCount(rows, (r) => r.adId);
  if (dim === 'ad') {
    return [...rows].sort((a, b) => b.metrics.spend - a.metrics.spend)[0].campaignName;
  }
  if (dim === 'creative' || dim === 'concept') {
    const parts = [`${ads} ad${ads === 1 ? '' : 's'}`, `${campaigns} campaign${campaigns === 1 ? '' : 's'}`];
    if (geos > 1) parts.push(`${geos} geos`);
    return parts.join(' · ');
  }
  return `${rows.length} ad${rows.length === 1 ? '' : 's'}`;
}

function buildGroup(
  key: string,
  label: string,
  rows: CreativeRow[],
  dim: GroupDimension,
  formatOverride?: CreativeFormat,
): CreativeGroup {
  const metrics = rows.reduce((acc, r) => addMetrics(acc, r.metrics), emptyMetrics());
  const pool = rows.some((r) => r.thumbnailUrl) ? rows.filter((r) => r.thumbnailUrl) : rows;
  const lead = [...pool].sort((a, b) => b.metrics.spend - a.metrics.spend)[0];
  const formatCounts = new Map<CreativeFormat, number>();
  for (const r of rows) {
    const f = classifyFormat(r);
    formatCounts.set(f, (formatCounts.get(f) ?? 0) + 1);
  }
  const dominantFormat = [...formatCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const campaignCount = uniqueCount(rows, (r) => r.campaignName);
  const adsetCount = uniqueCount(rows, (r) => r.adsetName);
  const geoCount = uniqueCount(rows, (r) => r.geo);
  // For name-based de-dupe, show the top-spend variant's name (most representative).
  const displayLabel = dim === 'creative' || dim === 'concept' ? lead.adName : label;
  return {
    key,
    label: displayLabel,
    sublabel: makeSublabel(dim, rows, campaignCount, geoCount),
    format: formatOverride ?? (dim === 'format' ? (key as CreativeFormat) : dominantFormat),
    thumbnailUrl: lead.thumbnailUrl,
    permalink: lead.permalink,
    adCount: uniqueCount(rows, (r) => r.adId) || rows.length,
    campaignCount,
    adsetCount,
    geoCount,
    status: lead.status,
    metrics,
    rows,
  };
}

/**
 * Normalize ad copy so cosmetic variants of the same line collapse together:
 * case, whitespace, emoji, smart vs straight quotes, em/en dashes, appended
 * links, and punctuation are all flattened. Genuinely different wording stays
 * distinct (the actual words are preserved).
 */
export function normalizeCopy(text: string): string {
  const out = text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ') // drop trailing/inline links
    .replace(/[’‘`'"“”]/g, '') // delete quotes/apostrophes so "it's" === "its"
    .replace(/[^\p{L}\p{N}\s]/gu, ' ') // remaining punctuation / emoji → space
    .replace(/\s+/g, ' ')
    .trim();
  return out || text.trim().toLowerCase();
}

/**
 * Group by ad copy (primary text or headline), de-duped by normalized text.
 * One-to-many: an ad contributes its metrics to every distinct line it carries
 * (dynamic-creative ads carry several). This is directional — Meta can't
 * attribute ad-level results to a single body/title — but it surfaces which copy
 * rides on the best ads. Ads with no retrievable copy (e.g. boosted posts) are
 * excluded. The displayed label is the highest-spend original phrasing.
 */
export function groupByCopy(rows: CreativeRow[], kind: 'primaryText' | 'headline'): CreativeGroup[] {
  const map = new Map<string, { rows: CreativeRow[]; variants: Map<string, number> }>();
  for (const row of rows) {
    const texts = kind === 'primaryText' ? row.primaryTexts : row.headlines;
    // Collapse this ad's lines to distinct normalized keys (a row counts once
    // per key, even if it carries two cosmetically-different copies of it).
    const perKey = new Map<string, string[]>();
    for (const raw of texts) {
      const t = raw.trim();
      if (!t) continue;
      const key = normalizeCopy(t);
      const arr = perKey.get(key);
      if (arr) arr.push(t);
      else perKey.set(key, [t]);
    }
    for (const [key, origs] of perKey) {
      let entry = map.get(key);
      if (!entry) {
        entry = { rows: [], variants: new Map() };
        map.set(key, entry);
      }
      entry.rows.push(row);
      for (const o of origs) entry.variants.set(o, (entry.variants.get(o) ?? 0) + row.metrics.spend);
    }
  }

  const groups: CreativeGroup[] = [];
  for (const [key, { rows: groupRowsList, variants }] of map) {
    // Representative label = the original phrasing with the most spend behind it.
    const label = [...variants.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const group = buildGroup(key, label, groupRowsList, kind);
    if (variants.size > 1) {
      group.sublabel = `${group.adCount} ad${group.adCount === 1 ? '' : 's'} · ${variants.size} variants`;
    }
    groups.push(group);
  }
  return groups;
}

/** Count of rows that carry at least one retrievable copy string. */
export function copyCoverage(rows: CreativeRow[], kind: 'primaryText' | 'headline'): number {
  return rows.filter((r) => (kind === 'primaryText' ? r.primaryTexts : r.headlines).some((t) => t.trim())).length;
}
