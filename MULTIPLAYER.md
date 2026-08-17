# Avenue Run — 2-Player Multiplayer

Avenue Run has two game modes:

- **Single Player** — the original endless runner. 100% client-side. It never
  touches the network and works even if the multiplayer server is offline.
- **2 Player** — a private online race. Two players run the *same deterministic
  course* and the first to the finish distance wins.

Single-player and multiplayer are cleanly separated: the game only opens a
WebSocket when a player enters 2-Player and creates/joins a room.

## How it works

The frontend stays on Vercel (static). Realtime is a separate **Cloudflare
Worker + Durable Object** service — Vercel's serverless functions can't hold
long-lived WebSockets, but a Durable Object is a perfect fit: **one room == one
Durable Object**, addressed by its room code.

```
Vercel (static PWA)                 Cloudflare Worker
  ┌───────────────┐   WebSocket   ┌────────────────────────┐
  │ Player 1  ────────────────────▶  GameRoom "K7X4P"       │
  │ Player 2  ────────────────────▶  (Durable Object)       │
  └───────────────┘                └────────────────────────┘
```

**Deterministic course.** When Player 1 creates a room the server generates one
`seed` and stores it. Player 2 receives the *same* seed, location and difficulty
on join, so both clients build an identical course. Obstacles are spawned on a
distance-keyed schedule from a dedicated `courseRng` (separate from the cosmetic
particle RNG) so the two clients never diverge regardless of frame timing.

**What crosses the wire.** Never the world — both clients already know it from
the seed. Only: room state, ~15 Hz player snapshots (distance/y/score/coins/
lives/combo/animation), input events, finish, rematch, disconnects. The opponent
is rendered from interpolated snapshots (via the existing procedural character
renderer) and never collides with the local player — each player has their own
coins, hearts and power-ups.

**Server-authoritative** for the things that matter: membership (max 2), the
seed, the countdown, the winner, rematch, and disconnect handling. Incoming
messages are validated and clamped (room codes, character indices, snapshot
ranges) so a client can't just declare `score: 999999999`.

Key files:

| File | Role |
| --- | --- |
| `shared/protocol.ts` | Typed messages + validators + constants (shared by client & server) |
| `multiplayer-server/src/GameRoom.ts` | The Durable Object: one race room |
| `multiplayer-server/src/index.ts` | Worker that routes `/room/:code` → its Durable Object |
| `src/multiplayer/MultiplayerClient.ts` | Typed WebSocket wrapper + reconnect |
| `src/multiplayer/OpponentInterpolator.ts` | Smooths opponent snapshots |
| `src/multiplayer/versus.ts` | Lobby / countdown / results / rematch UI + flow |
| `src/multiplayer/RoomCode.ts` | 5-char unambiguous room codes |
| `src/main.ts` (`prepareVersus`…) | In-scene versus race, opponent rendering, versus HUD |

## Local development

Two terminals:

```bash
# 1) realtime server (Durable Objects run locally via Miniflare — no Cloudflare account needed)
npm run multiplayer:dev        # → ws://localhost:8787

# 2) the game
npm run dev                    # → http://localhost:5173
```

The client defaults to `ws://localhost:8787` when `VITE_MULTIPLAYER_URL` is unset.

Then open **two browser windows**:

- Window A → **2 PLAYER → CREATE RACE** → note the room code.
- Window B → **2 PLAYER**, type the code → **JOIN** (or open the copied invite link).

Both should see the countdown and race. (Two tabs in the *same* browser window
won't both animate — background tabs throttle their game loop — so use two
separate windows, or two devices.)

## Production deployment

The frontend deploys to Vercel as usual. Deploy the realtime service to
Cloudflare separately:

```bash
cd multiplayer-server
npx wrangler login          # one-time, uses your Cloudflare account
npm run deploy              # wrangler deploy  → https://avenue-run-mp.<subdomain>.workers.dev
```

Then point the frontend at it and redeploy:

```bash
# in the Vercel project (or a local .env for testing):
VITE_MULTIPLAYER_URL=wss://avenue-run-mp.<subdomain>.workers.dev
npx vercel --prod --yes
```

`.env.example` documents the variable. Single-player is unaffected whether or not
this is set.

## Testing

```bash
npm run multiplayer:test           # unit: room codes, validators, sanitizers (vitest)

# integration (two live clients through the local server):
npm run multiplayer:dev            # in one terminal
node multiplayer-server/test/integration.mjs   # in another
```

The integration test covers: create + join, seed sync, countdown, snapshot
relay, third-player rejection, finish/winner ordering, and rematch (new seed).

## Protocol summary

Client → server: `create` · `join` · `input` · `snapshot` · `finish` ·
`rematch` · `leave` · `ping`.

Server → client: `created` · `joined` · `room-state` · `player-joined` ·
`player-left` · `player-reconnected` · `countdown` · `opponent-input` ·
`opponent-snapshot` · `race-finished` · `rematch-state` · `rematch-start` ·
`error` · `pong`.

See `shared/protocol.ts` for the exact shapes.
