import { describe, it, expect } from "vitest";
import {
  isValidRoomCode, normalizeRoomCode, sanitizeCharacter, sanitizeSnapshot,
  safeParse, makeRoomCode, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, MULTIPLAYER_RACE_DISTANCE,
} from "../../shared/protocol";

const randBytes = (n: number) => {
  const a = new Uint8Array(n);
  for (let i = 0; i < n; i++) a[i] = (i * 53 + 7) % 256;
  return a;
};

describe("room codes", () => {
  it("makes a 5-char code from the unambiguous alphabet", () => {
    const code = makeRoomCode(randBytes);
    expect(code).toHaveLength(ROOM_CODE_LENGTH);
    for (const ch of code) expect(ROOM_CODE_ALPHABET).toContain(ch);
  });
  it("never contains ambiguous glyphs O/0/I/1", () => {
    for (const bad of ["O", "0", "I", "1"]) expect(ROOM_CODE_ALPHABET).not.toContain(bad);
  });
  it("validates well-formed codes and rejects junk", () => {
    expect(isValidRoomCode("K7X4P")).toBe(true);
    expect(isValidRoomCode("k7x4p")).toBe(false); // lowercase
    expect(isValidRoomCode("K7X4")).toBe(false);  // too short
    expect(isValidRoomCode("K7X4PP")).toBe(false); // too long
    expect(isValidRoomCode("K0X4P")).toBe(false);  // contains 0
    expect(isValidRoomCode(42)).toBe(false);
  });
  it("normalizes user input (uppercase, O→0, trims)", () => {
    expect(normalizeRoomCode(" k7x4p ")).toBe("K7X4P");
    expect(normalizeRoomCode("k-7x4p")).toBe("K7X4P");
  });
});

describe("character sanitization", () => {
  it("clamps out-of-range indices to 0 and defaults gender", () => {
    const c = sanitizeCharacter({ gender: "x", skin: 999, hair: -1, hairColor: 2, outfit: 3 });
    expect(c).toEqual({ gender: "m", skin: 0, hair: 0, hairColor: 2, outfit: 3 });
  });
  it("keeps valid female config", () => {
    const c = sanitizeCharacter({ gender: "f", skin: 4, hair: 2, hairColor: 0, outfit: 5 });
    expect(c).toEqual({ gender: "f", skin: 4, hair: 2, hairColor: 0, outfit: 5 });
  });
});

describe("snapshot sanitization (anti-cheat clamps)", () => {
  it("rejects non-numeric snapshots", () => {
    expect(sanitizeSnapshot({ tick: "x" })).toBeNull();
  });
  it("clamps impossible values", () => {
    const s = sanitizeSnapshot({ tick: 5, distance: 9e12, y: -9999, score: 9e12, coins: 9e9, lives: 99, maxCombo: 9e9, animation: "fly" });
    expect(s).not.toBeNull();
    expect(s!.distance).toBeLessThanOrEqual(MULTIPLAYER_RACE_DISTANCE + 500);
    expect(s!.lives).toBeLessThanOrEqual(9);
    expect(s!.animation).toBe("run"); // unknown anim falls back
  });
});

describe("safeParse", () => {
  it("parses valid messages and rejects malformed", () => {
    expect(safeParse('{"type":"ping"}')).toEqual({ type: "ping" });
    expect(safeParse("not json")).toBeNull();
    expect(safeParse('{"noType":true}')).toBeNull();
  });
});
