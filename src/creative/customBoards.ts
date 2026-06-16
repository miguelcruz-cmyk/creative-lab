/**
 * Persistence for user-created boards. Custom boards live in localStorage (per
 * browser) so anyone on the team can spin up their own saved lenses without a
 * backend. They share the same Board shape as built-in boards, flagged
 * `custom: true` so the UI can offer edit/delete.
 */
import type { Board } from './boards.ts';

const STORAGE_KEY = 'creative.customBoards.v1';

export function loadCustomBoards(): Board[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Board[];
    return Array.isArray(parsed) ? parsed.filter((b) => b && b.id && b.custom) : [];
  } catch {
    return [];
  }
}

function persist(boards: Board[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(boards));
  } catch {
    /* storage may be full or disabled; custom boards are best-effort */
  }
}

export function newBoardId(): string {
  return `custom-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

/** Insert or replace a board by id, returning the updated list. */
export function upsertCustomBoard(boards: Board[], board: Board): Board[] {
  const idx = boards.findIndex((b) => b.id === board.id);
  const next = idx >= 0 ? boards.map((b) => (b.id === board.id ? board : b)) : [...boards, board];
  persist(next);
  return next;
}

export function removeCustomBoard(boards: Board[], id: string): Board[] {
  const next = boards.filter((b) => b.id !== id);
  persist(next);
  return next;
}
