import { ROLE_DEFS, remainingCounts } from "./_shared/roles.mjs";
import { json } from "./_shared/http.mjs";
import { getRoomsStore } from "./_shared/store.mjs";

function nameOf(room, id) {
  const p = room.players.find((pl) => pl.id === id);
  return p ? p.name : null;
}

function revealFor(id, room) {
  const p = room.players.find((pl) => pl.id === id);
  if (!p) return { id, name: "?" };
  return { id, name: p.name, role: p.role, roleName: ROLE_DEFS[p.role]?.name, emoji: ROLE_DEFS[p.role]?.emoji };
}

function computeNightStatus(room) {
  const alive = room.players.filter((p) => p.alive);
  const wolves = alive.filter((p) => p.role === "lobo");
  const seers = alive.filter((p) => p.role === "vidente");
  const cupidos = alive.filter((p) => p.role === "cupido");
  return {
    wolves: { acted: Object.keys(room.night.wolfVotes).length, total: wolves.length },
    seers: {
      acted: seers.filter((s) => room.night.seerResults[s.id]?.round === room.round).length,
      total: seers.length,
    },
    cupidos: room.round === 1 ? { acted: room.night.cupidoDone ? 1 : 0, total: cupidos.length > 0 ? 1 : 0 } : null,
  };
}

function buildHostNightView(room) {
  const wolfVotes = Object.entries(room.night.wolfVotes).map(([wolfId, targetId]) => ({
    wolfName: nameOf(room, wolfId),
    targetName: nameOf(room, targetId),
  }));
  const seerResults = Object.entries(room.night.seerResults)
    .filter(([, r]) => r.round === room.round)
    .map(([seerId, r]) => ({
      seerName: nameOf(room, seerId),
      targetName: nameOf(room, r.targetId),
      targetRole: ROLE_DEFS[r.targetRole]?.name,
    }));
  const lovers = [];
  const seenLovers = new Set();
  room.players.forEach((p) => {
    if (p.loverId && !seenLovers.has(p.id)) {
      seenLovers.add(p.id);
      seenLovers.add(p.loverId);
      lovers.push({ a: p.name, b: nameOf(room, p.loverId) });
    }
  });
  return {
    wolfVotes,
    seerResults,
    witchUsed: room.night.witchUsed,
    witchSavedThisRound: room.night.witchSavedThisRound,
    witchKillTargetName: room.night.witchKillTargetId ? nameOf(room, room.night.witchKillTargetId) : null,
    cupidoDone: room.night.cupidoDone,
    lovers,
  };
}

function buildMeNightView(room, me) {
  const alive = room.players.filter((p) => p.alive);
  const view = {};

  if (!me.alive || room.phase !== "night") return view;

  if (me.role === "lobo") {
    const packMates = alive.filter((p) => p.role === "lobo" && p.id !== me.id).map((p) => p.name);
    const targets = alive.filter((p) => p.role !== "lobo").map((p) => ({ id: p.id, name: p.name }));
    const tally = {};
    Object.values(room.night.wolfVotes).forEach((t) => (tally[t] = (tally[t] || 0) + 1));
    view.wolf = {
      packMates,
      targets,
      myVote: room.night.wolfVotes[me.id] || null,
      tally: Object.entries(tally).map(([targetId, count]) => ({ targetId, name: nameOf(room, targetId), count })),
    };
  }

  if (me.role === "vidente") {
    const targets = alive.filter((p) => p.id !== me.id).map((p) => ({ id: p.id, name: p.name }));
    const existing = room.night.seerResults[me.id];
    view.seer = {
      targets,
      result:
        existing && existing.round === room.round
          ? { targetId: existing.targetId, targetName: nameOf(room, existing.targetId), targetRole: existing.targetRole, roleName: ROLE_DEFS[existing.targetRole]?.name }
          : null,
    };
  }

  if (me.role === "bruja") {
    const wolfTallyEntries = Object.values(room.night.wolfVotes);
    const tally = {};
    wolfTallyEntries.forEach((t) => (tally[t] = (tally[t] || 0) + 1));
    let leadId = null;
    let leadCount = 0;
    for (const [id, count] of Object.entries(tally)) {
      if (count > leadCount) {
        leadId = id;
        leadCount = count;
      }
    }
    const targets = alive.filter((p) => p.id !== me.id).map((p) => ({ id: p.id, name: p.name }));
    view.witch = {
      wolfTargetName: leadId ? nameOf(room, leadId) : null,
      lifeUsed: room.night.witchUsed.life,
      deathUsed: room.night.witchUsed.death,
      savedThisRound: room.night.witchSavedThisRound,
      killTargetId: room.night.witchKillTargetId,
      targets,
    };
  }

  if (me.role === "cupido" && room.round === 1 && !room.night.cupidoDone) {
    view.cupido = { targets: alive.map((p) => ({ id: p.id, name: p.name })) };
  }

  return view;
}

export default async (req) => {
  const url = new URL(req.url);
  const code = (url.searchParams.get("code") || "").toUpperCase().trim();
  const hostToken = url.searchParams.get("hostToken");
  const playerToken = url.searchParams.get("playerToken");

  if (!code) return json({ error: "Falta el código de sala" }, 400);

  const store = getRoomsStore();
  const room = await store.get(code, { type: "json" });
  if (!room) return json({ error: "No existe ninguna sala con ese código" }, 404);

  const isHost = Boolean(hostToken) && hostToken === room.hostToken;
  const me = playerToken ? room.players.find((p) => p.token === playerToken) : null;

  const revealAll = isHost || room.phase === "ended";
  const players = room.players.map((p) => ({
    id: p.id,
    name: p.name,
    alive: p.alive !== false,
    ...(revealAll || p.alive === false
      ? { role: p.role, roleName: ROLE_DEFS[p.role]?.name, emoji: ROLE_DEFS[p.role]?.emoji }
      : {}),
  }));

  const dayVotes = Object.entries(room.day?.votes || {}).map(([voterId, targetId]) => ({
    voterId,
    voterName: nameOf(room, voterId),
    targetId,
    targetName: nameOf(room, targetId),
  }));

  const pendingCazador = room.pendingCazadorIds?.length
    ? { id: room.pendingCazadorIds[0], name: nameOf(room, room.pendingCazadorIds[0]) }
    : null;

  const result = {
    code: room.code,
    status: room.status,
    phase: room.phase,
    round: room.round,
    winner: room.winner,
    roleCounts: room.roleCounts,
    remaining: remainingCounts(room.roleCounts, room.players),
    playerCount: room.players.length,
    players,
    isHost,
    lastNightDeaths: (room.lastNightDeaths || []).map((id) => revealFor(id, room)),
    lastDayElimination: room.lastDayElimination ? revealFor(room.lastDayElimination, room) : null,
    eliminationLog: (room.eliminationLog || []).map((e) => ({
      round: e.round,
      cause: e.cause,
      name: e.name,
      role: e.role,
      roleName: ROLE_DEFS[e.role]?.name,
      emoji: ROLE_DEFS[e.role]?.emoji,
    })),
    pendingCazador,
    dayVotes,
    nightStatus: room.phase === "night" ? computeNightStatus(room) : null,
  };

  if (isHost) {
    result.hostNight = room.phase === "night" ? buildHostNightView(room) : null;
  }

  if (me) {
    result.me = {
      id: me.id,
      name: me.name,
      role: me.role,
      roleInfo: ROLE_DEFS[me.role],
      alive: me.alive !== false,
      loverName: me.loverId ? nameOf(room, me.loverId) : null,
      isPendingCazador: pendingCazador?.id === me.id,
      myDayVote: room.day?.votes?.[me.id] || null,
      night: buildMeNightView(room, me),
    };
  }

  return json(result);
};

export const config = { path: "/api/get-room" };
