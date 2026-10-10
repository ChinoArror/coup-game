import React, { useEffect, useState } from 'react';
import { ArrowLeft, CircleDollarSign, History as HistoryIcon, LoaderCircle, Trash2 } from 'lucide-react';
import { coinChanges } from './services/history';

type Channels = { alapha: string; beta: string };
type Summary = { id: string; game_id: string; completed_at: number; winner: string | null; ai_channels: Channels };
type LogEntry = { id: string; text: string; timestamp: number; coins?: Record<string, number> };
type Detail = Summary & { state: { logs: LogEntry[]; players: Array<{ id: string; name: string }> } };

export default function History({ onBack }: { onBack: () => void }) {
  const [matches, setMatches] = useState<Summary[]>([]);
  const [selected, setSelected] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadMatches = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/history');
      if (!response.ok) throw new Error('Unable to load match history.');
      setMatches(await response.json());
    } catch (cause: any) {
      setError(cause.message || 'Unable to load match history.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadMatches();
  }, []);

  const select = async (id: string) => {
    try {
      setError(null);
      const response = await fetch('/api/history/' + encodeURIComponent(id));
      if (!response.ok) throw new Error('Unable to load this match.');
      setSelected(await response.json());
    } catch (cause: any) {
      setError(cause.message || 'Unable to load this match.');
    }
  };

  const remove = async (id: string) => {
    try {
      setError(null);
      const response = await fetch('/api/history/' + encodeURIComponent(id), { method: 'DELETE' });
      if (!response.ok) throw new Error('Unable to delete match history.');
      setMatches(items => items.filter(item => item.id !== id));
      if (selected?.id === id) setSelected(null);
    } catch (cause: any) {
      setError(cause.message || 'Unable to delete match history.');
    }
  };

  const names = new Map(selected?.state.players.map(player => [player.id, player.name]) || []);

  return (
    <div className="min-h-screen bg-slate-950 p-4 text-slate-200 md:p-8">
      <header className="mx-auto mb-8 flex max-w-6xl items-center justify-between">
        <button onClick={onBack} className="inline-flex items-center gap-2 font-mono text-sm text-slate-400 transition-colors hover:text-amber-500">
          <ArrowLeft size={18} /> BACK
        </button>
        <div className="flex items-center gap-3">
          <HistoryIcon className="text-amber-500" size={28} />
          <h1 className="font-mono text-xl font-bold tracking-widest text-amber-500">MATCH HISTORY</h1>
        </div>
        <div className="w-16" />
      </header>

      {error && <div className="mx-auto mb-4 max-w-6xl rounded-lg border border-red-900 bg-red-950/40 p-3 font-mono text-sm text-red-300">{error}</div>}

      <main className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-5">
        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 lg:col-span-2">
          <h2 className="mb-4 font-mono text-sm font-bold tracking-widest text-slate-400">SAVED MATCHES</h2>
          {loading ? (
            <div className="flex justify-center py-12 text-amber-500"><LoaderCircle className="animate-spin" /></div>
          ) : matches.length === 0 ? (
            <p className="py-12 text-center font-mono text-sm text-slate-500">No completed matches saved yet.</p>
          ) : (
            <div className="space-y-3">
              {matches.map(match => (
                <article key={match.id} className={'rounded-xl border p-3 transition-colors ' + (selected?.id === match.id ? 'border-amber-500 bg-amber-500/10' : 'border-slate-700 bg-slate-950/70')}>
                  <button onClick={() => void select(match.id)} className="w-full text-left">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-bold text-slate-100">{match.winner || 'No winner'}</span>
                      <time className="font-mono text-xs text-slate-500">{new Date(match.completed_at).toLocaleString()}</time>
                    </div>
                    <p className="mt-2 font-mono text-xs text-slate-400">Alapha · Channel {match.ai_channels.alapha} &nbsp; Beta · Channel {match.ai_channels.beta}</p>
                  </button>
                  <button onClick={() => void remove(match.id)} className="mt-3 inline-flex items-center gap-1 rounded px-2 py-1 font-mono text-xs text-red-400 transition-colors hover:bg-red-950/60 hover:text-red-200" title="Delete this record">
                    <Trash2 size={14} /> DELETE
                  </button>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5 lg:col-span-3">
          {!selected ? (
            <div className="flex min-h-80 items-center justify-center text-center font-mono text-sm text-slate-500">Select a saved match to inspect its game timeline.</div>
          ) : (
            <>
              <div className="mb-5 border-b border-slate-800 pb-4">
                <h2 className="font-mono text-lg font-bold text-amber-500">{selected.winner || 'Completed match'}</h2>
                <p className="mt-1 font-mono text-xs text-slate-400">Alapha · Channel {selected.ai_channels.alapha} &nbsp; Beta · Channel {selected.ai_channels.beta}</p>
              </div>
              <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
                {selected.state.logs.map((entry, index) => {
                  const previous = index > 0 ? selected.state.logs[index - 1].coins : undefined;
                  const changes = coinChanges(entry.coins, previous);
                  return (
                    <article key={entry.id} className="rounded-lg border border-slate-800 bg-slate-950/70 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm text-slate-200">{entry.text}</p>
                        <time className="shrink-0 font-mono text-xs text-slate-500">{new Date(entry.timestamp).toLocaleTimeString()}</time>
                      </div>
                      {changes.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {changes.map(change => (
                            <span key={change.playerId} className={'inline-flex items-center gap-1 rounded px-2 py-1 font-mono text-xs ' + (change.delta > 0 ? 'bg-emerald-950/60 text-emerald-300' : 'bg-red-950/60 text-red-300')}>
                              <CircleDollarSign size={12} /> {names.get(change.playerId) || change.playerId} {change.delta > 0 ? '+' : ''}{change.delta}
                            </span>
                          ))}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}
