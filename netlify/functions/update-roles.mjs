import { ROLE_ORDER } from "./_shared/roles.mjs";
import { json } from "./_shared/http.mjs";
import { getRoomsStore } from "./_shared/store.mjs";

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  const code = String(body.code || "").toUpperCase().trim();
  const { hostToken, roles } = body;
  if (!code || !hostToken || !roles || typeof roles !== "object") {
    return json({ error: "Faltan datos" }, 400);
  }

  const store = getRoomsStore();
  const room = await store.get(code, { type: "json" });
  if (!room) return json({ error: "No existe ninguna sala con ese código" }, 404);
  if (room.hostToken !== hostToken) return json({ error: "No autorizado" }, 403);

  const nextRoles = { ...room.roles };
  for (const id of ROLE_ORDER) {
    if (typeof roles[id] === "boolean") nextRoles[id] = roles[id];
  }
  if (!Object.values(nextRoles).some(Boolean)) {
    return json({ error: "Debes dejar al menos un personaje habilitado" }, 400);
  }

  room.roles = nextRoles;
  await store.setJSON(code, room);

  return json({ roles: room.roles });
};

export const config = { path: "/api/update-roles" };
