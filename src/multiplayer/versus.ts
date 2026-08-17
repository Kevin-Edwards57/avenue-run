import {
  type CharacterConfig, type ClientMessage, type ServerMessage,
  type NetworkPlayerState, type PlayerSnapshot, type RaceResult,
} from "../../shared/protocol";
import { MultiplayerClient, multiplayerConfigured, type ConnState } from "./MultiplayerClient";
import { generateRoomCode, isValidRoomCode, normalizeRoomCode } from "./RoomCode";

/** The controller drives the game through this narrow bridge (no import cycle). */
export interface RunnerBridge {
  getMyChar(): CharacterConfig;
  getSelection(): { difficulty: string; location: string };
  prepareVersus(cfg: {
    seed: number; difficulty: string; location: string;
    myChar: CharacterConfig; oppChar: CharacterConfig;
    send: (m: ClientMessage) => void;
  }): void;
  startVersusRace(): void;
  pushOpponentSnapshot(snap: PlayerSnapshot): void;
  applyOpponentInput(action: "jump" | "slide"): void;
  setOpponentFinished(finished: boolean): void;
  endVersus(): void;
  getFinalStats(): { score: number; coins: number; maxCombo: number; distance: number; lives: number };
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export class VersusController {
  private bridge: RunnerBridge;
  private client?: MultiplayerClient;
  private code = "";
  private seed = 0;
  private location = "nyc";
  private difficulty = "normal";
  private oppChar: CharacterConfig | null = null;
  private prepared = false;
  private finished = false;
  private wantsRematch = false;
  private onHome: () => void;

  constructor(bridge: RunnerBridge, onHome: () => void) {
    this.bridge = bridge;
    this.onHome = onHome;
    this.wireStaticButtons();
  }

  /* ---------- entry points ---------- */
  openMenu() {
    this.hideAllSheets();
    $("menu").hidden = true;
    $("mp").hidden = false;
    $("mpCodeInput").focus?.();
  }

  /** If the page was opened via ?room=CODE, jump straight into joining. */
  checkInviteLink(): boolean {
    const code = new URLSearchParams(location.search).get("room");
    if (!code) return false;
    const norm = normalizeRoomCode(code);
    if (!isValidRoomCode(norm)) { this.showStatus("RACE NOT FOUND", "Bad invite", "This invite link isn't valid.", "BACK TO HOME"); return true; }
    $("menu").hidden = true;
    this.join(norm);
    return true;
  }

  private wireStaticButtons() {
    $("mpBack").onclick = () => this.goHome();
    $("mpCreate").onclick = () => this.create();
    $("mpJoin").onclick = () => {
      const val = normalizeRoomCode(($("mpCodeInput") as HTMLInputElement).value);
      if (!isValidRoomCode(val)) return this.flashInput();
      this.join(val);
    };
    ($("mpCodeInput") as HTMLInputElement).addEventListener("keydown", (e) => { if ((e as KeyboardEvent).key === "Enter") $("mpJoin").click(); });
    $("mpCancel").onclick = () => this.goHome();
    $("mpCopyCode").onclick = () => this.copy(this.code, "COPY CODE");
    $("mpCopyInvite").onclick = () => this.shareInvite();
    $("mpAgain").onclick = () => this.requestRematch();
    $("mpHome").onclick = () => this.goHome();
    $("mpShare").onclick = () => this.shareResult();
    $("mpStatusBtn").onclick = () => this.goHome();
  }

  /* ---------- create / join ---------- */
  private notConfigured(): boolean {
    if (multiplayerConfigured()) return false;
    this.showStatus("COMING SOON", "2-Player almost ready", "This build isn't connected to the race server yet. Single Player works right now — check back for online races.", "BACK TO HOME");
    return true;
  }
  private create() {
    if (this.notConfigured()) return;
    this.code = generateRoomCode();
    this.connect(() => this.client!.send({ type: "create", player: this.bridge.getMyChar(), location: this.location, difficulty: this.difficulty }));
  }

  private join(code: string) {
    if (this.notConfigured()) return;
    this.code = code;
    this.showStatus("JOINING RACE", `ROOM ${code}`, "Connecting…", "CANCEL");
    this.connect(() => this.client!.send({ type: "join", player: this.bridge.getMyChar() }));
  }

  private connect(onOpen: () => void) {
    this.teardownClient();
    this.finished = false; this.prepared = false; this.wantsRematch = false;
    // Host uses the currently-selected difficulty/location; joiner inherits from server.
    const sel = this.bridge.getSelection();
    this.difficulty = sel.difficulty; this.location = sel.location;
    const client = new MultiplayerClient(this.code);
    this.client = client;
    client.on((m) => this.onMessage(m));
    client.onState((s) => this.onConnState(s));
    let opened = false;
    client.onState((s) => { if (s === "open" && !opened) { opened = true; onOpen(); } });
    client.connect();
  }

  private onConnState(s: ConnState) {
    if (s === "reconnecting" && !this.finished) this.showStatus("RECONNECTING…", `ROOM ${this.code}`, "Lost the connection — trying to get you back in.", "LEAVE");
    if (s === "closed" && !this.finished) this.showStatus("CONNECTION LOST", "Disconnected", "Couldn't reach the race server.", "BACK TO HOME");
  }

  /* ---------- server messages ---------- */
  private onMessage(m: ServerMessage) {
    switch (m.type) {
      case "created":
        this.seed = m.seed;
        this.showLobby();
        break;
      case "joined":
        this.seed = m.seed; this.location = m.location; this.difficulty = m.difficulty;
        this.oppChar = m.opponent?.character ?? null;
        this.showLobby(true);
        break;
      case "player-joined":
        this.oppChar = m.player.character;
        this.setFriendPresent(true);
        break;
      case "room-state":
        this.seed = m.seed; this.location = m.location; this.difficulty = m.difficulty;
        this.updateFromPlayers(m.players);
        break;
      case "player-left":
        if (m.temporary) this.showStatus("FRIEND DROPPED", "Reconnecting…", "Waiting for your friend to come back…", "LEAVE");
        else if (!this.finished) this.handleOpponentGone();
        break;
      case "player-reconnected":
        this.hideStatus();
        break;
      case "countdown":
        this.onCountdown(m.value);
        break;
      case "opponent-snapshot":
        this.bridge.pushOpponentSnapshot(m.snap);
        break;
      case "opponent-input":
        this.bridge.applyOpponentInput(m.action);
        break;
      case "race-finished":
        this.showResults(m.winnerId, m.results);
        break;
      case "rematch-state":
        if (m.wanting.length >= 1 && this.wantsRematch) $("mpRematchNote").hidden = m.wanting.length >= 2;
        break;
      case "rematch-start":
        this.seed = m.seed; this.finished = false; this.prepared = false; this.wantsRematch = false;
        $("mpResult").hidden = true; $("mpRematchNote").hidden = true;
        break;
      case "error":
        this.onError(m.code);
        break;
    }
  }

  private onError(code: string) {
    if (code === "full") this.showStatus("RACE FULL", "Room is full", "This race already has two players.", "BACK TO HOME");
    else if (code === "not-found") this.showStatus("RACE NOT FOUND", "No such room", "This invite may have expired.", "BACK TO HOME");
    else if (code === "bad-state") { this.code = generateRoomCode(); this.create(); } // code collision — retry fresh
    else this.showStatus("SOMETHING WENT WRONG", "Error", "Please try again.", "BACK TO HOME");
  }

  private updateFromPlayers(players: NetworkPlayerState[]) {
    const me = this.client?.playerId;
    const opp = players.find((p) => p.id !== me);
    if (opp) this.oppChar = opp.character;
    this.setFriendPresent(players.length >= 2 && !!opp?.connected);
  }

  private handleOpponentGone() {
    this.bridge.endVersus();
    this.showStatus("FRIEND DISCONNECTED", "Race ended", "Your friend left the race.", "BACK TO HOME");
  }

  /* ---------- countdown + race ---------- */
  private onCountdown(value: 3 | 2 | 1 | 0) {
    if (!this.prepared) {
      this.hideAllSheets();
      this.bridge.prepareVersus({
        seed: this.seed, difficulty: this.difficulty, location: this.location,
        myChar: this.bridge.getMyChar(), oppChar: this.oppChar ?? this.bridge.getMyChar(),
        send: (msg) => this.client?.send(msg),
      });
      this.prepared = true;
    }
    const el = $("mpCountdown"), num = $("mpCountNum");
    el.hidden = false;
    el.classList.toggle("go", value === 0);
    num.textContent = value === 0 ? "RUN!" : String(value);
    // restart the pop animation
    num.style.animation = "none"; void num.offsetWidth; num.style.animation = "";
    if (value === 0) {
      this.bridge.startVersusRace();
      window.setTimeout(() => { el.hidden = true; el.classList.remove("go"); }, 650);
    }
  }

  /* ---------- results ---------- */
  private showResults(winnerId: string, results: RaceResult[]) {
    this.finished = true;
    this.bridge.endVersus();
    this.hideStatus();
    $("mpCountdown").hidden = true;
    const meId = this.client?.playerId;
    const mine = results.find((r) => r.id === meId);
    const opp = results.find((r) => r.id !== meId);
    const iWon = winnerId === meId;
    $("mpResultTitle").textContent = iWon ? "🏆 YOU WIN" : "FRIEND WINS";
    const s = mine ?? this.fallbackResult();
    $("mpYouScore").textContent = s.score.toLocaleString();
    $("mpYouCoins").textContent = `${s.coins} COINS`;
    $("mpYouPlace").textContent = iWon ? "1ST PLACE" : "2ND PLACE";
    $("mpOppScore").textContent = (opp?.score ?? 0).toLocaleString();
    $("mpOppCoins").textContent = `${opp?.coins ?? 0} COINS`;
    $("mpOppPlace").textContent = iWon ? "2ND PLACE" : "1ST PLACE";
    ($("mpResultTitle").parentElement!.querySelector(".vs-col.you") as HTMLElement)?.classList.toggle("won", iWon);
    $("mpRematchNote").hidden = true;
    this.hideAllSheets();
    $("mpResult").hidden = false;
  }
  private fallbackResult(): RaceResult {
    const f = this.bridge.getFinalStats();
    return { id: "", slot: 1, distance: f.distance, score: f.score, coins: f.coins, maxCombo: f.maxCombo, lives: f.lives };
  }

  private requestRematch() {
    this.wantsRematch = true;
    $("mpRematchNote").hidden = false;
    this.client?.send({ type: "rematch" });
  }

  /* ---------- lobby ---------- */
  private showLobby(hasOpponent = false) {
    this.hideAllSheets();
    $("mpCode").textContent = this.code;
    $("mpLobby").hidden = false;
    this.setFriendPresent(hasOpponent);
  }
  private setFriendPresent(present: boolean) {
    const dot = $("mpFriendDot");
    dot.classList.toggle("on", present);
    dot.querySelector("span")!.textContent = present ? "●" : "○";
    $("mpLobbyStatus").textContent = present ? "Friend joined — starting…" : "Waiting for player…";
  }

  /* ---------- status overlay ---------- */
  private showStatus(eyebrow: string, title: string, msg: string, btn: string) {
    this.hideAllSheets();
    $("mpStatusEyebrow").textContent = eyebrow;
    $("mpStatusTitle").textContent = title;
    $("mpStatusMsg").textContent = msg;
    $("mpStatusBtn").innerHTML = `${btn} <span>›</span>`;
    $("mpStatus").hidden = false;
  }
  private hideStatus() { $("mpStatus").hidden = true; }

  /* ---------- share / copy ---------- */
  private inviteUrl() { return `${location.origin}${location.pathname}?room=${this.code}`; }
  private async copy(text: string, label: string) {
    try { await navigator.clipboard.writeText(text); this.flashButton("mpCopyCode", "COPIED ✓", label); } catch { /* denied */ }
  }
  private async shareInvite() {
    const url = this.inviteUrl();
    const data = { title: "Avenue Run", text: `Race me on Avenue Run! Room ${this.code}`, url };
    try {
      if (navigator.share) await navigator.share(data);
      else { await navigator.clipboard.writeText(url); this.flashButton("mpCopyInvite", "LINK COPIED ✓", "COPY INVITE"); }
    } catch { /* dismissed */ }
  }
  private async shareResult() {
    const f = this.bridge.getFinalStats();
    const data = { title: "Avenue Run", text: `I raced ${f.score.toLocaleString()} on Avenue Run 2-player!`, url: `${location.origin}${location.pathname}` };
    try { if (navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(data.text + " " + data.url); } } catch { /* dismissed */ }
  }
  private flashButton(id: string, on: string, off: string) {
    const b = $(id); b.textContent = on; window.setTimeout(() => { b.textContent = off; }, 1200);
  }
  private flashInput() {
    const el = $("mpCodeInput"); el.style.borderColor = "#ff5555";
    window.setTimeout(() => { el.style.borderColor = ""; }, 600);
  }

  /** Leave/forfeit the current race and return to the main menu. */
  leaveRace() { this.goHome(); }

  /* ---------- cleanup ---------- */
  private goHome() {
    this.teardownClient();
    this.bridge.endVersus();
    this.hideAllSheets();
    $("mpCountdown").hidden = true;
    // strip ?room= so a refresh doesn't rejoin
    if (new URLSearchParams(location.search).get("room")) history.replaceState({}, "", location.pathname);
    this.onHome();
  }
  private teardownClient() { try { this.client?.close(); } catch { /* noop */ } this.client = undefined; }
  private hideAllSheets() {
    for (const id of ["mp", "mpLobby", "mpResult", "mpStatus"]) $(id).hidden = true;
  }
}
