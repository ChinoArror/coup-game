import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CircleDollarSign, Shield } from 'lucide-react';
import { ActionType, CardType, GamePhase, type GameState, type Player } from './types';
import { roomMobileClasses } from './services/roomUi';
import { availableRoomAiChannels } from './services/rooms';
import { roomApi } from './services/roomClient';

type RoomWireState = {
  type: 'state';
  state: GameState;
  revision: number;
  deadline: number | null;
  remaining: Record<string, number>;
  paused?: boolean;
  aiChannels?: string[];
  aiFailure?: { playerId: string; channelId: string; status: number; message?: string } | null;
};

const getCardCaption = (type: CardType) => ({
  [CardType.DUKE]: 'Taxation',
  [CardType.ASSASSIN]: 'Lethal',
  [CardType.CAPTAIN]: 'Thievery',
  [CardType.AMBASSADOR]: 'Swapping',
  [CardType.CONTESSA]: 'Defense',
}[type]);

const getCardCaptionClass = (type: CardType) => ({
  [CardType.DUKE]: 'text-purple-400',
  [CardType.ASSASSIN]: 'text-red-400',
  [CardType.CAPTAIN]: 'text-green-400',
  [CardType.AMBASSADOR]: 'text-blue-400',
  [CardType.CONTESSA]: 'text-orange-400',
}[type]);

function PlayerPanel({ player, currentTurn, target, onTarget }: { key?: string; player: Player; currentTurn: boolean; target: boolean; onTarget: () => void }) {
  return (
    <div
      onClick={target ? onTarget : undefined}
      className={`relative rounded-xl border-2 p-3 transition-all sm:p-4 ${
        target
          ? 'cursor-pointer border-amber-500 bg-amber-900/20 shadow-[0_0_20px_rgba(245,158,11,0.4)]'
          : currentTurn
            ? 'border-amber-500 bg-amber-500/5 shadow-[0_0_15px_rgba(245,158,11,0.2)]'
            : player.isEliminated
              ? 'border-slate-800 bg-slate-950 opacity-50'
              : 'border-slate-800 bg-slate-900'
      }`}
    >
      {target && <div className="absolute right-2 top-2 rounded bg-amber-950/80 px-2 py-1 text-xs font-bold uppercase tracking-widest text-amber-500">Target</div>}
      <div className="mb-3 flex items-center gap-3">
        <div className={`grid h-10 w-10 place-items-center rounded-full font-bold text-slate-900 ${player.isEliminated ? 'bg-slate-700' : 'bg-slate-200'}`}>
          {player.name.charAt(0)}
        </div>
        <div>
          <h3 className={`font-bold ${player.isEliminated ? 'text-slate-500 line-through' : 'text-slate-100'}`}>{player.name}</h3>
          <div className="flex items-center gap-2 font-mono text-xs text-amber-400"><CircleDollarSign size={12} /> {player.coins} Credits</div>
        </div>
      </div>
      <div className="flex gap-2">
        {player.cards.map(card => (
          <div key={card.id} className={`flex h-24 w-16 items-center justify-center rounded border p-1 text-center text-xs ${card.isRevealed ? 'border-slate-600 bg-slate-800 text-slate-400 grayscale' : 'border-slate-600 bg-slate-700 bg-[url("https://www.transparenttextures.com/patterns/carbon-fibre.png")]'}`}>
            {card.isRevealed ? card.type : <Shield className="text-slate-500 opacity-20" />}
          </div>
        ))}
      </div>
    </div>
  );
}

function ActionButton({ label, sub, onClick, color = 'slate' }: { label: string; sub?: string; onClick: () => void; color?: string }) {
  const colors: Record<string, string> = {
    slate: 'bg-slate-800 hover:bg-slate-700 border-slate-600',
    purple: 'bg-purple-900/30 hover:bg-purple-900/50 border-purple-500/50 text-purple-200',
    red: 'bg-red-900/30 hover:bg-red-900/50 border-red-500/50 text-red-200',
    green: 'bg-green-900/30 hover:bg-green-900/50 border-green-500/50 text-green-200',
    blue: 'bg-blue-900/30 hover:bg-blue-900/50 border-blue-500/50 text-blue-200',
  };
  return (
    <button onClick={onClick} className={`${roomMobileClasses.touchTarget} relative flex w-full flex-col items-start justify-center rounded-lg border p-3 text-left transition-all ${colors[color]}`}>
      <span className="text-sm font-bold">{label}</span>
      {sub && <span className="text-[10px] opacity-70">{sub}</span>}
    </button>
  );
}

export default function RoomMatch({ roomId, currentUserId, spectator = false, watchToken, isOwner = false }: { roomId: string; currentUserId: string; spectator?: boolean; watchToken?: string; isOwner?: boolean }) {
  const [wire, setWire] = useState<RoomWireState | null>(null);
  const [error, setError] = useState('');
  const [targetAction, setTargetAction] = useState<ActionType | null>(null);
  const [recovering, setRecovering] = useState(false);
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    let disposed = false;
    let retry: number | undefined;
    const connect = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const socketUrl = new URL(`${protocol}//${window.location.host}/api/rooms/${encodeURIComponent(roomId)}/socket`);
      if (spectator && watchToken && watchToken !== 'admin') socketUrl.searchParams.set('invite', watchToken);
      if (spectator && watchToken === 'admin') socketUrl.searchParams.set('admin', '1');
      const ws = new WebSocket(socketUrl);
      socket.current = ws;
      ws.onmessage = event => {
        const message = JSON.parse(event.data);
        if (message.type === 'state') {
          setWire(message as RoomWireState);
          setError('');
        } else if (message.type === 'error') {
          setError(message.error || 'Room action failed');
        }
      };
      ws.onerror = () => setError('Realtime connection failed.');
      ws.onclose = () => {
        if (!disposed) retry = window.setTimeout(connect, 1500);
      };
    };
    connect();
    return () => {
      disposed = true;
      if (retry) window.clearTimeout(retry);
      socket.current?.close();
    };
  }, [roomId, spectator, watchToken]);

  const state = wire?.state;
  const me = state?.players.find(player => player.id === currentUserId);
  const boardPlayer = me || state?.players[state.currentPlayerIndex];
  const opponents = useMemo(() => state?.players.filter(player => player.id !== currentUserId) || [], [state, currentUserId]);
  const send = (body: Record<string, unknown>) => {
    if (!wire || socket.current?.readyState !== WebSocket.OPEN) {
      setError('Connection is not ready');
      return;
    }
    socket.current.send(JSON.stringify({ ...body, revision: wire.revision, clientActionId: crypto.randomUUID() }));
    setTargetAction(null);
  };

  const recoverAi = async (type: 'retry-ai' | 'switch-ai', channelId?: string) => {
    setRecovering(true); setError('');
    try { await roomApi.recoverAi(roomId, type, channelId); }
    catch (reason: any) { setError(reason.message || 'AI recovery failed'); }
    finally { setRecovering(false); }
  };

  if (!state || !boardPlayer) return <div className="flex min-h-[360px] items-center justify-center rounded-2xl border border-slate-800 bg-slate-900 font-mono text-amber-500 animate-pulse">ESTABLISHING CONNECTION...</div>;

  const isMyTurn = !wire?.paused && !spectator && state.phase === GamePhase.TURN_START && state.players[state.currentPlayerIndex]?.id === currentUserId;
  const mustCoup = boardPlayer.coins >= 10;
  const canRespond = !wire?.paused && !spectator && state.waitingForResponseFrom.includes(currentUserId);
  const isActionPhase = state.phase === GamePhase.ACTION_DECLARED;
  const isBlockPhase = state.phase === GamePhase.BLOCK_DECLARED;
  const mustLoseInfluence = state.phase === GamePhase.CHALLENGE_LOSS && state.playerToLoseInfluence === currentUserId;
  const incomingAction = state.pendingAction?.action;
  const isTargeted = state.pendingAction?.targetId === currentUserId;
  const canBlockDuke = isActionPhase && incomingAction === ActionType.FOREIGN_AID;
  const canBlockContessa = isActionPhase && incomingAction === ActionType.ASSASSINATE && isTargeted;
  const canBlockCaptain = isActionPhase && incomingAction === ActionType.STEAL && isTargeted;
  const canBlockAmbassador = canBlockCaptain;
  const canChallenge = (isActionPhase && incomingAction !== ActionType.FOREIGN_AID) || isBlockPhase;
  const status = wire?.aiFailure
    ? 'AI CONNECTION LOST · WAITING FOR HOST'
    : wire?.paused
    ? 'ROOM PAUSED. WAITING FOR OWNER...'
    : state.phase === GamePhase.GAME_OVER
    ? `GAME OVER. WINNER: ${state.winner || 'ROOM CLOSED'}`
    : targetAction
      ? `Select target for ${targetAction}...`
      : state.pendingAction
        ? `${state.players.find(player => player.id === state.pendingAction?.actorId)?.name} is attempting to ${state.pendingAction.action}...`
        : state.pendingBlock
          ? `${state.players.find(player => player.id === state.pendingBlock?.blockerId)?.name} blocks using ${state.pendingBlock.cardClaimed}`
          : `Waiting for ${state.players[state.currentPlayerIndex]?.name}...`;

  return (
    <div className="min-h-screen bg-slate-950 font-sans text-slate-200 selection:bg-amber-500/30">
      {wire?.aiFailure && !wire.paused && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"><section role="dialog" aria-modal="true" aria-labelledby="ai-recovery-title" className="w-full max-w-md rounded-2xl border border-amber-500/40 bg-slate-900 p-5 shadow-2xl"><p className="font-mono text-xs tracking-widest text-amber-400">ROOM AGENT CONNECTION</p><h2 id="ai-recovery-title" className="mt-2 text-xl font-bold text-white">{isOwner ? `AI ${wire.aiFailure.channelId} could not respond` : 'Agent connection interrupted'}</h2><p className="mt-3 text-sm text-slate-300">{isOwner ? wire.aiFailure.message || `The current AI request failed (HTTP ${wire.aiFailure.status}). You can retry or move this seat to an unused AI channel.` : 'Waiting for the room owner to retry or switch this AI. The game is paused at this action.'}</p>{isOwner && <div className="mt-5 grid gap-2">{availableRoomAiChannels(wire.aiChannels || [], wire.aiFailure.channelId).map(channel => <button key={channel} disabled={recovering} onClick={() => void recoverAi('switch-ai', channel)} className="min-h-11 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-left text-sm font-bold text-amber-200 disabled:opacity-50">Switch this seat to AI {({ '1': 'I', '2': 'II', '3': 'III' } as Record<string, string>)[channel]}</button>)}<button disabled={recovering} onClick={() => void recoverAi('retry-ai')} className="min-h-11 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-slate-950 disabled:opacity-50">{recovering ? 'RECONNECTING…' : 'RETRY CURRENT AI'}</button>{availableRoomAiChannels(wire.aiChannels || [], wire.aiFailure.channelId).length === 0 && <p className="text-xs text-slate-400">No unused AI channel is available in this room.</p>}</div>}</section></div>}
      <main className="mx-auto grid max-w-5xl grid-cols-1 gap-5 p-3 sm:gap-6 sm:p-4 md:p-6 lg:grid-cols-12">
        <div className="flex flex-col gap-6 lg:col-span-8">
          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            {opponents.map(player => (
              <PlayerPanel
                key={player.id}
                player={player}
                currentTurn={player.id === state.players[state.currentPlayerIndex]?.id}
                target={Boolean(targetAction && !wire?.paused && !spectator && !player.isEliminated)}
                onTarget={() => targetAction && send({ type: 'action', action: targetAction, targetId: player.id })}
              />
            ))}
          </div>

          <div className="relative flex min-h-[200px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 p-5 text-center sm:p-8">
            {state.phase === GamePhase.GAME_OVER ? (
              <div className="animate-bounce text-2xl font-bold uppercase tracking-widest text-amber-500">{status}</div>
            ) : (
              <>
                <div className="mb-2 font-mono text-sm uppercase tracking-widest text-slate-400">Current Protocol</div>
                <div className={`mb-4 text-xl font-bold sm:text-2xl md:text-3xl ${wire?.aiFailure ? 'text-amber-300' : 'text-white'}`}>{status}</div>
                {wire?.aiFailure && <p className="text-sm text-slate-400">{isOwner ? 'Resolve the agent connection to continue.' : 'Waiting for the room owner to restore this agent.'}</p>}
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {state.waitingForResponseFrom.map(id => <div key={id} className="animate-pulse rounded-full border border-slate-700 bg-slate-800 px-3 py-1 font-mono text-xs tracking-widest text-slate-300">Waiting for {state.players.find(player => player.id === id)?.name}</div>)}
                </div>
              </>
            )}
          </div>

          <div className={`rounded-2xl border-2 p-4 transition-all sm:p-6 ${isMyTurn ? 'border-amber-500 bg-slate-900/80' : 'border-slate-800 bg-slate-900'}`}>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="mb-1 text-xl font-bold text-white">{spectator ? 'SPECTATOR VIEW' : boardPlayer.name}</h2>
                <div className="flex items-center gap-2 font-mono text-lg text-amber-400"><CircleDollarSign size={18} /> {spectator ? '—' : `${boardPlayer.coins} Credits`}</div>
              </div>
              {mustLoseInfluence && <div className="flex items-center gap-2 font-mono font-bold text-red-500 animate-pulse"><AlertTriangle size={18} /> Choose card to lose</div>}
            </div>

            <div className="mb-6 flex flex-wrap gap-4">
              {boardPlayer.cards.map(card => (
                <button key={card.id} disabled={!me || !mustLoseInfluence || card.isRevealed} onClick={() => me && send({ type: 'lose', cardId: card.id })} className={`flex h-36 w-24 flex-col items-center justify-between rounded-lg border-2 p-2 transition-all duration-300 ${card.isRevealed ? 'border-slate-700 bg-slate-900 text-slate-600 grayscale opacity-50' : mustLoseInfluence ? 'cursor-pointer border-red-500 bg-red-900/20 shadow-[0_0_15px_rgba(239,68,68,0.3)]' : 'border-slate-600 bg-gradient-to-br from-slate-800 to-slate-900'}`}>
                  <span className="font-mono text-xs opacity-50">{card.isRevealed ? 'LOST' : 'ACTIVE'}</span>
                  <span className={`text-center text-sm font-bold ${getCardCaptionClass(card.type)}`}>{card.type}</span>
                  <span className={`mt-2 text-xs uppercase tracking-wider ${getCardCaptionClass(card.type)}`}>{getCardCaption(card.type)}</span>
                </button>
              ))}
            </div>

            <div className={roomMobileClasses.actionGrid}>
              {isMyTurn && me && !boardPlayer.isEliminated && (
                <>
                  {!mustCoup && (
                    <>
                      <ActionButton label="Income (1)" sub="Safe" onClick={() => send({ type: 'action', action: ActionType.INCOME })} />
                      <ActionButton label="Foreign Aid (2)" sub="Blockable by Duke" onClick={() => send({ type: 'action', action: ActionType.FOREIGN_AID })} />
                      <ActionButton label="Tax (3)" sub="Claims Duke" color="purple" onClick={() => send({ type: 'action', action: ActionType.TAX })} />
                      <ActionButton label="Exchange" sub="Claims Ambassador" color="blue" onClick={() => send({ type: 'action', action: ActionType.EXCHANGE })} />
                      <ActionButton label="Steal (2)" sub="Claims Captain" color="green" onClick={() => setTargetAction(ActionType.STEAL)} />
                      {boardPlayer.coins >= 3 && <ActionButton label="Assassinate (3)" sub="Claims Assassin" color="red" onClick={() => setTargetAction(ActionType.ASSASSINATE)} />}
                    </>
                  )}
                  {boardPlayer.coins >= 7 && <ActionButton label="Coup (7)" sub="Unblockable" color="red" onClick={() => setTargetAction(ActionType.COUP)} />}
                  {targetAction && <button onClick={() => setTargetAction(null)} className={`${roomMobileClasses.touchTarget} col-span-2 mt-2 rounded-lg border border-slate-600 bg-slate-800 py-2 font-bold uppercase tracking-widest text-white md:col-span-4`}>Cancel Target Selection</button>}
                </>
              )}

              {canRespond && (
                <>
                  {canChallenge && <button onClick={() => send({ type: 'challenge' })} className="col-span-2 flex min-h-12 flex-col items-center justify-center rounded-lg border border-red-500 bg-red-600 py-3 font-bold text-white shadow-lg shadow-red-900/20"><span>CHALLENGE!</span><span className="text-xs font-normal opacity-80">They are lying!</span></button>}
                  {(canBlockDuke || canBlockContessa || canBlockCaptain || canBlockAmbassador) && (
                    <div className="col-span-2 my-2 grid grid-cols-2 gap-2 border-b border-t border-slate-800 py-2 md:col-span-4">
                      <div className="col-span-2 mb-1 text-center text-xs uppercase tracking-widest text-slate-400">Counter Measures</div>
                      {canBlockDuke && <ActionButton label="Block with Duke" color="purple" onClick={() => send({ type: 'block', cardClaim: CardType.DUKE })} />}
                      {canBlockContessa && <ActionButton label="Block with Contessa" color="red" onClick={() => send({ type: 'block', cardClaim: CardType.CONTESSA })} />}
                      {canBlockCaptain && <ActionButton label="Block with Captain" color="green" onClick={() => send({ type: 'block', cardClaim: CardType.CAPTAIN })} />}
                      {canBlockAmbassador && <ActionButton label="Block with Ambassador" color="blue" onClick={() => send({ type: 'block', cardClaim: CardType.AMBASSADOR })} />}
                    </div>
                  )}
                  <button onClick={() => send({ type: 'pass' })} className="col-span-2 min-h-12 rounded-lg border border-slate-600 bg-slate-700 py-3 font-bold text-white">PASS / ALLOW</button>
                </>
              )}
            </div>
          </div>
        </div>

        <aside className="flex h-full max-h-[520px] flex-col gap-4 lg:max-h-[700px] lg:col-span-4">
          <div className="flex min-h-[360px] flex-1 flex-col rounded-xl border border-slate-800 bg-slate-900 p-4">
            <h3 className="mb-4 border-b border-slate-800 pb-2 font-mono text-xs uppercase tracking-widest text-slate-400">Mission Log</h3>
            <div className="flex-1 space-y-3 overflow-y-auto pr-2">
              {state.logs.slice().reverse().map(log => <div key={log.id} className={`rounded p-2 text-sm ${log.type === 'alert' ? 'border-l-2 border-amber-500 bg-amber-900/20 text-amber-200' : log.type === 'danger' ? 'border-l-2 border-red-500 bg-red-900/20 text-red-200' : log.type === 'success' ? 'border-l-2 border-green-500 bg-green-900/20 text-green-200' : 'text-slate-400'}`}><span className="mr-2 font-mono text-xs opacity-50">[{new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>{log.text}</div>)}
            </div>
            {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
          </div>
          <div className="space-y-2 rounded-xl border border-slate-800 bg-slate-900 p-4 text-xs text-slate-500">
            <p><span className="font-bold text-purple-400">Duke</span>: Tax (+3), Blocks Foreign Aid</p>
            <p><span className="font-bold text-red-400">Assassin</span>: Kill (-3 coins)</p>
            <p><span className="font-bold text-green-400">Captain</span>: Steal (+2), Blocks Steal</p>
            <p><span className="font-bold text-blue-400">Ambassador</span>: Exchange cards, Blocks Steal</p>
            <p><span className="font-bold text-slate-200">Contessa</span>: Blocks Assassination</p>
          </div>
        </aside>
      </main>
    </div>
  );
}
