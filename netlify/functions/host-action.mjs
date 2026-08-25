import { getStore } from "@netlify/blobs";
import { json } from "./_shared/http.mjs";

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  const code = String(body.code || "").toUpperCase().trim();
  const { hostToken, action } = body;
  if (!code || !hostToken || !action) return json({ error: "Faltan datos" }, 400);

  const store = getStore("rooms");
  const room = await store.get(code, { type: "json" });
  if (!room) return json({ error: "No existe ninguna sala con ese código" }, 404);
  if (room.hostToken !== hostToken) return json({ error: "No autorizado" }, 403);

  if (action === "close") {
    room.status = "closed";
  } else if (action === "open") {
    room.status = "open";
  } else if (action === "reset") {
    room.players = [];
    room.status = "open";
  } else if (action === "kick") {
    const playerId = body.playerId;
    room.players = room.players.filter((p) => p.id !== playerId);
  } else {
    return json({ error: "Acción desconocida" }, 400);
  }

  await store.setJSON(code, room);
  return json({ status: room.status });
};

export const config = { path: "/api/host-action" };
