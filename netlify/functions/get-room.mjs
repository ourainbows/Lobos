import { getStore } from "@netlify/blobs";
import { ROLE_DEFS } from "./_shared/roles.mjs";
import { json } from "./_shared/http.mjs";

export default async (req) => {
  const url = new URL(req.url);
  const code = (url.searchParams.get("code") || "").toUpperCase().trim();
  const hostToken = url.searchParams.get("hostToken");
  const playerToken = url.searchParams.get("playerToken");

  if (!code) return json({ error: "Falta el código de sala" }, 400);

  const store = getStore("rooms");
  const room = await store.get(code, { type: "json" });
  if (!room) return json({ error: "No existe ninguna sala con ese código" }, 404);

  const isHost = Boolean(hostToken) && hostToken === room.hostToken;
  const me = playerToken ? room.players.find((p) => p.token === playerToken) : null;

  const players = room.players.map((p) => ({
    id: p.id,
    name: p.name,
    ...(isHost
      ? { role: p.role, roleName: ROLE_DEFS[p.role]?.name, emoji: ROLE_DEFS[p.role]?.emoji }
      : {}),
  }));

  const result = {
    code: room.code,
    status: room.status,
    roles: room.roles,
    playerCount: room.players.length,
    players,
    isHost,
  };

  if (me) {
    result.me = {
      id: me.id,
      name: me.name,
      role: me.role,
      roleInfo: ROLE_DEFS[me.role],
    };
  }

  return json(result);
};

export const config = { path: "/api/get-room" };
