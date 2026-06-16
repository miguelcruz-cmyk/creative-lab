import { useEffect, useRef, useState } from 'react';
import type { PlatformId, PlatformStatus } from '../../creative/api.ts';
import { IconChevronDown, IconCheck } from './icons.tsx';

/** Brand dot color per platform (kept subtle against the dark UI). */
const DOT: Record<string, string> = {
  meta: '#1877F2',
  tiktok: '#FF2D55',
  snapchat: '#F5C518',
  reddit: '#FF4500',
};

interface PlatformSwitcherProps {
  platforms: PlatformStatus[];
  active: PlatformId;
  onSelect: (id: PlatformId) => void;
}

export function PlatformSwitcher({ platforms, active, onSelect }: PlatformSwitcherProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Until /api/platforms responds, show just the active platform so the label
  // never flashes a different platform than the one being loaded.
  const list: PlatformStatus[] =
    platforms.length > 0
      ? platforms
      : [
          {
            id: active,
            label: active.charAt(0).toUpperCase() + active.slice(1),
            configured: true,
            missing: [],
          },
        ];
  const current = list.find((p) => p.id === active) ?? list[0];

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md border border-border bg-surface hover:bg-surface-hover transition-colors"
      >
        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: DOT[current.id] ?? '#8b6dff' }} />
        <div className="min-w-0 flex-1 text-left leading-tight">
          <div className="text-[10px] text-text-tertiary font-medium uppercase tracking-wide">Platform</div>
          <div className="text-[13px] font-semibold text-text truncate">{current.label}</div>
        </div>
        <IconChevronDown className="w-3.5 h-3.5 text-text-tertiary shrink-0" />
      </button>

      {open && (
        <div className="absolute z-30 mt-1.5 left-0 right-0 rounded-lg border border-border bg-surface-raised shadow-xl shadow-black/40 p-1">
          {list.map((p) => {
            const isActive = p.id === active;
            const disabled = !p.configured;
            return (
              <button
                key={p.id}
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (disabled) return;
                  onSelect(p.id);
                  setOpen(false);
                }}
                title={disabled ? `Needs setup: ${p.missing.join(', ')}` : undefined}
                className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left transition-colors ${
                  disabled
                    ? 'cursor-not-allowed opacity-50'
                    : isActive
                      ? 'bg-accent-muted text-text'
                      : 'text-text-secondary hover:bg-surface-hover hover:text-text'
                }`}
              >
                <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: DOT[p.id] ?? '#8b6dff' }} />
                <span className="text-[12.5px] font-medium truncate flex-1">{p.label}</span>
                {disabled ? (
                  <span className="text-[10px] text-text-tertiary shrink-0">Not connected</span>
                ) : isActive ? (
                  <IconCheck className="w-3.5 h-3.5 text-accent-hover shrink-0" />
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
