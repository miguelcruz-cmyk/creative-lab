import { useState } from 'react';
import { IconChevronDown } from './icons.tsx';

interface CalendarProps {
  /** Selected range endpoints as YYYY-MM-DD (until may be undefined mid-pick). */
  since?: string;
  until?: string;
  /** Latest selectable day (YYYY-MM-DD); future days are disabled. */
  max: string;
  onChange: (since: string, until: string | undefined) => void;
}

const pad = (n: number) => String(n).padStart(2, '0');
const keyOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function parseKey(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m: m - 1, d };
}

/**
 * Two-click date-range picker. First click sets the start (clears end); second
 * click sets the end (auto-orders if you click an earlier day). Range selection
 * spans months via the month nav; selection lives entirely in the parent props.
 */
export function Calendar({ since, until, max, onChange }: CalendarProps) {
  const anchor = since ? parseKey(since) : parseKey(max);
  const [view, setView] = useState({ y: anchor.y, m: anchor.m });

  const firstDow = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const click = (key: string) => {
    if (!since || (since && until)) onChange(key, undefined);
    else if (key < since) onChange(key, since);
    else onChange(since, key);
  };

  const shiftMonth = (delta: number) => {
    const next = new Date(view.y, view.m + delta, 1);
    setView({ y: next.getFullYear(), m: next.getMonth() });
  };

  const navBtn =
    'h-7 w-7 grid place-items-center rounded-md text-text-tertiary hover:text-text hover:bg-surface-hover transition-colors';

  return (
    <div className="px-1 select-none">
      <div className="flex items-center justify-between mb-1.5">
        <button type="button" onClick={() => shiftMonth(-1)} className={navBtn} aria-label="Previous month">
          <IconChevronDown className="w-4 h-4 rotate-90" />
        </button>
        <span className="text-[12.5px] font-semibold text-text">
          {MONTHS[view.m]} {view.y}
        </span>
        <button type="button" onClick={() => shiftMonth(1)} className={navBtn} aria-label="Next month">
          <IconChevronDown className="w-4 h-4 -rotate-90" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 mb-0.5">
        {DOW.map((d, i) => (
          <span key={i} className="h-6 grid place-items-center text-[10px] font-medium text-text-tertiary">
            {d}
          </span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((day, i) => {
          if (day === null) return <span key={i} />;
          const key = keyOf(view.y, view.m, day);
          const disabled = key > max;
          const isStart = key === since;
          const isEnd = key === until;
          const inRange = since && until && key > since && key < until;
          const endpoint = isStart || isEnd;
          return (
            <button
              key={i}
              type="button"
              disabled={disabled}
              onClick={() => click(key)}
              className={`h-8 grid place-items-center rounded-md text-[12px] tabular-nums transition-colors ${
                disabled
                  ? 'text-text-tertiary/40 cursor-not-allowed'
                  : endpoint
                    ? 'bg-accent text-white font-semibold'
                    : inRange
                      ? 'bg-accent-muted text-text'
                      : 'text-text-secondary hover:bg-surface-hover hover:text-text'
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
