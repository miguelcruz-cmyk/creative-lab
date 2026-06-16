/** Shared domain types for the creative analysis tool (client side). */

/** Additive base metrics returned per ad by the API (safe to sum). */
export interface BaseMetrics {
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  linkClicks: number;
  landingPageViews: number;
  purchases: number;
  purchaseValue: number;
  registrations: number;
  leads: number;
  addToCart: number;
  initiateCheckout: number;
  postEngagement: number;
  reactions: number;
  comments: number;
  shares: number;
  saves: number;
  videoPlays: number;
  video3s: number;
  thruplays: number;
  videoWatchSeconds: number;
  p25: number;
  p50: number;
  p75: number;
  p100: number;
}

export interface CreativeRow {
  adId: string;
  adName: string;
  status: string;
  campaignName: string;
  adsetName: string;
  objective: string;
  /** ISO timestamp the ad was created in Meta ("went live"), when available. */
  createdTime: string | null;
  creativeId: string | null;
  objectType: string | null;
  videoId: string | null;
  imageHash: string | null;
  geo: string | null;
  permalink: string | null;
  thumbnailUrl: string | null;
  primaryTexts: string[];
  headlines: string[];
  metrics: BaseMetrics;
}

export interface AccountInfo {
  id: string;
  name: string;
  currency: string;
  timezone: string;
}

export interface CreativeResponse {
  account: AccountInfo;
  range: { label: string; since?: string; until?: string };
  rows: CreativeRow[];
  fetchedAt: string;
  cached?: boolean;
}

export type CreativeFormat = 'ugc' | 'static' | 'motion' | 'egc';

/** An aggregated unit shown as one card/row in the grid (one or many ads). */
export interface CreativeGroup {
  key: string;
  label: string;
  sublabel: string;
  format: CreativeFormat;
  thumbnailUrl: string | null;
  permalink: string | null;
  adCount: number;
  /** Distinct campaigns / ad sets / geos this unit spans (for de-duped views). */
  campaignCount: number;
  adsetCount: number;
  geoCount: number;
  status: string;
  metrics: BaseMetrics;
  /** Underlying rows, kept so a unit can be drilled into by campaign/geo/ad set. */
  rows: CreativeRow[];
}

/** Empty additive metrics, used as the accumulator seed. */
export function emptyMetrics(): BaseMetrics {
  return {
    spend: 0,
    impressions: 0,
    reach: 0,
    clicks: 0,
    linkClicks: 0,
    landingPageViews: 0,
    purchases: 0,
    purchaseValue: 0,
    registrations: 0,
    leads: 0,
    addToCart: 0,
    initiateCheckout: 0,
    postEngagement: 0,
    reactions: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    videoPlays: 0,
    video3s: 0,
    thruplays: 0,
    videoWatchSeconds: 0,
    p25: 0,
    p50: 0,
    p75: 0,
    p100: 0,
  };
}

export function addMetrics(a: BaseMetrics, b: BaseMetrics): BaseMetrics {
  const out = { ...a } as Record<keyof BaseMetrics, number>;
  for (const k of Object.keys(b) as (keyof BaseMetrics)[]) out[k] += b[k];
  return out as BaseMetrics;
}
