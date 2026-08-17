/// <reference types="@cloudflare/workers-types" />
import {
  MAX_PLAYERS, MULTIPLAYER_RACE_DISTANCE, RECONNECT_GRACE_MS,
  safeParse, sanitizeCharacter, sanitizeSnapshot,
  type CharacterConfig, type ClientMessage, type ServerMessage,
  type NetworkPlayerState, type PlayerSnapshot, type RaceResult, type RaceStatus, type AnimState,
} from "../../shared/protocol";

type Conn = {
  id: string;
  slot: 1 | 2;
  ws: WebSocket;
  char: CharacterConfig;
  connected: boolean;
  snap: PlayerSnapshot;
  finished: boolean;
  reachedLine: boolean;
  finishOrder: number;
  result: RaceResult | null;
  wantsRematch: boolean;
  graceTimer?: ReturnType<typeof setTimeout>;
};

const emptySnap = (): PlayerSnapshot => ({ tick: 0, distance: 0, y: 0, score: 0, coins: 0, lives: 3, maxCombo: 1, animation: "run" });

/** One Durable Object instance == one race room, keyed by its room code. */
export class GameRoom {
  private code = "";
  private seed = 0;
  private location = "nyc";
  private difficulty = "normal";
  private status: RaceStatus = "waiting";
  private players: Conn[] = [];
  private finishCounter = 0;
  private finishTimer?: ReturnType<typeof setTimeout>;
  private countdownTimers: ReturnType<typeof setTimeout>[] = [];

  constructor(_state: DurableObjectState, _env: unknown) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const m = url.pathname.match(/\/room\/([A-Za-z0-9]+)/);
    this.setCode(((m?.[1] || url.searchParams.get("code") || "")).toUpperCase());
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response(JSON.stringify({ status: this.status, players: this.players.length }), {
        headers: { "content-type": "application/json" },
      });
    }
    const resumeId = url.searchParams.get("resume") || "";
    const pair = new WebSocketPair();
    const client = pair[0], server = pair[1];
    server.accept();
    this.attach(server, resumeId);
    return new Response(null, { status: 101, webSocket: client });
  }

  /* ----- connection lifecycle ------------------------------------- */
  private attach(ws: WebSocket, resumeId: string) {
    // Try to resume a dropped slot.
    if (resumeId) {
      const prev = this.players.find(p => p.id === resumeId && !p.connected);
      if (prev) {
        prev.ws = ws; prev.connected = true;
        if (prev.graceTimer) { clearTimeout(prev.graceTimer); prev.graceTimer = undefined; }
        this.wire(ws, prev);
        this.send(ws, this.roomStateMsg());
        this.broadcastExcept(prev.id, { type: "player-reconnected", playerId: prev.id });
        return;
      }
    }
    // Otherwise this socket is unassigned until it sends create/join.
    this.wire(ws, null);
  }

  private wire(ws: WebSocket, conn: Conn | null) {
    ws.addEventListener("message", (ev: MessageEvent) => {
      const msg = safeParse(typeof ev.data === "string" ? ev.data : "");
      if (!msg) return this.send(ws, { type: "error", code: "bad-message", message: "unparseable" });
      const bound = conn ?? this.players.find(p => p.ws === ws) ?? null;
      this.handle(ws, bound, msg);
    });
    ws.addEventListener("close", () => this.onClose(ws));
    ws.addEventListener("error", () => this.onClose(ws));
  }

  private handle(ws: WebSocket, conn: Conn | null, msg: ClientMessage) {
    switch (msg.type) {
      case "ping": return this.send(ws, { type: "pong" });
      case "create": return this.onCreate(ws, msg.player, msg.location, msg.difficulty);
      case "join": return this.onJoin(ws, msg.player);
      case "input":
        if (conn && this.status === "racing" && (msg.action === "jump" || msg.action === "slide"))
          this.broadcastExcept(conn.id, { type: "opponent-input", playerId: conn.id, tick: msg.tick | 0, action: msg.action });
        return;
      case "snapshot": {
        if (!conn) return;
        const snap = sanitizeSnapshot(msg.snap);
        if (!snap) return;
        // never let distance jump backwards wildly (anti-teleport / anti-cheat)
        if (snap.distance + 1 < conn.snap.distance) snap.distance = conn.snap.distance;
        conn.snap = snap;
        this.broadcastExcept(conn.id, { type: "opponent-snapshot", playerId: conn.id, snap });
        return;
      }
      case "finish": return conn && this.onFinish(conn, msg);
      case "rematch": return conn && this.onRematch(conn);
      case "leave": return this.onClose(ws);
    }
  }

  private newConn(ws: WebSocket, slot: 1 | 2, char: CharacterConfig): Conn {
    return {
      id: crypto.randomUUID(), slot, ws, char, connected: true,
      snap: emptySnap(), finished: false, reachedLine: false, finishOrder: 0,
      result: null, wantsRematch: false,
    };
  }

  private onCreate(ws: WebSocket, player: unknown, location: string, difficulty: string) {
    if (this.players.some(p => p.ws === ws)) return;
    if (this.players.length >= 1) return this.send(ws, { type: "error", code: "bad-state", message: "room already exists" });
    this.seed = (crypto.getRandomValues(new Uint32Array(1))[0] >>> 0) || 1;
    this.location = typeof location === "string" ? location.slice(0, 24) : "nyc";
    this.difficulty = typeof difficulty === "string" ? difficulty.slice(0, 24) : "normal";
    this.status = "waiting";
    const conn = this.newConn(ws, 1, sanitizeCharacter(player));
    this.players.push(conn);
    this.send(ws, { type: "created", roomCode: this.code, seed: this.seed, you: this.toNet(conn) });
  }

  private onJoin(ws: WebSocket, player: unknown) {
    if (this.players.some(p => p.ws === ws)) return;
    if (this.players.length === 0) return this.send(ws, { type: "error", code: "not-found", message: "room not found" });
    if (this.players.length >= MAX_PLAYERS) return this.send(ws, { type: "error", code: "full", message: "room is full" });
    const conn = this.newConn(ws, 2, sanitizeCharacter(player));
    this.players.push(conn);
    const host = this.players.find(p => p.slot === 1) || null;
    this.send(ws, {
      type: "joined", roomCode: this.code, seed: this.seed, location: this.location, difficulty: this.difficulty,
      you: this.toNet(conn), opponent: host ? this.toNet(host) : null,
    });
    this.broadcastExcept(conn.id, { type: "player-joined", player: this.toNet(conn) });
    this.maybeStartCountdown();
  }

  /* ----- countdown ------------------------------------------------ */
  private maybeStartCountdown() {
    if (this.status !== "waiting") return;
    if (this.players.filter(p => p.connected).length < MAX_PLAYERS) return;
    this.status = "countdown";
    this.broadcast(this.roomStateMsg());
    let n = 3;
    const tick = () => {
      this.broadcast({ type: "countdown", value: n as 3 | 2 | 1 | 0 });
      if (n === 0) { this.status = "racing"; return; }
      n--;
      this.countdownTimers.push(setTimeout(tick, 1000));
    };
    tick();
  }

  /* ----- finishing ------------------------------------------------ */
  private onFinish(conn: Conn, msg: Extract<ClientMessage, { type: "finish" }>) {
    if (conn.finished) return;
    conn.finished = true;
    conn.finishOrder = ++this.finishCounter;
    conn.reachedLine = msg.distance >= MULTIPLAYER_RACE_DISTANCE && msg.lives > 0;
    conn.result = {
      id: conn.id, slot: conn.slot,
      distance: Math.max(0, Math.min(MULTIPLAYER_RACE_DISTANCE + 200, msg.distance | 0)),
      score: Math.max(0, msg.score | 0), coins: Math.max(0, msg.coins | 0),
      maxCombo: Math.max(1, msg.maxCombo | 0), lives: Math.max(0, msg.lives | 0),
    };
    this.broadcast(this.roomStateMsg()); // opponent sees "friend finished/wiped out"
    if (this.players.every(p => p.finished)) this.finishRace();
    else if (!this.finishTimer) this.finishTimer = setTimeout(() => this.finishRace(), 45000);
  }

  private finishRace() {
    if (this.status === "finished") return;
    this.status = "finished";
    if (this.finishTimer) { clearTimeout(this.finishTimer); this.finishTimer = undefined; }
    const results: RaceResult[] = this.players.map(p => p.result ?? {
      id: p.id, slot: p.slot, distance: p.snap.distance, score: p.snap.score,
      coins: p.snap.coins, maxCombo: p.snap.maxCombo, lives: p.snap.lives,
    });
    const winner = this.computeWinner();
    this.broadcast({ type: "race-finished", winnerId: winner, results });
  }

  private computeWinner(): string {
    const line = this.players.filter(p => p.reachedLine).sort((a, b) => a.finishOrder - b.finishOrder);
    if (line.length) return line[0].id;
    // nobody crossed the line (both wiped): furthest distance wins, slot 1 breaks ties
    const sorted = [...this.players].sort((a, b) => (b.result?.distance ?? b.snap.distance) - (a.result?.distance ?? a.snap.distance) || a.slot - b.slot);
    return sorted[0]?.id ?? "";
  }

  /* ----- rematch -------------------------------------------------- */
  private onRematch(conn: Conn) {
    if (this.status !== "finished") return;
    conn.wantsRematch = true;
    const wanting = this.players.filter(p => p.wantsRematch).map(p => p.id);
    this.broadcast({ type: "rematch-state", wanting });
    if (this.players.length === MAX_PLAYERS && this.players.every(p => p.connected && p.wantsRematch)) {
      this.seed = (crypto.getRandomValues(new Uint32Array(1))[0] >>> 0) || 1;
      this.finishCounter = 0;
      for (const p of this.players) {
        p.finished = false; p.reachedLine = false; p.finishOrder = 0; p.result = null;
        p.wantsRematch = false; p.snap = emptySnap();
      }
      this.status = "waiting";
      this.broadcast({ type: "rematch-start", seed: this.seed });
      this.maybeStartCountdown();
    }
  }

  /* ----- disconnect ----------------------------------------------- */
  private onClose(ws: WebSocket) {
    const conn = this.players.find(p => p.ws === ws);
    if (!conn || !conn.connected) return;
    conn.connected = false;
    if (this.status === "waiting" || this.status === "countdown" || this.status === "finished") {
      // pre-race or post-race: just remove and reset the room to a clean waiting state
      this.players = this.players.filter(p => p !== conn);
      for (const t of this.countdownTimers) clearTimeout(t);
      this.countdownTimers = [];
      if (this.status !== "finished") this.status = "waiting";
      this.broadcastExcept(conn.id, { type: "player-left", playerId: conn.id, temporary: false });
      return;
    }
    // mid-race: allow a short reconnect window, else the opponent wins by default
    this.broadcastExcept(conn.id, { type: "player-left", playerId: conn.id, temporary: true });
    conn.graceTimer = setTimeout(() => {
      if (conn.connected) return;
      this.broadcastExcept(conn.id, { type: "player-left", playerId: conn.id, temporary: false });
      const other = this.players.find(p => p !== conn && p.connected);
      if (other && this.status === "racing") {
        conn.finished = true; conn.reachedLine = false;
        other.reachedLine = true; other.finishOrder = 1; conn.finishOrder = 2;
        this.finishRace();
      }
    }, RECONNECT_GRACE_MS);
  }

  /* ----- helpers -------------------------------------------------- */
  private toNet(c: Conn): NetworkPlayerState {
    return {
      id: c.id, slot: c.slot, character: c.char,
      distance: c.snap.distance, score: c.snap.score, coins: c.snap.coins,
      lives: c.snap.lives, maxCombo: c.snap.maxCombo, y: c.snap.y,
      animation: c.snap.animation as AnimState, connected: c.connected, finished: c.finished,
    };
  }
  private roomStateMsg(): ServerMessage {
    return { type: "room-state", status: this.status, seed: this.seed, location: this.location, difficulty: this.difficulty, players: this.players.map(p => this.toNet(p)) };
  }
  private send(ws: WebSocket, msg: ServerMessage) { try { ws.send(JSON.stringify(msg)); } catch { /* socket gone */ } }
  private broadcast(msg: ServerMessage) { for (const p of this.players) if (p.connected) this.send(p.ws, msg); }
  private broadcastExcept(id: string, msg: ServerMessage) { for (const p of this.players) if (p.connected && p.id !== id) this.send(p.ws, msg); }

  /** Called by the Worker so the room knows its own code. */
  setCode(code: string) { if (!this.code) this.code = code; }
}
