import React, { useState, useEffect, useRef } from 'react';
import { GameState, GamePhase, ActionType, CardType, Player } from './types';
import { initializeGame, handlePlayerAction, handleChallenge, handleBlock, handleLoseCard, handlePass } from './utils/gameEngine';
import { getAIDecision } from './services/geminiService';
import { canAccessAdminDash } from './services/adminAccess';
import { createAIRequestContext, isAIRequestRelevant, type AIRequestContext } from './services/aiDecisionGuard';
import { AppShell, Badge, Button, PageHeader, ThemeToggle, cn, confirmAction, deferSensitive } from './ui';
import { Shield, LayoutDashboard, Zap, CircleDollarSign, AlertTriangle, RefreshCw, Trophy, LogOut, History as HistoryIcon, Users } from 'lucide-react';

export default function App({ role, onNavigate, onLogout }: { role: string, onNavigate: (v: 'admin' | 'leaderboard' | 'history') => void, onLogout: () => void }) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiThinking, setAiThinking] = useState<string | null>(null);
  const [selectingTargetFor, setSelectingTargetFor] = useState<ActionType | null>(null);

  // Track leaderboard submission to avoid duplicates
  const submittedRef = useRef(false);
  const historySubmittedRef = useRef(false);
  const aiTaskRef = useRef<{ context: AIRequestContext; controller: AbortController; timer: ReturnType<typeof setTimeout>; cancel: () => void } | null>(null);

  const startFresh = new URLSearchParams(window.location.search).get('new') === '1';

  // Initialize or resume the direct match.
  useEffect(() => {
    let active = true;
    const initialize = async () => {
      try {
        if (startFresh) {
          await fetch('/api/process', { method: 'DELETE' });
          if (!active) return;
          window.history.replaceState({}, '', '/play');
          setGameState(initializeGame());
        } else {
          const response = await fetch('/api/process');
          const data = await response.json();
          if (!active) return;
          if (data.state && data.state.phase !== GamePhase.GAME_OVER) {
            setGameState({ ...data.state, revision: data.state.revision || 0 });
          } else {
            setGameState(initializeGame());
          }
        }
      } catch {
        if (active) setGameState(initializeGame());
      } finally {
        if (active) setLoading(false);
      }
    };
    void initialize();
    return () => { active = false; };
  }, [startFresh]);

  // Persist State to DB
  useEffect(() => {
    if (!gameState || loading) return;
    const controller = new AbortController();

    // Check if game over to submit leaderboard
    if (gameState.phase === GamePhase.GAME_OVER && !submittedRef.current) {
      submittedRef.current = true;
      const human = gameState.players.find(p => p.id === 'human');
      if (human && human.placement) {
        const duration = Math.floor((Date.now() - gameState.startedAt) / 1000);
        fetch('/api/leaderboard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ place: human.placement, duration, game_id: gameState.gameId })
        });
      }
    }

    if (gameState.phase === GamePhase.GAME_OVER && !historySubmittedRef.current) {
      void fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: gameState }),
      }).then(response => {
        if (response.ok || response.status === 409) historySubmittedRef.current = true;
      }).catch(() => undefined);
    }

    const timer = setTimeout(() => {
      void fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state: gameState, game_id: gameState.gameId }),
        signal: controller.signal,
      }).catch(error => {
        if (error?.name !== 'AbortError') console.error('Game state sync failed', error);
      });
    }, 1000);

    const handleBeforeUnload = () => {
      if (gameState) {
        navigator.sendBeacon('/api/process', JSON.stringify({ state: gameState, game_id: gameState.gameId }));
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearTimeout(timer);
      controller.abort();
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [gameState, loading]);

  // --- AI Game Loop ---
  useEffect(() => () => { aiTaskRef.current?.cancel(); aiTaskRef.current = null; }, []);

  useEffect(() => {
    const activeTask = aiTaskRef.current;
    if (activeTask && (!gameState || !isAIRequestRelevant(gameState, activeTask.context))) {
      activeTask.cancel();
      aiTaskRef.current = null;
      setAiThinking(null);
    }
    if (!gameState || gameState.phase === GamePhase.GAME_OVER) return;

    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    const aiResponders = gameState.waitingForResponseFrom.filter(id => {
      const player = gameState.players.find(candidate => candidate.id === id);
      return player?.isAI;
    });
    const aiPlayer = gameState.phase === GamePhase.TURN_START && currentPlayer.isAI
      ? currentPlayer
      : aiResponders.length > 0 ? gameState.players.find(player => player.id === aiResponders[0]) : undefined;
    if (!aiPlayer || aiTaskRef.current) return;

    const controller = new AbortController();
    const context = createAIRequestContext(gameState, aiPlayer.id);
    let cancelled = false;
    const task = {
      context, controller,
      timer: undefined as unknown as ReturnType<typeof setTimeout>,
      cancel: () => { cancelled = true; clearTimeout(task.timer); controller.abort(); },
    };
    aiTaskRef.current = task;
    setAiThinking(aiPlayer.name);

    const processAI = async () => {
      try {
        const decision = await getAIDecision(gameState, aiPlayer, controller.signal);
        if (cancelled) return;
        setGameState(previous => {
          if (cancelled || !previous || !isAIRequestRelevant(previous, context)) return previous;
          if (previous.phase === GamePhase.TURN_START) {
            const action = decision.type === 'ACTION' ? decision.payload?.action : undefined;
            const target = decision.payload?.targetId;
            if (action) {
              const applied = handlePlayerAction(previous, aiPlayer.id, action, target);
              if (applied !== previous) return applied;
            }
            const fallbackTarget = previous.players.find(player => player.id !== aiPlayer.id && !player.isEliminated)?.id;
            return previous.players.find(player => player.id === aiPlayer.id)?.coins >= 10
              ? handlePlayerAction(previous, aiPlayer.id, ActionType.COUP, fallbackTarget)
              : handlePlayerAction(previous, aiPlayer.id, ActionType.INCOME);
          }
          if (decision.type === 'CHALLENGE') return handleChallenge(previous, aiPlayer.id);
          if (decision.type === 'BLOCK' && decision.payload?.blockCard) return handleBlock(previous, aiPlayer.id, decision.payload.blockCard);
          if (previous.phase === GamePhase.CHALLENGE_LOSS) {
            const cardId = decision.payload?.cardToLose || previous.players.find(player => player.id === aiPlayer.id)?.cards.find(card => !card.isRevealed)?.id;
            return cardId ? handleLoseCard(previous, aiPlayer.id, cardId) : previous;
          }
          return handlePass(previous, aiPlayer.id);
        });
      } catch (error: any) {
        if (error?.name !== 'AbortError') console.error('AI decision failed', error);
      } finally {
        if (aiTaskRef.current === task) {
          aiTaskRef.current = null;
          if (!cancelled) setAiThinking(null);
        }
      }
    };

    task.timer = setTimeout(processAI, 1500); // Delay for realism
  }, [gameState]);

  // --- UI Handlers ---

  const onAction = (action: ActionType, targetId?: string) => {
    if (!gameState) return;
    if ((action === ActionType.STEAL || action === ActionType.ASSASSINATE || action === ActionType.COUP) && !targetId) {
      setSelectingTargetFor(action);
      return;
    }
    setSelectingTargetFor(null);
    setGameState(handlePlayerAction(gameState, 'human', action, targetId));
  };

  const onTargetSelect = (targetId: string) => {
    if (selectingTargetFor) {
      onAction(selectingTargetFor, targetId);
    }
  };

  const cancelTargetSelection = () => {
    setSelectingTargetFor(null);
  };

  const onChallenge = () => {
    if (!gameState) return;
    setGameState(prev => prev ? handleChallenge(prev, 'human') : null);
  };

  const onBlock = (card: CardType) => {
    if (!gameState) return;
    setGameState(prev => prev ? handleBlock(prev, 'human', card) : null);
  };

  const onPass = () => {
    if (!gameState) return;
    setGameState(prev => prev ? handlePass(prev, 'human') : null);
  };

  const onLoseCard = (cardId: string) => {
    if (!gameState) return;
    setGameState(prev => prev ? handleLoseCard(prev, 'human', cardId) : null);
  };

  const resetGame = async () => {
    const startFresh = async () => {
      await fetch('/api/process', { method: 'DELETE' });
      submittedRef.current = false;
      historySubmittedRef.current = false;
      setGameState(initializeGame());
    };
    // A finished match has nothing to lose: start over without confirm/undo.
    if (gameState?.phase === GamePhase.GAME_OVER) { await startFresh(); return; }
    const confirmed = await confirmAction({ title: 'Start a new match?', description: 'Your current match progress will be discarded.', confirmLabel: 'NEW MATCH', tone: 'destructive' });
    if (!confirmed) return;
    deferSensitive({
      title: 'Starting new match',
      description: 'Your saved match is discarded when the timer ends.',
      successTitle: 'New match started',
      errorTitle: 'Could not start a new match',
      run: startFresh,
    });
  };

  if (loading || !gameState) return <div className="flex min-h-dvh w-full items-center justify-center bg-background font-mono text-xs uppercase tracking-widest text-muted-foreground animate-pulse">ESTABLISHING CONNECTION...</div>;

  const human = gameState.players.find(p => p.id === 'human')!;
  const opponents = gameState.players.filter(p => p.id !== 'human');
  const isMyTurn = gameState.currentPlayerIndex === gameState.players.indexOf(human);
  const mustCoup = human.coins >= 10;

  // UI State Computations
  const canRespond = gameState.waitingForResponseFrom.includes('human');
  const isActionPhase = gameState.phase === GamePhase.ACTION_DECLARED;
  const isBlockPhase = gameState.phase === GamePhase.BLOCK_DECLARED;

  const mustLoseInfluence = gameState.phase === GamePhase.CHALLENGE_LOSS && gameState.playerToLoseInfluence === 'human';

  // Logic to determine available blocks
  const incomingAction = gameState.pendingAction?.action.toUpperCase() || '';
  const isTargeted = gameState.pendingAction?.targetId === 'human';

  const canBlockDuke = isActionPhase && (incomingAction === 'FOREIGN AID' || incomingAction === 'FOREIGN_AID');
  const canBlockContessa = isActionPhase && incomingAction === 'ASSASSINATE' && isTargeted;
  const canBlockCaptain = isActionPhase && incomingAction === 'STEAL' && isTargeted;
  const canBlockAmbassador = isActionPhase && incomingAction === 'STEAL' && isTargeted;

  const showBlockOptions = canBlockDuke || canBlockContessa || canBlockCaptain || canBlockAmbassador;

  const nav = [
    { key: 'solo', label: 'Direct match', description: 'Alapha and Beta', icon: <Shield size={18} />, active: true },
    { key: 'rooms', label: 'Game rooms', description: 'Create, join and watch tables', icon: <Users size={18} />, href: '/game' },
    ...(canAccessAdminDash(role) ? [{ key: 'admin', label: 'Admin dashboard', description: 'Manage agents and active rooms', icon: <LayoutDashboard size={18} />, onClick: () => onNavigate('admin') }] : []),
    { key: 'history', label: 'Match history', description: 'Review your previous tables', icon: <HistoryIcon size={18} />, onClick: () => onNavigate('history') },
    { key: 'leaderboard', label: 'Leaderboard', description: 'See who holds the table', icon: <Trophy size={18} />, onClick: () => onNavigate('leaderboard') },
  ];

  const footer = (
    <div className="flex items-center justify-between gap-2">
      <ThemeToggle />
      <Button variant="ghost" size="icon" onClick={onLogout} className="text-muted-foreground hover:text-destructive" title="Log out" aria-label="Log out"><LogOut size={17} /></Button>
    </div>
  );

  return (
    <AppShell nav={nav} footer={footer}>
      <PageHeader
        eyebrow="Direct protocol / live match"
        title="The table is yours."
        description="Outmaneuver Alapha and Beta. Your progress saves as you play."
        actions={<Button variant="outline" size="icon" onClick={() => void resetGame()} title="New match" aria-label="New match"><RefreshCw size={16} /></Button>}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-6">

        {/* Left Column: Game Board */}
        <div className="flex flex-col gap-6 lg:col-span-8">

          {/* Opponents Area */}
          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            {opponents.map(opp => (
              <button
                type="button"
                key={opp.id}
                disabled={!selectingTargetFor || opp.isEliminated}
                aria-label={`${opp.name}, ${opp.coins} credits${opp.isEliminated ? ', eliminated' : ''}${selectingTargetFor ? ', choose as target' : ''}`}
                onClick={() => selectingTargetFor && !opp.isEliminated ? onTargetSelect(opp.id) : undefined}
                className={cn(
                  'ui-card relative w-full appearance-none rounded-2xl border bg-card p-3 text-left transition-all outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:p-5',
                  selectingTargetFor && !opp.isEliminated
                    ? 'cursor-pointer border-primary/60 bg-primary/5 ring-2 ring-primary/40'
                    : !selectingTargetFor && opp.id === gameState.players[gameState.currentPlayerIndex].id
                      ? 'border-primary/40 ring-2 ring-primary/50'
                      : 'border-border/60',
                  opp.isEliminated && 'opacity-50',
                )}
              >
                {aiThinking === opp.name && (
                  <Badge tone="primary" className="absolute right-2 top-2 animate-pulse gap-1">
                    <Zap size={12} /> Thinking...
                  </Badge>
                )}
                {selectingTargetFor && !opp.isEliminated && (
                  <Badge tone="primary" className="absolute right-2 top-2 text-micro font-bold uppercase tracking-widest">
                    Target
                  </Badge>
                )}
                <div className="mb-3 flex items-center gap-3">
                  <div className={cn('grid size-10 place-items-center rounded-full font-bold', opp.isEliminated ? 'bg-muted text-muted-foreground' : 'bg-foreground text-background')}>
                    {opp.name.charAt(0)}
                  </div>
                  <div className="min-w-0">
                    <h3 className={cn('font-semibold', opp.isEliminated && 'text-muted-foreground line-through')}>{opp.name}</h3>
                    <div className="flex items-center gap-2 font-mono text-xs tabular-nums text-log-warn">
                      <CircleDollarSign size={12} /> {opp.coins} Credits
                    </div>
                  </div>
                </div>
                {/* Cards (Face Down unless revealed) */}
                <div className="flex gap-2">
                  {opp.cards.map((card, idx) => (
                    <div key={idx} className={cn('flex h-24 w-16 items-center justify-center rounded-lg border p-1 text-center text-xs', card.isRevealed ? 'border-border bg-muted text-muted-foreground grayscale' : 'border-border bg-gradient-to-br from-muted to-card')}>
                      {card.isRevealed ? card.type : <Shield className="text-muted-foreground/40" />}
                    </div>
                  ))}
                </div>
              </button>
            ))}
          </div>

          {/* Table / Status Area */}
          <div aria-live="polite" className="ui-card relative flex min-h-[180px] flex-col items-center justify-center overflow-hidden rounded-2xl border border-primary/20 bg-card bg-[radial-gradient(60%_80%_at_50%_0%,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_70%)] p-5 text-center sm:p-8">
            {gameState.phase === GamePhase.GAME_OVER ? (
              <div className="animate-bounce text-2xl font-bold uppercase tracking-widest text-log-warn">
                GAME OVER. WINNER: {gameState.winner}
              </div>
            ) : (
              <>
                <div className="mb-2 font-mono text-sm uppercase tracking-widest text-muted-foreground">Current Protocol</div>
                <div className="mb-4 text-2xl font-semibold tracking-tight md:text-3xl">
                  {selectingTargetFor
                    ? `Select target for ${selectingTargetFor}...`
                    : gameState.pendingAction
                      ? `${gameState.players.find(p => p.id === gameState.pendingAction?.actorId)?.name} is attempting to ${gameState.pendingAction.action}...`
                      : gameState.pendingBlock
                        ? `${gameState.players.find(p => p.id === gameState.pendingBlock?.blockerId)?.name} blocks using ${gameState.pendingBlock.cardClaimed}`
                        : isMyTurn
                          ? 'Your turn — choose an action.'
                          : `Waiting for ${gameState.players[gameState.currentPlayerIndex].name}...`
                  }
                </div>
                {/* Visualizing the "Stack" */}
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {gameState.waitingForResponseFrom.map(id => (
                    <Badge key={id} tone="neutral" className="animate-pulse py-1 font-mono text-xs tracking-widest">
                      Waiting for {gameState.players.find(p => p.id === id)?.name}
                    </Badge>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Human Player Area */}
          <div className={cn('ui-card rounded-2xl border p-5 transition-all sm:p-6', isMyTurn ? 'border-primary/40 ring-2 ring-primary/50' : 'border-border/60 bg-card')}>
            <div className="mb-6 flex items-end justify-between gap-3">
              <div>
                <p className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">Your influence</p>
                <h2 className="mb-1 text-xl font-semibold tracking-tight">You</h2>
                <div className="flex items-center gap-2 font-mono text-lg tabular-nums text-log-warn">
                  <CircleDollarSign size={18} /> {human.coins} Credits
                </div>
              </div>
              {mustLoseInfluence && <Badge tone="destructive" className="animate-pulse gap-2 font-mono text-sm"><AlertTriangle size={16} /> Choose card to lose</Badge>}
            </div>

            {/* My Cards */}
            <div className="mb-6 flex gap-4">
              {human.cards.map((card) => (
                <button
                  key={card.id}
                  disabled={!mustLoseInfluence || card.isRevealed}
                  onClick={() => mustLoseInfluence && onLoseCard(card.id)}
                  className={cn('flex h-36 w-24 flex-col items-center justify-between rounded-lg border-2 bg-card p-2 outline-none transition-all duration-300 focus-visible:ring-[3px] focus-visible:ring-ring/40', card.isRevealed ? 'border-border bg-muted opacity-50 grayscale' : mustLoseInfluence ? 'cursor-pointer border-destructive ring-2 ring-destructive/40 hover:bg-destructive/5' : 'border-border')}
                >
                  <Badge tone={card.isRevealed ? 'neutral' : 'success'} className="font-mono text-micro uppercase tracking-wider">{card.isRevealed ? 'LOST' : 'ACTIVE'}</Badge>
                  <div className={cn('text-center text-sm font-bold', card.isRevealed && 'line-through')}>{card.type}</div>
                  {getCardIcon(card.type)}
                </button>
              ))}
            </div>

            {/* Controls */}
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4 sm:gap-3">
              {/* 1. Turn Actions */}
              {isMyTurn && gameState.phase === GamePhase.TURN_START && !human.isEliminated && (
                <>
                  <ActionButton label="Income (1)" disabled={selectingTargetFor !== null || mustCoup} onClick={() => onAction(ActionType.INCOME)} sub="Safe" />
                  <ActionButton label="Foreign Aid (2)" disabled={selectingTargetFor !== null || mustCoup} onClick={() => onAction(ActionType.FOREIGN_AID)} sub="Blockable by Duke" />
                  <ActionButton label="Tax (3)" disabled={selectingTargetFor !== null || mustCoup} onClick={() => onAction(ActionType.TAX)} sub="Claims Duke" color="purple" />
                  <ActionButton label="Exchange" disabled={selectingTargetFor !== null || mustCoup} onClick={() => onAction(ActionType.EXCHANGE)} sub="Claims Ambassador" color="blue" />
                  <ActionButton label="Steal (2)" disabled={selectingTargetFor !== null || mustCoup} onClick={() => onAction(ActionType.STEAL)} sub="Claims Captain" color="green" />
                  <ActionButton label="Assassinate (3)" disabled={selectingTargetFor !== null || human.coins < 3 || mustCoup} onClick={() => onAction(ActionType.ASSASSINATE)} sub="Claims Assassin" color="red" />
                  <ActionButton label="Coup (7)" disabled={selectingTargetFor !== null || human.coins < 7} onClick={() => onAction(ActionType.COUP)} sub="Unblockable" color="red" strong />

                  {selectingTargetFor && (
                    <Button variant="outline" onClick={cancelTargetSelection} className="col-span-2 mt-2 font-bold uppercase tracking-widest md:col-span-4">
                      Cancel Target Selection
                    </Button>
                  )}
                </>
              )}

              {/* 2. Response Actions (Challenge / Block) */}
              {canRespond && (
                <>
                  {/* Contextual Challenge Button */}
                  {((isActionPhase && incomingAction !== 'FOREIGN AID' && incomingAction !== 'FOREIGN_AID') || isBlockPhase) && (
                    <Button variant="destructive" onClick={onChallenge} className="col-span-2 h-auto min-h-12 flex-col py-3 font-bold">
                      <span>CHALLENGE!</span>
                      <span className="text-xs font-normal opacity-80">They are lying!</span>
                    </Button>
                  )}

                  {/* Contextual Block Buttons */}
                  {showBlockOptions && (
                    <div className="col-span-2 my-2 grid grid-cols-2 gap-2 rounded-xl bg-muted/40 p-2 md:col-span-4">
                      <div className="col-span-2 mb-1 text-center text-xs uppercase tracking-widest text-muted-foreground">Counter Measures</div>
                      {canBlockDuke && <ActionButton label="Block with Duke" onClick={() => onBlock(CardType.DUKE)} color="purple" />}
                      {canBlockContessa && <ActionButton label="Block with Contessa" onClick={() => onBlock(CardType.CONTESSA)} color="red" />}
                      {canBlockCaptain && <ActionButton label="Block with Captain" onClick={() => onBlock(CardType.CAPTAIN)} color="green" />}
                      {canBlockAmbassador && <ActionButton label="Block with Ambassador" onClick={() => onBlock(CardType.AMBASSADOR)} color="blue" />}
                    </div>
                  )}

                  {/* Pass/Allow Button */}
                  <Button variant="secondary" onClick={onPass} className="col-span-2 py-3 font-bold">
                    PASS / ALLOW
                  </Button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Game Log */}
        <div className="flex h-full flex-col gap-4 lg:col-span-4">
          <div className="ui-card flex max-h-[600px] flex-1 flex-col rounded-2xl border border-border/60 bg-card p-5">
            <h3 className="mb-4 font-mono text-xs uppercase tracking-widest text-muted-foreground">Mission Log</h3>
            <div className="flex-1 space-y-2 overflow-y-auto pr-2">
              {gameState.logs.slice().reverse().map((log) => (
                <div key={log.id} className={cn('anim-rise rounded-lg px-2.5 py-2 text-sm', log.type === 'alert' ? 'border-l-2 border-warning bg-warning/10 text-log-warn' :
                  log.type === 'danger' ? 'border-l-2 border-destructive bg-destructive/10 text-log-error' :
                    log.type === 'success' ? 'border-l-2 border-success bg-success/10 text-log-success' :
                      'text-muted-foreground'
                  )}>
                  <span className="mr-2 font-mono text-micro tabular-nums opacity-60">[{new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                  {log.text}
                </div>
              ))}
            </div>
          </div>

          {/* Rules Hint */}
          <div className="ui-card space-y-2 rounded-2xl border border-border/60 bg-card p-5 text-xs text-muted-foreground">
            <p><span className="font-bold text-role-duke">Duke</span>: Tax (+3), Blocks Foreign Aid</p>
            <p><span className="font-bold text-role-assassin">Assassin</span>: Kill (-3 coins)</p>
            <p><span className="font-bold text-role-captain">Captain</span>: Steal (+2), Blocks Steal</p>
            <p><span className="font-bold text-role-ambassador">Ambassador</span>: Exchange cards, Blocks Steal</p>
            <p><span className="font-bold text-role-contessa">Contessa</span>: Blocks Assassination</p>
          </div>
        </div>

      </div>
    </AppShell>
  );
}

// Subcomponents

const ActionButton = ({ label, sub, onClick, disabled, color = 'slate', strong }: { label: string, sub?: string, onClick: () => void, disabled?: boolean, color?: string, strong?: boolean }) => {
  const colors: Record<string, string> = {
    slate: 'border-border bg-card text-foreground hover:bg-accent',
    purple: 'border-role-duke/30 bg-role-duke/10 text-role-duke hover:bg-role-duke/15',
    red: 'border-destructive/30 bg-destructive/10 text-log-error hover:bg-destructive/15',
    green: 'border-role-captain/30 bg-role-captain/10 text-role-captain hover:bg-role-captain/15',
    blue: 'border-role-ambassador/30 bg-role-ambassador/10 text-role-ambassador hover:bg-role-ambassador/15',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'relative flex min-h-14 flex-col items-start justify-center rounded-xl border p-3 text-left outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-40 disabled:grayscale',
        colors[color],
        strong && 'ring-1 ring-ring/40',
      )}
    >
      <span className="text-sm font-bold">{label}</span>
      {sub && <span className="text-micro opacity-75">{sub}</span>}
    </button>
  )
}

const getCardIcon = (type: CardType) => {
  switch (type) {
    case CardType.DUKE: return <div className="mt-2 text-xs uppercase tracking-wider text-role-duke">Taxation</div>;
    case CardType.ASSASSIN: return <div className="mt-2 text-xs uppercase tracking-wider text-role-assassin">Lethal</div>;
    case CardType.CAPTAIN: return <div className="mt-2 text-xs uppercase tracking-wider text-role-captain">Thievery</div>;
    case CardType.AMBASSADOR: return <div className="mt-2 text-xs uppercase tracking-wider text-role-ambassador">Swapping</div>;
    case CardType.CONTESSA: return <div className="mt-2 text-xs uppercase tracking-wider text-role-contessa">Defense</div>;
    default: return null;
  }
}
