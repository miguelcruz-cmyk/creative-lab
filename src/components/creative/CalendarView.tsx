import { useMemo, useState } from 'react';
import { bucketLaunches, monthKeyOf, type LaunchAd } from '../../creative/launches.ts';
import { FORMAT_META, isVideoFormat } from '../../creative/format.ts';
import { formatMetric, METRIC_BY_ID } from '../../creative/metrics.ts';
import { type DateSelection } from '../../creative/api.ts';
import type { CreativeFormat, CreativeRow } from '../../creative/types.ts';
import { DateSelector } from './DateSelector.tsx';
import { IconCalendar, IconChevronDown, IconClose, IconPlay } from './icons.tsx';

interface CalendarViewProps {
  rows: CreativeRow[];
  currency: string;
  date: DateSelection;
  onDateChange: (d: DateSelection) => void;
  loading: boolean;
}

const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const FORMAT_DOT: Record<CreativeFormat, string> = {
  ugc: 'bg-[oklch(62%_0.17_25)]',
  egc: 'bg-[oklch(62%_0.15_150)]',
  static: 'bg-[oklch(60%_0.13_240)]',
  motion: 'bg-[oklch(62%_0.16_300)]',
};

const todayKey = (() => {
  const d = new Date();
  return keyOf(d.getFullYear(), d.getMonth(), d.getDate());
})();

export function CalendarView({ rows, currency, date, onDateChange, loading }: CalendarViewProps) {
  const buckets = useMemo(() => bucketLaunches(rows), [rows]);

  // Default to the most recent month that has launches; fall back to today.
  const defaultMonth = useMemo(() => {
    const latest = buckets.months[buckets.months.length - 1];
    if (latest) {
      const [y, m] = latest.split('-').map(Number);
      return { y, m: m - 1 };
    }
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  }, [buckets.months]);

  const [override, setOverride] = useState<{ y: number; m: number } | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const view = override ?? defaultMonth;
  const monthKey = `${view.y}-${pad(view.m + 1)}`;

  const firstDow = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const monthTotal = useMemo(() => {
    let n = 0;
    for (const [dateKey, list] of buckets.byDay) {
      if (monthKeyOf(dateKey) === monthKey) n += list.length;
    }
    return n;
  }, [buckets.byDay, monthKey]);

  const shiftMonth = (delta: number) => {
    const next = new Date(view.y, view.m + delta, 1);
    setOverride({ y: next.getFullYear(), m: next.getMonth() });
    setSelectedDay(null);
  };

  const selectedAds = selectedDay ? buckets.byDay.get(selectedDay) ?? [] : [];

  const navBtn =
    'h-8 w-8 grid place-items-center rounded-md border border-border bg-surface text-text-tertiary hover:text-text hover:bg-surface-hover transition-colors';

  return (
    <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden">
      <header className="px-6 h-14 shrink-0 flex items-center justify-between border-b border-border-subtle">
        <div className="flex items-center gap-2.5">
          <IconCalendar className="w-5 h-5 text-accent-hover" />
          <div className="leading-tight">
            <div className="text-[15px] font-bold text-text tracking-tight">Launch Calendar</div>
            <div className="text-[11px] text-text-tertiary">When ads went live, by Meta launch date</div>
          </div>
        </div>
        <DateSelector value={date} onChange={onDateChange} />
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {/* Month nav */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => shiftMonth(-1)} className={navBtn} aria-label="Previous month">
              <IconChevronDown className="w-4 h-4 rotate-90" />
            </button>
            <button type="button" onClick={() => shiftMonth(1)} className={navBtn} aria-label="Next month">
              <IconChevronDown className="w-4 h-4 -rotate-90" />
            </button>
            <h2 className="ml-1 text-[16px] font-bold text-text tracking-tight">
              {MONTHS[view.m]} {view.y}
            </h2>
            <span className="text-[12px] text-text-tertiary">
              {monthTotal} launch{monthTotal === 1 ? '' : 'es'}
            </span>
          </div>
          {buckets.months.length > 0 && monthKey !== buckets.months[buckets.months.length - 1] && (
            <button
              type="button"
              onClick={() => {
                setOverride(null);
                setSelectedDay(null);
              }}
              className="h-8 px-3 rounded-md border border-border bg-surface text-[12px] font-medium text-text-secondary hover:text-text hover:bg-surface-hover transition-colors"
            >
              Jump to latest
            </button>
          )}
        </div>

        <p className="mb-3 text-[11.5px] text-text-tertiary">
          Each ad is placed on its Meta launch date. Only ads that delivered in the selected range appear — widen the
          date range to surface more launches.
          {buckets.unknown > 0 && (
            <span> {buckets.unknown} ad{buckets.unknown === 1 ? '' : 's'} have no launch date yet (refresh to populate).</span>
          )}
        </p>

        {/* Weekday header */}
        <div className="grid grid-cols-7 gap-1 mb-1">
          {DOW.map((d) => (
            <div key={d} className="px-1 text-[10.5px] font-semibold uppercase tracking-wider text-text-tertiary">
              {d}
            </div>
          ))}
        </div>

        {/* Month grid */}
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) return <div key={i} className="min-h-[88px] rounded-lg" />;
            const dateKey = keyOf(view.y, view.m, day);
            const ads = buckets.byDay.get(dateKey) ?? [];
            const isToday = dateKey === todayKey;
            const has = ads.length > 0;
            return (
              <button
                key={i}
                type="button"
                disabled={!has}
                onClick={() => setSelectedDay(dateKey)}
                className={`min-h-[88px] rounded-lg border p-1.5 flex flex-col text-left transition-colors ${
                  has
                    ? 'border-border bg-surface hover:bg-surface-hover hover:border-accent-muted cursor-pointer'
                    : 'border-border-subtle bg-surface/30 cursor-default'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[11px] tabular-nums ${
                      isToday
                        ? 'w-5 h-5 grid place-items-center rounded-full bg-accent text-white font-bold'
                        : has
                          ? 'text-text-secondary font-medium'
                          : 'text-text-tertiary'
                    }`}
                  >
                    {day}
                  </span>
                  {has && (
                    <span className="text-[10px] font-semibold text-accent-hover tabular-nums">{ads.length}</span>
                  )}
                </div>

                {has && (
                  <div className="mt-auto">
                    <div className="flex gap-0.5">
                      {ads.slice(0, 3).map((ad) => (
                        <DayThumb key={ad.adId} ad={ad} />
                      ))}
                      {ads.length > 3 && (
                        <span className="w-6 h-6 rounded grid place-items-center text-[9px] font-semibold text-text-tertiary bg-surface-hover">
                          +{ads.length - 3}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {!loading && buckets.total === 0 && (
          <div className="mt-10 text-center">
            <div className="text-[13.5px] font-semibold text-text">No launch dates in this range</div>
            <div className="text-[12px] text-text-tertiary mt-1">
              Try a wider date range, or refresh — launch dates populate on the next data sync.
            </div>
          </div>
        )}
      </div>

      {selectedDay && (
        <DayDetail
          dateKey={selectedDay}
          ads={selectedAds}
          currency={currency}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
}

function DayThumb({ ad }: { ad: LaunchAd }) {
  const isVideo = isVideoFormat(ad.format);
  return (
    <span className="relative w-6 h-6 rounded overflow-hidden bg-black/40 shrink-0" title={ad.adName}>
      {ad.thumbnailUrl ? (
        <img src={ad.thumbnailUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <span className={`absolute inset-0 ${FORMAT_DOT[ad.format]} opacity-70`} />
      )}
      {isVideo && (
        <span className="absolute inset-0 grid place-items-center">
          <IconPlay className="w-2.5 h-2.5 text-white/90" />
        </span>
      )}
    </span>
  );
}

function fmtDayTitle(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function DayDetail({
  dateKey,
  ads,
  currency,
  onClose,
}: {
  dateKey: string;
  ads: LaunchAd[];
  currency: string;
  onClose: () => void;
}) {
  const spendDef = METRIC_BY_ID.spend;
  const roasDef = METRIC_BY_ID.roas;
  const totalSpend = ads.reduce((s, a) => s + a.metrics.spend, 0);

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <aside className="relative w-full max-w-md h-full bg-bg border-l border-border shadow-2xl shadow-black/50 flex flex-col">
        <div className="flex items-start gap-3 p-4 border-b border-border-subtle">
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-semibold text-text leading-snug">{fmtDayTitle(dateKey)}</div>
            <div className="text-[11.5px] text-text-tertiary mt-0.5">
              {ads.length} ad{ads.length === 1 ? '' : 's'} launched ·{' '}
              {spendDef ? formatMetric(totalSpend, spendDef.unit, currency) : ''} spend
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

        <div className="flex-1 overflow-y-auto divide-y divide-border-subtle">
          {ads.map((ad) => {
            const isVideo = isVideoFormat(ad.format);
            const inner = (
              <>
                <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-black/40 shrink-0">
                  {ad.thumbnailUrl ? (
                    <img src={ad.thumbnailUrl} alt="" className="w-full h-full object-cover" loading="lazy" />
                  ) : (
                    <span className={`absolute inset-0 ${FORMAT_DOT[ad.format]} opacity-70`} />
                  )}
                  {isVideo && (
                    <span className="absolute inset-0 grid place-items-center">
                      <IconPlay className="w-3.5 h-3.5 text-white/90" />
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-medium text-text truncate" title={ad.adName}>
                    {ad.adName}
                  </div>
                  <div className="text-[11px] text-text-tertiary truncate mt-0.5">
                    <span className="inline-flex items-center gap-1">
                      <span className={`w-1.5 h-1.5 rounded-full ${FORMAT_DOT[ad.format]}`} />
                      {FORMAT_META[ad.format].label}
                    </span>
                    {' · '}
                    {ad.campaignName}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[12.5px] font-semibold text-text tabular-nums">
                    {spendDef ? formatMetric(ad.metrics.spend, spendDef.unit, currency) : ''}
                  </div>
                  {roasDef && (
                    <div className="text-[11px] text-text-tertiary tabular-nums">
                      {formatMetric(roasDef.compute(ad.metrics), roasDef.unit, currency)} ROAS
                    </div>
                  )}
                </div>
              </>
            );
            return ad.permalink ? (
              <a
                key={ad.adId}
                href={ad.permalink}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 px-4 py-3 hover:bg-surface-hover transition-colors"
              >
                {inner}
              </a>
            ) : (
              <div key={ad.adId} className="flex items-center gap-3 px-4 py-3">
                {inner}
              </div>
            );
          })}
        </div>
      </aside>
    </div>
  );
}
