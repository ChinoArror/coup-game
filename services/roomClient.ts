export type RoomStatus = 'open' | 'started' | 'paused' | 'closed';
export type RoomMember = { uuid: string; name: string; seatIndex: number; ready: boolean };
export type RoomDetails = {
  id: string;
  ownerUuid: string;
  status: RoomStatus;
  seatCount: number;
  aiChannels: string[];
  aiNames: string[];
  timeControls: { stepLimitMs?: number; totalLimitMs?: number };
  me: { ready: boolean } | null;
  members: RoomMember[];
  spectator?: boolean;
};

export type RoomSummary = {
  id: string;
  status: RoomStatus;
  seatCount: number;
  aiChannels: string[];
  aiNames: string[];
  timeControls: { stepLimitMs?: number; totalLimitMs?: number };
  isReady: boolean;
  memberCount: number;
};

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body as T;
}

export const roomApi = {
  list: () => api<RoomSummary[]>('/api/rooms'),
  get: (id: string) => api<RoomDetails>(`/api/rooms/${encodeURIComponent(id)}`),
  create: (body: unknown) => api<{ id: string; status: string; invite: { url: string; expiresAt: number } }>('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  invite: (id: string) => api<{ url: string }>(`/api/rooms/${encodeURIComponent(id)}/invite`, { method: 'POST' }),
  resolveInvite: (token: string) => api<{ room: { id: string; status: RoomStatus }; canJoin: boolean; canWatch: boolean }>(`/api/rooms/invite/${encodeURIComponent(token)}`),
  watch: (id: string, inviteToken: string) => api<RoomDetails>(`/api/rooms/${encodeURIComponent(id)}/watch?invite=${encodeURIComponent(inviteToken)}`),
  adminWatch: (id: string) => api<RoomDetails>(`/api/admin/rooms/${encodeURIComponent(id)}/watch`),
  join: (id: string, inviteToken: string) => api(`/api/rooms/${encodeURIComponent(id)}/join`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ inviteToken }) }),
  ready: (id: string, ready: boolean) => api(`/api/rooms/${encodeURIComponent(id)}/ready`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ready }) }),
  start: (id: string) => api(`/api/rooms/${encodeURIComponent(id)}/start`, { method: 'POST' }),
  close: (id: string) => api(`/api/rooms/${encodeURIComponent(id)}/close`, { method: 'POST' }),
  resume: (id: string) => api(`/api/rooms/${encodeURIComponent(id)}/resume`, { method: 'POST' }),
  pause: (id: string) => api(`/api/rooms/${encodeURIComponent(id)}/pause`, { method: 'POST' }),
  leave: (id: string) => api(`/api/rooms/${encodeURIComponent(id)}/leave`, { method: 'POST' }),
  kick: (id: string, userUuid: string) => api(`/api/rooms/${encodeURIComponent(id)}/kick`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userUuid }) }),
};
