import { type ClientMessage, type ServerMessage, RECONNECT_GRACE_MS } from "../../shared/protocol";

type Listener = (msg: ServerMessage) => void;
type StateListener = (s: ConnState) => void;
export type ConnState = "connecting" | "open" | "reconnecting" | "closed";

/** Resolve the realtime base URL (ws/wss). Falls back to localhost in dev. */
export function multiplayerBaseUrl(): string {
  const raw = (import.meta.env.VITE_MULTIPLAYER_URL as string | undefined)?.trim();
  if (raw) return raw.replace(/^http/, "ws").replace(/\/+$/, "");
  // dev default: local `wrangler dev`
  return "ws://localhost:8787";
}

/** True when a race server is reachable: explicitly configured, or local dev. */
export function multiplayerConfigured(): boolean {
  return !!(import.meta.env.VITE_MULTIPLAYER_URL as string | undefined)?.trim() || !!import.meta.env.DEV;
}

/**
 * Thin, typed WebSocket wrapper for one room. Handles a short reconnect
 * window mid-race (using the server's `?resume=` slot recovery).
 */
export class MultiplayerClient {
  readonly code: string;
  playerId = "";
  private base: string;
  private ws?: WebSocket;
  private listeners = new Set<Listener>();
  private stateListeners = new Set<StateListener>();
  private userClosed = false;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private reconnectDeadline = 0;

  constructor(code: string, base = multiplayerBaseUrl()) {
    this.code = code;
    this.base = base;
  }

  connect() {
    this.userClosed = false;
    this.open(false);
  }

  private open(resume: boolean) {
    const q = resume && this.playerId ? `?resume=${encodeURIComponent(this.playerId)}` : "";
    const ws = new WebSocket(`${this.base}/room/${this.code}${q}`);
    this.ws = ws;
    this.emitState(resume ? "reconnecting" : "connecting");
    ws.addEventListener("open", () => { this.reconnectDeadline = 0; this.emitState("open"); });
    ws.addEventListener("message", (e) => {
      let msg: ServerMessage | null = null;
      try { msg = JSON.parse(typeof e.data === "string" ? e.data : ""); } catch { msg = null; }
      if (!msg) return;
      if (msg.type === "created" || msg.type === "joined") this.playerId = msg.you.id;
      for (const l of this.listeners) l(msg);
    });
    ws.addEventListener("close", () => this.onDrop());
    ws.addEventListener("error", () => { try { ws.close(); } catch { /* noop */ } });
  }

  private onDrop() {
    if (this.userClosed) { this.emitState("closed"); return; }
    // Attempt to reconnect within the grace window (server holds our slot).
    const now = Date.now();
    if (this.reconnectDeadline === 0) this.reconnectDeadline = now + RECONNECT_GRACE_MS;
    if (now >= this.reconnectDeadline || !this.playerId) { this.emitState("closed"); return; }
    this.emitState("reconnecting");
    this.reconnectTimer = setTimeout(() => this.open(true), 700);
  }

  send(msg: ClientMessage) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  on(l: Listener): () => void { this.listeners.add(l); return () => this.listeners.delete(l); }
  onState(l: StateListener): () => void { this.stateListeners.add(l); return () => this.stateListeners.delete(l); }
  private emitState(s: ConnState) { for (const l of this.stateListeners) l(s); }

  close() {
    this.userClosed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    try { this.send({ type: "leave" }); } catch { /* noop */ }
    try { this.ws?.close(); } catch { /* noop */ }
  }
}
