import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Cpu, Eye, FlaskConical, Power, RefreshCw, Save, ShieldCheck, Users } from 'lucide-react';
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

export default function AdminPanel({ onNavigate }: { onNavigate: (view: 'game' | 'leaderboard') => void }) {
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
    <div className="min-h-screen bg-slate-950 p-4 text-slate-200 md:p-8">
      <header className="mx-auto mb-8 flex max-w-5xl flex-wrap items-start justify-between gap-4 border-b border-slate-800 pb-5 sm:items-center">
        <div className="flex items-center gap-3">
          <ShieldCheck className="text-amber-500" size={30} />
          <div>
            <h1 className="font-mono text-2xl font-bold tracking-widest text-amber-500">ADMINDASH</h1>
          </div>
        </div>
        <button onClick={() => onNavigate('game')} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold transition-colors hover:bg-slate-800">
          <ArrowLeft size={16} /> Game
        </button>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-2">
        <section className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl shadow-black/20">
          <div className="mb-5 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Users className="text-amber-500" size={20} /><h2 className="font-mono font-bold tracking-wide">ACTIVE ROOMS</h2></div><button onClick={() => void loadRooms().catch(error => setNotice(error.message))} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800" aria-label="Refresh active rooms"><RefreshCw size={17} /></button></div>
          <div className="grid gap-3 md:grid-cols-2">
            {activeRooms.map(room => { const status = roomStatusLabel(room.status); return <article key={room.id} className="rounded-xl border border-slate-800 bg-slate-950 p-4"><div className="flex items-start justify-between gap-3"><div><span className={`inline-flex rounded-full border px-2 py-0.5 font-mono text-[10px] font-bold ${status.className}`}>{status.text}</span><p className="mt-2 font-mono text-xs text-slate-500">ROOM {room.id.slice(0, 8).toUpperCase()}</p></div><p className="text-xs text-slate-500">{room.members.length + room.aiNames.length}/{room.seatCount} seats</p></div><p className="mt-2 text-sm text-slate-300">Owner: <b className="text-white">{room.ownerName}</b></p><p className="mt-1 text-xs text-slate-500">Players: {room.members.map(member => member.name).join(', ') || 'none'} · AI {room.aiNames.join(', ') || 'none'}</p><div className="mt-4 grid grid-cols-2 gap-2 sm:flex"><button disabled={room.status === 'open'} onClick={() => { window.location.href = `/game/${encodeURIComponent(room.id)}?watch=admin`; }} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-sky-500/40 px-3 text-xs font-bold text-sky-300 disabled:cursor-not-allowed disabled:opacity-40"><Eye size={15} /> WATCH</button><button disabled={roomBusy === room.id} onClick={() => void closeRoom(room.id)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-red-500/40 px-3 text-xs font-bold text-red-300 disabled:opacity-40"><Power size={15} /> {roomBusy === room.id ? 'CLOSING…' : 'CLOSE'}</button></div></article>; })}
            {activeRooms.length === 0 && <p className="text-sm text-slate-500">No active rooms.</p>}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl shadow-black/20">
          <div className="mb-5 flex items-center gap-2"><Cpu className="text-amber-500" size={20} /><h2 className="font-mono font-bold tracking-wide">OPPONENT ROUTING</h2></div>
          <div className="space-y-5">
            {players.map(player => (
              <div key={player.slot} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <label className="mb-3 block font-mono font-bold text-slate-200">{player.label}</label>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <select value={selection[player.slot] || player.fallback} onChange={event => setSelection(current => ({ ...current, [player.slot]: event.target.value }))} className="min-h-11 min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-500">
                    {channels.map(channel => <option key={channel.id} value={channel.id}>{channel.label}</option>)}
                  </select>
                  <button onClick={() => savePlayer(player.slot)} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 transition-colors hover:bg-amber-400">
                    <Save size={16} /> Save
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl shadow-black/20">
          <div className="mb-5 flex items-center gap-2"><FlaskConical className="text-amber-500" size={20} /><h2 className="font-mono font-bold tracking-wide">CHANNEL HEALTH CHECK</h2></div>
          <div className="space-y-3">
            {channels.map(channel => (
              <div key={channel.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950 p-4">
                <span className="font-mono text-sm font-bold">{channel.label}</span>
                <button disabled={testing !== null} onClick={() => testChannel(channel.id)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-amber-500/50 px-3 py-2 text-sm font-bold text-amber-400 transition-colors hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-50">
                  <FlaskConical size={16} /> {testing === channel.id ? 'Testing…' : 'Test'}
                </button>
              </div>
            ))}
          </div>
        </section>

        <p className="lg:col-span-2 rounded-lg border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-slate-300" aria-live="polite">{notice}</p>
      </main>
    </div>
  );
}
