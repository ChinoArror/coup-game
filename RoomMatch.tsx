import { useEffect, useMemo, useRef, useState } from 'react';
import { CircleDollarSign, Shield, Wifi, WifiOff } from 'lucide-react';
import { ActionType, CardType, GamePhase, type GameState } from './types';

type RoomWireState = {
  type: 'state';
  state: GameState;
  revision: number;
  deadline: number | null;
  remaining: Record<string, number>;
};

const targetedActions = [ActionType.STEAL, ActionType.ASSASSINATE, ActionType.COUP];
const ordinaryActions = [ActionType.INCOME, ActionType.FOREIGN_AID, ActionType.TAX, ActionType.EXCHANGE];

export default function RoomMatch({ roomId, currentUserId }: { roomId: string; currentUserId: string }) {
  const [wire, setWire] = useState<RoomWireState | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState('');
  const [targetAction, setTargetAction] = useState<ActionType | null>(null);
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    let disposed = false;
    let retry: number | undefined;
    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/api/rooms/${encodeURIComponent(roomId)}/socket`);
      socket.current = ws;
      ws.onopen = () => { if (!disposed) setConnected(true); };
      ws.onmessage = event => {
        const message = JSON.parse(event.data);
        if (message.type === 'state') {
          setWire(message as RoomWireState);
          setError('');
        } else if (message.type === 'error') {
          setError(message.error || 'Room action failed');
        }
      };
      ws.onerror = () => setError('Realtime connection failed. Reconnecting…');
      ws.onclose = () => {
        if (!disposed) {
          setConnected(false);
          retry = window.setTimeout(connect, 1500);
        }
      };
    };
    connect();
    return () => {
      disposed = true;
      if (retry) window.clearTimeout(retry);
      socket.current?.close();
    };
  }, [roomId]);

  const state = wire?.state;
  const me = state?.players.find(player => player.id === currentUserId);
  const opponents = useMemo(() => state?.players.filter(player => player.id !== currentUserId) || [], [state, currentUserId]);
  const send = (body: Record<string, unknown>) => {
    if (!wire || socket.current?.readyState !== WebSocket.OPEN) {
      setError('Connection is not ready');
      return;
    }
    socket.current.send(JSON.stringify({ ...body, revision: wire.revision, clientActionId: crypto.randomUUID() }));
    setTargetAction(null);
  };

  if (!state || !me) return <div className="rounded-xl border border-slate-800 bg-slate-900 p-8 font-mono text-sm text-amber-400 animate-pulse">CONNECTING TO ROOM…</div>;

  const isTurn = state.phase === GamePhase.TURN_START && state.players[state.currentPlayerIndex]?.id === currentUserId;
  const canRespond = state.waitingForResponseFrom.includes(currentUserId);
  const mustLose = state.phase === GamePhase.CHALLENGE_LOSS && state.playerToLoseInfluence === currentUserId;
  const mustCoup = me.coins >= 10;

  return <section className="grid gap-5 lg:grid-cols-3">
    <div className="space-y-4 lg:col-span-2">
      <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 p-4">
        <div>
          <p className="font-mono text-xs text-slate-500">ROOM MATCH</p>
          <p className="font-bold text-amber-400">{state.phase === GamePhase.GAME_OVER ? `WINNER: ${state.winner}` : `WAITING FOR ${state.players[state.currentPlayerIndex]?.name}`}</p>
        </div>
        <span className="inline-flex items-center gap-2 font-mono text-xs text-slate-400">
          {connected ? <Wifi size={15} className="text-emerald-400" /> : <WifiOff size={15} className="text-red-400" />}
          {connected ? 'SYNCED' : 'RECONNECTING'}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {opponents.map(player => <button
          key={player.id}
          disabled={!targetAction || player.isEliminated}
          onClick={() => targetAction && send({ type: 'action', action: targetAction, targetId: player.id })}
          className={`rounded-xl border p-4 text-left ${targetAction && !player.isEliminated ? 'border-amber-500 bg-amber-500/10' : 'border-slate-800 bg-slate-900'} ${player.isEliminated ? 'opacity-40' : ''}`}
        >
          <p className="font-bold text-slate-100">{player.name}</p>
          <p className="mt-1 inline-flex items-center gap-1 font-mono text-xs text-amber-400"><CircleDollarSign size={13} />{player.coins}</p>
          <div className="mt-3 flex gap-2">
            {player.cards.map(card => <span key={card.id} className="grid h-12 w-10 place-items-center rounded border border-slate-700 bg-slate-950 text-xs text-slate-400">{card.isRevealed ? card.type : <Shield size={14} />}</span>)}
          </div>
        </button>)}
      </div>

      <div className="rounded-xl border-2 border-slate-700 bg-slate-900 p-5">
        <div className="flex justify-between">
          <div><p className="font-bold text-white">{me.name}</p><p className="inline-flex items-center gap-1 font-mono text-sm text-amber-400"><CircleDollarSign size={15} />{me.coins}</p></div>
          {wire.deadline && <p className="font-mono text-xs text-slate-500">CLOCK ACTIVE</p>}
        </div>
        <div className="my-4 flex gap-3">
          {me.cards.map(card => <button key={card.id} disabled={!mustLose || card.isRevealed} onClick={() => send({ type: 'lose', cardId: card.id })} className={`rounded-lg border px-4 py-5 text-sm ${card.isRevealed ? 'border-slate-800 text-slate-600' : mustLose ? 'border-red-500 bg-red-950/30 text-red-200' : 'border-slate-600 text-slate-100'}`}>{card.isRevealed ? 'LOST' : card.type}</button>)}
        </div>
        {isTurn && <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {ordinaryActions.map(action => <button key={action} disabled={mustCoup} onClick={() => send({ type: 'action', action })} className="rounded border border-slate-700 bg-slate-800 p-3 text-xs font-bold hover:border-amber-500">{action}</button>)}
          {targetedActions.map(action => <button key={action} onClick={() => setTargetAction(action)} disabled={(action === ActionType.ASSASSINATE && me.coins < 3) || (action === ActionType.COUP && me.coins < 7)} className="rounded border border-slate-700 bg-slate-800 p-3 text-xs font-bold hover:border-amber-500">{targetAction === action ? 'SELECT TARGET' : action}</button>)}
        </div>}
        {canRespond && <div className="mt-3 flex flex-wrap gap-2">
          <button onClick={() => send({ type: 'pass' })} className="rounded bg-slate-700 px-3 py-2 text-xs font-bold">PASS / ALLOW</button>
          <button onClick={() => send({ type: 'challenge' })} className="rounded bg-red-900/60 px-3 py-2 text-xs font-bold text-red-100">CHALLENGE</button>
          {state.phase === GamePhase.ACTION_DECLARED && [CardType.DUKE, CardType.CAPTAIN, CardType.AMBASSADOR, CardType.CONTESSA].map(cardClaim => <button key={cardClaim} onClick={() => send({ type: 'block', cardClaim })} className="rounded bg-slate-800 px-3 py-2 text-xs">BLOCK {cardClaim}</button>)}
        </div>}
      </div>
    </div>
    <aside className="max-h-[680px] overflow-auto rounded-xl border border-slate-800 bg-slate-900 p-4">
      <p className="mb-3 font-mono text-xs tracking-widest text-slate-500">MISSION LOG</p>
      {error && <p className="mb-3 text-xs text-red-300">{error}</p>}
      {state.logs.slice().reverse().map(log => <p key={log.id} className="mb-2 border-l border-slate-700 pl-2 text-xs text-slate-400">{log.text}</p>)}
    </aside>
  </section>;
}
