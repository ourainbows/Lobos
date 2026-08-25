import { json } from "./_shared/http.mjs";
import { getRoomsStore } from "./_shared/store.mjs";
import {
  applyDeaths,
  finalizeAfterDeaths,
  freshNightState,
  initGameState,
  resolveDayTarget,
  resolveWolfTarget,
} from "./_shared/game.mjs";

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

  const store = getRoomsStore();
  const room = await store.get(code, { type: "json" });
  if (!room) return json({ error: "No existe ninguna sala con ese código" }, 404);
  if (room.hostToken !== hostToken) return json({ error: "No autorizado" }, 403);

  if (action === "start") {
    if (room.phase !== "lobby") return json({ error: "La partida ya empezó" }, 400);
    if (room.players.length < 3) {
      return json({ error: "Necesitas al menos 3 jugadores para empezar" }, 400);
    }
    if (!room.players.some((p) => p.role === "lobo")) {
      return json({ error: "Necesitas al menos un jugador con el personaje Lobo para empezar" }, 400);
    }
    initGameState(room);
  } else if (action === "resolve-night") {
    if (room.phase !== "night") return json({ error: "No es de noche" }, 400);

    const wolfTarget = resolveWolfTarget(room.night.wolfVotes);
    const initialDeaths = [];
    if (wolfTarget && !room.night.witchSavedThisRound) {
      initialDeaths.push(wolfTarget);
    }
    if (room.night.witchKillTargetId) {
      initialDeaths.push(room.night.witchKillTargetId);
    }
    if (room.night.witchSavedThisRound) room.night.witchUsed.life = true;
    if (room.night.witchKillTargetId) room.night.witchUsed.death = true;

    const deadIds = applyDeaths(room, initialDeaths, "night");
    room.lastNightDeaths = deadIds;

    // Per-round choices are spent; reset them so the next night starts clean
    // (single-use potion flags in witchUsed persist across rounds).
    const usedFlags = room.night.witchUsed;
    const cupidoDone = room.night.cupidoDone;
    room.night = freshNightState();
    room.night.witchUsed = usedFlags;
    room.night.cupidoDone = cupidoDone;

    finalizeAfterDeaths(room, "day", room.round);
  } else if (action === "resolve-day") {
    if (room.phase !== "day") return json({ error: "No es de día" }, 400);

    const target = resolveDayTarget(room.day.votes);
    room.day.votes = {};
    room.lastDayElimination = target;

    if (target) {
      applyDeaths(room, [target], "day");
    }

    finalizeAfterDeaths(room, "night", room.round + 1);
  } else {
    return json({ error: "Acción desconocida" }, 400);
  }

  await store.setJSON(code, room);
  return json({ phase: room.phase, round: room.round, winner: room.winner });
};

export const config = { path: "/api/game-advance" };
