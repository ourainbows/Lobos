import { getStore } from "@netlify/blobs";
import { pickRandomRole } from "./_shared/roles.mjs";
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
  const name = String(body.name || "").trim().slice(0, 30);

  if (!code || !name) {
    return json({ error: "Escribe el código de la sala y tu nombre" }, 400);
  }

  const store = getStore("rooms");
  const room = await store.get(code, { type: "json" });
  if (!room) {
    return json({ error: "No existe ninguna sala con ese código" }, 404);
  }
  if (room.status === "closed") {
    return json({ error: "El anfitrión cerró la sala, ya no se aceptan más jugadores" }, 403);
  }
  if (room.players.some((p) => p.name.toLowerCase() === name.toLowerCase())) {
    return json({ error: "Ya hay alguien en la sala con ese nombre, elige otro" }, 409);
  }

  const playerId = crypto.randomUUID();
  const playerToken = crypto.randomUUID();
  const role = pickRandomRole(room.roles);

  room.players.push({
    id: playerId,
    name,
    role,
    token: playerToken,
    joinedAt: Date.now(),
  });

  await store.setJSON(code, room);

  return json({ playerId, playerToken, role, code: room.code });
};

export const config = { path: "/api/join-room" };
