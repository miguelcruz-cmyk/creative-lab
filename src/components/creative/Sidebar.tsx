import { BOARDS, type Board } from '../../creative/boards.ts';
import type { AccountInfo } from '../../creative/types.ts';
import type { PlatformId, PlatformStatus } from '../../creative/api.ts';
import { AppLogo } from './AppLogo.tsx';
import { PlatformSwitcher } from './PlatformSwitcher.tsx';
import { BoardIcon, IconCalendar, IconEdit, IconPlus } from './icons.tsx';

interface SidebarProps {
  account: AccountInfo | null;
  platforms: PlatformStatus[];
  activePlatform: PlatformId;
  onSelectPlatform: (id: PlatformId) => void;
  activeBoardId: string;
  customBoards: Board[];
  onSelectBoard: (id: string) => void;
  onNewBoard: () => void;
  onEditBoard: (board: Board) => void;
  calendarActive: boolean;
  onOpenCalendar: () => void;
}

export function Sidebar({
  account,
  platforms,
  activePlatform,
  onSelectPlatform,
  activeBoardId,
  customBoards,
  onSelectBoard,
  onNewBoard,
  onEditBoard,
  calendarActive,
  onOpenCalendar,
}: SidebarProps) {
  const activeLabel =
    platforms.find((p) => p.id === activePlatform)?.label ??
    activePlatform.charAt(0).toUpperCase() + activePlatform.slice(1);
  const renderBoard = (board: Board, editable: boolean) => {
    const active = !calendarActive && board.id === activeBoardId;
    return (
      <li key={board.id} className="group/board relative">
        <button
          type="button"
          onClick={() => onSelectBoard(board.id)}
          title={board.description}
          className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left transition-colors ${
            active ? 'bg-accent-muted text-text' : 'text-text-secondary hover:bg-surface-hover hover:text-text'
          }`}
        >
          <BoardIcon
            name={board.icon}
            className={`w-4 h-4 shrink-0 ${active ? 'text-accent-hover' : 'text-text-tertiary'}`}
          />
          <span className="text-[13px] font-medium truncate">{board.label}</span>
        </button>
        {editable && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEditBoard(board);
            }}
            title="Edit board"
            className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 grid place-items-center rounded text-text-tertiary opacity-0 group-hover/board:opacity-100 hover:text-text hover:bg-surface-hover transition-opacity"
          >
            <IconEdit className="w-3.5 h-3.5" />
          </button>
        )}
      </li>
    );
  };

  return (
    <aside className="w-60 shrink-0 border-r border-border bg-surface/40 flex flex-col h-full">
      <div className="px-4 h-14 flex items-center gap-2.5 border-b border-border-subtle">
        <AppLogo className="w-6 h-6" />
        <div className="leading-tight">
          <div className="text-[13px] font-bold text-text tracking-tight">Creative Lab</div>
          <div className="text-[10px] text-text-tertiary font-medium tracking-wide uppercase">
            Ad Analytics
          </div>
        </div>
      </div>

      <div className="px-2 pt-3">
        <PlatformSwitcher platforms={platforms} active={activePlatform} onSelect={onSelectPlatform} />
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-3">
        <button
          type="button"
          onClick={onOpenCalendar}
          title="See when ads went live"
          className={`w-full flex items-center gap-2.5 px-2.5 py-2 mb-3 rounded-md text-left transition-colors ${
            calendarActive ? 'bg-accent-muted text-text' : 'text-text-secondary hover:bg-surface-hover hover:text-text'
          }`}
        >
          <IconCalendar className={`w-4 h-4 shrink-0 ${calendarActive ? 'text-accent-hover' : 'text-text-tertiary'}`} />
          <span className="text-[13px] font-semibold truncate">Launch Calendar</span>
        </button>

        <div className="px-2 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
          Boards
        </div>
        <ul className="space-y-0.5">{BOARDS.map((board) => renderBoard(board, false))}</ul>

        <div className="px-2 mt-4 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-tertiary">
          My Boards
        </div>
        {customBoards.length > 0 && (
          <ul className="space-y-0.5">{customBoards.map((board) => renderBoard(board, true))}</ul>
        )}
        <button
          type="button"
          onClick={onNewBoard}
          className="mt-0.5 w-full flex items-center gap-2.5 px-2.5 py-2 rounded-md text-left text-accent-hover border border-dashed border-border hover:bg-surface-hover transition-colors"
        >
          <IconPlus className="w-4 h-4 shrink-0" />
          <span className="text-[13px] font-medium">New board</span>
        </button>
      </nav>

      <div className="px-4 py-3 border-t border-border-subtle">
        <div className="flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-win-pill-text shrink-0" />
          <div className="leading-tight min-w-0">
            <div className="text-[12px] font-semibold text-text truncate">
              {account?.name ?? 'Connecting…'}
            </div>
            <div className="text-[10px] text-text-tertiary truncate">
              {account ? `${activeLabel} · ${account.currency}` : `${activeLabel} Ads`}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}
