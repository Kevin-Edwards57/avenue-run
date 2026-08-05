import Phaser from "phaser";
import "./style.css";

/* ------------------------------------------------------------------ *
 * Avenue Run — a neon side-scrolling endless runner with a
 * Mario x Subway-Surfers flavor. Jump the barriers, stomp the
 * goombas, grab coins, ride power-ups. Pick your avenue, your
 * difficulty and build your own runner.
 * ------------------------------------------------------------------ */

type Kind = "barrier" | "cone" | "goomba" | "gate" | "coin" | "magnet" | "sneaker" | "board" | "star" | "mushroom" | "jetpack";
type Mover = { x: number; lift: number; w: number; h: number; kind: Kind; scored?: boolean; taken?: boolean; dead?: number; pull?: number; cleared?: boolean };
type Part = { x: number; y: number; vx: number; vy: number; life: number; max: number; col: number; r: number; grav: boolean; world: boolean };
type Char = { gender: "m" | "f"; skin: number; hair: number; hairColor: number; outfit: number };
type Save = { best: number; bank: number; runs: number; difficulty: string; location: string; char: Char };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const OBSTACLES: Kind[] = ["barrier", "cone", "goomba", "gate"];
const PICKUPS: Kind[] = ["magnet", "sneaker", "board", "star", "mushroom", "jetpack"];
const isPickup = (k: Kind) => k === "coin" || PICKUPS.includes(k);
const isObstacle = (k: Kind) => OBSTACLES.includes(k);

/* ----- character options -------------------------------------------- */
const SKINS = [0xffe0bd, 0xf1c27d, 0xe0a973, 0xc68642, 0x9c6a3f, 0x7a4a24, 0x4e2f18];
const HAIR_COLORS = [0x14100c, 0x3a2416, 0x6b3a1a, 0xa9662b, 0xd9a441, 0xe8e8e8, 0xff3f8e, 0x67efff, 0x7b61ff];
const OUTFITS = [0xff3f8e, 0x67efff, 0x7b61ff, 0xffd23f, 0x35c46a, 0xe23b3b, 0xff8a3d, 0xffffff];
const HAIRS = [
  { key: 0, name: "SHORT" }, { key: 1, name: "AFRO" }, { key: 2, name: "BRAIDS" },
  { key: 3, name: "LOCS" }, { key: 4, name: "PONYTAIL" }, { key: 5, name: "BUN" },
  { key: 6, name: "CAP" }, { key: 7, name: "BALD" },
];
const defaultChar = (): Char => ({ gender: "m", skin: 2, hair: 0, hairColor: 0, outfit: 0 });

/* ----- persistence -------------------------------------------------- */
const clampIdx = (v: unknown, len: number, dflt: number) => (Number.isInteger(v) && (v as number) >= 0 && (v as number) < len ? (v as number) : dflt);
const loadSave = (): Save => {
  try {
    const s = JSON.parse(localStorage.getItem("avenue-save") || "{}") as Partial<Save>;
    const c = (s.char || {}) as Partial<Char>;
    return {
      best: Number.isFinite(s.best) ? Math.max(0, s.best!) : 0,
      bank: Number.isFinite(s.bank) ? Math.max(0, s.bank!) : 0,
      runs: Number.isFinite(s.runs) ? Math.max(0, s.runs!) : 0,
      difficulty: s.difficulty || "normal",
      location: s.location || "nyc",
      char: {
        gender: c.gender === "f" ? "f" : "m",
        skin: clampIdx(c.skin, SKINS.length, 2),
        hair: clampIdx(c.hair, HAIRS.length, 0),
        hairColor: clampIdx(c.hairColor, HAIR_COLORS.length, 0),
        outfit: clampIdx(c.outfit, OUTFITS.length, 0),
      },
    };
  } catch { return { best: 0, bank: 0, runs: 0, difficulty: "normal", location: "nyc", char: defaultChar() }; }
};
const save: Save = loadSave();
const persist = () => { try { localStorage.setItem("avenue-save", JSON.stringify(save)); } catch { /* storage may be blocked */ } };

/* ----- difficulty --------------------------------------------------- */
type Diff = { key: string; name: string; note: string; base: number; accel: number; top: number; gap: number; goomba: number };
const DIFFS: Diff[] = [
  { key: "easy",   name: "CHILL",  note: "learn the streets", base: 320, accel: 6,  top: 500, gap: 1550, goomba: 0.2 },
  { key: "normal", name: "AVENUE", note: "the real run",      base: 380, accel: 11, top: 640, gap: 1300, goomba: 0.3 },
  { key: "hard",   name: "RUSH",   note: "no chill",          base: 460, accel: 17, top: 820, gap: 1050, goomba: 0.4 },
  { key: "insane", name: "MAYHEM", note: "good luck",         base: 560, accel: 25, top: 1000, gap: 850, goomba: 0.5 },
];
const diffOf = (k: string) => DIFFS.find(d => d.key === k) || DIFFS[1];

/* ----- locations / themes ------------------------------------------ */
type Theme = {
  key: string; name: string; sub: string; tagline: string;
  skyTop: number; skyBottom: number; sun: number;
  buildings: number[]; windows: number; road: number; roadEdge: number; laneLine: number;
  accent: number; coin: number; palms: boolean; elevated: boolean; ground: number;
};
const THEMES: Theme[] = [
  {
    key: "nyc", name: "NEW YORK CITY", sub: "Times Square · midtown neon",
    tagline: "Dodge the rush. The city never stops.",
    skyTop: 0x0a0824, skyBottom: 0x3a1c5e, sun: 0xff5db1,
    buildings: [0x1a1436, 0x241a44, 0x2e2054, 0x141029], windows: 0x8fe9ff, road: 0x14121f, roadEdge: 0xff3f8e,
    laneLine: 0xffe35a, accent: 0xff3f8e, coin: 0xffe35a, palms: false, elevated: false, ground: 0x0f0d1a,
  },
  {
    key: "jamaica", name: "JAMAICA AVENUE", sub: "Queens · under the J train",
    tagline: "Beat the J train down the Ave.",
    skyTop: 0x141033, skyBottom: 0x6b3b2e, sun: 0xffb454,
    buildings: [0x3a241c, 0x4a2e20, 0x5c3a26, 0x2a1a16], windows: 0xffd98a, road: 0x1c1712, roadEdge: 0xff8a3d,
    laneLine: 0xffe35a, accent: 0xff8a3d, coin: 0xffd23f, palms: false, elevated: true, ground: 0x171009,
  },
  {
    key: "liberty", name: "LIBERTY AVENUE", sub: "Little Guyana · Richmond Hill",
    tagline: "Roti, gold shops and string lights on Liberty.",
    skyTop: 0x241338, skyBottom: 0x8a4a2e, sun: 0xffc24a,
    buildings: [0x4a2a2e, 0x5c3626, 0x6e4230, 0x37211f], windows: 0xffe08a, road: 0x1e1714, roadEdge: 0xffb03a,
    laneLine: 0xffe35a, accent: 0x35c46a, coin: 0xffd23f, palms: true, elevated: false, ground: 0x18130d,
  },
  {
    key: "guyana", name: "GUYANA · EAST BANK", sub: "Demerara · the coast road",
    tagline: "Down the East Bank, past the sea wall.",
    skyTop: 0x0e2a4a, skyBottom: 0x2f9ec4, sun: 0xffe36a,
    buildings: [0x1f6b4a, 0x2a7d54, 0x14563a, 0x8a6a3a], windows: 0xfff2b0, road: 0x2a2418, roadEdge: 0x35c46a,
    laneLine: 0xffe35a, accent: 0xffd23f, coin: 0xffe36a, palms: true, elevated: false, ground: 0x123a1e,
  },
];
const themeOf = (k: string) => THEMES.find(t => t.key === k) || THEMES[0];

/* ----- DOM refs ----------------------------------------------------- */
const menu = $("menu"), result = $("result"), mission = $("mission"), toastEl = $("toast");
const walletEl = document.querySelector(".wallet") as HTMLElement; // lifetime coins — hidden mid-run
let gameScene: Runner | undefined, lastSeed = 0, lastScore = 0;
let soundOn = localStorage.getItem("avenue-sound") !== "off";
let curDiff = diffOf(save.difficulty), curTheme = themeOf(save.location);
const challenge = new URLSearchParams(location.search);
const challengeSeed = Number(challenge.get("seed")) || 0, targetScore = Number(challenge.get("beat")) || 0;
if (challengeSeed) { const b = $("challengeBanner"); b.hidden = false; b.textContent = `FRIEND CHALLENGE · Beat ${targetScore.toLocaleString()} points`; }

const syncMeta = () => {
  $("best").textContent = $("resultBest").textContent = save.best.toLocaleString();
  $("runs").textContent = String(save.runs);
  $("bank").textContent = $("menuBank").textContent = save.bank.toLocaleString();
};
const toast = (t: string) => { toastEl.textContent = t; toastEl.classList.add("show"); window.setTimeout(() => toastEl.classList.remove("show"), 1500); };
syncMeta();

/* ----- audio -------------------------------------------------------- */
class Synth {
  ctx?: AudioContext; timer?: number; step = 0;
  ensure() { this.ctx ||= new AudioContext(); void this.ctx.resume(); return this.ctx; }
  start() { if (!soundOn) return; this.ensure(); this.stop(); this.timer = window.setInterval(() => this.note([110, 165, 220, 165][this.step++ % 4], .02, .12, "triangle"), 300); }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = undefined; }
  note(freq = 440, volume = .05, duration = .09, type: OscillatorType = "triangle") {
    if (!soundOn) return; const c = this.ensure(), o = c.createOscillator(), g = c.createGain(), now = c.currentTime;
    o.type = type; o.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(volume, now); g.gain.exponentialRampToValueAtTime(.0001, now + duration);
    o.connect(g).connect(c.destination); o.start(); o.stop(now + duration);
  }
}

/* ----- physics constants -------------------------------------------- */
const GRAV_UP = 2500;     // rising gravity (floaty pop)
const GRAV_DOWN = 3500;   // falling gravity (snappy landing)
const JUMP_V = -1010;     // px/s launch
const COYOTE = 0.09;      // grace after leaving the ground
const BUFFER = 0.13;      // early-tap forgiveness before landing
const PW = 30, PH = 62;   // player hitbox

/* ================================================================== */
class Runner extends Phaser.Scene {
  gSky!: Phaser.GameObjects.Graphics; gBack!: Phaser.GameObjects.Graphics; gObs!: Phaser.GameObjects.Graphics; gPlayer!: Phaser.GameObjects.Graphics;
  scoreText!: Phaser.GameObjects.Text; comboText!: Phaser.GameObjects.Text; coinText!: Phaser.GameObjects.Text; powText!: Phaser.GameObjects.Text; prompt!: Phaser.GameObjects.Text;

  w = 0; h = 0; ground = 0; px = 0;
  rng = mulberry32(1); seed = 1; theme = curTheme; diff = curDiff; char: Char = save.char;
  running = false; paused = false;
  elapsed = 0; distance = 0; speed = 430; nextObstacle = 0; nextPickup = 0;
  movers: Mover[] = [];

  py = 0; vy = 0; jumps = 0; sliding = 0; footPhase = 0; coyote = 0; buffer = 0;
  dnX = 0; dnY = 0; dnT = 0; land = 0; ambient = 0;
  parts: Part[] = [];
  score = 0; coins = 0; combo = 1; maxCombo = 1; comboClock = 0;
  magnet = 0; sneaker = 0; board = 0; star = 0; invuln = 0; lives = 3; jet = 0; jetCoin = 0;
  synth = new Synth();

  constructor() { super("runner"); gameScene = this; }

  create() {
    this.gSky = this.add.graphics(); this.gBack = this.add.graphics(); this.gObs = this.add.graphics(); this.gPlayer = this.add.graphics();
    this.layout();
    const mk = (x: number, y: number, size: string, color: string, ox = 0.5) =>
      this.add.text(x, y, "", { fontFamily: "system-ui", fontStyle: "bold", fontSize: size, color, stroke: "#0a0716", strokeThickness: 6 }).setOrigin(ox, 0).setDepth(5);
    this.scoreText = mk(this.w / 2, 20, "30px", "#ffffff");
    this.comboText = mk(this.w / 2, 60, "15px", "#ffe35a");
    this.coinText = mk(16, 64, "19px", "#ffe35a", 0); // left, below the header
    this.powText = mk(this.w / 2, this.h - 40, "13px", "#67efff");
    this.prompt = this.add.text(this.w / 2, this.h * 0.46, "", { fontFamily: "system-ui", fontStyle: "bold", fontSize: "17px", color: "#fff", align: "center", stroke: "#0a0716", strokeThickness: 5 }).setOrigin(.5).setDepth(5).setAlpha(0);

    // Mobile: tap = jump, swipe down = slide. Decide on release so a
    // downward swipe never fires a jump first.
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => { this.dnX = p.x; this.dnY = p.y; this.dnT = this.time.now; });
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => {
      if (!this.running) return;
      const dy = p.y - this.dnY, dx = p.x - this.dnX;
      if (dy > 42 && dy > Math.abs(dx)) this.slide();
      else this.jump();
    });
    const kb = this.input.keyboard;
    kb?.on("keydown-SPACE", () => this.jump()); kb?.on("keydown-UP", () => this.jump()); kb?.on("keydown-W", () => this.jump());
    kb?.on("keydown-DOWN", () => this.slide()); kb?.on("keydown-S", () => this.slide());
    kb?.on("keydown-P", () => this.togglePause());
    this.scale.on("resize", () => this.layout());
    this.drawSky();
  }

  layout() {
    this.w = this.scale.width; this.h = this.scale.height;
    this.ground = this.h * 0.8; this.px = Math.max(90, this.w * 0.24);
    if (this.coinText) this.coinText.setX(16);
    if (this.powText) { this.powText.setX(this.w / 2); this.powText.setY(this.h - 40); }
    if (this.scoreText) this.scoreText.setX(this.w / 2);
    if (this.comboText) this.comboText.setX(this.w / 2);
    if (this.prompt) this.prompt.setPosition(this.w / 2, this.h * 0.46);
    this.drawSky();
  }

  start(seed: number) {
    this.theme = curTheme; this.diff = curDiff; this.char = save.char;
    this.seed = seed >>> 0; lastSeed = this.seed; this.rng = mulberry32(this.seed);
    this.movers = []; this.parts = []; this.gObs.clear();
    this.running = true; this.paused = false;
    // gentle warm-up: coins first, obstacles only after a beat so you ease in
    this.elapsed = 0; this.distance = 0; this.speed = this.diff.base; this.nextObstacle = 1600; this.nextPickup = 700; this.ambient = 0;
    this.py = 0; this.vy = 0; this.jumps = 0; this.sliding = 0; this.footPhase = 0; this.coyote = 0; this.buffer = 0; this.land = 0;
    this.score = 0; this.coins = 0; this.combo = 1; this.maxCombo = 1; this.comboClock = 0;
    this.magnet = 0; this.sneaker = 0; this.board = 0; this.star = 0; this.invuln = 0; this.lives = 3; this.jet = 0; this.jetCoin = 0;
    menu.hidden = true; result.hidden = true; mission.hidden = false; walletEl.hidden = true;
    this.drawSky();
    this.prompt.setText("TAP TO JUMP\n↓ / bottom = SLIDE").setAlpha(1);
    this.tweens.killTweensOf(this.prompt);
    this.tweens.add({ targets: this.prompt, alpha: 0, duration: 900, delay: 1400 });
    this.synth.start();
  }

  /* ----- input ------------------------------------------------------ */
  jump() {
    if (!this.running || this.paused) return;
    this.buffer = BUFFER; // consumed in update() with coyote-time + double-jump
  }
  doJump(n: number) {
    this.vy = JUMP_V * (this.sneaker > 0 ? 1.22 : 1) * (n === 2 ? 0.9 : 1);
    this.jumps = n; this.sliding = 0; this.buffer = 0; this.coyote = 0;
    this.synth.note(n === 1 ? 340 : 540, .04, .08);
  }
  slide() {
    if (!this.running || this.paused) return;
    if (this.py < 0) { this.vy = 700; } // fast-fall
    else { this.sliding = 0.55; this.synth.note(180, .04, .08); }
  }
  togglePause() {
    if (!this.running) return;
    this.paused = !this.paused; this.paused ? this.synth.stop() : this.synth.start();
    toast(this.paused ? "PAUSED · P to resume" : "BACK ON THE AVE");
  }

  /* ----- main loop -------------------------------------------------- */
  update(_: number, deltaMs: number) {
    if (!this.running || this.paused) return;
    const dt = Math.min(deltaMs, 42) / 1000;
    this.elapsed += deltaMs;
    this.speed = Math.min(this.diff.top, this.diff.base + this.diff.accel * (this.elapsed / 1000));
    this.distance += this.speed * dt;
    this.footPhase += this.speed * dt * 0.032;

    // timers
    this.comboClock = Math.max(0, this.comboClock - dt); if (!this.comboClock) this.combo = 1;
    this.magnet = Math.max(0, this.magnet - dt); this.sneaker = Math.max(0, this.sneaker - dt);
    this.board = Math.max(0, this.board - dt); this.star = Math.max(0, this.star - dt);
    this.invuln = Math.max(0, this.invuln - dt); this.sliding = Math.max(0, this.sliding - dt);
    this.jet = Math.max(0, this.jet - dt);

    // player vertical physics
    if (this.jet > 0) {
      // JETPACK — blast up to a hover height and fly over everything
      const target = -Math.min(this.h * 0.34, 250);
      this.py += (target - this.py) * Math.min(1, dt * 5);
      this.vy = 0; this.jumps = 0; this.buffer = 0;
      if (this.rng() < 0.7) this.spawnJetFlame();
      // coin trail in the sky to fly through
      this.jetCoin -= dt;
      if (this.jetCoin <= 0) { this.jetCoin = 0.26; this.movers.push({ x: this.w + 40, lift: 250 + (this.rng() * 2 - 1) * 18, w: 30, h: 30, kind: "coin" }); }
    } else {
      // coyote time, jump buffering, asymmetric gravity
      const grounded = this.py >= 0;
      this.coyote = grounded ? COYOTE : Math.max(0, this.coyote - dt);
      this.buffer = Math.max(0, this.buffer - dt);
      if (this.buffer > 0) {
        if (grounded || this.coyote > 0) this.doJump(1);
        else if (this.jumps < 2) this.doJump(2);
      }
      const wasAir = this.py < -1;
      this.vy += (this.vy < 0 ? GRAV_UP : GRAV_DOWN) * dt;
      this.py += this.vy * dt;
      if (this.py >= 0) {
        if (wasAir && this.vy > 320) { this.land = 0.14; this.spawnDust(); }
        this.py = 0; this.vy = 0; this.jumps = 0;
      }
    }
    this.land = Math.max(0, this.land - dt);

    // particles + ambient neon specks drifting across the avenue
    this.ambient -= dt;
    if (this.ambient <= 0) { this.ambient = 0.24 + this.rng() * 0.3; this.spawnAmbient(); }
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.world) p.x -= this.speed * dt;
      if (p.grav) p.vy += 1400 * dt;
      p.life -= dt;
      if (p.life <= 0 || p.x < -40) this.parts.splice(i, 1);
    }

    // spawn
    if (this.elapsed > this.nextObstacle) {
      this.spawnObstacle();
      // keep a floor so obstacles never clump into an impossible wall
      this.nextObstacle += Math.max(620, this.diff.gap - this.speed * 0.25) + this.rng() * 460;
    }
    if (this.elapsed > this.nextPickup) {
      const r = this.rng();
      this.spawn(r > .94 ? "star" : r > .88 ? "jetpack" : r > .82 ? "mushroom" : r > .74 ? "board" : r > .66 ? "magnet" : r > .58 ? "sneaker" : "coin", 40 + this.rng() * 120);
      this.nextPickup += 520 + this.rng() * 640;
    }

    // move + collide
    const pCenterLift = -this.py + PH * 0.5;
    for (let i = this.movers.length - 1; i >= 0; i--) {
      const m = this.movers[i];
      if (m.dead !== undefined) { m.dead -= dt; if (m.dead <= 0) this.movers.splice(i, 1); else m.x -= this.speed * dt; continue; }
      m.x -= this.speed * dt;
      // magnet pull for coins
      if (this.magnet > 0 && m.kind === "coin" && !m.taken && Math.abs(m.x - this.px) < 260) {
        m.x += (this.px - m.x) * dt * 5; m.lift += (pCenterLift - m.lift) * dt * 5;
      }
      const overlapX = Math.abs(m.x - this.px) < m.w / 2 + PW / 2 - 15; // forgive grazes
      if (isObstacle(m.kind)) {
        if (overlapX) this.hitObstacle(m);
        if (!m.scored && !m.dead && m.x < this.px - PW) { m.scored = true; this.combo = Math.min(10, this.combo + 1); this.maxCombo = Math.max(this.maxCombo, this.combo); this.comboClock = 2.6; this.synth.note(360 + this.combo * 28, .02, .06); }
      } else if (isPickup(m.kind) && !m.taken) {
        const near = Math.abs(m.lift - pCenterLift) < 62;
        if (overlapX && (near || (this.magnet > 0 && m.kind === "coin"))) this.collect(m);
      }
      if (m.x < -120) this.movers.splice(i, 1);
    }

    this.score = Math.floor(this.distance / 9) + this.coins * 6;
    this.render();
    this.updateHud();
  }

  hitObstacle(m: Mover) {
    if (m.dead !== undefined || m.cleared) return;
    if (this.jet > 0) return;                                  // flying over it
    if (this.star > 0) { this.stomp(m, "STAR SMASH"); return; }
    const GRACE = 20;                       // px of forgiveness on every edge
    const feet = -this.py;                  // feet height above ground
    const obTop = m.lift + m.h;
    // stomp a Goomba you're dropping onto
    if (m.kind === "goomba" && this.vy > 0 && feet > m.h - 20) { this.stomp(m, "STOMP!"); return; }
    // cleared the top edge → you're over it, run on (no death on the way down)
    if (feet >= obTop - GRACE) { m.cleared = true; return; }
    // ducked/jumped under an overhead gate
    const head = feet + (this.sliding > 0 ? 26 : PH);
    if (head <= m.lift + GRACE) { m.cleared = true; return; }
    this.crash();
  }
  stomp(m: Mover, label: string) {
    m.dead = 0.32; m.scored = true;
    this.combo = Math.min(10, this.combo + 1); this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.comboClock = 2.6; this.coins += 2; this.vy = -720;
    if (this.combo >= 3) toast(`${label} x${this.combo}`);
    this.synth.note(540, .05, .1, "square");
  }
  crash() {
    if (this.invuln > 0 || this.star > 0) return;
    if (this.board > 0) { this.board = 0; this.invuln = 1; this.cameras.main.shake(140, .01); this.synth.note(140, .08, .12); toast("HOVERBOARD SAVED YOU"); return; }
    if (this.lives > 1) { this.lives--; this.invuln = 1.6; this.cameras.main.shake(160, .012); this.synth.note(160, .09, .14); this.spawnBurst(this.px, this.ground - 30, 0xff5555, 14); toast(`OUCH · ${this.lives} ${this.lives === 1 ? "heart" : "hearts"} left`); return; }
    this.spawnBurst(this.px, this.ground - 30, this.theme.accent, 20);
    this.finish();
  }

  /* ----- particles -------------------------------------------------- */
  spawnBurst(x: number, y: number, col: number, n: number) {
    for (let i = 0; i < n; i++) {
      const a = this.rng() * Math.PI * 2, sp = 60 + this.rng() * 260;
      this.parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, life: 0.5 + this.rng() * 0.4, max: 0.9, col, r: 2 + this.rng() * 3, grav: true, world: false });
    }
  }
  spawnDust() {
    for (let i = 0; i < 7; i++) {
      const sp = 40 + this.rng() * 90;
      this.parts.push({ x: this.px - 6 + this.rng() * 12, y: this.ground - 2, vx: -sp - this.rng() * 40, vy: -this.rng() * 90, life: 0.35 + this.rng() * 0.25, max: 0.6, col: 0xcfc6e6, r: 2 + this.rng() * 2.5, grav: true, world: false });
    }
  }
  spawnAmbient() {
    this.parts.push({ x: this.w + 12, y: this.h * (0.1 + this.rng() * 0.55), vx: -20 - this.rng() * 30, vy: (this.rng() - 0.5) * 20, life: 3, max: 3, col: this.theme.accent, r: 1 + this.rng() * 2, grav: false, world: true });
  }
  spawnJetFlame() {
    const fy = this.ground + this.py + 6;
    for (let i = 0; i < 2; i++) {
      const col = this.rng() < 0.5 ? 0xffd23f : 0xff5a2f;
      this.parts.push({ x: this.px - 20 + this.rng() * 8, y: fy, vx: -80 - this.rng() * 120, vy: 60 + this.rng() * 120, life: 0.3 + this.rng() * 0.2, max: 0.5, col, r: 3 + this.rng() * 3, grav: false, world: false });
    }
  }
  drawParts(pen: Pen) {
    for (const p of this.parts) { const a = Math.min(1, p.life / p.max * 1.4); pen.circle(p.x, p.y, p.r, p.col, a); }
  }

  collect(m: Mover) {
    m.taken = true;
    const sx = m.x, sy = this.ground - m.lift;
    this.spawnBurst(sx, sy, m.kind === "coin" ? this.theme.coin : 0xffffff, m.kind === "coin" ? 7 : 16);
    if (m.kind === "coin") { this.coins++; this.comboClock = 2.6; this.synth.note(720 + this.combo * 40, .05, .09, "square"); }
    else if (m.kind === "magnet") { this.magnet = 8; toast("COIN MAGNET · 8s"); this.synth.note(560, .06, .12); }
    else if (m.kind === "sneaker") { this.sneaker = 9; toast("SUPER SNEAKERS · higher jumps"); this.synth.note(600, .06, .12); }
    else if (m.kind === "board") { this.board = 10; toast("HOVERBOARD · takes one hit"); this.synth.note(500, .06, .12); }
    else if (m.kind === "star") { this.star = 7; toast("SUPER STAR · invincible!"); this.synth.note(880, .06, .14, "square"); }
    else if (m.kind === "mushroom") { this.lives++; toast("1-UP · extra life"); this.synth.note(660, .06, .16, "square"); }
    else if (m.kind === "jetpack") { this.jet = 5.5; this.jetCoin = 0; toast("JETPACK · take to the sky!"); this.synth.note(300, .07, .2, "sawtooth"); }
    const i = this.movers.indexOf(m); if (i >= 0) this.movers.splice(i, 1);
  }

  finish() {
    if (!this.running) return;
    this.running = false; this.synth.stop();
    lastScore = this.score + (this.coins >= 10 ? 100 : 0);
    save.runs++; save.bank += this.coins;
    if (lastScore > save.best) { save.best = lastScore; toast("NEW HIGH SCORE!"); }
    persist(); syncMeta();
    $("resultScore").textContent = lastScore.toLocaleString();
    $("resultCoins").textContent = `+${this.coins}`;
    $("resultCombo").textContent = `x${this.maxCombo}`;
    $("resultWhere").textContent = this.theme.name;
    mission.hidden = true; result.hidden = false; walletEl.hidden = false;
    this.cameras.main.shake(230, .015);
  }

  /* ----- spawn ------------------------------------------------------ */
  spawnObstacle() {
    const r = this.rng();
    let kind: Kind;
    if (r < this.diff.goomba) kind = "goomba";
    else if (r < this.diff.goomba + 0.14) kind = "gate";      // slide-under, kept rare
    else if (r < this.diff.goomba + 0.58) kind = "cone";
    else kind = "barrier";
    this.spawn(kind);
  }
  spawn(kind: Kind, lift = 0) {
    const size: Record<Kind, [number, number]> = {
      barrier: [54, 58], cone: [40, 44], goomba: [46, 42], gate: [70, 42],
      coin: [30, 30], magnet: [34, 34], sneaker: [34, 34], board: [34, 34], star: [36, 36], mushroom: [34, 34], jetpack: [34, 34],
    };
    const [w, h] = size[kind];
    if (kind === "gate") lift = 44;              // head-height bar — slide under (or jump over)
    this.movers.push({ x: this.w + 70, lift, w, h, kind });
  }

  /* ----- HUD -------------------------------------------------------- */
  updateHud() {
    this.scoreText.setText(this.score.toLocaleString());
    this.comboText.setText(this.combo > 1 ? `x${this.combo} COMBO ${"◆".repeat(Math.min(this.combo, 6))}` : "");
    this.coinText.setText(`♥ ${this.lives}    ◆ ${this.coins}`);
    const p: string[] = [];
    if (this.jet) p.push(`🚀 JETPACK ${Math.ceil(this.jet)}s`);
    if (this.star) p.push(`★ STAR ${Math.ceil(this.star)}s`);
    if (this.magnet) p.push(`MAGNET ${Math.ceil(this.magnet)}s`);
    if (this.sneaker) p.push(`SNEAKERS ${Math.ceil(this.sneaker)}s`);
    if (this.board) p.push(`BOARD ${Math.ceil(this.board)}s`);
    this.powText.setText(p.join("   "));
    const goal = 500 + Math.min(save.runs, 8) * 125; // stays attainable
    $("missionText").textContent = `Reach ${goal.toLocaleString()} points`;
    $("missionBar").style.width = `${Math.min(100, (this.score / goal) * 100)}%`;
  }

  /* ----- rendering -------------------------------------------------- */
  drawSky() {
    if (!this.gSky) return;
    const g = this.gSky, t = this.theme, w = this.w, h = this.h;
    g.clear();
    g.fillGradientStyle(t.skyTop, t.skyTop, t.skyBottom, t.skyBottom, 1).fillRect(0, 0, w, h);
    const mx = w * 0.78, my = h * 0.15, mr = Math.min(w, h) * 0.055;
    g.fillStyle(t.sun, .16).fillCircle(mx, my, mr * 2.6);
    g.fillStyle(t.sun, .95).fillCircle(mx, my, mr);
    g.fillStyle(shade(t.sun, 0.7), .5).fillCircle(mx + mr * 0.4, my - mr * 0.35, mr * 0.7);
  }

  render() {
    const g = this.gBack; g.clear();
    this.drawSkyline(g); this.drawRoad(g);
    const og = this.gObs; og.clear();
    const pen = phaserPen(og);
    for (const m of this.movers) this.drawMover(og, pen, m);
    this.drawParts(pen);
    this.drawPlayer();
  }

  drawSkyline(g: Phaser.GameObjects.Graphics) {
    const t = this.theme, w = this.w, gy = this.ground;
    // far parallax band (darker, slower, shorter) for depth
    const fscroll = (this.distance * 0.18) % 64;
    const far = shade(t.buildings[0], 0.6);
    for (let x = -64; x < w + 64; x += 64) {
      const seed = Math.floor((x + this.distance * 0.18) / 64);
      const bh = 44 + ((seed * 37) % 120);
      g.fillStyle(far, 1).fillRect(x - fscroll, gy - bh, 56, bh);
    }
    // near band
    const scroll = (this.distance * 0.4) % 96;
    for (let x = -96; x < w + 96; x += 96) {
      const seed = Math.floor((x + this.distance * 0.4) / 96);
      const bh = 70 + ((seed * 53) % 190);
      const col = t.buildings[((seed % t.buildings.length) + t.buildings.length) % t.buildings.length];
      const bx = x - scroll;
      g.fillStyle(col, 1).fillRect(bx, gy - bh, 80, bh);
      g.fillStyle(shade(col, 1.4), .5).fillRect(bx, gy - bh, 6, bh); // edge highlight
      g.fillStyle(t.windows, .5);
      for (let yy = gy - bh + 12; yy < gy - 12; yy += 18)
        for (let xx = bx + 9; xx < bx + 68; xx += 17)
          if (((seed + yy + xx) | 0) % 3) g.fillRect(xx, yy, 8, 9);
    }
    if (t.elevated) this.drawElevated(g);
    if (t.palms) this.drawPalms(g);
    g.fillStyle(t.accent, .12).fillRect(0, gy - 4, w, 8);
  }
  drawElevated(g: Phaser.GameObjects.Graphics) {
    const w = this.w, y = this.ground - 150;
    g.fillStyle(0x2b2b33, 1).fillRect(0, y, w, 22);
    g.fillStyle(0x15151b, 1).fillRect(0, y + 22, w, 6);
    for (let x = 10; x < w; x += 50) g.fillStyle(0x1c1c24, 1).fillRect(x, y + 28, 12, 60);
    const tx = (w * 1.4 - (this.distance * 0.9) % (w * 1.9));
    g.fillStyle(0x9aa6b2, 1).fillRoundedRect(tx, y - 22, 160, 24, 4);
    g.fillStyle(0x2a2f36, 1); for (let i = 0; i < 6; i++) g.fillRect(tx + 12 + i * 26, y - 17, 15, 11);
  }
  drawPalms(g: Phaser.GameObjects.Graphics) {
    const gy = this.ground, span = this.w + 260, gap = 300;
    // scroll with the world so trees pass by instead of tracking the player
    const off = (this.distance * 0.62) % gap;
    for (let k = -1; k * gap - off < span; k++) {
      const bx = k * gap - off + 40, i = ((k % 2) + 2) % 2, hh = 96 + i * 30;
      g.fillStyle(0x1a2a1a, 1).fillRect(bx - 5, gy - hh, 10, hh);
      g.fillStyle(0x2f8f4a, 1);
      for (let a = 0; a < 6; a++) { const ang = -Math.PI / 2 + (a - 2.5) * 0.42; g.fillTriangle(bx, gy - hh, bx + Math.cos(ang) * 44, gy - hh + Math.sin(ang) * 44 - 6, bx + Math.cos(ang) * 50, gy - hh + Math.sin(ang) * 50 + 8); }
      g.fillStyle(0x6b3a1a, 1).fillCircle(bx, gy - hh, 6);
    }
  }
  drawRoad(g: Phaser.GameObjects.Graphics) {
    const t = this.theme, w = this.w, gy = this.ground;
    g.fillStyle(t.ground, 1).fillRect(0, gy, w, this.h - gy);
    g.lineStyle(4, t.roadEdge, .9).lineBetween(0, gy, w, gy);
    const off = (this.distance * 0.9) % 90;
    g.fillStyle(t.laneLine, .5);
    for (let x = -90; x < w + 90; x += 90) g.fillRect(x - off, gy + (this.h - gy) * 0.55, 46, 5);
  }

  drawMover(g: Phaser.GameObjects.Graphics, pen: Pen, m: Mover) {
    const t = this.theme, x = m.x, gy = this.ground, cy = gy - m.lift;
    if (m.dead !== undefined) {
      const a = Math.max(0, m.dead / 0.32);
      pen.ellipse(x, gy - 4, 22 * (2 - a), 6 * a, 0x6b3a1a, a);
      for (let i = 0; i < 4; i++) { const ang = i * 1.6; pen.circle(x + Math.cos(ang) * 24 * (1.3 - a), gy - 26 - (1 - a) * 26 + Math.sin(ang) * 12, 3, 0xffffff, a * 0.8); }
      return;
    }
    if (isPickup(m.kind)) {
      const bob = Math.sin(this.elapsed * 0.006 + m.x * 0.02) * 4, py = cy + bob, r = m.w / 2;
      if (m.kind === "coin") {
        const sq = Math.abs(Math.cos(this.elapsed * 0.005 + m.x * 0.02));
        pen.circle(x, py, r * 1.7, t.coin, 0.22);
        pen.ellipse(x, py, Math.max(2, r * sq), r, shade(t.coin, 0.8), 1);
        pen.ellipse(x, py, Math.max(1, r * 0.55 * sq), r * 0.55, t.coin, 1);
        return;
      }
      if (m.kind === "star") {
        const R = r * 1.25, blink = 0.6 + 0.4 * Math.sin(this.elapsed * 0.012);
        pen.circle(x, py, R * 1.5, 0xffe35a, 0.3 * blink);
        for (let i = 0; i < 5; i++) { const a1 = -Math.PI / 2 + i * (Math.PI * 2 / 5), a2 = a1 + Math.PI * 2 / 5; pen.tri(x, py, x + Math.cos(a1) * R, py + Math.sin(a1) * R, x + Math.cos(a2) * R, py + Math.sin(a2) * R, 0xffd23f, 1); }
        pen.circle(x, py, R * 0.4, 0xffe35a, 1);
        pen.circle(x - R * 0.15, py, 2.4, 0x141018, 1); pen.circle(x + R * 0.15, py, 2.4, 0x141018, 1);
        return;
      }
      if (m.kind === "mushroom") {
        pen.circle(x, py, r * 1.7, 0x35c46a, 0.2);
        pen.ellipse(x, py - 2, r * 1.15, r * 0.9, 0x35c46a, 1);
        pen.circle(x - r * 0.45, py - 5, r * 0.3, 0xffffff, 1); pen.circle(x + r * 0.45, py - 5, r * 0.3, 0xffffff, 1); pen.circle(x, py - 9, r * 0.26, 0xffffff, 1);
        pen.rrect(x - r * 0.5, py + 2, r, r * 0.85, 3, 0xffe9c9, 1);
        pen.circle(x - r * 0.2, py + 7, 1.8, 0x141018, 1); pen.circle(x + r * 0.2, py + 7, 1.8, 0x141018, 1);
        return;
      }
      if (m.kind === "jetpack") {
        pen.circle(x, py, r * 1.9, 0xff8a3d, .28);
        pen.circle(x, py, r * 1.35, 0x0d0a1e, 1);
        g.lineStyle(Math.max(1, 3), 0xff8a3d, 1).strokeCircle(x, py, r * 1.35);
        pen.rrect(x - r * 0.55, py - r * 0.6, r * 0.42, r * 1.1, r * 0.2, 0xff8a3d, 1);
        pen.rrect(x + r * 0.13, py - r * 0.6, r * 0.42, r * 1.1, r * 0.2, 0xff8a3d, 1);
        pen.tri(x - r * 0.2, py + r * 0.5, x + r * 0.25, py + r * 0.5, x + r * 0.02, py + r * 1.15, 0xffd23f, 1);
        return;
      }
      const col = { magnet: 0xff3f8e, sneaker: 0x67efff, board: 0x7b61ff }[m.kind as "magnet" | "sneaker" | "board"];
      pen.circle(x, py, r * 1.9, col, 0.28);
      pen.circle(x, py, r * 1.35, 0x0d0a1e, 1);
      g.lineStyle(3, col, 1).strokeCircle(x, py, r * 1.35);
      g.fillStyle(col, 1);
      if (m.kind === "magnet") { g.lineStyle(7, col).beginPath(); g.arc(x, py + 3, r * 0.7, Math.PI, 0, false); g.strokePath(); g.fillRect(x - r * 0.7 - 2, py + 2, 5, r * 0.7); g.fillRect(x + r * 0.7 - 3, py + 2, 5, r * 0.7); }
      else if (m.kind === "sneaker") { g.fillRoundedRect(x - r, py - 3, r * 2, r * 0.9, 4); g.fillTriangle(x - r, py - 3, x - r, py - r, x - r * 0.2, py - 3); }
      else { g.fillRoundedRect(x - r, py - 2, r * 2, r * 0.7, 4); g.fillStyle(0x67efff, 1).fillRoundedRect(x - r * 0.7, py, r * 1.4, 3, 2); }
      return;
    }
    // ---- obstacles ----
    if (m.kind === "goomba") {
      const wd = m.w, hh = m.h, top = gy - hh, wob = Math.sin(this.elapsed * 0.008 + m.x * 0.02) * 2;
      pen.ellipse(x, gy + 2, wd * 0.55, 6, 0x000000, 0.25);
      pen.ellipse(x, top + hh * 0.42, wd * 0.5, hh * 0.42, 0x8a5a2c, 1);
      pen.ellipse(x, gy - hh * 0.15, wd * 0.42, hh * 0.3, 0xf0c68a, 1);
      pen.circle(x - wd * 0.14, top + hh * 0.42, 4, 0xffffff, 1); pen.circle(x + wd * 0.14, top + hh * 0.42, 4, 0xffffff, 1);
      pen.circle(x - wd * 0.12, top + hh * 0.45, 2, 0x141018, 1); pen.circle(x + wd * 0.16, top + hh * 0.45, 2, 0x141018, 1);
      pen.rect(x - wd * 0.24, top + hh * 0.28, wd * 0.16, 2.5, 0x3a1f0e, 1); pen.rect(x + wd * 0.08, top + hh * 0.28, wd * 0.16, 2.5, 0x3a1f0e, 1);
      pen.rect(x - wd * 0.2 + wob, gy - 5, wd * 0.16, 5, 0x2a160a, 1); pen.rect(x + wd * 0.04 - wob, gy - 5, wd * 0.16, 5, 0x2a160a, 1);
      return;
    }
    if (m.kind === "cone") {
      const wd = m.w, hh = m.h;
      pen.circle(x, gy - hh * 0.3, wd * 0.7, t.accent, 0.16);
      pen.tri(x, gy - hh, x - wd / 2, gy, x + wd / 2, gy, 0xff6c36, 1);
      pen.rect(x - wd * 0.36, gy - hh * 0.5, wd * 0.72, hh * 0.16, 0xffffff, 0.9);
      return;
    }
    if (m.kind === "barrier") {
      const wd = m.w, hh = m.h, top = gy - hh;
      pen.circle(x, gy - hh * 0.4, wd * 0.8, t.accent, 0.16);
      pen.rrect(x - wd / 2, top, wd, hh, 7, 0xe8275f, 1);
      for (let yy = top + 9; yy < gy - 6; yy += 18) pen.rect(x - wd / 2 + 5, yy, wd - 10, 6, 0xffffff, 0.7);
      return;
    }
    // gate — overhead brick bar to slide under
    const gw = m.w, top = gy - m.lift - m.h;
    pen.rrect(x - gw / 2 - 4, top, 8, m.lift + m.h, 2, 0x8a5a2c, 1);
    pen.rrect(x + gw / 2 - 4, top, 8, m.lift + m.h, 2, 0x8a5a2c, 1);
    for (let bx = x - gw / 2; bx < x + gw / 2 - 2; bx += gw / 4) { pen.rrect(bx + 1.5, top, gw / 4 - 3, m.h / 2 - 1.5, 2, 0xd07a3a, 1); pen.rrect(bx + 1.5, top + m.h / 2, gw / 4 - 3, m.h / 2 - 1.5, 2, 0xd07a3a, 1); }
  }

  drawPlayer() {
    const g = this.gPlayer; g.clear();
    if (this.invuln > 0 && Math.floor(this.elapsed * 0.012) % 2 === 0) return;
    const cx = this.px, footY = this.ground + this.py, s = 1, pen = phaserPen(g);
    if (this.board > 0) { g.fillStyle(0x7b61ff, .35).fillEllipse(cx, footY + 14, 70, 16); g.fillStyle(0x7b61ff, .95).fillRoundedRect(cx - 32, footY + 2, 64, 12, 6); g.fillStyle(0x67efff, .9).fillRoundedRect(cx - 26, footY + 4, 52, 4, 2); }
    // jetpack on the back (behind the runner) + thruster glow
    if (this.jet > 0) {
      const packH = 30;
      g.fillStyle(0x3a4152, 1).fillRoundedRect(cx - 26, footY - 52, 13, packH, 4);
      g.fillStyle(0x5a6376, 1).fillRoundedRect(cx - 24, footY - 50, 4, packH - 4, 2);
      const f = 12 + Math.abs(Math.sin(this.elapsed * 0.04)) * 12;
      g.fillStyle(0xff5a2f, .9).fillTriangle(cx - 24, footY - 24, cx - 15, footY - 24, cx - 19.5, footY - 24 + f);
      g.fillStyle(0xffd23f, .95).fillTriangle(cx - 22, footY - 24, cx - 17, footY - 24, cx - 19.5, footY - 24 + f * 0.6);
    }
    if (this.star > 0) {
      const hue = (this.elapsed * 0.0006) % 1;
      const rc = Phaser.Display.Color.HSVToRGB(hue, 0.9, 1) as Phaser.Types.Display.ColorObject;
      g.fillStyle(rc.color, 0.35).fillCircle(cx, footY - 34, 42);
    }
    const bob = (this.py >= 0 && this.sliding <= 0) ? Math.abs(Math.sin(this.footPhase)) * 2 : 0;
    drawCharacter(pen, cx, footY - bob, s, this.char, {
      swing: Math.sin(this.footPhase), roll: this.sliding > 0, airborne: this.py < -2,
      board: this.board > 0, accent: this.theme.accent, bend: this.land / 0.14,
    });
  }
}

/* ----- helpers ------------------------------------------------------ */
function mulberry32(seed: number) { let s = seed >>> 0; return () => { s += 0x6D2B79F5; let v = Math.imul(s ^ (s >>> 15), 1 | s); v ^= v + Math.imul(v ^ (v >>> 7), 61 | v); return ((v ^ (v >>> 14)) >>> 0) / 4294967296; }; }
const hex = (n: number) => "#" + (n >>> 0).toString(16).padStart(6, "0").slice(-6);
const shade = (n: number, f: number) => { const r = Math.min(255, ((n >> 16) & 255) * f), g = Math.min(255, ((n >> 8) & 255) * f), b = Math.min(255, (n & 255) * f); return (r << 16) | (g << 8) | b; };

/* ----- pen abstraction (draws to Phaser OR Canvas2D) ---------------- */
type Pen = {
  circle(x: number, y: number, r: number, c: number, a?: number): void;
  rect(x: number, y: number, w: number, h: number, c: number, a?: number): void;
  rrect(x: number, y: number, w: number, h: number, r: number, c: number, a?: number): void;
  line(x1: number, y1: number, x2: number, y2: number, w: number, c: number, a?: number): void;
  tri(x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, c: number, a?: number): void;
  ellipse(x: number, y: number, rx: number, ry: number, c: number, a?: number): void;
};
function phaserPen(g: Phaser.GameObjects.Graphics): Pen {
  return {
    circle: (x, y, r, c, a = 1) => g.fillStyle(c, a).fillCircle(x, y, Math.max(0.5, r)),
    rect: (x, y, w, h, c, a = 1) => g.fillStyle(c, a).fillRect(x, y, w, h),
    rrect: (x, y, w, h, r, c, a = 1) => g.fillStyle(c, a).fillRoundedRect(x, y, w, h, Math.max(0, Math.min(r, w / 2, h / 2))),
    line: (x1, y1, x2, y2, w, c, a = 1) => g.lineStyle(Math.max(0.5, w), c, a).lineBetween(x1, y1, x2, y2),
    tri: (x1, y1, x2, y2, x3, y3, c, a = 1) => g.fillStyle(c, a).fillTriangle(x1, y1, x2, y2, x3, y3),
    ellipse: (x, y, rx, ry, c, a = 1) => g.fillStyle(c, a).fillEllipse(x, y, rx * 2, ry * 2),
  };
}
function canvasPen(ctx: CanvasRenderingContext2D): Pen {
  const set = (c: number, a: number) => { ctx.globalAlpha = a; ctx.fillStyle = hex(c); };
  return {
    circle: (x, y, r, c, a = 1) => { set(c, a); ctx.beginPath(); ctx.arc(x, y, Math.max(0.5, r), 0, 7); ctx.fill(); },
    rect: (x, y, w, h, c, a = 1) => { set(c, a); ctx.fillRect(x, y, w, h); },
    rrect: (x, y, w, h, r, c, a = 1) => { set(c, a); const rr = Math.max(0, Math.min(r, w / 2, h / 2)); ctx.beginPath(); ctx.roundRect(x, y, w, h, rr); ctx.fill(); },
    line: (x1, y1, x2, y2, w, c, a = 1) => { ctx.globalAlpha = a; ctx.strokeStyle = hex(c); ctx.lineWidth = Math.max(0.5, w); ctx.lineCap = "round"; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); },
    tri: (x1, y1, x2, y2, x3, y3, c, a = 1) => { set(c, a); ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.lineTo(x3, y3); ctx.closePath(); ctx.fill(); },
    ellipse: (x, y, rx, ry, c, a = 1) => { set(c, a); ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 7); ctx.fill(); },
  };
}

type Pose = { swing: number; roll: boolean; airborne: boolean; board: boolean; accent: number; bend?: number };

/* Draw a fully customizable runner. footY = where the feet touch. */
function drawCharacter(pen: Pen, cx: number, footY: number, s: number, ch: Char, pose: Pose) {
  const skin = SKINS[ch.skin], skinDk = shade(skin, 0.82);
  const hairC = HAIR_COLORS[ch.hairColor];
  const shirt = OUTFITS[ch.outfit], shirtDk = shade(shirt, 0.8);
  const pants = 0x232842, sole = 0xf2f2f7;
  const fem = ch.gender === "f";
  const sw = pose.swing;

  pen.ellipse(cx, footY + 3 * s, 22 * s, 6 * s, 0x000000, 0.28);

  if (pose.roll) {
    const ry = footY - 15 * s;
    pen.ellipse(cx, ry, 20 * s, 18 * s, shirt, 1);
    pen.ellipse(cx, ry - 4 * s, 20 * s, 9 * s, shirtDk, 0.5);
    pen.rrect(cx - 24 * s, ry + 6 * s, 22 * s, 11 * s, 5 * s, pants, 1);
    pen.circle(cx + 15 * s, ry + 3 * s, 11 * s, skin, 1);
    drawHair(pen, cx + 15 * s, ry + 3 * s, 11 * s, s, ch, hairC, sw);
    return;
  }

  const bend = pose.bend || 0; // landing squash
  const hipY = footY - (33 - bend * 9) * s, shoulderY = footY - (62 - bend * 14) * s;
  const shoulderW = (fem ? 19 : 24) * s + bend * 3 * s, hipW = (fem ? 20 : 21) * s;
  const headR = 11.5 * s, headCy = shoulderY - 16 * s;
  const legTop = hipY - 2 * s;
  const stride = pose.airborne ? 6 * s : sw * 13 * s;
  const kneeDrop = (pose.airborne ? 14 : 20) * s + bend * 7 * s;

  // legs
  pen.line(cx - 4 * s, legTop, cx - 4 * s - stride, legTop + kneeDrop, 9 * s, pants);
  pen.line(cx - 4 * s - stride, legTop + kneeDrop, cx - 4 * s - stride, footY - (pose.airborne ? 8 * s : 0), 8 * s, pants);
  pen.line(cx + 4 * s, legTop, cx + 4 * s + stride, legTop + kneeDrop, 9 * s, pants);
  pen.line(cx + 4 * s + stride, legTop + kneeDrop, cx + 4 * s + stride, footY - (pose.airborne ? 4 * s : 0), 8 * s, pants);
  pen.rrect(cx - 4 * s - stride - 6 * s, footY - 6 * s - (pose.airborne ? 8 * s : 0), 14 * s, 7 * s, 3 * s, sole);
  pen.rrect(cx + 4 * s + stride - 6 * s, footY - 6 * s - (pose.airborne ? 4 * s : 0), 14 * s, 7 * s, 3 * s, sole);
  pen.line(cx - 4 * s - stride - 4 * s, footY - 4 * s - (pose.airborne ? 8 * s : 0), cx - 4 * s - stride + 6 * s, footY - 4 * s - (pose.airborne ? 8 * s : 0), 2 * s, pose.accent);
  pen.line(cx + 4 * s + stride - 4 * s, footY - 4 * s - (pose.airborne ? 4 * s : 0), cx + 4 * s + stride + 6 * s, footY - 4 * s - (pose.airborne ? 4 * s : 0), 2 * s, pose.accent);

  // torso
  pen.rrect(cx - hipW / 2, hipY - 6 * s, hipW, 10 * s, 3 * s, pants);
  pen.tri(cx - shoulderW / 2, shoulderY, cx + shoulderW / 2, shoulderY, cx + hipW / 2, hipY, shirt);
  pen.tri(cx - shoulderW / 2, shoulderY, cx + hipW / 2, hipY, cx - hipW / 2, hipY, shirt);
  pen.rrect(cx - shoulderW / 2, shoulderY - 3 * s, shoulderW, 12 * s, 4 * s, shirt);
  pen.rect(cx - 1 * s, shoulderY, 2 * s, hipY - shoulderY - 4 * s, shirtDk, 0.6);
  if (fem) { pen.circle(cx - 5 * s, shoulderY + 7 * s, 4 * s, shirtDk, 0.35); pen.circle(cx + 5 * s, shoulderY + 7 * s, 4 * s, shirtDk, 0.35); }

  // arms
  const armSwing = pose.airborne ? -6 * s : -sw * 12 * s;
  pen.line(cx - shoulderW / 2 + 2 * s, shoulderY + 2 * s, cx - shoulderW / 2 - 3 * s + armSwing, shoulderY + 16 * s, 7 * s, shirtDk);
  pen.line(cx - shoulderW / 2 - 3 * s + armSwing, shoulderY + 16 * s, cx - shoulderW / 2 - 5 * s + armSwing * 1.4, shoulderY + 28 * s, 6 * s, skinDk);
  pen.line(cx + shoulderW / 2 - 2 * s, shoulderY + 2 * s, cx + shoulderW / 2 + 3 * s - armSwing, shoulderY + 16 * s, 7 * s, shirt);
  pen.line(cx + shoulderW / 2 + 3 * s - armSwing, shoulderY + 16 * s, cx + shoulderW / 2 + 5 * s - armSwing * 1.4, shoulderY + 28 * s, 6 * s, skin);

  // head
  pen.rect(cx - 3 * s, headCy + headR - 2 * s, 6 * s, 8 * s, skinDk);
  pen.circle(cx, headCy, headR, skin, 1);
  pen.circle(cx - headR * 0.5, headCy + headR * 0.55, headR * 0.35, skin, 0.6);
  pen.circle(cx + headR * 0.45, headCy - headR * 0.1, 1.7 * s, 0x141018, 1);
  pen.circle(cx + headR * 0.05, headCy - headR * 0.1, 1.7 * s, 0x141018, 1);
  pen.rrect(cx + headR * 0.05, headCy + headR * 0.45, headR * 0.55, 1.6 * s, 1 * s, shade(skin, 0.7), 0.8);
  if (fem) pen.circle(cx + headR * 0.95, headCy + headR * 0.4, 1.6 * s, pose.accent, 1);

  drawHair(pen, cx, headCy, headR, s, ch, hairC, sw);
}

function drawHair(pen: Pen, cx: number, cy: number, hr: number, s: number, ch: Char, hairC: number, sw: number) {
  const fem = ch.gender === "f";
  switch (ch.hair) {
    case 7: pen.circle(cx - hr * 0.3, cy - hr * 0.5, hr * 0.3, 0xffffff, 0.12); break; // bald
    case 1: pen.circle(cx, cy - hr * 0.35, hr * 1.5, hairC, 1); pen.circle(cx, cy, hr * 1.05, hairC, 1); break; // afro
    case 2: // braids
      pen.rrect(cx - hr, cy - hr * 1.15, hr * 2, hr * 0.9, hr * 0.4, hairC, 1);
      for (let i = -2; i <= 2; i++) { const bx = cx + i * hr * 0.42; pen.line(bx, cy - hr * 0.4, bx - 1 * s, cy + hr * (fem ? 2.4 : 1.4), 3 * s, hairC); pen.circle(bx - 1 * s, cy + hr * (fem ? 2.4 : 1.4), 2 * s, hairC); }
      break;
    case 3: // locs
      pen.rrect(cx - hr, cy - hr * 1.2, hr * 2, hr, hr * 0.4, hairC, 1);
      for (let i = -2; i <= 2; i++) { const bx = cx + i * hr * 0.5; pen.line(bx, cy - hr * 0.5, bx, cy + hr * (fem ? 2.0 : 1.1), 4.5 * s, hairC); }
      break;
    case 4: // ponytail
      pen.rrect(cx - hr, cy - hr * 1.15, hr * 2, hr, hr * 0.5, hairC, 1);
      { const tx = cx - hr - 4 * s + sw * 4 * s; pen.line(cx - hr * 0.7, cy - hr * 0.6, tx, cy + hr * 0.2, 5 * s, hairC); pen.line(tx, cy + hr * 0.2, tx - 3 * s, cy + hr * 1.6, 6 * s, hairC); pen.circle(tx - 3 * s, cy + hr * 1.6, 4 * s, hairC); }
      break;
    case 5: // bun
      pen.rrect(cx - hr, cy - hr * 1.1, hr * 2, hr, hr * 0.5, hairC, 1);
      pen.circle(cx, cy - hr * 1.5, hr * 0.55, hairC, 1);
      if (fem) { pen.line(cx - hr, cy, cx - hr * 0.9, cy + hr * 1.2, 4 * s, hairC); pen.line(cx + hr, cy, cx + hr * 0.9, cy + hr * 1.2, 4 * s, hairC); }
      break;
    case 6: // cap
      pen.rrect(cx - hr * 1.05, cy - hr * 1.1, hr * 2.1, hr * 1.1, hr * 0.5, hairC, 1);
      pen.rrect(cx + hr * 0.4, cy - hr * 0.45, hr * 1.2, hr * 0.4, hr * 0.2, shade(hairC, 0.85), 1);
      break;
    default: // short
      pen.rrect(cx - hr * 1.02, cy - hr * 1.2, hr * 2.04, hr * 1.15, hr * 0.7, hairC, 1);
      pen.rect(cx - hr, cy - hr * 0.6, hr * 0.5, hr * (fem ? 1.4 : 0.8), hairC, 1);
      pen.rect(cx + hr * 0.5, cy - hr * 0.6, hr * 0.5, hr * (fem ? 1.4 : 0.8), hairC, 1);
      break;
  }
}

/* render a static character into a DOM canvas (menu / customizer) */
function renderCharPreview(canvas: HTMLCanvasElement, ch: Char, accent = 0xff3f8e) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const W = canvas.clientWidth || 120, H = canvas.clientHeight || 170;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext("2d"); if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  const grd = ctx.createRadialGradient(W / 2, H * 0.55, 4, W / 2, H * 0.55, W * 0.6);
  grd.addColorStop(0, hex(accent) + "33"); grd.addColorStop(1, "#00000000");
  ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
  drawCharacter(canvasPen(ctx), W / 2, H * 0.9, Math.min(W, H) / 105, ch, { swing: 0.35, roll: false, airborne: false, board: false, accent });
  ctx.globalAlpha = 1;
}

/* ----- boot --------------------------------------------------------- */
new Phaser.Game({
  type: Phaser.CANVAS, parent: "game",
  backgroundColor: "#0a0716",
  scale: { mode: Phaser.Scale.RESIZE, width: "100%", height: "100%" },
  input: { activePointers: 2, touch: { capture: true } },
  scene: [Runner],
});

/* ----- menu wiring -------------------------------------------------- */
$("play").onclick = () => gameScene?.start(challengeSeed || Math.floor(Math.random() * 1e9));
$("again").onclick = () => gameScene?.start(lastSeed);
$("home").onclick = () => { result.hidden = true; menu.hidden = false; };
$("pause").onclick = () => gameScene?.togglePause();
$("sound").onclick = () => { soundOn = !soundOn; localStorage.setItem("avenue-sound", soundOn ? "on" : "off"); $("sound").textContent = soundOn ? "♫" : "×"; toast(soundOn ? "SOUND ON" : "SOUND OFF"); };
$("share").onclick = async () => {
  const url = new URL(location.href); url.search = `?seed=${lastSeed}&beat=${lastScore}`;
  const data = { title: "Avenue Run", text: `I scored ${lastScore.toLocaleString()} on ${curTheme.name} (${curDiff.name}) in Avenue Run. Beat me!`, url: url.toString() };
  try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(`${data.text} ${data.url}`); toast("CHALLENGE LINK COPIED"); } } catch { /* dismissed */ }
};

// difficulty selector
const diffWrap = $("diffPick");
DIFFS.forEach(d => {
  const b = document.createElement("button");
  b.className = "pick" + (d.key === curDiff.key ? " on" : "");
  b.innerHTML = `<b>${d.name}</b><small>${d.note}</small>`;
  b.onclick = () => { curDiff = d; save.difficulty = d.key; persist(); diffWrap.querySelectorAll(".pick").forEach(e => e.classList.remove("on")); b.classList.add("on"); };
  diffWrap.appendChild(b);
});

// location selector
const locWrap = $("locPick");
const setTagline = () => { $("tagline").textContent = curTheme.tagline; };
THEMES.forEach(t => {
  const b = document.createElement("button");
  b.className = "pick loc" + (t.key === curTheme.key ? " on" : "");
  b.innerHTML = `<b>${t.name}</b><small>${t.sub}</small>`;
  b.onclick = () => { curTheme = t; save.location = t.key; persist(); locWrap.querySelectorAll(".pick").forEach(e => e.classList.remove("on")); b.classList.add("on"); setTagline(); if (gameScene) { gameScene.theme = t; gameScene.drawSky(); } refreshChar(); };
  locWrap.appendChild(b);
});
setTagline();

// character customizer
const customizer = $("customizer");
const previewCanvas = document.createElement("canvas");
$("charPreview").appendChild(previewCanvas);
const menuCharCanvas = document.createElement("canvas");
const charRow = $("charRow");
charRow.appendChild(menuCharCanvas);
const charInfo = document.createElement("div");
charInfo.className = "cinfo"; charRow.appendChild(charInfo);

function refreshChar() {
  const c = save.char;
  renderCharPreview(previewCanvas, c, curTheme.accent);
  renderCharPreview(menuCharCanvas, c, curTheme.accent);
  charInfo.innerHTML = `<b>${c.gender === "f" ? "FEMALE" : "MALE"} RUNNER</b>${HAIRS[c.hair].name} · tap Customize to restyle`;
}
const buildSwatches = (host: HTMLElement, colors: number[], get: () => number, set: (i: number) => void) => {
  host.innerHTML = "";
  colors.forEach((col, i) => {
    const b = document.createElement("button");
    b.className = "swatch" + (get() === i ? " on" : "");
    b.style.background = hex(col);
    b.onclick = () => { set(i); persist(); host.querySelectorAll(".swatch").forEach(e => e.classList.remove("on")); b.classList.add("on"); refreshChar(); };
    host.appendChild(b);
  });
};
const buildPills = (host: HTMLElement, items: { key: number; name: string }[], get: () => number, set: (i: number) => void) => {
  host.innerHTML = "";
  items.forEach(it => {
    const b = document.createElement("button");
    b.className = "pick" + (get() === it.key ? " on" : "");
    b.innerHTML = `<b>${it.name}</b>`;
    b.onclick = () => { set(it.key); persist(); host.querySelectorAll(".pick").forEach(e => e.classList.remove("on")); b.classList.add("on"); refreshChar(); };
    host.appendChild(b);
  });
};
const rebuildCustomizer = () => {
  buildPills($("pickGender"), [{ key: 0, name: "MALE" }, { key: 1, name: "FEMALE" }], () => (save.char.gender === "f" ? 1 : 0), i => { save.char.gender = i === 1 ? "f" : "m"; });
  buildSwatches($("pickSkin"), SKINS, () => save.char.skin, i => { save.char.skin = i; });
  buildPills($("pickHair"), HAIRS, () => save.char.hair, i => { save.char.hair = i; });
  buildSwatches($("pickHairColor"), HAIR_COLORS, () => save.char.hairColor, i => { save.char.hairColor = i; });
  buildSwatches($("pickOutfit"), OUTFITS, () => save.char.outfit, i => { save.char.outfit = i; });
};
$("customize").onclick = () => { rebuildCustomizer(); refreshChar(); menu.hidden = true; customizer.hidden = false; };
$("saveChar").onclick = () => { customizer.hidden = true; menu.hidden = false; refreshChar(); toast("RUNNER SAVED"); };
refreshChar();

/* ----- PWA / lifecycle ---------------------------------------------- */
let installPrompt: (Event & { prompt: () => Promise<void> }) | undefined;
const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent);
const isStandalone = window.matchMedia("(display-mode: standalone)").matches;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installPrompt = e as Event & { prompt: () => Promise<void> }; $("install").hidden = false; });
if (isIos && !isStandalone) { $("install").hidden = false; $("install").textContent = "Add to Home"; }
$("install").onclick = async () => { if (installPrompt) { await installPrompt.prompt(); $("install").hidden = true; } else toast("iPhone: Share → Add to Home Screen"); };
if ("serviceWorker" in navigator && import.meta.env.PROD) window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js"));
document.addEventListener("visibilitychange", () => { if (document.hidden && gameScene?.running && !gameScene.paused) gameScene.togglePause(); });
window.addEventListener("offline", () => toast("OFFLINE · Avenue Run is ready"));
window.addEventListener("online", () => toast("BACK ONLINE"));
