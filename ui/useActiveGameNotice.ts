import { useEffect, useRef } from 'react';
import { dismiss, notify } from './notify';

const SHOWN_KEY = 'coup_resume_notices';
const MAX_SHOWN = 3;

type ResumeCandidate = { key: string; href: string; title: string; description: string };
type RoomSummaryLike = { id: string; status: string; seatCount: number; memberCount: number };

/** Keys already shown in this tab, so a resume prompt is not repeated after it was seen. */
function readShownKeys(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(sessionStorage.getItem(SHOWN_KEY) || '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((key): key is string => typeof key === 'string') : []);
  } catch {
    return new Set();
  }
}

function writeShownKeys(keys: Set<string>) {
  try {
    sessionStorage.setItem(SHOWN_KEY, JSON.stringify([...keys]));
  } catch {
    // Storage may be disabled; the prompt can then repeat within the tab.
  }
}

async function loadCandidates(): Promise<ResumeCandidate[]> {
  const [processResult, roomsResult] = await Promise.allSettled([
    fetch('/api/process').then(response => (response.ok ? response.json() : null)),
    fetch('/api/rooms').then(response => (response.ok ? response.json() : [])),
  ]);
  const candidates: ResumeCandidate[] = [];

  const solo = processResult.status === 'fulfilled' ? processResult.value : null;
  if (solo?.state && solo.state.phase !== 'GAME_OVER') {
    candidates.push({
      key: `solo:${solo.state.gameId || 'current'}`,
      href: '/play',
      title: 'Unfinished direct match',
      description: 'Your match against Alapha and Beta is still in progress. Click to continue.',
    });
  }

  const rooms: RoomSummaryLike[] = roomsResult.status === 'fulfilled' && Array.isArray(roomsResult.value) ? roomsResult.value : [];
  for (const room of rooms) {
    if (room.status !== 'started' && room.status !== 'paused') continue;
    const id = String(room.id);
    candidates.push({
      key: `room:${id}`,
      href: `/game/${encodeURIComponent(id)}`,
      title: room.status === 'started' ? 'Game in progress' : 'Paused game',
      description: `Room ${id.slice(0, 8).toUpperCase()} · ${room.memberCount}/${room.seatCount} players${room.status === 'paused' ? ' · waiting to resume' : ''}. Click to rejoin.`,
    });
  }
  return candidates;
}

function showCandidates(candidates: ResumeCandidate[]) {
  const currentPath = window.location.pathname;
  const shown = readShownKeys();
  const fresh = candidates.filter(candidate => candidate.href !== currentPath && !shown.has(candidate.key)).slice(0, MAX_SHOWN);
  if (fresh.length === 0) return;

  for (const candidate of fresh) {
    const id = `resume:${candidate.key}`;
    notify({
      id,
      tone: 'info',
      icon: 'play',
      duration: 0,
      title: candidate.title,
      description: candidate.description,
      onClick: () => {
        dismiss(id);
        window.location.href = candidate.href;
      },
    });
    shown.add(candidate.key);
  }
  writeShownKeys(shown);
}

/**
 * After sign-in, offers to resume an unfinished direct match or room. Runs once per mount.
 * Failures are ignored: the prompt is a convenience, not a requirement.
 */
export function useActiveGameNotice(enabled: boolean) {
  const started = useRef(false);

  useEffect(() => {
    if (!enabled || started.current) return;
    started.current = true;
    void loadCandidates().then(showCandidates).catch(() => undefined);
  }, [enabled]);
}
