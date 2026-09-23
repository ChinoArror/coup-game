import type { RoomStatus, RoomSummary } from './roomClient';

export type RoomFilter = 'active' | 'all';

const AI_LABELS: Record<string, string> = { '1': 'I', '2': 'II', '3': 'III' };

export const filterRoomSummaries = <T extends Pick<RoomSummary, 'status'>>(rooms: readonly T[], filter: RoomFilter) =>
  filter === 'all' ? [...rooms] : rooms.filter(room => room.status !== 'closed');

export const roomAiLabels = (channels: readonly string[]) => channels.map(channel => AI_LABELS[channel] || channel);

export const roomStatusLabel = (status: RoomStatus) => {
  if (status === 'started') return { text: 'STARTED', className: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' };
  if (status === 'paused') return { text: 'PAUSED', className: 'border-amber-500/40 bg-amber-500/10 text-amber-300' };
  if (status === 'closed') return { text: 'CLOSED', className: 'border-slate-600 bg-slate-800 text-slate-400' };
  return { text: 'OPEN', className: 'border-sky-500/40 bg-sky-500/10 text-sky-300' };
};
