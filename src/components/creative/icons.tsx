import type { IconName } from '../../creative/boards.ts';

type IconProps = { className?: string };

const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function BoardIcon({ name, className }: { name: IconName; className?: string }) {
  const common = { className, viewBox: '0 0 24 24', xmlns: 'http://www.w3.org/2000/svg', ...base };
  switch (name) {
    case 'grid':
      return (
        <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
      );
    case 'video':
      return (
        <svg {...common}><rect x="3" y="5" width="14" height="14" rx="2" /><path d="m17 9 4-2v10l-4-2" /></svg>
      );
    case 'layers':
      return (
        <svg {...common}><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 13 9 5 9-5" /></svg>
      );
    case 'zap':
      return (
        <svg {...common}><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /></svg>
      );
    case 'target':
      return (
        <svg {...common}><circle cx="12" cy="12" r="8.5" /><circle cx="12" cy="12" r="4.5" /><circle cx="12" cy="12" r="1" /></svg>
      );
    case 'trending':
      return (
        <svg {...common}><path d="m3 16 6-6 4 4 7-7" /><path d="M16 7h5v5" /></svg>
      );
    case 'alert':
      return (
        <svg {...common}><path d="M12 3 2.5 20h19L12 3Z" /><path d="M12 10v4" /><path d="M12 17.5h.01" /></svg>
      );
    case 'type':
      return (
        <svg {...common}><path d="M4 7V5h16v2" /><path d="M9 19h6M12 5v14" /></svg>
      );
    case 'heading':
      return (
        <svg {...common}><path d="M6 4v16M18 4v16M6 12h12" /></svg>
      );
    case 'concept':
      return (
        <svg {...common}><circle cx="7" cy="7" r="3.5" /><circle cx="17" cy="7" r="3.5" /><circle cx="12" cy="17" r="3.5" /><path d="M9 9.5 11 14M15 9.5 13 14" /></svg>
      );
    case 'globe':
      return (
        <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" /></svg>
      );
    case 'star':
      return (
        <svg {...common}><path d="m12 3 2.6 5.6L20.5 9.3l-4.3 4 1.1 6-5.3-2.9L6.7 19.3l1.1-6-4.3-4 5.9-.7L12 3Z" /></svg>
      );
    case 'bolt':
      return (
        <svg {...common}><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" /></svg>
      );
    case 'flag':
      return (
        <svg {...common}><path d="M5 21V4M5 4h12l-2 4 2 4H5" /></svg>
      );
    case 'sparkle':
      return (
        <svg {...common}><path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18" /></svg>
      );
  }
}

export const IconCalendar = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...base}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></svg>
);
export const IconLayers = ({ className }: IconProps) => <BoardIcon name="layers" className={className} />;
export const IconPlus = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...base}><path d="M12 5v14M5 12h14" /></svg>
);
export const IconClose = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...base}><path d="M6 6l12 12M18 6 6 18" /></svg>
);
export const IconSearch = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...base}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" /></svg>
);
export const IconGridView = ({ className }: IconProps) => <BoardIcon name="grid" className={className} />;
export const IconTableView = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...base}><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M3 9h18M3 14h18M9 4v16" /></svg>
);
export const IconRefresh = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...base}><path d="M21 12a9 9 0 1 1-2.6-6.3" /><path d="M21 4v5h-5" /></svg>
);
export const IconChevronDown = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...base}><path d="m6 9 6 6 6-6" /></svg>
);
export const IconPlay = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M8 5v14l11-7-11-7Z" fill="currentColor" /></svg>
);
export const IconSort = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...base}><path d="M7 4v16M7 20l-3-3M7 20l3-3M17 20V4M17 4l-3 3M17 4l3 3" /></svg>
);
export const IconFilter = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...base}><path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" /></svg>
);
export const IconCheck = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...base}><path d="m5 12 5 5L20 6" /></svg>
);
export const IconEdit = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...base}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" /></svg>
);
export const IconCopy = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...base}><rect x="9" y="9" width="12" height="12" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
);
export const IconSliders = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...base}><path d="M4 8h8M16 8h4M4 16h4M12 16h8" /><circle cx="14" cy="8" r="2" /><circle cx="10" cy="16" r="2" /></svg>
);
export const IconInfo = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...base}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>
);
export const IconArrowDown = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...base}><path d="M12 5v14M12 19l-5-5M12 19l5-5" /></svg>
);
export const IconArrowUp = ({ className }: IconProps) => (
  <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" {...base}><path d="M12 19V5M12 5 7 10M12 5l5 5" /></svg>
);
