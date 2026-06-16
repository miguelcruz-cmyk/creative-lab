import { DATE_PRESETS, type DateSelection } from '../../creative/api.ts';
import { Popover } from './Popover.tsx';
import { Calendar } from './Calendar.tsx';
import { IconCalendar } from './icons.tsx';

interface DateSelectorProps {
  value: DateSelection;
  onChange: (value: DateSelection) => void;
}

function currentLabel(value: DateSelection): string {
  if (value.presetId === 'custom') {
    return value.since && value.until ? `${value.since} → ${value.until}` : 'Custom range';
  }
  return DATE_PRESETS.find((p) => p.id === value.presetId)?.label ?? 'Last 7 days';
}

export function DateSelector({ value, onChange }: DateSelectorProps) {
  const today = new Date().toISOString().slice(0, 10);
  return (
    <Popover
      label={
        <span className="inline-flex items-center gap-1.5">
          <IconCalendar className="w-3.5 h-3.5 text-text-tertiary" />
          {currentLabel(value)}
        </span>
      }
      panelClassName="w-72"
    >
      {(close) => (
        <div>
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
            Presets
          </div>
          {DATE_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onChange({ presetId: p.id });
                close();
              }}
              className={`w-full text-left px-2.5 py-1.5 rounded-md text-[12.5px] transition-colors ${
                value.presetId === p.id
                  ? 'bg-accent-muted text-text'
                  : 'text-text-secondary hover:bg-surface-hover hover:text-text'
              }`}
            >
              {p.label}
            </button>
          ))}
          <div className="my-1 border-t border-border-subtle" />
          <div className="flex items-center justify-between px-2 py-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
              Custom range
            </span>
            <span className="text-[10.5px] text-text-secondary tabular-nums">
              {value.presetId === 'custom' && value.since
                ? value.until
                  ? `${value.since} → ${value.until}`
                  : `${value.since} → …`
                : 'Pick start & end'}
            </span>
          </div>
          <Calendar
            since={value.presetId === 'custom' ? value.since : undefined}
            until={value.presetId === 'custom' ? value.until : undefined}
            max={today}
            onChange={(since, until) => {
              onChange({ presetId: 'custom', since, until });
              if (since && until) close();
            }}
          />
        </div>
      )}
    </Popover>
  );
}
