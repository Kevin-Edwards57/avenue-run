/* ------------------------------------------------------------------ *
 * Avenue Run — multiplayer wire protocol (shared by client + server).
 * Keep this dependency-free so both Vite and Workers can import it.
 * ------------------------------------------------------------------ */

export const PROTOCOL_VERSION = 1;
export const MAX_PLAYERS = 2;

/** Room-code alphabet with ambiguous glyphs removed (no O/0/I/1). */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 32 chars
export const ROOM_CODE_LENGTH = 5;

/** How far (in game distance units) a versus race runs. Single source of truth. */
export const MULTIPLAYER_RACE_DISTANCE = 6000;

/** Opponent snapshot cadence (client → server → opponent). */
export const SNAPSHOT_HZ = 15;

/** Reconnect grace before a room drops a player for good (ms). */
export const RECONNECT_GRACE_MS = 8000;
/** Idle rooms are reaped after this long with no activity (ms). */
export const ROOM_IDLE_TTL_MS = 10 * 60 * 1000;

/** Bounds for validating an incoming character config (mirrors the game palettes). */
export const CHAR_LIMITS = { skin: 7, hair: 8, hairColor: 9, outfit: 8 } as const;

export type CharacterConfig = {
  gender: "m" | "f";
  skin: number;
  hair: number;
  hairColor: number;
  outfit: number;
};

export type AnimState = "run" | "jump" | "double" | "slide" | "hit" | "dead";

export type RaceStatus = "waiting" | "ready" | "countdown" | "racing" | "finished";

export type NetworkPlayerState = {
  id: string;
  slot: 1 | 2;
  character: CharacterConfig;
  distance: number;
  score: number;
  coins: number;
  lives: number;
  maxCombo: number;
  y: number; // vertical offset (py), for opponent rendering
  animation: AnimState;
  connected: boolean;
  finished: boolean;
};

export type PlayerSnapshot = {
  tick: number;
  distance: number;
  y: number;
  score: number;
  coins: number;
  lives: number;
  maxCombo: number;
  animation: AnimState;
};

export type RaceResult = {
  id: string;
  slot: 1 | 2;
  distance: number;
  score: number;
  coins: number;
  maxCombo: number;
  lives: number;
};

export type ErrorCode = "not-found" | "full" | "bad-code" | "bad-state" | "bad-message";

/* ----- client → server -------------------------------------------- */
export type ClientMessage =
  | { type: "create"; player: CharacterConfig; location: string; difficulty: string }
  | { type: "join"; player: CharacterConfig }
  | { type: "input"; tick: number; action: "jump" | "slide" }
  | { type: "snapshot"; snap: PlayerSnapshot }
  | { type: "finish"; distance: number; score: number; coins: number; maxCombo: number; lives: number }
  | { type: "rematch" }
  | { type: "leave" }
  | { type: "ping" };

/* ----- server → client -------------------------------------------- */
export type ServerMessage =
  | { type: "created"; roomCode: string; seed: number; you: NetworkPlayerState }
  | { type: "joined"; roomCode: string; seed: number; location: string; difficulty: string; you: NetworkPlayerState; opponent: NetworkPlayerState | null }
  | { type: "room-state"; status: RaceStatus; seed: number; location: string; difficulty: string; players: NetworkPlayerState[] }
  | { type: "player-joined"; player: NetworkPlayerState }
  | { type: "player-left"; playerId: string; temporary: boolean }
  | { type: "player-reconnected"; playerId: string }
  | { type: "countdown"; value: 3 | 2 | 1 | 0 }
  | { type: "opponent-input"; playerId: string; tick: number; action: "jump" | "slide" }
  | { type: "opponent-snapshot"; playerId: string; snap: PlayerSnapshot }
  | { type: "race-finished"; winnerId: string; results: RaceResult[] }
  | { type: "rematch-state"; wanting: string[] }
  | { type: "rematch-start"; seed: number }
  | { type: "error"; code: ErrorCode; message: string }
  | { type: "pong" };

/* ----- validation (server trusts nothing) ------------------------- */
export function isValidRoomCode(code: unknown): code is string {
  if (typeof code !== "string" || code.length !== ROOM_CODE_LENGTH) return false;
  for (const ch of code) if (!ROOM_CODE_ALPHABET.includes(ch)) return false;
  return true;
}

export function normalizeRoomCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/O/g, "0").replace(/[^A-Z0-9]/g, "").slice(0, ROOM_CODE_LENGTH);
}

export function sanitizeCharacter(c: unknown): CharacterConfig {
  const o = (c ?? {}) as Record<string, unknown>;
  const idx = (v: unknown, max: number) =>
    Number.isInteger(v) && (v as number) >= 0 && (v as number) < max ? (v as number) : 0;
  return {
    gender: o.gender === "f" ? "f" : "m",
    skin: idx(o.skin, CHAR_LIMITS.skin),
    hair: idx(o.hair, CHAR_LIMITS.hair),
    hairColor: idx(o.hairColor, CHAR_LIMITS.hairColor),
    outfit: idx(o.outfit, CHAR_LIMITS.outfit),
  };
}

const ANIMS: AnimState[] = ["run", "jump", "double", "slide", "hit", "dead"];
export function sanitizeSnapshot(s: unknown): PlayerSnapshot | null {
  const o = (s ?? {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const tick = num(o.tick), distance = num(o.distance), y = num(o.y);
  const score = num(o.score), coins = num(o.coins), lives = num(o.lives), maxCombo = num(o.maxCombo);
  if (tick === null || distance === null || y === null || score === null || coins === null || lives === null || maxCombo === null) return null;
  const anim = ANIMS.includes(o.animation as AnimState) ? (o.animation as AnimState) : "run";
  // clamp to plausible ranges to blunt trivial cheating
  return {
    tick: Math.max(0, Math.floor(tick)),
    distance: Math.min(MULTIPLAYER_RACE_DISTANCE + 500, Math.max(0, distance)),
    y: Math.max(-800, Math.min(60, y)),
    score: Math.max(0, Math.min(10_000_000, Math.floor(score))),
    coins: Math.max(0, Math.min(100_000, Math.floor(coins))),
    lives: Math.max(0, Math.min(9, Math.floor(lives))),
    maxCombo: Math.max(1, Math.min(999, Math.floor(maxCombo))),
    animation: anim,
  };
}

export function safeParse(data: string): ClientMessage | null {
  try {
    const m = JSON.parse(data);
    return m && typeof m.type === "string" ? (m as ClientMessage) : null;
  } catch {
    return null;
  }
}

/** Generate a room code from a random-byte source (crypto in both runtimes). */
export function makeRoomCode(rand: (n: number) => Uint8Array): string {
  const bytes = rand(ROOM_CODE_LENGTH);
  let out = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) out += ROOM_CODE_ALPHABET[bytes[i] % ROOM_CODE_ALPHABET.length];
  return out;
}
