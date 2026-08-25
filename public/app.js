(() => {
  "use strict";

  const ROLE_META = {
    lobo: { name: "Lobo", emoji: "🐺" },
    aldeano: { name: "Aldeano", emoji: "🧑‍🌾" },
    vidente: { name: "Vidente", emoji: "🔮" },
    bruja: { name: "Bruja", emoji: "🧙" },
    cazador: { name: "Cazador", emoji: "🏹" },
    cupido: { name: "Cupido", emoji: "💘" },
  };
  const ROLE_ORDER = ["lobo", "aldeano", "vidente", "bruja", "cazador", "cupido"];

  const STORAGE_HOST = "lobos_host_session";
  const STORAGE_PLAYER = "lobos_player_session";
  const POLL_MS = 2500;

  let pollTimer = null;

  const el = (id) => document.getElementById(id);
  const screens = {
    home: el("screen-home"),
    joinForm: el("screen-join-form"),
    host: el("screen-host"),
    player: el("screen-player"),
  };

  function showScreen(name) {
    Object.values(screens).forEach((s) => s.classList.add("hidden"));
    screens[name].classList.remove("hidden");
  }

  function showToast(message, isSuccess = false) {
    const toast = el("toast");
    toast.textContent = message;
    toast.classList.remove("hidden");
    toast.classList.toggle("success", isSuccess);
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.add("hidden"), 3500);
  }

  async function api(path, options) {
    const res = await fetch(path, options);
    let data;
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    if (!res.ok) {
      throw new Error(data.error || "Ocurrió un error inesperado");
    }
    return data;
  }

  function stopPolling() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function withRetry(fn, attempts = 4, delayMs = 450) {
    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (err) {
        if (i === attempts - 1) throw err;
        await sleep(delayMs);
      }
    }
  }

  function saveHostSession(data) {
    localStorage.setItem(STORAGE_HOST, JSON.stringify(data));
  }
  function loadHostSession() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_HOST) || "null");
    } catch {
      return null;
    }
  }
  function clearHostSession() {
    localStorage.removeItem(STORAGE_HOST);
  }

  function savePlayerSession(data) {
    localStorage.setItem(STORAGE_PLAYER, JSON.stringify(data));
  }
  function loadPlayerSession() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_PLAYER) || "null");
    } catch {
      return null;
    }
  }
  function clearPlayerSession() {
    localStorage.removeItem(STORAGE_PLAYER);
  }

  // ---------- HOME ----------
  el("btn-go-create").addEventListener("click", async () => {
    try {
      const data = await api("/api/create-room", { method: "POST" });
      saveHostSession({ code: data.code, hostToken: data.hostToken });
      enterHostScreen(data.code, data.hostToken);
    } catch (err) {
      showToast(err.message);
    }
  });

  el("btn-go-join").addEventListener("click", () => {
    showScreen("joinForm");
  });

  document.querySelectorAll("[data-back]").forEach((btn) => {
    btn.addEventListener("click", () => showScreen("home"));
  });

  // ---------- JOIN ----------
  const joinCodeInput = el("input-join-code");
  joinCodeInput.addEventListener("input", () => {
    joinCodeInput.value = joinCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  });

  el("btn-join-submit").addEventListener("click", async () => {
    const code = joinCodeInput.value.trim();
    const name = el("input-join-name").value.trim();
    if (!code || !name) {
      showToast("Escribe el código de la sala y tu nombre");
      return;
    }
    try {
      const data = await api("/api/join-room", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code, name }),
      });
      savePlayerSession({
        code: data.code,
        playerToken: data.playerToken,
        playerId: data.playerId,
        name,
      });
      enterPlayerScreen(data.code, data.playerToken, name);
    } catch (err) {
      showToast(err.message);
    }
  });

  // ---------- HOST SCREEN ----------
  const MAX_ROLE_COUNT = 50;

  function renderRolesConfig(roleCounts, hostToken, code) {
    const wrap = el("roles-config");
    wrap.innerHTML = "";
    ROLE_ORDER.forEach((id) => {
      const meta = ROLE_META[id];
      const count = Number(roleCounts[id]) || 0;

      const row = document.createElement("div");
      row.className = "role-count-row" + (count === 0 ? " zero" : "");
      row.innerHTML = `
        <span class="emoji">${meta.emoji}</span>
        <span class="role-name-wrap">
          <span class="role-name">${meta.name}</span>
          <span class="role-remaining" data-remaining="${id}"></span>
        </span>
        <div class="stepper">
          <button type="button" class="step-btn" data-dir="-1" aria-label="Quitar un ${meta.name}">−</button>
          <input type="number" min="0" max="${MAX_ROLE_COUNT}" step="1" value="${count}" data-role="${id}" inputmode="numeric" />
          <button type="button" class="step-btn" data-dir="1" aria-label="Agregar un ${meta.name}">+</button>
        </div>`;

      const input = row.querySelector("input");
      // Tracked separately from input.value: by the time a "change" event
      // fires, the input already shows the new number, so we can't use it
      // as "the old value" to detect whether anything actually changed.
      let committedValue = count;

      const commit = async (nextValue) => {
        const clamped = Math.max(0, Math.min(MAX_ROLE_COUNT, Math.round(nextValue) || 0));
        if (clamped === committedValue) {
          input.value = committedValue;
          return;
        }
        const prev = committedValue;
        input.value = clamped;
        row.classList.toggle("zero", clamped === 0);
        try {
          await api("/api/update-roles", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ code, hostToken, roleCounts: { [id]: clamped } }),
          });
          committedValue = clamped;
        } catch (err) {
          committedValue = prev;
          input.value = prev;
          row.classList.toggle("zero", prev === 0);
          showToast(err.message);
        }
      };

      input.addEventListener("change", () => commit(Number(input.value)));
      row.querySelectorAll(".step-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const dir = Number(btn.dataset.dir);
          commit((Number(input.value) || 0) + dir);
        });
      });

      wrap.appendChild(row);
    });
  }

  function updateRemainingLabels(remaining) {
    ROLE_ORDER.forEach((id) => {
      const label = document.querySelector(`[data-remaining="${id}"]`);
      if (label) {
        const n = remaining?.[id] ?? 0;
        label.textContent = n > 0 ? `${n} libre${n === 1 ? "" : "s"}` : "sin cupo";
      }
    });
  }

  function renderHostPlayerList(players, revealRoles) {
    const list = el("host-player-list");
    el("host-player-count").textContent = players.length;
    list.innerHTML = "";
    if (players.length === 0) {
      list.innerHTML = '<li class="player-list-empty">Todavía no se ha unido nadie…</li>';
      return;
    }
    players.forEach((p) => {
      const li = document.createElement("li");
      const roleText = revealRoles && p.role ? `${p.emoji || ""} ${p.roleName || p.role}` : "";
      li.innerHTML = `<span>${escapeHtml(p.name)}</span><span class="player-role">${roleText}</span>`;
      list.appendChild(li);
    });
  }

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  let currentHostState = null;

  async function fetchHostState(code, hostToken) {
    const data = await api(`/api/get-room?code=${encodeURIComponent(code)}&hostToken=${encodeURIComponent(hostToken)}`);
    currentHostState = data;
    renderRolesConfigIfChanged(data.roleCounts, hostToken, code);
    updateRemainingLabels(data.remaining);
    renderHostPlayerList(data.players, el("toggle-reveal-roles").checked);
    const totalSlots = ROLE_ORDER.reduce((sum, id) => sum + (Number(data.roleCounts?.[id]) || 0), 0);
    el("host-total-slots").textContent = totalSlots;
    const badge = el("host-status-badge");
    const closed = data.status === "closed";
    badge.textContent = closed ? "Sala cerrada" : "Sala abierta";
    badge.className = "badge " + (closed ? "badge-closed" : "badge-open");
    el("btn-toggle-status").textContent = closed ? "Abrir sala" : "Cerrar sala";
  }

  async function pollHost(code, hostToken) {
    try {
      await fetchHostState(code, hostToken);
    } catch (err) {
      stopPolling();
      showToast(err.message);
      clearHostSession();
      showScreen("home");
    }
  }

  let lastRolesSignature = "";
  function renderRolesConfigIfChanged(roles, hostToken, code) {
    const sig = JSON.stringify(roles);
    if (sig === lastRolesSignature) return;
    lastRolesSignature = sig;
    renderRolesConfig(roles, hostToken, code);
  }

  async function enterHostScreen(code, hostToken) {
    stopPolling();
    lastRolesSignature = "";
    el("host-room-code").textContent = code;
    showScreen("host");
    try {
      // A brand-new room can take a moment to become visible, so the first
      // load retries a few times instead of immediately bailing to home.
      await withRetry(() => fetchHostState(code, hostToken));
    } catch (err) {
      showToast(err.message);
      clearHostSession();
      showScreen("home");
      return;
    }
    pollTimer = setInterval(() => pollHost(code, hostToken), POLL_MS);
  }

  el("btn-copy-code").addEventListener("click", async () => {
    const code = el("host-room-code").textContent;
    try {
      await navigator.clipboard.writeText(code);
      showToast("Código copiado", true);
    } catch {
      showToast(`Código: ${code}`);
    }
  });

  el("btn-toggle-status").addEventListener("click", async () => {
    const session = loadHostSession();
    if (!session) return;
    const closing = el("btn-toggle-status").textContent === "Cerrar sala";
    try {
      await api("/api/host-action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: session.code, hostToken: session.hostToken, action: closing ? "close" : "open" }),
      });
      pollHost(session.code, session.hostToken);
    } catch (err) {
      showToast(err.message);
    }
  });

  el("btn-reset-room").addEventListener("click", async () => {
    const session = loadHostSession();
    if (!session) return;
    if (!confirm("Esto quitará a todos los jugadores de la sala para empezar una ronda nueva. ¿Continuar?")) return;
    try {
      await api("/api/host-action", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code: session.code, hostToken: session.hostToken, action: "reset" }),
      });
      showToast("Nueva ronda lista, comparte el código de nuevo", true);
      pollHost(session.code, session.hostToken);
    } catch (err) {
      showToast(err.message);
    }
  });

  el("toggle-reveal-roles").addEventListener("change", () => {
    if (currentHostState) {
      renderHostPlayerList(currentHostState.players, el("toggle-reveal-roles").checked);
    }
  });

  document.querySelector("[data-leave-host]").addEventListener("click", () => {
    stopPolling();
    clearHostSession();
    showScreen("home");
  });

  // ---------- PLAYER SCREEN ----------
  function renderPlayerList(players) {
    const list = el("player-player-list");
    el("player-player-count").textContent = players.length;
    list.innerHTML = "";
    if (players.length === 0) {
      list.innerHTML = '<li class="player-list-empty">Todavía no se ha unido nadie…</li>';
      return;
    }
    players.forEach((p) => {
      const li = document.createElement("li");
      li.innerHTML = `<span>${escapeHtml(p.name)}</span>`;
      list.appendChild(li);
    });
  }

  async function fetchPlayerState(code, playerToken) {
    const data = await api(`/api/get-room?code=${encodeURIComponent(code)}&playerToken=${encodeURIComponent(playerToken)}`);
    renderPlayerList(data.players);
    if (data.me) {
      const meta = ROLE_META[data.me.role] || {};
      el("reveal-emoji-big").textContent = meta.emoji || "❔";
      el("reveal-role-name").textContent = data.me.roleInfo?.name || meta.name || "-";
      el("reveal-role-desc").textContent = data.me.roleInfo?.desc || "";
    }
  }

  async function pollPlayer(code, playerToken) {
    try {
      await fetchPlayerState(code, playerToken);
    } catch (err) {
      stopPolling();
      showToast(err.message);
      clearPlayerSession();
      showScreen("home");
    }
  }

  async function enterPlayerScreen(code, playerToken, name) {
    stopPolling();
    el("player-room-code").textContent = code;
    el("player-name").textContent = name;
    el("reveal-card").classList.remove("flipped");
    showScreen("player");
    try {
      // Same read-after-write safety net as the host screen: retry the
      // first load instead of bailing out on a transient miss.
      await withRetry(() => fetchPlayerState(code, playerToken));
    } catch (err) {
      showToast(err.message);
      clearPlayerSession();
      showScreen("home");
      return;
    }
    pollTimer = setInterval(() => pollPlayer(code, playerToken), POLL_MS);
  }

  el("reveal-wrap").addEventListener("click", () => {
    el("reveal-card").classList.toggle("flipped");
  });

  document.querySelector("[data-leave-player]").addEventListener("click", () => {
    stopPolling();
    clearPlayerSession();
    showScreen("home");
  });

  // ---------- INIT ----------
  (function init() {
    const hostSession = loadHostSession();
    const playerSession = loadPlayerSession();
    if (hostSession) {
      enterHostScreen(hostSession.code, hostSession.hostToken);
    } else if (playerSession) {
      enterPlayerScreen(playerSession.code, playerSession.playerToken, playerSession.name);
    } else {
      showScreen("home");
    }
  })();
})();
