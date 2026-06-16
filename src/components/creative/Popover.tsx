import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IconChevronDown } from './icons.tsx';

interface PopoverProps {
  label: ReactNode;
  children: (close: () => void) => ReactNode;
  align?: 'left' | 'right';
  className?: string;
  panelClassName?: string;
  showChevron?: boolean;
}

export function Popover({
  label,
  children,
  align = 'left',
  className = '',
  panelClassName = '',
  showChevron = true,
}: PopoverProps) {
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

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-border bg-surface text-[12.5px] font-medium text-text-secondary hover:text-text hover:border-border hover:bg-surface-hover transition-colors ${className}`}
      >
        {label}
        {showChevron && <IconChevronDown className="w-3.5 h-3.5 text-text-tertiary -mr-0.5" />}
      </button>
      {open && (
        <div
          className={`absolute z-30 mt-1.5 min-w-[12rem] rounded-lg border border-border bg-surface-raised shadow-xl shadow-black/40 p-1 ${
            align === 'right' ? 'right-0' : 'left-0'
          } ${panelClassName}`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}
