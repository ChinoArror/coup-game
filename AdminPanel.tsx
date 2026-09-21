import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Cpu, FlaskConical, Save, ShieldCheck } from 'lucide-react';

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

export default function AdminPanel({ onNavigate }: { onNavigate: (view: 'game' | 'leaderboard') => void }) {
  const [selection, setSelection] = useState<Record<PlayerSlot, string>>({ alapha: '1', beta: '2' });
  const [notice, setNotice] = useState('Loading saved channels…');
  const [testing, setTesting] = useState<string | null>(null);

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

  return (
    <div className="min-h-screen bg-slate-950 p-4 text-slate-200 md:p-8">
      <header className="mx-auto mb-8 flex max-w-5xl items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <ShieldCheck className="text-amber-500" size={30} />
          <div>
            <h1 className="font-mono text-2xl font-bold tracking-widest text-amber-500">ADMINDASH</h1>
            <p className="text-sm text-slate-400">AI channel routing and metered provider checks</p>
          </div>
        </div>
        <button onClick={() => onNavigate('game')} className="inline-flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm font-semibold transition-colors hover:bg-slate-800">
          <ArrowLeft size={16} /> Game
        </button>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl shadow-black/20">
          <div className="mb-5 flex items-center gap-2"><Cpu className="text-amber-500" size={20} /><h2 className="font-mono font-bold tracking-wide">OPPONENT ROUTING</h2></div>
          <div className="space-y-5">
            {players.map(player => (
              <div key={player.slot} className="rounded-xl border border-slate-800 bg-slate-950 p-4">
                <label className="mb-3 block font-mono font-bold text-slate-200">{player.label}</label>
                <div className="flex flex-col gap-3 sm:flex-row">
                  <select value={selection[player.slot] || player.fallback} onChange={event => setSelection(current => ({ ...current, [player.slot]: event.target.value }))} className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 outline-none focus:border-amber-500">
                    {channels.map(channel => <option key={channel.id} value={channel.id}>{channel.label}</option>)}
                  </select>
                  <button onClick={() => savePlayer(player.slot)} className="inline-flex items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 transition-colors hover:bg-amber-400">
                    <Save size={16} /> Save
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/80 p-6 shadow-xl shadow-black/20">
          <div className="mb-5 flex items-center gap-2"><FlaskConical className="text-amber-500" size={20} /><h2 className="font-mono font-bold tracking-wide">CHANNEL HEALTH CHECK</h2></div>
          <p className="mb-4 text-sm leading-6 text-slate-400">Each test sends a minimal model request through the same quota pre-check and token reporting path used by a game.</p>
          <div className="space-y-3">
            {channels.map(channel => (
              <div key={channel.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-800 bg-slate-950 p-4">
                <span className="font-mono text-sm font-bold">{channel.label}</span>
                <button disabled={testing !== null} onClick={() => testChannel(channel.id)} className="inline-flex items-center gap-2 rounded-lg border border-amber-500/50 px-3 py-2 text-sm font-bold text-amber-400 transition-colors hover:bg-amber-500/10 disabled:cursor-not-allowed disabled:opacity-50">
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
