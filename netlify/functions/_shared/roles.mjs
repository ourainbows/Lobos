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

export function defaultRolesConfig() {
  return {
    lobo: true,
    aldeano: true,
    vidente: true,
    bruja: true,
    cazador: true,
    cupido: false,
  };
}

export function pickRandomRole(rolesConfig) {
  const enabled = Object.entries(rolesConfig)
    .filter(([, on]) => on)
    .map(([id]) => id);
  if (enabled.length === 0) return "aldeano";
  return enabled[Math.floor(Math.random() * enabled.length)];
}
