import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  DATE_PRESETS,
  fetchCreatives,
  peekCreatives,
  fetchPlatforms,
  type DateSelection,
  type GeoBreakdown,
  type PlatformId,
  type PlatformStatus,
} from '../../creative/api.ts';
import { BOARDS, DEFAULT_BOARD, type Board } from '../../creative/boards.ts';
import { loadCustomBoards, upsertCustomBoard, removeCustomBoard } from '../../creative/customBoards.ts';
import { BoardEditor } from './BoardEditor.tsx';
import { CalendarView } from './CalendarView.tsx';
import {
  GROUP_DIMENSIONS,
  groupRows,
  groupByCopy,
  copyCoverage,
  isCopyDimension,
  type GroupDimension,
} from '../../creative/aggregate.ts';
import { classifyFormat } from '../../creative/format.ts';
import { METRIC_BY_ID, metricValue } from '../../creative/metrics.ts';
import { addMetrics, emptyMetrics } from '../../creative/types.ts';
import type { AccountInfo, CreativeGroup, CreativeResponse, CreativeRow } from '../../creative/types.ts';
import { Sidebar } from './Sidebar.tsx';
import { DateSelector } from './DateSelector.tsx';
import { MetricBar } from './MetricBar.tsx';
import { FormatTabs, type FormatFilter } from './FormatTabs.tsx';
import { CreativeCard } from './CreativeCard.tsx';
import { CreativeTable } from './CreativeTable.tsx';
import { DrillIn } from './DrillIn.tsx';
import { Popover } from './Popover.tsx';
import { FilterMenu, type FilterState } from './FilterMenu.tsx';
import { DisplayMenu } from './DisplayMenu.tsx';
import {
  IconArrowDown,
  IconArrowUp,
  IconGridView,
  IconInfo,
  IconRefresh,
  IconSearch,
  IconSort,
  IconTableView,
} from './icons.tsx';

type ViewMode = 'grid' | 'table';

const GROUP_NOUN: Record<string, string> = {
  creative: 'creatives',
  concept: 'concepts',
  ad: 'ads',
  format: 'formats',
  campaign: 'campaigns',
  adset: 'ad sets',
  geo: 'geos',
  objective: 'objectives',
  primaryText: 'primary texts',
  headline: 'headlines',
};

interface BoardConfig {
  groupBy: GroupDimension;
  metricIds: string[];
  formatTab: FormatFilter;
  sortMetricId: string;
  sortDir: 'asc' | 'desc';
  minSpend: number;
}

function configFromBoard(board: Board): BoardConfig {
  return {
    groupBy: board.groupBy,
    metricIds: board.metricIds,
    formatTab: 'all',
    sortMetricId: board.sortMetricId,
    sortDir: board.sortDir,
    minSpend: board.minSpend ?? 0,
  };
}

function initialBoard(): Board {
  const id = new URLSearchParams(window.location.search).get('board');
  const all = [...BOARDS, ...loadCustomBoards()];
  return all.find((b) => b.id === id) ?? DEFAULT_BOARD;
}

function filtersFromBoard(board: Board): FilterState {
  return {
    campaigns: new Set(board.filters?.campaigns ?? []),
    adsets: new Set(board.filters?.adsets ?? []),
  };
}

/**
 * The full view state lives in the URL so a browser refresh restores exactly
 * what was on screen, and any view can be shared as a link. Defaults are
 * omitted from the URL to keep it short.
 */
interface UrlState {
  platform: PlatformId;
  date: DateSelection;
  panel: 'board' | 'calendar';
  geo: 'off' | GeoBreakdown;
  formatTab: FormatFilter | null;
  groupBy: GroupDimension | null;
  sort: { metricId: string; dir: 'asc' | 'desc' } | null;
  viewMode: ViewMode;
  search: string;
  campaigns: string[];
  adsets: string[];
  noFilter: boolean;
}

const PLATFORM_IDS: PlatformId[] = ['meta', 'tiktok', 'snapchat', 'reddit'];
const FORMAT_TABS: FormatFilter[] = ['all', 'ugc', 'egc', 'static', 'motion'];

function parseUrlState(): UrlState {
  const p = new URLSearchParams(window.location.search);

  const rawPlatform = p.get('platform');
  const platform = PLATFORM_IDS.find((id) => id === rawPlatform) ?? 'meta';

  let date: DateSelection = { presetId: 'last_7d' };
  const rawDate = p.get('date');
  if (rawDate) {
    const custom = rawDate.match(/^(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/);
    if (custom) date = { presetId: 'custom', since: custom[1], until: custom[2] };
    else if (DATE_PRESETS.some((d) => d.id === rawDate)) date = { presetId: rawDate };
  }

  const rawView = p.get('view');
  const panel = rawView === 'calendar' ? rawView : 'board';

  const rawGeo = p.get('geo');
  const rawTab = p.get('tab');
  const rawGroup = p.get('group');
  const rawSort = p.get('sort')?.match(/^([a-zA-Z0-9]+):(asc|desc)$/);

  return {
    platform,
    date,
    panel,
    geo: rawGeo === 'country' || rawGeo === 'region' ? rawGeo : 'off',
    formatTab: FORMAT_TABS.find((t) => t === rawTab) ?? null,
    groupBy: GROUP_DIMENSIONS.find((d) => d.id === rawGroup)?.id ?? null,
    sort: rawSort && METRIC_BY_ID[rawSort[1]] ? { metricId: rawSort[1], dir: rawSort[2] as 'asc' | 'desc' } : null,
    viewMode: p.get('mode') === 'table' ? 'table' : 'grid',
    search: p.get('q') ?? '',
    campaigns: p.getAll('camp'),
    adsets: p.getAll('adset'),
    noFilter: p.get('nofilter') === '1',
  };
}

// Parsed once at startup; every consuming useState initializer reads from this.
let urlInitCache: UrlState | null = null;
function urlInit(): UrlState {
  if (!urlInitCache) urlInitCache = parseUrlState();
  return urlInitCache;
}

export default function CreativeAnalytics() {
  const [platform, setPlatform] = useState<PlatformId>(() => urlInit().platform);
  const [platforms, setPlatforms] = useState<PlatformStatus[]>([]);
  const [date, setDate] = useState<DateSelection>(() => urlInit().date);
  const [customBoards, setCustomBoards] = useState<Board[]>(() => loadCustomBoards());
  const [editor, setEditor] = useState<{ board: Board | null } | null>(null);
  const [calendar, setCalendar] = useState(() => urlInit().panel === 'calendar');
  const [boardId, setBoardId] = useState(() => initialBoard().id);
  const [cfg, setCfg] = useState<BoardConfig>(() => {
    const u = urlInit();
    const base = configFromBoard(initialBoard());
    return {
      ...base,
      ...(u.groupBy ? { groupBy: u.groupBy } : {}),
      ...(u.formatTab ? { formatTab: u.formatTab } : {}),
      ...(u.sort ? { sortMetricId: u.sort.metricId, sortDir: u.sort.dir } : {}),
    };
  });
  const [view, setView] = useState<ViewMode>(() => urlInit().viewMode);
  const [search, setSearch] = useState(() => urlInit().search);
  const [filters, setFilters] = useState<FilterState>(() => {
    const u = urlInit();
    if (u.noFilter) return { campaigns: new Set<string>(), adsets: new Set<string>() };
    if (u.campaigns.length || u.adsets.length) {
      return { campaigns: new Set(u.campaigns), adsets: new Set(u.adsets) };
    }
    return filtersFromBoard(initialBoard());
  });
  const [geo, setGeo] = useState<'off' | GeoBreakdown>(() => urlInit().geo);
  const [openGroup, setOpenGroup] = useState<CreativeGroup | null>(null);

  const [data, setData] = useState<CreativeResponse | null>(null);
  const [account, setAccount] = useState<AccountInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [revalidating, setRevalidating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allBoards = useMemo(() => [...BOARDS, ...customBoards], [customBoards]);
  const board = allBoards.find((b) => b.id === boardId) ?? DEFAULT_BOARD;

  // Geo grouping needs geo-split data; force a country breakdown when the user
  // groups by geo even if they didn't flip the toggle.
  const effectiveBreakdown: GeoBreakdown | undefined =
    geo !== 'off' ? geo : cfg.groupBy === 'geo' ? 'country' : undefined;

  // Cached payloads older than this trigger a silent background refresh. The
  // server keeps snapshots warm via cron, so the client can stay relaxed and
  // avoid poking the API on every quick revisit.
  const STALE_MS = 30 * 60 * 1000;
  // Monotonic id of the latest primary request, so stale async results (after
  // the user changes selection) are ignored.
  const reqId = useRef(0);

  const apply = useCallback((res: CreativeResponse) => {
    setData(res);
    setAccount(res.account);
  }, []);

  // Refresh in place without blanking the grid (shows the pill, not a skeleton).
  const revalidate = useCallback(
    async (sel: DateSelection, breakdown: GeoBreakdown | undefined, hard: boolean) => {
      const id = reqId.current;
      setRevalidating(true);
      try {
        const res = await fetchCreatives(sel, { platform, breakdown, refresh: hard });
        if (id === reqId.current) apply(res);
      } catch {
        /* keep showing current data; explicit errors surface on full loads */
      } finally {
        if (id === reqId.current) setRevalidating(false);
      }
    },
    [apply, platform],
  );

  const load = useCallback(
    async (sel: DateSelection, breakdown: GeoBreakdown | undefined, refresh = false) => {
      const id = ++reqId.current;
      const cached = refresh ? undefined : peekCreatives(sel, { platform, breakdown });
      if (cached) {
        apply(cached.data);
        setLoading(false);
        setError(null);
        if (Date.now() - cached.at > STALE_MS) void revalidate(sel, breakdown, false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetchCreatives(sel, { platform, breakdown, refresh });
        if (id === reqId.current) apply(res);
      } catch (e) {
        if (id === reqId.current) setError(e instanceof Error ? e.message : 'Failed to load data');
      } finally {
        if (id === reqId.current) setLoading(false);
      }
    },
    [apply, revalidate, STALE_MS, platform],
  );

  useEffect(() => {
    if (date.presetId === 'custom' && (!date.since || !date.until)) return;
    void load(date, effectiveBreakdown);
  }, [date, effectiveBreakdown, load]);

  // Discover which ad platforms are connected (for the switcher).
  useEffect(() => {
    fetchPlatforms()
      .then(setPlatforms)
      .catch(() => {
        /* leave the switcher on its Meta-only fallback */
      });
  }, []);

  // Switching platform clears platform-specific selections (campaign/ad set
  // names, geo, search) and the open drill-in; the date + board carry over.
  const selectPlatform = useCallback(
    (id: PlatformId) => {
      if (id === platform) return;
      setPlatform(id);
      setFilters({ campaigns: new Set(), adsets: new Set() });
      setSearch('');
      setGeo('off');
      setOpenGroup(null);
      setCalendar(false);
    },
    [platform],
  );

  // Note: client-side preset prefetching was removed intentionally. Presets are
  // kept warm server-side by the cron warmer, and the API serves snapshots from
  // the store — so the browser never needs to trigger background Meta pulls
  // (which used to be a burst source against the ad-account rate limit).

  // Mirror the full view state into the URL (defaults omitted) so a browser
  // refresh restores the exact view and any state is shareable as a link.
  useEffect(() => {
    const url = new URL(window.location.href);
    const p = url.searchParams;
    const set = (k: string, v: string | null) => (v ? p.set(k, v) : p.delete(k));

    set('platform', platform !== 'meta' ? platform : null);
    set('board', boardId !== DEFAULT_BOARD.id ? boardId : null);
    set('view', calendar ? 'calendar' : null);
    set(
      'date',
      date.presetId === 'custom' && date.since && date.until
        ? `${date.since}:${date.until}`
        : date.presetId !== 'last_7d'
          ? date.presetId
          : null,
    );
    set('geo', geo !== 'off' ? geo : null);
    set('tab', cfg.formatTab !== 'all' ? cfg.formatTab : null);
    set('group', cfg.groupBy !== board.groupBy ? cfg.groupBy : null);
    set(
      'sort',
      cfg.sortMetricId !== board.sortMetricId || cfg.sortDir !== board.sortDir
        ? `${cfg.sortMetricId}:${cfg.sortDir}`
        : null,
    );
    set('mode', view === 'table' ? 'table' : null);
    set('q', search.trim() ? search : null);
    p.delete('camp');
    p.delete('adset');
    p.delete('nofilter');
    const boardFilters = filtersFromBoard(board);
    const sameAsBoard =
      filters.campaigns.size === boardFilters.campaigns.size &&
      filters.adsets.size === boardFilters.adsets.size &&
      [...filters.campaigns].every((c) => boardFilters.campaigns.has(c)) &&
      [...filters.adsets].every((a) => boardFilters.adsets.has(a));
    if (!sameAsBoard) {
      if (filters.campaigns.size === 0 && filters.adsets.size === 0) {
        // Board ships filters but the user cleared them — mark explicitly so a
        // reload doesn't silently restore the board's defaults.
        p.set('nofilter', '1');
      } else {
        for (const c of filters.campaigns) p.append('camp', c);
        for (const a of filters.adsets) p.append('adset', a);
      }
    }

    window.history.replaceState(null, '', url);
  }, [platform, boardId, calendar, date, geo, cfg, view, search, filters, board]);

  const applyBoard = useCallback((next: Board) => {
    setCalendar(false);
    setBoardId(next.id);
    setCfg(configFromBoard(next));
    setFilters(filtersFromBoard(next));
    setOpenGroup(null);
  }, []);

  const selectBoard = (id: string) => {
    applyBoard(allBoards.find((b) => b.id === id) ?? DEFAULT_BOARD);
  };

  const saveBoard = (b: Board) => {
    setCustomBoards((prev) => upsertCustomBoard(prev, b));
    setEditor(null);
    applyBoard(b);
  };

  const deleteBoard = (id: string) => {
    setCustomBoards((prev) => removeCustomBoard(prev, id));
    setEditor(null);
    if (boardId === id) applyBoard(DEFAULT_BOARD);
  };

  const currency = account?.currency ?? 'USD';
  const platformLabel =
    platforms.find((p) => p.id === platform)?.label ?? platform.charAt(0).toUpperCase() + platform.slice(1);
  const rows: CreativeRow[] = data?.rows ?? [];

  // Distinct campaign / ad set names for the filter menu (full universe).
  const filterOptions = useMemo(() => {
    const campaigns = new Set<string>();
    const adsets = new Set<string>();
    for (const r of rows) {
      if (r.campaignName) campaigns.add(r.campaignName);
      if (r.adsetName) adsets.add(r.adsetName);
    }
    const sort = (s: Set<string>) => [...s].sort((a, b) => a.localeCompare(b));
    return { campaigns: sort(campaigns), adsets: sort(adsets) };
  }, [rows]);

  // Base universe restricted by the board's allowed formats + campaign/ad set
  // filters + search query.
  const baseRows = useMemo(() => {
    const allowed = board.formats;
    const q = search.trim().toLowerCase();
    const { campaigns, adsets } = filters;
    return rows.filter((r) => {
      if (allowed !== 'all' && !allowed.includes(classifyFormat(r))) return false;
      if (campaigns.size && !campaigns.has(r.campaignName)) return false;
      if (adsets.size && !adsets.has(r.adsetName)) return false;
      if (q && !(`${r.adName} ${r.campaignName} ${r.adsetName} ${r.geo ?? ''}`.toLowerCase().includes(q))) return false;
      return true;
    });
  }, [rows, board.formats, filters, search]);

  const formatCounts = useMemo(() => {
    const counts: Record<FormatFilter, number> = { all: baseRows.length, ugc: 0, egc: 0, static: 0, motion: 0 };
    for (const r of baseRows) counts[classifyFormat(r)] += 1;
    return counts;
  }, [baseRows]);

  const copyKind = cfg.groupBy === 'primaryText' || cfg.groupBy === 'headline' ? cfg.groupBy : undefined;

  const visibleRows = useMemo(() => {
    if (cfg.formatTab === 'all') return baseRows;
    return baseRows.filter((r) => classifyFormat(r) === cfg.formatTab);
  }, [baseRows, cfg.formatTab]);

  // Spend-weighted account average across the visible universe — the benchmark
  // KPI values are colored against (good / average / poor) and the input to
  // benchmark-relative metrics like Score. Copy dimensions double-count an ad
  // across texts, so skip benchmarking there.
  const benchmark = useMemo(
    () => (copyKind ? undefined : visibleRows.reduce((acc, r) => addMetrics(acc, r.metrics), emptyMetrics())),
    [visibleRows, copyKind],
  );

  const groups = useMemo(() => {
    const raw = isCopyDimension(cfg.groupBy)
      ? groupByCopy(visibleRows, cfg.groupBy as 'primaryText' | 'headline')
      : groupRows(visibleRows, cfg.groupBy);
    const g = raw.filter((x) => x.metrics.spend >= cfg.minSpend);
    const def = METRIC_BY_ID[cfg.sortMetricId];
    g.sort((a, b) => {
      const av = def ? metricValue(def, a, benchmark) : null;
      const bv = def ? metricValue(def, b, benchmark) : null;
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return cfg.sortDir === 'desc' ? bv - av : av - bv;
    });
    return g;
  }, [visibleRows, cfg.groupBy, cfg.minSpend, cfg.sortMetricId, cfg.sortDir, benchmark]);

  /** Account spend for the selected dates + filters — one total per ad (geo rows summed). */
  const totalSpend = useMemo(() => {
    const byAd = new Map<string, number>();
    for (const r of visibleRows) {
      byAd.set(r.adId, (byAd.get(r.adId) ?? 0) + r.metrics.spend);
    }
    return [...byAd.values()].reduce((s, v) => s + v, 0);
  }, [visibleRows]);

  const coverage = useMemo(() => {
    if (!copyKind) return null;
    const withCopy = copyCoverage(visibleRows, copyKind);
    return { withCopy, total: visibleRows.length };
  }, [copyKind, visibleRows]);

  const handleSort = (metricId: string) => {
    setCfg((c) =>
      c.sortMetricId === metricId
        ? { ...c, sortDir: c.sortDir === 'desc' ? 'asc' : 'desc' }
        : { ...c, sortMetricId: metricId, sortDir: 'desc' },
    );
  };

  return (
    <div className="flex h-screen overflow-hidden bg-bg">
      <Sidebar
        account={account}
        platforms={platforms}
        activePlatform={platform}
        onSelectPlatform={selectPlatform}
        activeBoardId={boardId}
        customBoards={customBoards}
        onSelectBoard={selectBoard}
        onNewBoard={() => setEditor({ board: null })}
        onEditBoard={(b) => setEditor({ board: b })}
        calendarActive={calendar}
        onOpenCalendar={() => {
          setCalendar(true);
        }}
      />

      {calendar ? (
        <CalendarView
          rows={rows}
          currency={currency}
          date={date}
          onDateChange={setDate}
          loading={loading}
        />
      ) : (
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Board header */}
        <header className="px-6 pt-5 pb-3 border-b border-border-subtle shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h1 className="text-[20px] font-bold text-text tracking-tight">{board.label}</h1>
              <p className="text-[12.5px] text-text-tertiary mt-0.5">{board.description}</p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <div className="text-right mr-1">
                <div className="text-[11px] text-text-tertiary">
                  Account spend · {data?.range.label ?? '—'}
                </div>
                <div className="text-[14px] font-bold text-text tabular-nums">
                  {new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(totalSpend)}
                </div>
              </div>
              <button
                type="button"
                onClick={() => void revalidate(date, effectiveBreakdown, true)}
                className="h-8 w-8 grid place-items-center rounded-md border border-border bg-surface text-text-tertiary hover:text-text hover:bg-surface-hover transition-colors"
                title="Refresh live data"
              >
                <IconRefresh className={`w-4 h-4 ${loading || revalidating ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Controls row 1: date, sort, filter, display, view */}
          <div className="flex items-center gap-2 mt-4 flex-wrap">
            <DateSelector value={date} onChange={setDate} />

            <Popover
              label={
                <span className="inline-flex items-center gap-1.5">
                  <IconSort className="w-3.5 h-3.5 text-text-tertiary" />
                  Sort: <span className="text-text">{METRIC_BY_ID[cfg.sortMetricId]?.short ?? '—'}</span>
                  {cfg.sortDir === 'desc' ? (
                    <IconArrowDown className="w-3 h-3 text-text-tertiary" />
                  ) : (
                    <IconArrowUp className="w-3 h-3 text-text-tertiary" />
                  )}
                </span>
              }
              panelClassName="max-h-[20rem] overflow-y-auto"
            >
              {(close) => (
                <div>
                  {cfg.metricIds.map((id) => {
                    const def = METRIC_BY_ID[id];
                    if (!def) return null;
                    const active = cfg.sortMetricId === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => {
                          // Re-clicking the active metric flips direction and
                          // keeps the menu open so the arrow flip is visible;
                          // picking a new metric sorts desc and closes.
                          handleSort(id);
                          if (!active) close();
                        }}
                        className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-[12.5px] transition-colors ${
                          active ? 'bg-accent-muted text-text' : 'text-text-secondary hover:bg-surface-hover hover:text-text'
                        }`}
                      >
                        {def.label}
                        {active &&
                          (cfg.sortDir === 'desc' ? (
                            <IconArrowDown className="w-3.5 h-3.5 text-text-secondary" />
                          ) : (
                            <IconArrowUp className="w-3.5 h-3.5 text-text-secondary" />
                          ))}
                      </button>
                    );
                  })}
                  <div className="mt-1 pt-1 border-t border-border-subtle px-2.5 py-1.5 text-[10.5px] text-text-tertiary">
                    Click the active metric to reverse order.
                  </div>
                </div>
              )}
            </Popover>

            <FilterMenu
              campaigns={filterOptions.campaigns}
              adsets={filterOptions.adsets}
              value={filters}
              onChange={setFilters}
            />

            <DisplayMenu
              groupBy={cfg.groupBy}
              onGroupBy={(d) => setCfg((c) => ({ ...c, groupBy: d }))}
              geo={geo}
              onGeo={setGeo}
              defaultGroupBy={board.groupBy}
            />

            <div className="ml-auto flex items-center gap-2">
              <div className="relative">
                <IconSearch className="w-3.5 h-3.5 text-text-tertiary absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by ad name…"
                  className="h-8 w-48 pl-8 pr-2.5 rounded-md border border-border bg-surface text-[12.5px] text-text placeholder:text-text-tertiary focus:outline-none focus:border-accent-muted"
                />
              </div>
              <div className="inline-flex items-center p-0.5 rounded-md border border-border bg-surface">
                <button
                  type="button"
                  onClick={() => setView('grid')}
                  className={`h-7 w-7 grid place-items-center rounded ${view === 'grid' ? 'bg-surface-raised text-text' : 'text-text-tertiary hover:text-text-secondary'}`}
                  title="Grid view"
                >
                  <IconGridView className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setView('table')}
                  className={`h-7 w-7 grid place-items-center rounded ${view === 'table' ? 'bg-surface-raised text-text' : 'text-text-tertiary hover:text-text-secondary'}`}
                  title="Table view"
                >
                  <IconTableView className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Controls row 2: metrics + format tabs + reading guide */}
          <div className="flex items-center gap-3 mt-3 flex-wrap justify-between">
            <MetricBar selected={cfg.metricIds} onChange={(ids) => setCfg((c) => ({ ...c, metricIds: ids }))} />
            <div className="flex items-center gap-2">
              <FormatTabs value={cfg.formatTab} counts={formatCounts} onChange={(f) => setCfg((c) => ({ ...c, formatTab: f }))} />
              <Popover
                showChevron={false}
                align="right"
                label={
                  <>
                    <IconInfo className="w-4 h-4" />
                    <span className="sr-only">How to read this board</span>
                  </>
                }
                className="w-8 px-0 justify-center text-text-tertiary"
                panelClassName="w-72 p-3"
              >
                {() => (
                  <div className="space-y-3">
                    {cfg.metricIds.includes('score') && (
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
                          Score
                        </div>
                        <p className="text-[11px] text-text-tertiary leading-relaxed">
                          Ranks proven winners: CPA and ROAS vs the account average, with a bonus for holding
                          efficiency at scale. 100 ≈ an average performer at $1k spend — above 100 beats the account.
                        </p>
                      </div>
                    )}
                    <div>
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
                        KPI colors
                      </div>
                      <div className="space-y-1 text-[12px] text-text-secondary">
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-win-pill-text" /> Good — beats the account average
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-inconclusive-pill-text" /> Average — within ±15%
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-loss-pill-text" /> Poor — trails the account average
                        </div>
                      </div>
                      <p className="mt-1.5 text-[11px] text-text-tertiary leading-relaxed">
                        The benchmark is the spend-weighted account average across everything in view for the selected dates.
                      </p>
                    </div>
                    {coverage && (
                      <div className="pt-2 border-t border-border-subtle">
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-text-tertiary mb-1.5">
                          Copy attribution
                        </div>
                        <p className="text-[11px] text-text-tertiary leading-relaxed">
                          Directional: an ad's results count toward every text it carries. Retrievable copy covers{' '}
                          <span className="text-text-secondary font-medium">{coverage.withCopy}</span> of {coverage.total}{' '}
                          creatives in view (boosted-post copy isn't exposed by the API).
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </Popover>
            </div>
          </div>
        </header>

        {/* Body */}
        <main className="relative flex-1 overflow-y-auto px-6 py-5">
          {error ? (
            <ErrorState platformLabel={platformLabel} message={error} onRetry={() => void load(date, effectiveBreakdown, true)} />
          ) : loading && !data ? (
            <GridSkeleton />
          ) : (
            <>
              <div className={loading ? 'opacity-40 pointer-events-none transition-opacity' : 'transition-opacity'}>
                {groups.length === 0 ? (
                  <EmptyState />
                ) : view === 'grid' ? (
                  <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
                    {groups.map((g, i) => (
                      <CreativeCard
                        key={g.key}
                        group={g}
                        metricIds={cfg.metricIds}
                        currency={currency}
                        rank={i + 1}
                        benchmark={benchmark}
                        copyKind={copyKind}
                        onOpen={copyKind ? undefined : setOpenGroup}
                      />
                    ))}
                  </div>
                ) : (
                  <CreativeTable
                    groups={groups}
                    metricIds={cfg.metricIds}
                    currency={currency}
                    sortMetricId={cfg.sortMetricId}
                    sortDir={cfg.sortDir}
                    onSort={handleSort}
                    benchmark={benchmark}
                    copyKind={copyKind}
                    onOpen={copyKind ? undefined : setOpenGroup}
                  />
                )}
              </div>

              {data && (
                <div className="mt-6 text-[11px] text-text-tertiary">
                  {groups.length} {GROUP_NOUN[cfg.groupBy] ?? 'groups'} · Updated{' '}
                  {new Date(data.fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                </div>
              )}
            </>
          )}

          {/* Floating refetch indicator. A blocking load (no cache) dims the grid;
              a background revalidate keeps it fully interactive. */}
          {((loading && data) || revalidating) && (
            <div className="sticky bottom-4 flex justify-center pointer-events-none">
              <div className="inline-flex items-center gap-2 h-9 px-4 rounded-full border border-border bg-surface-raised shadow-xl shadow-black/40 text-[12.5px] font-medium text-text">
                <IconRefresh className="w-4 h-4 text-accent-hover animate-spin" />
                {revalidating ? 'Refreshing…' : 'Loading live data…'}
              </div>
            </div>
          )}
        </main>
      </div>
      )}

      {openGroup && (
        <DrillIn
          group={openGroup}
          metricIds={cfg.metricIds}
          currency={currency}
          benchmark={benchmark}
          onClose={() => setOpenGroup(null)}
        />
      )}

      {editor && (
        <BoardEditor
          initial={editor.board}
          campaigns={filterOptions.campaigns}
          adsets={filterOptions.adsets}
          onSave={saveBoard}
          onDelete={editor.board ? deleteBoard : undefined}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
      {Array.from({ length: 10 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-surface overflow-hidden">
          <div className="aspect-square bg-surface-hover animate-pulse" />
          <div className="p-3 space-y-2">
            <div className="h-3 w-3/4 bg-surface-hover rounded animate-pulse" />
            <div className="h-2.5 w-1/2 bg-surface-hover rounded animate-pulse" />
            <div className="h-5 w-2/3 bg-surface-hover rounded animate-pulse mt-3" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return (
    <div className="h-full grid place-items-center py-20">
      <div className="text-center">
        <div className="text-[14px] font-semibold text-text">No creatives match this view</div>
        <div className="text-[12.5px] text-text-tertiary mt-1">
          Try a wider date range, a different format, or clear the search.
        </div>
      </div>
    </div>
  );
}

function ErrorState({ platformLabel, message, onRetry }: { platformLabel: string; message: string; onRetry: () => void }) {
  return (
    <div className="h-full grid place-items-center py-20">
      <div className="text-center max-w-md">
        <div className="text-[14px] font-semibold text-loss-pill-text">Couldn’t load {platformLabel} data</div>
        <div className="text-[12.5px] text-text-secondary mt-2">{message}</div>
        <div className="text-[11.5px] text-text-tertiary mt-2">
          Check that this platform's API credentials are configured (see the connection status in the sidebar).
        </div>
        <button
          type="button"
          onClick={onRetry}
          className="mt-4 h-8 px-3 rounded-md border border-border bg-surface text-[12.5px] font-medium text-text hover:bg-surface-hover"
        >
          Retry
        </button>
      </div>
    </div>
  );
}
