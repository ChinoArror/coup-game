/**
 * STAGE 1: Database Schema & State Definitions
 * 
 * Cloudflare D1 Schema Design (Conceptual):
 * 
 * CREATE TABLE users (
 *   id TEXT PRIMARY KEY,
 *   username TEXT NOT NULL,
 *   created_at INTEGER,
 *   matches_played INTEGER DEFAULT 0,
 *   matches_won INTEGER DEFAULT 0
 * );
 * 
 * CREATE TABLE leaderboard (
 *   user_id TEXT PRIMARY KEY,
 *   score INTEGER DEFAULT 0,
 *   FOREIGN KEY(user_id) REFERENCES users(id)
 * );
 */

export enum CardType {
  DUKE = 'Duke',
  ASSASSIN = 'Assassin',
  CAPTAIN = 'Captain',
  AMBASSADOR = 'Ambassador',
  CONTESSA = 'Contessa',
  UNKNOWN = 'Unknown' // For hidden cards
}

export enum ActionType {
  INCOME = 'Income',         // +1 coin
  FOREIGN_AID = 'Foreign Aid', // +2 coins, blockable by Duke
  COUP = 'Coup',             // -7 coins, unblockable, target loses influence
  TAX = 'Tax',               // +3 coins, claims Duke
  ASSASSINATE = 'Assassinate', // -3 coins, claims Assassin, target loses influence
  STEAL = 'Steal',           // +2 coins from target, claims Captain
  EXCHANGE = 'Exchange',     // Draw 2, keep 2, claims Ambassador
}

export enum GamePhase {
  LOBBY = 'LOBBY',
  TURN_START = 'TURN_START',           // Player chooses action
  ACTION_DECLARED = 'ACTION_DECLARED', // Opportunity to challenge action
  BLOCK_DECLARED = 'BLOCK_DECLARED',   // Opportunity to challenge block
  RESOLVE_ACTION = 'RESOLVE_ACTION',   // Applying action results
  CHALLENGE_LOSS = 'CHALLENGE_LOSS',   // Loser of challenge must pick card to lose
  GAME_OVER = 'GAME_OVER'
}

export interface Card {
  id: string;
  type: CardType;
  isRevealed: boolean;
}

export interface Player {
  id: string;
  name: string;
  isAI: boolean;
  coins: number;
  cards: Card[];
  isEliminated: boolean;
  placement?: number;
}

export interface GameLogEntry {
  id: string;
  text: string;
  type: 'info' | 'alert' | 'success' | 'danger';
  timestamp: number;
}

export interface PendingAction {
  actorId: string;
  action: ActionType;
  targetId?: string; // For Coup, Assassinate, Steal
}

export interface PendingBlock {
  blockerId: string;
  cardClaimed: CardType;
}

export interface GameState {
  roomId: string;
  turn: number;
  currentPlayerIndex: number;
  phase: GamePhase;
  players: Player[];
  deck: CardType[]; // Remaining cards in the deck

  // State Machine Context
  pendingAction: PendingAction | null;
  pendingBlock: PendingBlock | null;

  // Who needs to respond? (Used for UI locking)
  waitingForResponseFrom: string[];

  // Specific context for resolving card loss
  playerToLoseInfluence: string | null;

  logs: GameLogEntry[];
  winner: string | null;
  startedAt: number;
}

// AI Decision Types
export interface AIDecision {
  type: 'ACTION' | 'CHALLENGE' | 'BLOCK' | 'PASS' | 'LOSE_CARD';
  payload?: {
    action?: ActionType;
    targetId?: string;
    cardToLose?: string; // Card ID
    blockCard?: CardType;
  };
  thoughtProcess: string; // The "Thinking" part from Gemini
}
