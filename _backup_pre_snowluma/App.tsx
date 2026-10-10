import React, { useState, useEffect, useRef } from 'react';
import { GameState, GamePhase, ActionType, CardType, Player } from './types';
import { initializeGame, handlePlayerAction, handleChallenge, handleBlock, handleLoseCard, handlePass } from './utils/gameEngine';
import { getAIDecision } from './services/geminiService';
import { canAccessAdminDash } from './services/adminAccess';
import { createAIRequestContext, isAIRequestRelevant, type AIRequestContext } from './services/aiDecisionGuard';
import ProtocolPage from './ProtocolPage';
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
    await fetch('/api/process', { method: 'DELETE' });
    submittedRef.current = false;
    historySubmittedRef.current = false;
    setGameState(initializeGame());
  };

  if (loading || !gameState) return <div className="flex min-h-screen w-full items-center justify-center bg-[#090d12] font-mono tracking-widest text-amber-200 animate-pulse">ESTABLISHING CONNECTION...</div>;

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

  return (
    <ProtocolPage eyebrow="Direct protocol / live match" title="The table is yours." description="Outmaneuver Alapha and Beta. Your progress saves as you play." actions={<>
      <a href="/game" className="inline-flex min-h-11 min-w-11 items-center justify-center gap-2 rounded-xl border border-white/10 px-2 text-xs font-semibold text-slate-300 transition hover:bg-white/[0.05] hover:text-amber-200 sm:px-3" title="Multiplayer rooms" aria-label="Multiplayer rooms"><Users size={18} /><span className="hidden sm:inline">Rooms</span></a>
      {canAccessAdminDash(role) && <button onClick={() => onNavigate('admin')} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-amber-200/15 text-amber-200 transition hover:bg-amber-200/[0.08]" title="Admin dashboard" aria-label="Admin dashboard"><LayoutDashboard size={18} /></button>}
      <button onClick={() => onNavigate('history')} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-white/10 text-slate-400 transition hover:bg-white/[0.05] hover:text-amber-200" title="Match history" aria-label="Match history"><HistoryIcon size={18} /></button>
      <button onClick={() => onNavigate('leaderboard')} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-white/10 text-slate-400 transition hover:bg-white/[0.05] hover:text-amber-200" title="Leaderboard" aria-label="Leaderboard"><Trophy size={18} /></button>
      <button onClick={resetGame} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-white/10 text-slate-400 transition hover:bg-white/[0.05] hover:text-amber-200" title="New match" aria-label="New match"><RefreshCw size={18} /></button>
      <button onClick={onLogout} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-white/10 text-slate-400 transition hover:bg-red-400/10 hover:text-red-200" title="Log out" aria-label="Log out"><LogOut size={18} /></button>
    </>}>
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:gap-6">

        {/* Left Column: Game Board */}
        <div className="lg:col-span-8 flex flex-col gap-6">

          {/* Opponents Area */}
          <div className="grid grid-cols-2 gap-2 sm:gap-4">
            {opponents.map(opp => (
              <button
                type="button"
                key={opp.id}
                disabled={!selectingTargetFor || opp.isEliminated}
                aria-label={`${opp.name}, ${opp.coins} credits${opp.isEliminated ? ', eliminated' : ''}${selectingTargetFor ? ', choose as target' : ''}`}
                onClick={() => selectingTargetFor && !opp.isEliminated ? onTargetSelect(opp.id) : undefined}
                className={`relative w-full appearance-none rounded-3xl border p-3 text-left transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-300 sm:p-5
                  ${selectingTargetFor && !opp.isEliminated ? 'cursor-pointer border-amber-200/50 bg-amber-200/[0.09] shadow-[0_0_24px_rgba(245,158,11,0.15)]' : ''}
                  ${!selectingTargetFor && opp.id === gameState.players[gameState.currentPlayerIndex].id ? 'border-amber-200/30 bg-gradient-to-br from-[#282116] to-[#111820]' : 'border-white/10 bg-[#111820]'}
                `}
              >
                {aiThinking === opp.name && (
                  <div className="absolute top-2 right-2 flex items-center gap-1 text-xs text-amber-400 animate-pulse">
                    <Zap size={12} /> Thinking...
                  </div>
                )}
                {selectingTargetFor && !opp.isEliminated && (
                  <div className="absolute top-2 right-2 text-xs font-bold text-amber-500 uppercase tracking-widest bg-amber-950/80 px-2 py-1 rounded">
                    Target
                  </div>
                )}
                <div className="flex items-center gap-3 mb-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-slate-900 ${opp.isEliminated ? 'bg-slate-700' : 'bg-slate-200'}`}>
                    {opp.name.charAt(0)}
                  </div>
                  <div>
                    <h3 className={`font-bold ${opp.isEliminated ? 'text-slate-500 line-through' : 'text-slate-100'}`}>{opp.name}</h3>
                    <div className="flex items-center gap-2 text-xs text-amber-400 font-mono">
                      <CircleDollarSign size={12} /> {opp.coins} Credits
                    </div>
                  </div>
                </div>
                {/* Cards (Face Down unless revealed) */}
                <div className="flex gap-2">
                  {opp.cards.map((card, idx) => (
                    <div key={idx} className={`w-16 h-24 rounded border flex items-center justify-center text-xs text-center p-1 ${card.isRevealed ? 'bg-slate-800 border-slate-600 text-slate-400 grayscale' : 'bg-slate-700 border-slate-600 bg-[url("https://www.transparenttextures.com/patterns/carbon-fibre.png")]'}`}>
                      {card.isRevealed ? card.type : <Shield className="text-slate-500 opacity-20" />}
                    </div>
                  ))}
                </div>
              </button>
            ))}
          </div>

          {/* Table / Status Area */}
          <div aria-live="polite" className="relative flex min-h-[180px] flex-col items-center justify-center overflow-hidden rounded-3xl border border-amber-200/15 bg-gradient-to-br from-[#282116] via-[#171713] to-[#10151a] p-5 text-center sm:p-8">
            {gameState.phase === GamePhase.GAME_OVER ? (
              <div className="animate-bounce text-2xl font-bold text-amber-500 uppercase tracking-widest">
                GAME OVER. WINNER: {gameState.winner}
              </div>
            ) : (
              <>
                <div className="text-slate-400 text-sm mb-2 uppercase tracking-widest font-mono">Current Protocol</div>
                <div className="text-2xl md:text-3xl font-bold text-white mb-4">
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
                <div className="flex gap-4 mt-4">
                  {gameState.waitingForResponseFrom.map(id => (
                    <div key={id} className="text-xs bg-slate-800 text-slate-300 px-3 py-1 rounded-full border border-slate-700 animate-pulse font-mono tracking-widest">
                      Waiting for {gameState.players.find(p => p.id === id)?.name}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Human Player Area */}
          <div className={`rounded-3xl border p-5 transition-all sm:p-6 ${isMyTurn ? 'border-amber-200/35 bg-[#1d1c17]' : 'border-white/10 bg-[#111820]'}`}>
            <div className="flex justify-between items-end mb-6">
              <div>
                <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.16em] text-slate-500">Your influence</p>
                <h2 className="text-xl font-bold text-white mb-1">You</h2>
                <div className="flex items-center gap-2 text-amber-400 font-mono text-lg">
                  <CircleDollarSign size={18} /> {human.coins} Credits
                </div>
              </div>
              {mustLoseInfluence && <div className="text-red-500 font-bold animate-pulse flex items-center gap-2 font-mono"><AlertTriangle /> Choose card to lose</div>}
            </div>

            {/* My Cards */}
            <div className="flex gap-4 mb-6">
              {human.cards.map((card) => (
                <button
                  key={card.id}
                  disabled={!mustLoseInfluence || card.isRevealed}
                  onClick={() => mustLoseInfluence && onLoseCard(card.id)}
                  className={`w-24 h-36 rounded-lg border-2 flex flex-col items-center justify-between p-2 transition-all duration-300 
                            ${card.isRevealed
                      ? 'bg-slate-900 border-slate-700 text-slate-600 grayscale opacity-50'
                      : mustLoseInfluence
                        ? 'bg-red-900/20 border-red-500 hover:bg-red-900/40 cursor-pointer shadow-[0_0_15px_rgba(239,68,68,0.3)]'
                        : 'bg-gradient-to-br from-slate-800 to-slate-900 border-slate-600'
                    }`}
                >
                  <span className="text-xs font-mono opacity-50">{card.isRevealed ? 'LOST' : 'ACTIVE'}</span>
                  <div className="font-bold text-sm text-center">{card.type}</div>
                  {getCardIcon(card.type)}
                </button>
              ))}
            </div>

            {/* Controls */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
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
                    <button onClick={cancelTargetSelection} className="col-span-2 md:col-span-4 mt-2 bg-slate-800 hover:bg-slate-700 text-white font-bold py-2 rounded-lg border border-slate-600 uppercase text-sm tracking-widest">
                      Cancel Target Selection
                    </button>
                  )}
                </>
              )}

              {/* 2. Response Actions (Challenge / Block) */}
              {canRespond && (
                <>
                  {/* Contextual Challenge Button */}
                  {((isActionPhase && incomingAction !== 'FOREIGN AID' && incomingAction !== 'FOREIGN_AID') || isBlockPhase) && (
                    <button onClick={onChallenge} className="col-span-2 bg-red-600 hover:bg-red-500 text-white font-bold py-3 rounded-lg flex flex-col items-center shadow-lg shadow-red-900/20 border border-red-500">
                      <span>CHALLENGE!</span>
                      <span className="text-xs font-normal opacity-80">They are lying!</span>
                    </button>
                  )}

                  {/* Contextual Block Buttons */}
                  {showBlockOptions && (
                    <div className="col-span-4 grid grid-cols-2 gap-2 my-2 border-t border-b border-slate-800 py-2">
                      <div className="col-span-2 text-center text-xs text-slate-400 uppercase tracking-widest mb-1">Counter Measures</div>
                      {canBlockDuke && <ActionButton label="Block with Duke" onClick={() => onBlock(CardType.DUKE)} color="purple" />}
                      {canBlockContessa && <ActionButton label="Block with Contessa" onClick={() => onBlock(CardType.CONTESSA)} color="red" />}
                      {canBlockCaptain && <ActionButton label="Block with Captain" onClick={() => onBlock(CardType.CAPTAIN)} color="green" />}
                      {canBlockAmbassador && <ActionButton label="Block with Ambassador" onClick={() => onBlock(CardType.AMBASSADOR)} color="blue" />}
                    </div>
                  )}

                  {/* Pass/Allow Button */}
                  <button onClick={onPass} className="col-span-2 bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-lg border border-slate-600">
                    PASS / ALLOW
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Game Log */}
        <div className="lg:col-span-4 h-full flex flex-col gap-4">
          <div className="flex max-h-[600px] flex-1 flex-col rounded-3xl border border-white/10 bg-[#111820] p-5">
            <h3 className="text-slate-400 font-mono text-xs uppercase tracking-widest mb-4 border-b border-slate-800 pb-2">Mission Log</h3>
            <div className="flex-1 overflow-y-auto space-y-3 pr-2">
              {gameState.logs.slice().reverse().map((log) => (
                <div key={log.id} className={`text-sm p-2 rounded ${log.type === 'alert' ? 'bg-amber-900/20 text-amber-200 border-l-2 border-amber-500' :
                  log.type === 'danger' ? 'bg-red-900/20 text-red-200 border-l-2 border-red-500' :
                    log.type === 'success' ? 'bg-green-900/20 text-green-200 border-l-2 border-green-500' :
                      'text-slate-400'
                  }`}>
                  <span className="text-xs opacity-50 font-mono mr-2">[{new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span>
                  {log.text}
                </div>
              ))}
            </div>
          </div>

          {/* Rules Hint */}
          <div className="space-y-2 rounded-3xl border border-white/10 bg-[#111820] p-5 text-xs text-slate-500">
            <p><span className="text-purple-400 font-bold">Duke</span>: Tax (+3), Blocks Foreign Aid</p>
            <p><span className="text-red-400 font-bold">Assassin</span>: Kill (-3 coins)</p>
            <p><span className="text-green-400 font-bold">Captain</span>: Steal (+2), Blocks Steal</p>
            <p><span className="text-blue-400 font-bold">Ambassador</span>: Exchange cards, Blocks Steal</p>
            <p><span className="text-slate-200 font-bold">Contessa</span>: Blocks Assassination</p>
          </div>
        </div>

      </div>
    </ProtocolPage>
  );
}

// Subcomponents

const ActionButton = ({ label, sub, onClick, disabled, color = 'slate', strong }: { label: string, sub?: string, onClick: () => void, disabled?: boolean, color?: string, strong?: boolean }) => {
  const colors: any = {
    slate: 'border-white/10 bg-white/[0.04] text-slate-100 hover:bg-white/[0.08]',
    purple: 'border-purple-200/20 bg-purple-200/[0.06] text-purple-100 hover:bg-purple-200/[0.12]',
    red: 'border-red-200/20 bg-red-200/[0.06] text-red-100 hover:bg-red-200/[0.12]',
    green: 'border-emerald-200/20 bg-emerald-200/[0.06] text-emerald-100 hover:bg-emerald-200/[0.12]',
    blue: 'border-sky-200/20 bg-sky-200/[0.06] text-sky-100 hover:bg-sky-200/[0.12]',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
                relative min-h-14 rounded-xl border p-3 flex flex-col items-start justify-center text-left transition-all
                ${disabled ? 'opacity-30 cursor-not-allowed grayscale' : ''}
                ${colors[color]}
                ${strong ? 'ring-1 ring-white/20' : ''}
            `}
    >
      <span className="font-bold text-sm">{label}</span>
      {sub && <span className="text-[10px] opacity-70">{sub}</span>}
    </button>
  )
}

const getCardIcon = (type: CardType) => {
  switch (type) {
    case CardType.DUKE: return <div className="text-purple-400 text-xs mt-2 uppercase tracking-wider">Taxation</div>;
    case CardType.ASSASSIN: return <div className="text-red-400 text-xs mt-2 uppercase tracking-wider">Lethal</div>;
    case CardType.CAPTAIN: return <div className="text-green-400 text-xs mt-2 uppercase tracking-wider">Thievery</div>;
    case CardType.AMBASSADOR: return <div className="text-blue-400 text-xs mt-2 uppercase tracking-wider">Swapping</div>;
    case CardType.CONTESSA: return <div className="text-orange-400 text-xs mt-2 uppercase tracking-wider">Defense</div>;
    default: return null;
  }
}
