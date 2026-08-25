import { json } from "./_shared/http.mjs";
import { getRoomsStore } from "./_shared/store.mjs";
import { applyDeaths, findPlayer, finalizeAfterDeaths } from "./_shared/game.mjs";

function isAliveOther(room, id, selfId) {
  const p = findPlayer(room, id);
  return Boolean(p && p.alive && p.id !== selfId);
}

export default async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let body;
  try {
    body = await req.json();
  } catch {
    return json({ error: "JSON inválido" }, 400);
  }

  const code = String(body.code || "").toUpperCase().trim();
  const { playerToken, type } = body;
  if (!code || !playerToken || !type) return json({ error: "Faltan datos" }, 400);

  const store = getRoomsStore();
  const room = await store.get(code, { type: "json" });
  if (!room) return json({ error: "No existe ninguna sala con ese código" }, 404);

  const me = room.players.find((p) => p.token === playerToken);
  if (!me) return json({ error: "No autorizado" }, 403);

  let result = {};

  switch (type) {
    case "wolf-vote": {
      if (room.phase !== "night") return json({ error: "No es de noche" }, 400);
      if (me.role !== "lobo" || !me.alive) return json({ error: "No puedes hacer esto" }, 403);
      const { targetId } = body;
      if (!isAliveOther(room, targetId, me.id)) return json({ error: "Objetivo inválido" }, 400);
      if (findPlayer(room, targetId).role === "lobo") {
        return json({ error: "No pueden atacarse entre lobos" }, 400);
      }
      room.night.wolfVotes[me.id] = targetId;
      break;
    }

    case "seer-inspect": {
      if (room.phase !== "night") return json({ error: "No es de noche" }, 400);
      if (me.role !== "vidente" || !me.alive) return json({ error: "No puedes hacer esto" }, 403);
      const existing = room.night.seerResults[me.id];
      if (existing && existing.round === room.round) {
        return json({ error: "Ya investigaste esta noche" }, 400);
      }
      const { targetId } = body;
      const target = findPlayer(room, targetId);
      if (!target || !target.alive) return json({ error: "Objetivo inválido" }, 400);
      room.night.seerResults[me.id] = { round: room.round, targetId, targetRole: target.role };
      result = { targetId, targetRole: target.role };
      break;
    }

    case "witch-save": {
      if (room.phase !== "night") return json({ error: "No es de noche" }, 400);
      if (me.role !== "bruja" || !me.alive) return json({ error: "No puedes hacer esto" }, 403);
      if (room.night.witchUsed.life) return json({ error: "Ya usaste tu poción de vida" }, 400);
      room.night.witchSavedThisRound = true;
      break;
    }

    case "witch-unsave": {
      if (me.role !== "bruja") return json({ error: "No puedes hacer esto" }, 403);
      room.night.witchSavedThisRound = false;
      break;
    }

    case "witch-kill": {
      if (room.phase !== "night") return json({ error: "No es de noche" }, 400);
      if (me.role !== "bruja" || !me.alive) return json({ error: "No puedes hacer esto" }, 403);
      if (room.night.witchUsed.death) return json({ error: "Ya usaste tu poción de muerte" }, 400);
      const { targetId } = body;
      if (!isAliveOther(room, targetId, me.id)) return json({ error: "Objetivo inválido" }, 400);
      room.night.witchKillTargetId = targetId;
      break;
    }

    case "witch-unkill": {
      if (me.role !== "bruja") return json({ error: "No puedes hacer esto" }, 403);
      room.night.witchKillTargetId = null;
      break;
    }

    case "cupid-pair": {
      if (room.phase !== "night" || room.round !== 1) {
        return json({ error: "Cupido solo actúa la primera noche" }, 400);
      }
      if (me.role !== "cupido" || !me.alive) return json({ error: "No puedes hacer esto" }, 403);
      if (room.night.cupidoDone) return json({ error: "Ya elegiste a los enamorados" }, 400);
      const { targetId, targetId2 } = body;
      if (!targetId || !targetId2 || targetId === targetId2) {
        return json({ error: "Elige a dos jugadores distintos" }, 400);
      }
      const t1 = findPlayer(room, targetId);
      const t2 = findPlayer(room, targetId2);
      if (!t1 || !t1.alive || !t2 || !t2.alive) return json({ error: "Objetivo inválido" }, 400);
      t1.loverId = t2.id;
      t2.loverId = t1.id;
      room.night.cupidoDone = true;
      break;
    }

    case "day-vote": {
      if (room.phase !== "day") return json({ error: "No es de día" }, 400);
      if (!me.alive) return json({ error: "Ya fuiste eliminado" }, 403);
      const { targetId } = body;
      const target = findPlayer(room, targetId);
      if (!target || !target.alive) return json({ error: "Objetivo inválido" }, 400);
      room.day.votes[me.id] = targetId;
      break;
    }

    case "cazador-shoot": {
      if (room.phase !== "cazador-wait") return json({ error: "No es tu turno" }, 400);
      if (room.pendingCazadorIds[0] !== me.id) return json({ error: "No es tu turno" }, 403);
      const { targetId } = body;
      const target = findPlayer(room, targetId);
      if (!target || !target.alive || target.id === me.id) {
        return json({ error: "Objetivo inválido" }, 400);
      }
      applyDeaths(room, [targetId], "cazador");
      room.pendingCazadorIds.shift();
      if (room.pendingCazadorIds.length === 0) {
        finalizeAfterDeaths(room, room.afterShotsPhase.phase, room.afterShotsPhase.round);
      }
      break;
    }

    default:
      return json({ error: "Acción desconocida" }, 400);
  }

  await store.setJSON(code, room);
  return json({ ok: true, ...result });
};

export const config = { path: "/api/game-action" };
