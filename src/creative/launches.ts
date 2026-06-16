/**
 * Launch bucketing for the calendar view. Reuses the rows already loaded for the
 * selected date range (no extra Meta calls): collapse rows to one entry per ad
 * (geo-split rows are summed), then bucket each ad onto the day it "went live"
 * (Meta `createdTime`).
 *
 * We key the day off the date prefix of the ISO `createdTime` string
 * ("2026-05-21T13:04:05-0700" -> "2026-05-21"). Using the string's own date part
 * keeps the bucket stable in the offset Meta reported, with no timezone drift.
 */
import { classifyFormat } from './format.ts';
import { addMetrics, emptyMetrics } from './types.ts';
import type { BaseMetrics, CreativeFormat, CreativeRow } from './types.ts';

export interface LaunchAd {
  adId: string;
  adName: string;
  format: CreativeFormat;
  thumbnailUrl: string | null;
  campaignName: string;
  adsetName: string;
  permalink: string | null;
  /** ISO timestamp the ad was created. */
  createdTime: string;
  /** YYYY-MM-DD bucket the ad is placed on. */
  dateKey: string;
  /** Metrics summed across the ad's rows (e.g. geo splits). */
  metrics: BaseMetrics;
}

export interface LaunchBuckets {
  /** YYYY-MM-DD -> ads launched that day (sorted by spend desc). */
  byDay: Map<string, LaunchAd[]>;
  /** Distinct YYYY-MM month keys that contain >=1 launch, ascending. */
  months: string[];
  /** Total ads placed (with a known created day). */
  total: number;
  /** Ads dropped because they have no createdTime yet (pre-refresh snapshots). */
  unknown: number;
}

export const monthKeyOf = (dateKey: string): string => dateKey.slice(0, 7);

/** Collapse rows to one entry per ad, then bucket by created day. */
export function bucketLaunches(rows: CreativeRow[]): LaunchBuckets {
  // 1) De-dupe to one accumulator per ad (sum geo/other split rows).
  const perAd = new Map<string, { lead: CreativeRow; metrics: BaseMetrics; createdTime: string | null }>();
  for (const row of rows) {
    const entry = perAd.get(row.adId);
    if (entry) {
      entry.metrics = addMetrics(entry.metrics, row.metrics);
      if (row.metrics.spend > entry.lead.metrics.spend) entry.lead = row;
      if (!entry.createdTime && row.createdTime) entry.createdTime = row.createdTime;
    } else {
      perAd.set(row.adId, {
        lead: row,
        metrics: addMetrics(emptyMetrics(), row.metrics),
        createdTime: row.createdTime,
      });
    }
  }

  // 2) Bucket each ad onto its created day.
  const byDay = new Map<string, LaunchAd[]>();
  let unknown = 0;
  let total = 0;
  for (const [adId, { lead, metrics, createdTime }] of perAd) {
    if (!createdTime) {
      unknown += 1;
      continue;
    }
    const dateKey = createdTime.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      unknown += 1;
      continue;
    }
    const ad: LaunchAd = {
      adId,
      adName: lead.adName,
      format: classifyFormat(lead),
      thumbnailUrl: lead.thumbnailUrl,
      campaignName: lead.campaignName,
      adsetName: lead.adsetName,
      permalink: lead.permalink,
      createdTime,
      dateKey,
      metrics,
    };
    const list = byDay.get(dateKey);
    if (list) list.push(ad);
    else byDay.set(dateKey, [ad]);
    total += 1;
  }

  // 3) Sort each day's ads by spend (most significant first) and collect months.
  const months = new Set<string>();
  for (const [dateKey, list] of byDay) {
    list.sort((a, b) => b.metrics.spend - a.metrics.spend);
    months.add(monthKeyOf(dateKey));
  }

  return {
    byDay,
    months: [...months].sort(),
    total,
    unknown,
  };
}
