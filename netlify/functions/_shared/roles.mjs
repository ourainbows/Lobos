export const ROLE_DEFS = {
  lobo: {
    name: "Lobo",
    emoji: "🐺",
    team: "lobos",
    desc: "Cada noche, junto a los demás lobos, elige en secreto a un aldeano para eliminar. Los lobos ganan si llegan a igualar o superar en número a los aldeanos.",
  },
  aldeano: {
    name: "Aldeano",
    emoji: "🧑‍🌾",
    team: "aldeanos",
    desc: "No tiene poderes especiales. Debe observar, debatir y votar de día para descubrir quiénes son los lobos antes de que sea tarde.",
  },
  vidente: {
    name: "Vidente",
    emoji: "🔮",
    team: "aldeanos",
    desc: "Cada noche puede mirar en secreto la identidad de un jugador para intentar descubrir a los lobos.",
  },
  bruja: {
    name: "Bruja",
    emoji: "🧙",
    team: "aldeanos",
    desc: "Tiene una poción de vida (puede salvar a la víctima de los lobos) y una poción de muerte (puede eliminar a quien quiera). Cada poción solo se puede usar una vez en toda la partida.",
  },
  cazador: {
    name: "Cazador",
    emoji: "🏹",
    team: "aldeanos",
    desc: "Si es eliminado (de día o de noche), en ese mismo instante puede disparar y eliminar a otro jugador de su elección.",
  },
  cupido: {
    name: "Cupido",
    emoji: "💘",
    team: "aldeanos",
    desc: "La primera noche elige a dos jugadores para que se enamoren. Si uno de los dos muere, el otro muere de pena de amor.",
  },
};

export const ROLE_ORDER = ["lobo", "aldeano", "vidente", "bruja", "cazador", "cupido"];

const MAX_ROLE_COUNT = 50;

// The host sets exactly how many of each character to include (a fixed
// "deck" of roles), like a real werewolf card set. Count 0 means that
// character is not in play.
export function defaultRoleCounts() {
  return {
    lobo: 2,
    aldeano: 4,
    vidente: 1,
    bruja: 1,
    cazador: 1,
    cupido: 0,
  };
}

export function isValidCount(value) {
  return Number.isInteger(value) && value >= 0 && value <= MAX_ROLE_COUNT;
}

// How many of each role are already held by players currently in the room.
export function assignedCounts(players) {
  const counts = {};
  for (const id of ROLE_ORDER) counts[id] = 0;
  for (const p of players) {
    if (counts[p.role] !== undefined) counts[p.role] += 1;
  }
  return counts;
}

// Open seats left per role: the host's target count minus how many are
// already assigned to players currently in the room.
export function remainingCounts(roleCounts, players) {
  const assigned = assignedCounts(players);
  const remaining = {};
  for (const id of ROLE_ORDER) {
    remaining[id] = Math.max(0, (roleCounts[id] || 0) - (assigned[id] || 0));
  }
  return remaining;
}

// Picks a role at random, weighted by how many open seats each one has left
// (equivalent to drawing a random card from the remaining shuffled deck).
export function pickRoleFromRemaining(remaining) {
  const total = ROLE_ORDER.reduce((sum, id) => sum + (remaining[id] || 0), 0);
  if (total === 0) return null;
  let r = Math.floor(Math.random() * total);
  for (const id of ROLE_ORDER) {
    const n = remaining[id] || 0;
    if (r < n) return id;
    r -= n;
  }
  return null;
}
