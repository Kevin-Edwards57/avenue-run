import { type PlayerSnapshot, type AnimState, SNAPSHOT_HZ } from "../../shared/protocol";

type Stamped = { at: number; snap: PlayerSnapshot };

export type OpponentView = {
  distance: number;
  y: number;
  animation: AnimState;
  score: number;
  coins: number;
  lives: number;
  maxCombo: number;
};

/**
 * Buffers opponent snapshots and plays them back slightly delayed, so the
 * remote runner moves smoothly (interpolated) instead of teleporting between
 * ~15 Hz network updates.
 */
export class OpponentInterpolator {
  private buf: Stamped[] = [];
  private readonly delayMs = (1000 / SNAPSHOT_HZ) * 2; // render ~2 frames behind

  push(snap: PlayerSnapshot) {
    // ignore out-of-order/older ticks
    const last = this.buf[this.buf.length - 1];
    if (last && snap.tick < last.snap.tick) return;
    this.buf.push({ at: performance.now(), snap });
    if (this.buf.length > 12) this.buf.shift();
  }

  /** Interpolated opponent state for the current frame (null until data arrives). */
  sample(now = performance.now()): OpponentView | null {
    if (this.buf.length === 0) return null;
    if (this.buf.length === 1) return this.view(this.buf[0].snap, this.buf[0].snap, 0);
    const target = now - this.delayMs;
    // find the pair straddling `target`
    for (let i = this.buf.length - 1; i > 0; i--) {
      const a = this.buf[i - 1], b = this.buf[i];
      if (a.at <= target && target <= b.at) {
        const span = b.at - a.at || 1;
        return this.view(a.snap, b.snap, Math.max(0, Math.min(1, (target - a.at) / span)));
      }
    }
    // target beyond newest → extrapolate mildly from the last two
    const a = this.buf[this.buf.length - 2], b = this.buf[this.buf.length - 1];
    const span = b.at - a.at || 1;
    return this.view(a.snap, b.snap, Math.min(1.4, (target - a.at) / span));
  }

  private view(a: PlayerSnapshot, b: PlayerSnapshot, t: number): OpponentView {
    const lerp = (x: number, y: number) => x + (y - x) * t;
    return {
      distance: lerp(a.distance, b.distance),
      y: lerp(a.y, b.y),
      animation: b.animation,
      score: b.score, coins: b.coins, lives: b.lives, maxCombo: b.maxCombo,
    };
  }
}
