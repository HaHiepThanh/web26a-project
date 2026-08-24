const LAST_SEEN_KEY = 'trello_chat_lastseen';

export function loadLastSeen(): Record<string, number> {
  if (typeof localStorage === 'undefined') return {};
  try {
    const raw = localStorage.getItem(LAST_SEEN_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function persistLastSeen(map: Record<string, number>): void {
  try {
    localStorage.setItem(LAST_SEEN_KEY, JSON.stringify(map));
  } catch {
    /* hết quota thì thôi, chỉ mất mốc đã đọc */
  }
}
