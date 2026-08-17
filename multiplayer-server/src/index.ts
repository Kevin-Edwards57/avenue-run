/// <reference types="@cloudflare/workers-types" />
import { GameRoom } from "./GameRoom";
import { isValidRoomCode } from "../../shared/protocol";

export { GameRoom };

export interface Env {
  GAME_ROOM: DurableObjectNamespace;
}

const CORS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,OPTIONS",
  "access-control-allow-headers": "*",
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") return new Response(null, { headers: CORS });

    if (url.pathname === "/" || url.pathname === "/health") {
      return new Response(JSON.stringify({ ok: true, service: "avenue-run-mp" }), {
        headers: { "content-type": "application/json", ...CORS },
      });
    }

    const match = url.pathname.match(/^\/room\/([^/]+)$/);
    if (match) {
      const code = decodeURIComponent(match[1]).toUpperCase();
      if (!isValidRoomCode(code)) {
        return new Response(JSON.stringify({ error: "bad-code" }), { status: 400, headers: { "content-type": "application/json", ...CORS } });
      }
      // Route every socket for a code to the one Durable Object that owns that room.
      const id = env.GAME_ROOM.idFromName(code);
      return env.GAME_ROOM.get(id).fetch(request);
    }

    return new Response("not found", { status: 404, headers: CORS });
  },
};
