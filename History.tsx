import React, { useEffect, useState } from 'react';
import { ArrowLeft, CircleDollarSign, History as HistoryIcon, LoaderCircle, Trash2 } from 'lucide-react';
import { coinChanges } from './services/history';
import { AppShell, Badge, Button, Card, PageHeader, ThemeToggle, cn, confirmAction, deferSensitive } from './ui';

type Channels = { alapha: string; beta: string };
type Summary = { id: string; game_id: string; completed_at: number; winner: string | null; ai_channels: Channels };
type LogEntry = { id: string; text: string; timestamp: number; coins?: Record<string, number> };
type Detail = Summary & { state: { logs: LogEntry[]; players: Array<{ id: string; name: string }> } };

export default function History({ onBack }: { onBack: () => void }) {
  const [matches, setMatches] = useState<Summary[]>([]);
  const [selected, setSelected] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Rows whose delete is inside its undo window.
  const [pendingDelete, setPendingDelete] = useState<Set<string>>(() => new Set());

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

  const setPending = (id: string, pending: boolean) => {
    setPendingDelete(current => {
      const next = new Set(current);
      if (pending) next.add(id); else next.delete(id);
      return next;
    });
  };

  // Confirm, then delete behind an undo window. The row stays visible, dimmed, until then.
  const remove = async (id: string) => {
    setError(null);
    const confirmed = await confirmAction({ title: 'Delete this match record?', description: 'The saved timeline cannot be recovered after the undo window.', confirmLabel: 'DELETE', tone: 'destructive' });
    if (!confirmed) return;
    const wasSelected = selected?.id === id;
    setPending(id, true);
    deferSensitive({
      title: 'Deleting match record',
      description: 'The record is removed when the timer ends.',
      successTitle: 'Match record deleted',
      errorTitle: 'Could not delete match record',
      onUndo: () => setPending(id, false),
      run: async () => {
        try {
          const response = await fetch('/api/history/' + encodeURIComponent(id), { method: 'DELETE' });
          if (!response.ok) throw new Error('Unable to delete match history.');
          setMatches(items => items.filter(item => item.id !== id));
          if (wasSelected) setSelected(null);
        } catch (cause: any) {
          setError(cause.message || 'Unable to delete match history.');
          throw cause;
        } finally {
          setPending(id, false);
        }
      },
    });
  };

  const names = new Map(selected?.state.players.map(player => [player.id, player.name]) || []);

  return (
    <AppShell
      nav={[
        { key: 'back', label: 'Command desk', description: 'Back to the command desk', icon: <ArrowLeft size={18} />, onClick: onBack },
        { key: 'history', label: 'Match history', description: 'Review your previous tables', icon: <HistoryIcon size={18} />, active: true },
      ]}
      footer={<ThemeToggle />}
    >
      <PageHeader
        icon={<HistoryIcon size={20} />}
        title="MATCH HISTORY"
        actions={<Button variant="outline" onClick={onBack} className="h-10 gap-2 px-3 font-mono text-xs"><ArrowLeft size={16} />BACK</Button>}
      />

      {error && <div className="mb-4 rounded-xl border border-destructive/30 bg-destructive/10 p-3 font-mono text-sm text-log-error">{error}</div>}

      <main className="grid gap-6 lg:grid-cols-5">
        <Card className="p-4 lg:col-span-2">
          <h2 className="mb-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">SAVED MATCHES</h2>
          {loading ? (
            <div className="flex justify-center py-12 text-primary"><LoaderCircle className="animate-spin" /></div>
          ) : matches.length === 0 ? (
            <p className="py-12 text-center font-mono text-sm text-muted-foreground">No completed matches saved yet.</p>
          ) : (
            <div className="space-y-3">
              {matches.map(match => (
                <article key={match.id} className={cn('rounded-xl border p-3 transition-colors', selected?.id === match.id ? 'border-primary/50 bg-primary/10' : 'border-border/60 bg-background/50', pendingDelete.has(match.id) && 'opacity-50')}>
                  <button onClick={() => void select(match.id)} className="w-full text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-sm font-bold">{match.winner || 'No winner'}</span>
                      <time className="font-mono text-xs text-muted-foreground">{new Date(match.completed_at).toLocaleString()}</time>
                    </div>
                    <p className="mt-2 font-mono text-xs text-muted-foreground">Alapha · Channel {match.ai_channels.alapha} &nbsp; Beta · Channel {match.ai_channels.beta}</p>
                  </button>
                  <div className="mt-2 flex items-center gap-2">
                    <Button variant="ghost" size="sm" disabled={pendingDelete.has(match.id)} onClick={() => void remove(match.id)} className="gap-1 px-2 font-mono text-xs text-log-error hover:text-log-error" title="Delete this record">
                      <Trash2 size={14} /> DELETE
                    </Button>
                    {pendingDelete.has(match.id) && <Badge tone="warning">Deleting…</Badge>}
                  </div>
                </article>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5 lg:col-span-3">
          {!selected ? (
            <div className="flex min-h-80 items-center justify-center text-center font-mono text-sm text-muted-foreground">Select a saved match to inspect its game timeline.</div>
          ) : (
            <>
              <div className="mb-5 pb-4">
                <h2 className="font-mono text-lg font-bold text-primary">{selected.winner || 'Completed match'}</h2>
                <p className="mt-1 font-mono text-xs text-muted-foreground">Alapha · Channel {selected.ai_channels.alapha} &nbsp; Beta · Channel {selected.ai_channels.beta}</p>
              </div>
              <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
                {selected.state.logs.map((entry, index) => {
                  const previous = index > 0 ? selected.state.logs[index - 1].coins : undefined;
                  const changes = coinChanges(entry.coins, previous);
                  return (
                    <article key={entry.id} className="rounded-lg border border-border/60 bg-background/50 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm">{entry.text}</p>
                        <time className="shrink-0 font-mono text-xs text-muted-foreground">{new Date(entry.timestamp).toLocaleTimeString()}</time>
                      </div>
                      {changes.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {changes.map(change => (
                            <span key={change.playerId} className={cn('inline-flex items-center gap-1 rounded-md px-2 py-1 font-mono text-xs tabular-nums', change.delta > 0 ? 'bg-success/10 text-log-success' : 'bg-destructive/10 text-log-error')}>
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
        </Card>
      </main>
    </AppShell>
  );
}
