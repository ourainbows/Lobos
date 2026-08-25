import { ROLE_ORDER, isValidCount } from "./_shared/roles.mjs";
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
  const { hostToken, roleCounts } = body;
  if (!code || !hostToken || !roleCounts || typeof roleCounts !== "object") {
    return json({ error: "Faltan datos" }, 400);
  }

  const store = getRoomsStore();
  const room = await store.get(code, { type: "json" });
  if (!room) return json({ error: "No existe ninguna sala con ese código" }, 404);
  if (room.hostToken !== hostToken) return json({ error: "No autorizado" }, 403);

  const nextCounts = { ...room.roleCounts };
  for (const id of ROLE_ORDER) {
    if (id in roleCounts) {
      if (!isValidCount(roleCounts[id])) {
        return json({ error: `Cantidad inválida para ${id}` }, 400);
      }
      nextCounts[id] = roleCounts[id];
    }
  }
  if (Object.values(nextCounts).every((n) => n === 0)) {
    return json({ error: "Debes incluir al menos un personaje" }, 400);
  }

  room.roleCounts = nextCounts;
  await store.setJSON(code, room);

  return json({ roleCounts: room.roleCounts });
};

export const config = { path: "/api/update-roles" };
