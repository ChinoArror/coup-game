import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, Bot, Cpu, Eye, FlaskConical, Power, RefreshCw, Save, Users } from 'lucide-react';
import ProtocolPage from './ProtocolPage';
import { roomStatusLabel } from './services/roomUi';

type PlayerSlot = 'alapha' | 'beta';

const channels = [
  { id: '1', label: '1 · Gemini' },
  { id: '2', label: '2 · DeepSeek' },
  { id: '3', label: '3 · OpenAI' },
];

const players: Array<{ slot: PlayerSlot; label: string; fallback: string }> = [
  { slot: 'alapha', label: 'Alapha', fallback: '1' },
  { slot: 'beta', label: 'Beta', fallback: '2' },
];

type AdminRoom = {
  id: string;
  status: 'open' | 'started' | 'paused' | 'closed';
  ownerName: string;
  seatCount: number;
  aiNames: string[];
  members: Array<{ uuid: string; name: string; ready: boolean }>;
};

export default function AdminPanel() {
  const [selection, setSelection] = useState<Record<PlayerSlot, string>>({ alapha: '1', beta: '2' });
  const [notice, setNotice] = useState('Loading saved channels…');
  const [testing, setTesting] = useState<string | null>(null);
  const [activeRooms, setActiveRooms] = useState<AdminRoom[]>([]);
  const [roomBusy, setRoomBusy] = useState<string | null>(null);

  const channelNames = useMemo(() => Object.fromEntries(channels.map(channel => [channel.id, channel.label])), []);

  useEffect(() => {
    fetch('/api/admin/ai-config')
      .then(async response => {
        if (!response.ok) throw new Error('Unable to load AI configuration.');
        const data = await response.json();
        const next = { alapha: '1', beta: '2' };
        for (const player of data.players || []) {
          if (player.player_slot === 'alapha' || player.player_slot === 'beta') next[player.player_slot] = player.channel_id;
        }
        setSelection(next);
        setNotice('Configuration loaded.');
      })
      .catch(error => setNotice(error.message));
  }, []);

  const loadRooms = async () => {
    const response = await fetch('/api/admin/rooms');
    const data = await response.json().catch(() => []);
    if (!response.ok) throw new Error(data.error || 'Unable to load active rooms.');
    setActiveRooms(data);
  };

  useEffect(() => {
    const refresh = () => { void loadRooms().catch(error => setNotice(error.message)); };
    refresh();
    const timer = window.setInterval(refresh, 3000);
    const onVisibility = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisibility);
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisibility); };
  }, []);

  const savePlayer = async (slot: PlayerSlot) => {
    setNotice(`Saving ${slot === 'alapha' ? 'Alapha' : 'Beta'}…`);
    const response = await fetch('/api/admin/ai-config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerSlot: slot, channelId: selection[slot] }),
    });
    const data = await response.json().catch(() => ({}));
    setNotice(response.ok ? `${slot === 'alapha' ? 'Alapha' : 'Beta'} now uses ${channelNames[selection[slot]]}.` : data.error || 'Unable to save configuration.');
  };

  const testChannel = async (channelId: string) => {
    setTesting(channelId);
    setNotice(`Testing ${channelNames[channelId]} through quota controls…`);
    try {
      const response = await fetch('/api/admin/ai-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelId }),
      });
      const data = await response.json().catch(() => ({}));
      setNotice(response.ok ? `${channelNames[channelId]} is available (${data.totalTokens ?? 0} tokens recorded).` : data.error || `${channelNames[channelId]} test failed.`);
    } catch {
      setNotice(`${channelNames[channelId]} test could not reach the server.`);
    } finally {
      setTesting(null);
    }
  };

  const closeRoom = async (roomId: string) => {
    setRoomBusy(roomId);
    try {
      const response = await fetch(`/api/admin/rooms/${encodeURIComponent(roomId)}/close`, { method: 'POST' });
      const data = await response.json().catch(() => ({}));
      setNotice(response.ok ? 'Room closed.' : data.error || 'Unable to close room.');
      await loadRooms();
    } catch {
      setNotice('Room close request could not reach the server.');
    } finally {
      setRoomBusy(null);
    }
  };

  return (
    <ProtocolPage eyebrow="Command desk / administrator" title="Control the table." description="Manage live rooms and set how Alapha and Beta respond in direct matches." actions={<a href="/" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/10 px-3 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.05] hover:text-amber-200"><ArrowLeft size={16} />Home</a>}>
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-white/[0.08] bg-[#111820]/80 p-4"><p className="font-mono text-[10px] uppercase tracking-[0.15em] text-slate-500">Active rooms</p><p className="mt-2 text-2xl font-semibold text-white">{activeRooms.length}</p></div>
        <div className="rounded-2xl border border-amber-200/15 bg-amber-200/[0.04] p-4"><p className="font-mono text-[10px] uppercase tracking-[0.15em] text-amber-200/60">Direct opponents</p><p className="mt-2 flex items-center gap-2 text-2xl font-semibold text-white"><Bot size={20} className="text-amber-200" />2</p></div>
        <div className="rounded-2xl border border-white/[0.08] bg-[#111820]/80 p-4"><p className="font-mono text-[10px] uppercase tracking-[0.15em] text-slate-500">Available channels</p><p className="mt-2 text-2xl font-semibold text-white">{channels.length}</p></div>
      </div>

      <div className="grid items-start gap-5 lg:grid-cols-[1.2fr_.8fr]">
        <section className="rounded-3xl border border-white/10 bg-[#111820] p-5 shadow-[0_24px_80px_rgba(0,0,0,.2)] sm:p-6">
          <div className="mb-5 flex items-center justify-between gap-3"><div><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-amber-200/65">Room operations</p><h2 className="mt-1 flex items-center gap-2 text-xl font-semibold text-white"><Users size={20} className="text-amber-200" />Active rooms</h2></div><button onClick={() => void loadRooms().catch(error => setNotice(error.message))} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-white/10 text-slate-400 transition hover:bg-white/[0.05] hover:text-white" aria-label="Refresh active rooms"><RefreshCw size={17} /></button></div>
          <div className="grid gap-3">
            {activeRooms.map(room => { const status = roomStatusLabel(room.status); return <article key={room.id} className="rounded-2xl border border-white/[0.08] bg-black/20 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><span className={`inline-flex rounded-full border px-2.5 py-1 font-mono text-[10px] font-bold ${status.className}`}>{status.text}</span><p className="mt-2 font-mono text-[10px] uppercase tracking-[0.12em] text-slate-500">Room {room.id.slice(0, 8).toUpperCase()}</p></div><span className="text-xs text-slate-500">{room.members.length + room.aiNames.length}/{room.seatCount} seats</span></div><p className="mt-3 text-sm text-slate-300">Hosted by <strong className="text-white">{room.ownerName}</strong></p><p className="mt-1 break-words text-xs leading-5 text-slate-500">Players: {room.members.map(member => member.name).join(', ') || 'none'} · AI {room.aiNames.join(', ') || 'none'}</p><div className="mt-4 grid grid-cols-2 gap-2 sm:flex"><button disabled={room.status === 'open'} onClick={() => { window.location.href = `/game/${encodeURIComponent(room.id)}?watch=admin`; }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-sky-200/20 bg-sky-200/[0.06] px-3 text-xs font-semibold text-sky-100 transition hover:bg-sky-200/[0.12] disabled:cursor-not-allowed disabled:opacity-40"><Eye size={15} />Watch</button><button disabled={roomBusy === room.id} onClick={() => void closeRoom(room.id)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-300/20 bg-red-300/[0.05] px-3 text-xs font-semibold text-red-200 transition hover:bg-red-300/[0.1] disabled:opacity-40"><Power size={15} />{roomBusy === room.id ? 'Closing…' : 'Close room'}</button></div></article>; })}
            {activeRooms.length === 0 && <p className="rounded-2xl border border-dashed border-white/10 p-6 text-sm text-slate-500">No active rooms. New tables will appear here.</p>}
          </div>
        </section>

        <div className="grid gap-5">
          <section className="rounded-3xl border border-amber-200/15 bg-gradient-to-br from-[#282116] via-[#171713] to-[#10151a] p-5 shadow-[0_24px_80px_rgba(0,0,0,.2)] sm:p-6">
            <div className="mb-5"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-amber-200/65">Direct protocol</p><h2 className="mt-1 flex items-center gap-2 text-xl font-semibold text-white"><Cpu size={20} className="text-amber-200" />Opponent routing</h2></div>
            <div className="space-y-3">{players.map(player => <div key={player.slot} className="rounded-2xl border border-white/[0.08] bg-black/20 p-4"><label htmlFor={`channel-${player.slot}`} className="mb-2 block text-sm font-semibold text-white">{player.label}</label><div className="flex flex-col gap-2 sm:flex-row"><select id={`channel-${player.slot}`} value={selection[player.slot] || player.fallback} onChange={event => setSelection(current => ({ ...current, [player.slot]: event.target.value }))} className="min-h-11 min-w-0 flex-1 rounded-xl border border-white/10 bg-[#111820] px-3 text-sm text-slate-100 outline-none focus:border-amber-200/50">{channels.map(channel => <option key={channel.id} value={channel.id}>{channel.label}</option>)}</select><button onClick={() => void savePlayer(player.slot)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 text-sm font-bold text-[#17130a] transition hover:bg-amber-200"><Save size={16} />Save</button></div></div>)}</div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-[#111820] p-5 sm:p-6"><div className="mb-5"><p className="font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Diagnostics</p><h2 className="mt-1 flex items-center gap-2 text-xl font-semibold text-white"><FlaskConical size={20} className="text-amber-200" />Channel checks</h2></div><div className="space-y-2">{channels.map(channel => <div key={channel.id} className="flex items-center justify-between gap-3 rounded-2xl border border-white/[0.08] bg-black/15 p-3"><span className="text-sm font-semibold text-slate-100">{channel.label}</span><button disabled={testing !== null} onClick={() => void testChannel(channel.id)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-amber-200/20 px-3 text-xs font-semibold text-amber-100 transition hover:bg-amber-200/[0.08] disabled:cursor-not-allowed disabled:opacity-50"><FlaskConical size={15} />{testing === channel.id ? 'Testing…' : 'Test'}<ArrowRight size={14} /></button></div>)}</div></section>
        </div>
      </div>
      <p className="mt-5 rounded-2xl border border-white/[0.08] bg-[#111820] px-4 py-3 text-sm text-slate-300" aria-live="polite">{notice}</p>
    </ProtocolPage>
  );
}
