// End-to-end room flow against a running `wrangler dev` (ws://localhost:8787).
// Uses Node's global WebSocket. Run: node test/integration.mjs
const BASE = process.env.MP_URL || "ws://localhost:8787";
const CODE = "K7X4P";
let failures = 0;
const ok = (c, m) => { if (!c) { failures++; console.error("  ✗ " + m); } else console.log("  ✓ " + m); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function connect(resume) {
  const url = `${BASE}/room/${CODE}` + (resume ? `?resume=${resume}` : "");
  const ws = new WebSocket(url);
  ws.inbox = [];
  ws.addEventListener("message", (e) => ws.inbox.push(JSON.parse(e.data)));
  return new Promise((res, rej) => {
    ws.addEventListener("open", () => res(ws));
    ws.addEventListener("error", () => rej(new Error("ws error " + url)));
  });
}
const send = (ws, m) => ws.send(JSON.stringify(m));
async function waitFor(ws, type, ms = 4000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const i = ws.inbox.findIndex((m) => m.type === type);
    if (i >= 0) return ws.inbox.splice(i, 1)[0];
    await sleep(20);
  }
  throw new Error("timeout waiting for " + type);
}
const char = (outfit) => ({ gender: "m", skin: 2, hair: 0, hairColor: 0, outfit });

async function main() {
  console.log("Room create + join + seed sync");
  const a = await connect();
  send(a, { type: "create", player: char(0), location: "nyc", difficulty: "normal" });
  const created = await waitFor(a, "created");
  ok(created.roomCode === CODE, "host gets room code");
  ok(typeof created.seed === "number" && created.seed > 0, "host gets a seed");

  const b = await connect();
  send(b, { type: "join", player: char(1) });
  const joined = await waitFor(b, "joined");
  ok(joined.seed === created.seed, "joiner gets the SAME seed (deterministic course)");
  ok(joined.location === "nyc" && joined.difficulty === "normal", "joiner inherits location + difficulty");
  await waitFor(a, "player-joined");
  ok(true, "host is told a player joined");

  console.log("Countdown");
  const c3 = await waitFor(a, "countdown");
  ok(c3.value === 3, "countdown starts at 3");
  const seq = [c3.value];
  for (let i = 0; i < 3; i++) seq.push((await waitFor(a, "countdown")).value);
  ok(JSON.stringify(seq) === JSON.stringify([3, 2, 1, 0]), "countdown runs 3→0");

  console.log("Snapshot relay");
  send(a, { type: "snapshot", snap: { tick: 1, distance: 500, y: -120, score: 200, coins: 5, lives: 3, maxCombo: 3, animation: "jump" } });
  const oppSnap = await waitFor(b, "opponent-snapshot");
  ok(oppSnap.snap.distance === 500 && oppSnap.playerId === created.you.id, "opponent receives snapshot");

  console.log("Third player rejected");
  const c = await connect();
  send(c, { type: "join", player: char(2) });
  const full = await waitFor(c, "error");
  ok(full.code === "full", "third joiner rejected as room-full");
  c.close();

  console.log("Finish + winner");
  send(a, { type: "finish", distance: 6000, score: 18000, coins: 80, maxCombo: 12, lives: 2 });
  await sleep(50);
  send(b, { type: "finish", distance: 6000, score: 16000, coins: 70, maxCombo: 9, lives: 1 });
  const fin = await waitFor(a, "race-finished");
  ok(fin.winnerId === created.you.id, "first to the line wins");
  ok(fin.results.length === 2, "results include both players");

  console.log("Rematch → new seed");
  send(a, { type: "rematch" });
  send(b, { type: "rematch" });
  const rematch = await waitFor(a, "rematch-start");
  ok(typeof rematch.seed === "number" && rematch.seed !== created.seed, "rematch generates a new seed");
  const rc = await waitFor(a, "countdown");
  ok(rc.value === 3, "rematch re-runs the countdown");

  a.close(); b.close();
  console.log(failures ? `\nFAILED (${failures})` : "\nALL INTEGRATION TESTS PASSED");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => { console.error("FATAL", e.message); process.exit(1); });
