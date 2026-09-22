# COUP: SHADOW PROTOCOL

**Coup: Shadow Protocol** is a fast-paced, psychological deduction and deception web-based board game powered by advanced AI. You are pitted against two AI operatives—**Gemini Alpha** and **Deepseek Beta**—in a tense battle for survival, influence, and wealth. 

Based on the highly acclaimed tabletop game *Coup (The Resistance)*, this digital adaptation uses LLM (Large Language Model) integration to create a truly realistic, deceptive, and unpredictable tabletop experience directly in your browser.

🌐 **Live Deployment**: [coup.aryuki.com](https://coup.aryuki.com)

---

## 🎯 The Objective
You are the head of a powerful family in a dystopian universe, vying for absolute control. Your goal is to **destroy the influence of all other families, forcing them into exile**. 
Only one family will survive.

## 🃏 Game Rules & Roles
Every player starts with **2 Coins** and **2 Influence Cards** (Dealt face down from a shared court deck).
Losing an influence card means turning it face up. If both your cards are revealed, you are **eliminated**.

There are 5 types of Influence Cards. You can **claim to have any card you want** at any time.

1. **Duke (紫 / Taxation)**
   - Action: Take **3 coins** from the bank.
   - Block: Can block someone from taking *Foreign Aid*.
2. **Assassin (红 / Lethal)**
   - Action: Pay **3 coins** to Assassinate (Snipe) another player's influence card.
3. **Captain (绿 / Thievery)**
   - Action: Steal **2 coins** from another player.
   - Block: Can block another Captain from stealing from you.
4. **Ambassador (蓝 / Swapping)**
   - Action: Draw 2 cards from the deck, choose which 2 to keep, and return 2 cards to the deck.
   - Block: Can block a Captain from stealing from you.
5. **Contessa (橙 / Defense)**
   - Block: Can block an Assassination attempt against you.

### Core Standard Actions (No specific card needed)
- **Income (1)**: Take 1 coin from the treasury (Safe, Unblockable).
- **Foreign Aid (2)**: Take 2 coins (Blockable by a Duke).
- **Coup (7)**: Pay 7 coins to forcefully launch a Coup against an opponent, definitively destroying 1 of their cards (Unblockable). *If you have 10+ coins, you MUST Coup.*

## 🗣️ Lying, Challenging & Blocking (The Core Loop)

When any player declares an Action, other players have the chance to intervene:

**1. CHALLENGE (They are lying!)**
If you don't believe an opponent has the Character card they are claiming to use (as an Action or a Block), you can **Challenge** them:
- If they **lied**, the challenge succeeds! They instantly lose 1 influence card, and their action fails.
- If they **told the truth**, they prove it by revealing the card, then drawing a new replacement from the deck. You (the challenger) lose 1 influence card for being wrong!

**2. BLOCK (Counter Measures)**
You can claim to have a defensive character to block an action targeted at you (or Foreign Aid). The original attacker can then choose to **Pass** (accepting the block), or **Challenge** your defensive claim.

---

## 💻 Tech Stack & Architecture
- **Frontend**: React, TypeScript, Vite, TailwindCSS
- **Backend**: Cloudflare Workers (Edge Computing)
- **Database**: Cloudflare D1 (Serverless Relational SQL)
- **AI Models**: Gemini 3.8 Flash (`Model_1=gemini-3.8-flash`), DeepSeek Flash with max thinking (`Model_2=deepseek-flash`), and OpenAI GPT-5.6 Luna with high reasoning (`Model_3=gpt-5.6-luna`).

### 🌟 Key Features
* **Dual AI Personalities**: Two uniquely prompted LLMs fighting against you and each other simultaneously.
* **Persistent Sessions**: Powered by CF D1 + `navigator.sendBeacon`. Start playing on your PC, refresh, or switch to your phone, and the match resumes exactly where you left off.
* **Global Leaderboard**: The system records the placement and survival duration of every user across the site in real-time.
* **Private Match History**: Completed matches retain their event timeline, history-only coin changes, and the Alapha/Beta AI channels used; each saved record can be deleted by its owner.
* **Admin Dashboard**: Real-time management and ban-controls for operant access codes.
* **Authenticated multiplayer rooms**: `/game` hosts separate 3–6 player rooms without changing the original `You + Alapha + Beta` game at `/`. Room AI seats are `I`, `II`, and `III`, each mapped once to existing channels `1`, `2`, and `3`.

### Multiplayer rooms

- Every participant authenticates through Auth Center. Only room members can inspect a lobby, connect its WebSocket, or submit a game action.
- The owner selects up to three distinct AI channels and optional *per-human* step and total clocks. The Worker runs a minimal health check for each selected AI before the room exists; that usage, and all later room-AI usage, is attributed to the owner. Admin owners remain unlimited.
- Invitations are opaque one-use, 24-hour links. D1 stores only a SHA-256 digest, never the plaintext token.
- All human members must be Ready, and all configured seats must be occupied, before the owner can start. The room Durable Object is the sole state writer and sends each socket a viewer-specific projection: other players' unrevealed cards and the court deck are never sent to the browser.
- Clocks continue through refreshes and reconnects. On expiry, the server passes a response, takes Income for a normal turn, Coupes the first live opponent when forced at 10+ coins, or reveals the first available influence when a loss must be chosen.

Run the relevant checks locally with:

```bash
npx vitest run
npx tsc --noEmit
npm run build
```

`wrangler.toml` contains the required `ROOM_GAME` Durable Object binding and migration. Apply the D1 schema before deploying a new environment.

--- 

## 🚀 Run locally

**Prerequisites:** Node.js, Wrangler CLI

1. **Clone & Install Dependencies**
   ```bash
   npm install
   ```
2. **Setup D1 Database (If replicating backend)**
   Initialize a Cloudflare D1 Database and update `wrangler.toml` with your database info.
   ```bash
   npx wrangler d1 create coup-game-db
   ```
3. **Set Secrets**
   ```bash
   npx wrangler secret put PROTOCOL_PASSWORD
   npx wrangler secret put GEMINI_API_KEY
   npx wrangler secret put DEEPSEEK_API_KEY
   npx wrangler secret put OPENAI_API_KEY
   ```
   Configure the channel models through Worker variables: `Model_1` (Gemini), `Model_2` (DeepSeek), and `Model_3` (OpenAI). API keys must never be placed in `wrangler.toml` or the frontend.
4. **Deploy to Cloudflare Network**
   ```bash
   npm run build
   npx wrangler deploy
   ```
