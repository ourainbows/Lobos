// Core state-machine helpers for the automated night/day game.
// Everything here mutates a `room` object in place and is meant to be
// called from the API handlers right before store.setJSON(code, room).

export function freshNightState() {
  return {
    cupidoDone: false,
    wolfVotes: {}, // { wolfPlayerId: targetPlayerId }
    seerResults: {}, // { seerPlayerId: { round, targetId, targetRole } }
    witchUsed: { life: false, death: false }, // game-wide, single use each
    witchSavedThisRound: false,
    witchKillTargetId: null,
  };
}

export function freshDayState() {
  return { votes: {} }; // { voterPlayerId: targetPlayerId }
}

export function initGameState(room) {
  room.phase = "night";
  room.round = 1;
  room.winner = null;
  room.players.forEach((p) => {
    p.alive = true;
    p.loverId = null;
  });
  room.night = freshNightState();
  room.day = freshDayState();
  room.pendingCazadorIds = [];
  room.afterShotsPhase = null;
  room.eliminationLog = [];
  room.lastNightDeaths = [];
  room.lastDayElimination = null;
}

export function findPlayer(room, id) {
  return room.players.find((p) => p.id === id) || null;
}

export function alivePlayers(room) {
  return room.players.filter((p) => p.alive);
}

export function checkWinner(players) {
  const alive = players.filter((p) => p.alive);
  const wolves = alive.filter((p) => p.role === "lobo");
  const villagers = alive.filter((p) => p.role !== "lobo");
  if (wolves.length === 0) return "aldeanos";
  if (wolves.length >= villagers.length) return "lobos";
  return null;
}

// Majority pick among wolf votes; ties broken at random. Returns null if no
// wolf voted (a "peaceful night").
export function resolveWolfTarget(wolfVotes) {
  const tally = {};
  Object.values(wolfVotes).forEach((targetId) => {
    tally[targetId] = (tally[targetId] || 0) + 1;
  });
  let best = [];
  let bestCount = 0;
  for (const [id, count] of Object.entries(tally)) {
    if (count > bestCount) {
      best = [id];
      bestCount = count;
    } else if (count === bestCount) {
      best.push(id);
    }
  }
  if (best.length === 0) return null;
  return best[Math.floor(Math.random() * best.length)];
}

// Plurality pick among day votes; ties broken at random. Returns null if
// nobody voted.
export function resolveDayTarget(dayVotes) {
  return resolveWolfTarget(dayVotes);
}

// Kills `initialDeadIds` and cascades through lover heartbreak deaths. Any
// cazador caught in the blast is queued in room.pendingCazadorIds instead of
// being resolved immediately, since their revenge shot needs player input.
// Mutates room.players and room.eliminationLog. Returns the final list of
// player ids that died in this call (including chained lover deaths).
export function applyDeaths(room, initialDeadIds, cause) {
  const deadNow = [];
  const queue = [...new Set(initialDeadIds)];
  const seen = new Set();

  while (queue.length) {
    const id = queue.shift();
    if (seen.has(id)) continue;
    seen.add(id);
    const player = findPlayer(room, id);
    if (!player || !player.alive) continue;

    player.alive = false;
    deadNow.push(id);
    room.eliminationLog.push({
      round: room.round,
      cause,
      playerId: player.id,
      name: player.name,
      role: player.role,
    });

    if (player.loverId && !seen.has(player.loverId)) {
      const lover = findPlayer(room, player.loverId);
      if (lover && lover.alive) queue.push(player.loverId);
    }

    if (player.role === "cazador" && !room.pendingCazadorIds.includes(player.id)) {
      room.pendingCazadorIds.push(player.id);
    }
  }

  return deadNow;
}

// After deaths are applied, either park the game on "cazador-wait" (if a
// revenge shot is still owed), declare a winner, or move on to the next
// phase/round.
export function finalizeAfterDeaths(room, nextPhase, nextRound) {
  if (room.pendingCazadorIds.length > 0) {
    room.phase = "cazador-wait";
    room.afterShotsPhase = { phase: nextPhase, round: nextRound };
    return;
  }
  const winner = checkWinner(room.players);
  if (winner) {
    room.phase = "ended";
    room.winner = winner;
    return;
  }
  room.phase = nextPhase;
  if (nextRound) room.round = nextRound;
}
