import { METRICS, METRIC_BY_ID, METRIC_GROUP_LABELS, type MetricGroup } from '../../creative/metrics.ts';
import { Popover } from './Popover.tsx';
import { IconClose, IconPlus } from './icons.tsx';

interface MetricBarProps {
  selected: string[];
  onChange: (ids: string[]) => void;
}

export function MetricBar({ selected, onChange }: MetricBarProps) {
  const remove = (id: string) => onChange(selected.filter((m) => m !== id));
  const toggle = (id: string) =>
    selected.includes(id) ? remove(id) : onChange([...selected, id]);

  const grouped = (Object.keys(METRIC_GROUP_LABELS) as MetricGroup[]).map((g) => ({
    group: g,
    metrics: METRICS.filter((m) => m.group === g),
  }));

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {selected.map((id) => {
        const def = METRIC_BY_ID[id];
        if (!def) return null;
        return (
          <span
            key={id}
            className="group inline-flex items-center gap-0.5 h-8 pl-2.5 pr-1 rounded-md border border-border bg-surface text-[12.5px] font-medium text-text-secondary"
          >
            {def.label}
            {/* Remove affordance appears on hover; space is reserved so chips don't shift. */}
            <button
              type="button"
              onClick={() => remove(id)}
              className="w-5 h-5 grid place-items-center rounded text-text-tertiary opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-text hover:bg-surface-hover transition-opacity"
              aria-label={`Remove ${def.label}`}
            >
              <IconClose className="w-3 h-3" />
            </button>
          </span>
        );
      })}

      <Popover
        showChevron={false}
        label={
          <span className="inline-flex items-center gap-1 text-accent-hover">
            <IconPlus className="w-3.5 h-3.5" />
            Add metric
          </span>
        }
        className="text-accent-hover border-dashed"
        panelClassName="w-60 max-h-[22rem] overflow-y-auto"
      >
        {() => (
          <div>
            {grouped.map(({ group, metrics }) => (
              <div key={group} className="mb-1">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
                  {METRIC_GROUP_LABELS[group]}
                </div>
                {metrics.map((m) => {
                  const on = selected.includes(m.id);
                  return (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => toggle(m.id)}
                      className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-[12.5px] text-text-secondary hover:bg-surface-hover hover:text-text transition-colors"
                    >
                      <span>{m.label}</span>
                      <span
                        className={`w-4 h-4 rounded border grid place-items-center ${
                          on ? 'bg-accent border-accent' : 'border-border'
                        }`}
                      >
                        {on && (
                          <svg viewBox="0 0 24 24" className="w-3 h-3 text-white" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                            <path d="m5 12 4 4 10-10" />
                          </svg>
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </Popover>
    </div>
  );
}
