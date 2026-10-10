import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CircleDollarSign, Shield } from 'lucide-react';
import { ActionType, CardType, GamePhase, type GameState, type Player } from './types';
import { roomMobileClasses } from './services/roomUi';
import { availableRoomAiChannels } from './services/rooms';
import { roomApi } from './services/roomClient';
import { Badge, Button, StatusDot, cn, notify } from './ui';

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
  [CardType.DUKE]: 'text-role-duke',
  [CardType.ASSASSIN]: 'text-role-assassin',
  [CardType.CAPTAIN]: 'text-role-captain',
  [CardType.AMBASSADOR]: 'text-role-ambassador',
  [CardType.CONTESSA]: 'text-role-contessa',
}[type]);

function PlayerPanel({ player, currentTurn, target, onTarget }: { key?: string; player: Player; currentTurn: boolean; target: boolean; onTarget: () => void }) {
  return (
    <button
      type="button"
      disabled={!target}
      aria-label={`${player.name}${player.isEliminated ? ', eliminated' : ''}${target ? ', choose as target' : ''}`}
      onClick={target ? onTarget : undefined}
      className={cn(
        'ui-card relative w-full appearance-none rounded-2xl border bg-card p-3 text-left transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:p-5',
        target
          ? 'cursor-pointer border-primary/60 bg-primary/5 ring-2 ring-primary/40'
          : currentTurn
            ? 'border-primary/40 ring-2 ring-primary/50'
            : 'border-border/60',
        player.isEliminated && 'opacity-50',
      )}
    >
      {target && <Badge tone="primary" className="absolute right-2 top-2 text-micro font-bold uppercase tracking-widest">Target</Badge>}
      <div className="mb-3 flex items-center gap-3">
        <div className={cn('grid size-10 place-items-center rounded-full font-bold', player.isEliminated ? 'bg-muted text-muted-foreground' : 'bg-foreground text-background')}>
          {player.name.charAt(0)}
        </div>
        <div className="min-w-0">
          <h3 className={cn('flex items-center gap-2 font-semibold', player.isEliminated && 'text-muted-foreground line-through')}>
            {player.name}
            {currentTurn && <StatusDot tone="primary" pulse label="Current turn" />}
          </h3>
          <div className="flex items-center gap-2 font-mono text-xs tabular-nums text-log-warn"><CircleDollarSign size={12} /> {player.coins} Credits</div>
        </div>
      </div>
      <div className="flex gap-2">
        {player.cards.map(card => (
          <div key={card.id} className={cn('flex h-24 w-16 items-center justify-center rounded-lg border p-1 text-center text-xs', card.isRevealed ? 'border-border bg-muted text-muted-foreground grayscale' : 'border-border bg-gradient-to-br from-muted to-card')}>
            {card.isRevealed ? card.type : <Shield className="text-muted-foreground/40" />}
          </div>
        ))}
      </div>
    </button>
  );
}

function ActionButton({ label, sub, onClick, color = 'slate' }: { label: string; sub?: string; onClick: () => void; color?: string }) {
  const colors: Record<string, string> = {
    slate: 'border-border bg-card text-foreground hover:bg-accent',
    purple: 'border-role-duke/30 bg-role-duke/10 text-role-duke hover:bg-role-duke/15',
    red: 'border-destructive/30 bg-destructive/10 text-log-error hover:bg-destructive/15',
    green: 'border-role-captain/30 bg-role-captain/10 text-role-captain hover:bg-role-captain/15',
    blue: 'border-role-ambassador/30 bg-role-ambassador/10 text-role-ambassador hover:bg-role-ambassador/15',
  };
  return (
    <button onClick={onClick} className={cn(roomMobileClasses.touchTarget, 'relative flex w-full flex-col items-start justify-center rounded-xl border p-3 text-left outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40', colors[color])}>
      <span className="text-sm font-bold">{label}</span>
      {sub && <span className="text-micro opacity-75">{sub}</span>}
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
    const romanChannel: Record<string, string> = { '1': 'I', '2': 'II', '3': 'III' };
    try {
      await roomApi.recoverAi(roomId, type, channelId);
      notify({ tone: 'success', title: type === 'switch-ai' && channelId ? `Seat switched to AI ${romanChannel[channelId] ?? channelId}` : 'AI reconnected' });
    }
    catch (reason: any) {
      const message = reason.message || 'AI recovery failed';
      setError(message);
      notify({ tone: 'destructive', title: 'AI recovery failed', description: message });
    }
    finally { setRecovering(false); }
  };

  if (!state || !boardPlayer) return <div className="ui-card flex min-h-[360px] items-center justify-center rounded-2xl border border-border/60 bg-card font-mono text-xs uppercase tracking-widest text-muted-foreground animate-pulse">ESTABLISHING CONNECTION...</div>;

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
          : isMyTurn
            ? 'Your turn — choose an action.'
            : `Waiting for ${state.players[state.currentPlayerIndex]?.name}...`;

  return (
    <div className="text-foreground">
      {wire?.aiFailure && !wire.paused && <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/70 p-4 backdrop-blur-sm"><section role="dialog" aria-modal="true" aria-labelledby="ai-recovery-title" className="ui-card w-full max-w-md rounded-2xl border border-border/80 bg-popover p-5 text-popover-foreground"><p className="text-xs font-medium uppercase tracking-wider text-log-warn">ROOM AGENT CONNECTION</p><h2 id="ai-recovery-title" className="mt-2 text-xl font-semibold tracking-tight">{isOwner ? `AI ${wire.aiFailure.channelId} could not respond` : 'Agent connection interrupted'}</h2><p className="mt-3 text-sm text-muted-foreground">{isOwner ? wire.aiFailure.message || `The current AI request failed (HTTP ${wire.aiFailure.status}). You can retry or move this seat to an unused AI channel.` : 'Waiting for the room owner to retry or switch this AI. The game is paused at this action.'}</p>{isOwner && <div className="mt-5 grid gap-2">{availableRoomAiChannels(wire.aiChannels || [], wire.aiFailure.channelId).map(channel => <Button key={channel} variant="outline" disabled={recovering} onClick={() => void recoverAi('switch-ai', channel)} className="min-h-11 justify-start px-4 text-left text-sm font-semibold">Switch this seat to AI {({ '1': 'I', '2': 'II', '3': 'III' } as Record<string, string>)[channel]}</Button>)}<Button disabled={recovering} onClick={() => void recoverAi('retry-ai')} className="min-h-11 px-4 text-sm font-semibold">{recovering ? 'RECONNECTING…' : 'RETRY CURRENT AI'}</Button>{availableRoomAiChannels(wire.aiChannels || [], wire.aiFailure.channelId).length === 0 && <p className="text-xs text-muted-foreground">No unused AI channel is available in this room.</p>}</div>}</section></div>}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-6">
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

          <div className="ui-card relative flex min-h-[200px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-primary/20 bg-card bg-[radial-gradient(60%_80%_at_50%_0%,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_70%)] p-5 text-center sm:p-8">
            {state.phase === GamePhase.GAME_OVER ? (
              <div className="animate-bounce text-2xl font-bold uppercase tracking-widest text-log-warn">{status}</div>
            ) : (
              <>
                <div className="mb-2 font-mono text-sm uppercase tracking-widest text-muted-foreground">Current Protocol</div>
                <div className={cn('mb-4 text-xl font-semibold tracking-tight sm:text-2xl md:text-3xl', wire?.aiFailure ? 'text-log-warn' : 'text-foreground')}>{status}</div>
                {wire?.aiFailure && <p className="text-sm text-muted-foreground">{isOwner ? 'Resolve the agent connection to continue.' : 'Waiting for the room owner to restore this agent.'}</p>}
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {state.waitingForResponseFrom.map(id => <Badge key={id} tone="neutral" className="animate-pulse py-1 font-mono text-xs tracking-widest">Waiting for {state.players.find(player => player.id === id)?.name}</Badge>)}
                </div>
              </>
            )}
          </div>

          <div className={cn('ui-card rounded-2xl border p-4 transition-all sm:p-6', isMyTurn ? 'border-primary/40 ring-2 ring-primary/50' : 'border-border/60 bg-card')}>
            <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="mb-1 text-xl font-semibold tracking-tight">{spectator ? 'SPECTATOR VIEW' : boardPlayer.name}</h2>
                <div className="flex items-center gap-2 font-mono text-lg tabular-nums text-log-warn"><CircleDollarSign size={18} /> {spectator ? '—' : `${boardPlayer.coins} Credits`}</div>
              </div>
              {mustLoseInfluence && <Badge tone="destructive" className="animate-pulse gap-2 font-mono text-sm"><AlertTriangle size={16} /> Choose card to lose</Badge>}
            </div>

            <div className="mb-6 flex flex-wrap gap-4">
              {boardPlayer.cards.map(card => (
                <button key={card.id} disabled={!me || !mustLoseInfluence || card.isRevealed} onClick={() => me && send({ type: 'lose', cardId: card.id })} className={cn('flex h-36 w-24 flex-col items-center justify-between rounded-lg border-2 bg-card p-2 outline-none transition-all duration-300 focus-visible:ring-[3px] focus-visible:ring-ring/40', card.isRevealed ? 'border-border bg-muted opacity-50 grayscale' : mustLoseInfluence ? 'cursor-pointer border-destructive ring-2 ring-destructive/40 hover:bg-destructive/5' : 'border-border')}>
                  <Badge tone={card.isRevealed ? 'neutral' : 'success'} className="font-mono text-micro uppercase tracking-wider">{card.isRevealed ? 'LOST' : 'ACTIVE'}</Badge>
                  <span className={cn('text-center text-sm font-bold', card.isRevealed && 'line-through', getCardCaptionClass(card.type))}>{card.type}</span>
                  <span className={cn('text-xs uppercase tracking-wider', getCardCaptionClass(card.type))}>{getCardCaption(card.type)}</span>
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
                  {targetAction && <Button variant="outline" onClick={() => setTargetAction(null)} className={cn(roomMobileClasses.touchTarget, 'col-span-2 mt-2 font-bold uppercase tracking-widest md:col-span-4')}>Cancel Target Selection</Button>}
                </>
              )}

              {canRespond && (
                <>
                  {canChallenge && <Button variant="destructive" onClick={() => send({ type: 'challenge' })} className="col-span-2 h-auto min-h-12 flex-col py-3 font-bold"><span>CHALLENGE!</span><span className="text-xs font-normal opacity-80">They are lying!</span></Button>}
                  {(canBlockDuke || canBlockContessa || canBlockCaptain || canBlockAmbassador) && (
                    <div className="col-span-2 my-2 grid grid-cols-2 gap-2 rounded-xl bg-muted/40 p-2 md:col-span-4">
                      <div className="col-span-2 mb-1 text-center text-xs uppercase tracking-widest text-muted-foreground">Counter Measures</div>
                      {canBlockDuke && <ActionButton label="Block with Duke" color="purple" onClick={() => send({ type: 'block', cardClaim: CardType.DUKE })} />}
                      {canBlockContessa && <ActionButton label="Block with Contessa" color="red" onClick={() => send({ type: 'block', cardClaim: CardType.CONTESSA })} />}
                      {canBlockCaptain && <ActionButton label="Block with Captain" color="green" onClick={() => send({ type: 'block', cardClaim: CardType.CAPTAIN })} />}
                      {canBlockAmbassador && <ActionButton label="Block with Ambassador" color="blue" onClick={() => send({ type: 'block', cardClaim: CardType.AMBASSADOR })} />}
                    </div>
                  )}
                  <Button variant="secondary" onClick={() => send({ type: 'pass' })} className="col-span-2 min-h-12 font-bold">PASS / ALLOW</Button>
                </>
              )}
            </div>
          </div>
        </div>

        <aside className="flex h-full max-h-[520px] flex-col gap-4 lg:max-h-[700px] lg:col-span-4">
          <div className="ui-card flex min-h-[360px] flex-1 flex-col rounded-2xl border border-border/60 bg-card p-5">
            <h3 className="mb-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">Mission Log</h3>
            <div className="flex-1 space-y-2 overflow-y-auto pr-2">
              {state.logs.slice().reverse().map(log => <div key={log.id} className={cn('anim-rise rounded-lg px-2.5 py-2 text-sm', log.type === 'alert' ? 'border-l-2 border-warning bg-warning/10 text-log-warn' : log.type === 'danger' ? 'border-l-2 border-destructive bg-destructive/10 text-log-error' : log.type === 'success' ? 'border-l-2 border-success bg-success/10 text-log-success' : 'text-muted-foreground')}><span className="mr-2 font-mono text-micro tabular-nums opacity-60">[{new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>{log.text}</div>)}
            </div>
            {error && <p className="mt-3 text-xs text-log-error">{error}</p>}
          </div>
          <div className="ui-card space-y-2 rounded-2xl border border-border/60 bg-card p-5 text-xs text-muted-foreground">
            <p><span className="font-bold text-role-duke">Duke</span>: Tax (+3), Blocks Foreign Aid</p>
            <p><span className="font-bold text-role-assassin">Assassin</span>: Kill (-3 coins)</p>
            <p><span className="font-bold text-role-captain">Captain</span>: Steal (+2), Blocks Steal</p>
            <p><span className="font-bold text-role-ambassador">Ambassador</span>: Exchange cards, Blocks Steal</p>
            <p><span className="font-bold text-role-contessa">Contessa</span>: Blocks Assassination</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
