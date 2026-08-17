import { makeRoomCode, isValidRoomCode, normalizeRoomCode } from "../../shared/protocol";

/** Cryptographically-random 5-char room code from the unambiguous alphabet. */
export function generateRoomCode(): string {
  return makeRoomCode((n) => crypto.getRandomValues(new Uint8Array(n)));
}

export { isValidRoomCode, normalizeRoomCode };
