import React, { useState, useEffect, useRef } from 'react';
import { GameState, GamePhase, ActionType, CardType, Player } from './types';
import { initializeGame, handlePlayerAction, handleChallenge, handleBlock, handleLoseCard, handlePass } from './utils/gameEngine';
import { getAIDecision } from './services/geminiService';
import { canAccessAdminDash } from './services/adminAccess';
import { createAIRequestContext, isAIRequestCurrent } from './services/aiDecisionGuard';
import { Shield, LayoutDashboard, Zap, CircleDollarSign, AlertTriangle, Eye, RefreshCw, Trophy, LogOut, History as HistoryIcon } from 'lucide-react';

export default function App({ role, onNavigate, onLogout }: { role: string, onNavigate: (v: 'game' | 'admin' | 'leaderboard' | 'history') => void, onLogout: () => void }) {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [loading, setLoading] = useState(true);
  const [aiThinking, setAiThinking] = useState<string | null>(null);
  const [selectingTargetFor, setSelectingTargetFor] = useState<ActionType | null>(null);

  // Track leaderboard submission to avoid duplicates
  const submittedRef = useRef(false);
  const historySubmittedRef = useRef(false);

  // Initialize Game from DB
  useEffect(() => {
    fetch('/api/process')
      .then(res => res.json())
      .then(data => {
        if (data.state) {
          setGameState({ ...data.state, revision: data.state.revision || 0 });
        } else {
          setGameState(initializeGame());
        }
        setLoading(false);
      })
      .catch(e => {
        setGameState(initializeGame());
        setLoading(false);
      });
  }, []);

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
  useEffect(() => {
    if (!gameState || gameState.phase === GamePhase.GAME_OVER) return;

    const controller = new AbortController();
    let cancelled = false;

    const processAI = async () => {
      const currentPlayer = gameState.players[gameState.currentPlayerIndex];
      const aiResponders = gameState.waitingForResponseFrom.filter(id => {
        const p = gameState.players.find(pl => pl.id === id);
        return p && p.isAI;
      });

      const aiPlayer = gameState.phase === GamePhase.TURN_START && currentPlayer.isAI
        ? currentPlayer
        : aiResponders.length > 0 ? gameState.players.find(player => player.id === aiResponders[0]) : undefined;
      if (!aiPlayer) return;

      const context = createAIRequestContext(gameState, aiPlayer.id);
      setAiThinking(aiPlayer.name);
      try {
        const decision = await getAIDecision(gameState, aiPlayer, controller.signal);
        if (cancelled) return;
        setGameState(previous => {
          if (!previous || !isAIRequestCurrent(previous, context)) return previous;
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
        if (!cancelled) setAiThinking(null);
      }
    };

    const timer = setTimeout(processAI, 1500); // Delay for realism
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
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

  const doLogout = async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
    } catch (e) {
      console.error('Local logout failed', e);
    }
    // Synchronize logout with Auth Center as per way.md / way0.md
    const SSO_URL = 'https://accounts.aryuki.com';
    const afterLogoutUrl = encodeURIComponent(window.location.origin);
    window.location.href = `${SSO_URL}/logout?redirect=${afterLogoutUrl}`;
  };

  if (loading || !gameState) return <div className="h-screen w-full bg-slate-900 flex items-center justify-center text-amber-500 font-mono animate-pulse tracking-widest">ESTABLISHING CONNECTION...</div>;

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
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-amber-500/30">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md p-4 sticky top-0 z-50 flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Shield className="text-amber-500 w-6 h-6" />
          <h1 className="text-lg font-bold tracking-wider text-amber-500 font-mono">COUP: SHADOW PROTOCOL</h1>
        </div>
        <div className="flex gap-2 items-center">
          {canAccessAdminDash(role) && (
            <button onClick={() => onNavigate('admin')} className="inline-flex items-center gap-2 rounded-lg px-3 py-2 font-mono text-xs font-bold tracking-wider text-amber-500 transition-colors hover:bg-slate-800" title="AdminDash">
              <LayoutDashboard size={18} />
              ADMINDASH
            </button>
          )}
          <button onClick={() => onNavigate('history')} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-amber-500" title="Match History"><HistoryIcon size={18} /></button>
          <button onClick={() => onNavigate('leaderboard')} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-amber-500" title="Leaderboard"><Trophy size={18} /></button>
          <button onClick={resetGame} className="p-2 hover:bg-slate-800 rounded-full transition-colors text-slate-400 hover:text-amber-500" title="Reset Game"><RefreshCw size={18} /></button>
          <button onClick={doLogout} className="p-2 hover:bg-red-900/50 rounded-full transition-colors text-slate-400 hover:text-red-500 ml-2" title="Logout"><LogOut size={18} /></button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 md:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">

        {/* Left Column: Game Board */}
        <div className="lg:col-span-8 flex flex-col gap-6">

          {/* Opponents Area */}
          <div className="grid grid-cols-2 gap-4">
            {opponents.map(opp => (
              <div
                key={opp.id}
                onClick={() => selectingTargetFor && !opp.isEliminated ? onTargetSelect(opp.id) : undefined}
                className={`relative p-4 rounded-xl border-2 transition-all 
                  ${selectingTargetFor && !opp.isEliminated ? 'border-amber-500 cursor-pointer hover:bg-amber-900/30 animate-pulse shadow-[0_0_20px_rgba(245,158,11,0.4)]' : ''}
                  ${!selectingTargetFor && opp.id === gameState.players[gameState.currentPlayerIndex].id ? 'border-amber-500 bg-amber-500/5 shadow-[0_0_15px_rgba(245,158,11,0.2)]' : 'border-slate-800 bg-slate-900'}
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
              </div>
            ))}
          </div>

          {/* Table / Status Area */}
          <div className="bg-slate-900/50 rounded-2xl p-8 border border-slate-800 flex flex-col items-center justify-center min-h-[200px] text-center relative overflow-hidden">
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
          <div className={`p-6 rounded-2xl border-2 transition-all ${isMyTurn ? 'border-amber-500 bg-slate-900/80' : 'border-slate-800 bg-slate-900'}`}>
            <div className="flex justify-between items-end mb-6">
              <div>
                <h2 className="text-xl font-bold text-white mb-1">YOU (Agent)</h2>
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
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 flex-1 flex flex-col max-h-[600px]">
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
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-xs text-slate-500 space-y-2">
            <p><span className="text-purple-400 font-bold">Duke</span>: Tax (+3), Blocks Foreign Aid</p>
            <p><span className="text-red-400 font-bold">Assassin</span>: Kill (-3 coins)</p>
            <p><span className="text-green-400 font-bold">Captain</span>: Steal (+2), Blocks Steal</p>
            <p><span className="text-blue-400 font-bold">Ambassador</span>: Exchange cards, Blocks Steal</p>
            <p><span className="text-slate-200 font-bold">Contessa</span>: Blocks Assassination</p>
          </div>
        </div>

      </main>
    </div>
  );
}

// Subcomponents

const ActionButton = ({ label, sub, onClick, disabled, color = 'slate', strong }: { label: string, sub?: string, onClick: () => void, disabled?: boolean, color?: string, strong?: boolean }) => {
  const colors: any = {
    slate: 'bg-slate-800 hover:bg-slate-700 border-slate-600',
    purple: 'bg-purple-900/30 hover:bg-purple-900/50 border-purple-500/50 text-purple-200',
    red: 'bg-red-900/30 hover:bg-red-900/50 border-red-500/50 text-red-200',
    green: 'bg-green-900/30 hover:bg-green-900/50 border-green-500/50 text-green-200',
    blue: 'bg-blue-900/30 hover:bg-blue-900/50 border-blue-500/50 text-blue-200',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
                relative p-3 rounded-lg border flex flex-col items-start justify-center transition-all
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
