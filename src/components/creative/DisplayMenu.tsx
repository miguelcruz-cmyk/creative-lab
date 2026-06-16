import { GROUP_DIMENSIONS, type GroupDimension } from '../../creative/aggregate.ts';
import type { GeoBreakdown } from '../../creative/api.ts';
import { Popover } from './Popover.tsx';
import { IconSliders } from './icons.tsx';

export type GeoSetting = 'off' | GeoBreakdown;

interface DisplayMenuProps {
  groupBy: GroupDimension;
  onGroupBy: (d: GroupDimension) => void;
  geo: GeoSetting;
  onGeo: (g: GeoSetting) => void;
  /** The board's own grouping — used to show the "modified" dot on the trigger. */
  defaultGroupBy: GroupDimension;
}

const GEO_OPTIONS: { id: GeoSetting; label: string }[] = [
  { id: 'off', label: 'Off (account total)' },
  { id: 'country', label: 'Segment by country' },
  { id: 'region', label: 'Segment by region' },
];

/**
 * Power-user view options tucked behind a single control: how rows are grouped
 * and whether results split by geography. Boards already pick a sensible
 * grouping, so most users never need to open this — a small accent dot on the
 * trigger signals when the view diverges from the board default.
 */
export function DisplayMenu({ groupBy, onGroupBy, geo, onGeo, defaultGroupBy }: DisplayMenuProps) {
  const modified = groupBy !== defaultGroupBy || geo !== 'off';

  const item = (active: boolean, label: string, onClick: () => void, key: string) => (
    <button
      key={key}
      type="button"
      onClick={onClick}
      className={`w-full text-left px-2.5 py-1.5 rounded-md text-[12.5px] transition-colors ${
        active ? 'bg-accent-muted text-text' : 'text-text-secondary hover:bg-surface-hover hover:text-text'
      }`}
    >
      {label}
    </button>
  );

  return (
    <Popover
      label={
        <span className="inline-flex items-center gap-1.5">
          <IconSliders className="w-3.5 h-3.5 text-text-tertiary" />
          Display
          {modified && <span className="w-1.5 h-1.5 rounded-full bg-accent" />}
        </span>
      }
      panelClassName="w-60"
    >
      {(close) => (
        <div>
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
            Group by
          </div>
          {GROUP_DIMENSIONS.map((d) =>
            item(
              groupBy === d.id,
              d.label,
              () => {
                onGroupBy(d.id);
                close();
              },
              `group-${d.id}`,
            ),
          )}

          <div className="my-1 border-t border-border-subtle" />
          <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
            Geo split
          </div>
          {GEO_OPTIONS.map((o) =>
            item(
              geo === o.id,
              o.label,
              () => {
                onGeo(o.id);
                close();
              },
              `geo-${o.id}`,
            ),
          )}
          <div className="mt-1 pt-1 border-t border-border-subtle px-2.5 py-1.5 text-[10.5px] text-text-tertiary">
            Geo splits pull platform breakdowns — slower, more rows.
          </div>
        </div>
      )}
    </Popover>
  );
}
