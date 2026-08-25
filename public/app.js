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

  function gameAdvance(code, hostToken, action, extra = {}) {
    return api("/api/game-advance", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, hostToken, action, ...extra }),
    });
  }

  function gameAction(code, playerToken, type, extra = {}) {
    return api("/api/game-action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ code, playerToken, type, ...extra }),
    });
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

    const badge = el("host-status-badge");
    const closed = data.status === "closed";
    badge.textContent = closed ? "Sala cerrada" : "Sala abierta";
    badge.className = "badge " + (closed ? "badge-closed" : "badge-open");
    el("btn-toggle-status").textContent = closed ? "Abrir sala" : "Cerrar sala";

    document.body.classList.toggle("phase-day", data.phase === "day");

    if (data.phase === "lobby") {
      el("host-lobby-panel").classList.remove("hidden");
      el("host-game-panel").classList.add("hidden");
      renderRolesConfigIfChanged(data.roleCounts, hostToken, code);
      updateRemainingLabels(data.remaining);
      renderHostPlayerList(data.players, el("toggle-reveal-roles").checked);
      const totalSlots = ROLE_ORDER.reduce((sum, id) => sum + (Number(data.roleCounts?.[id]) || 0), 0);
      el("host-total-slots").textContent = totalSlots;
      const hasWolf = data.players.some((p) => p.role === "lobo");
      const enough = data.players.length >= 3;
      el("start-game-hint").textContent = !enough
        ? `Necesitas al menos 3 jugadores (tienes ${data.players.length}).`
        : !hasWolf
        ? "Agrega al menos un jugador con personaje Lobo antes de empezar."
        : "¡Listo! Todos ya tienen su personaje asignado.";
    } else {
      el("host-lobby-panel").classList.add("hidden");
      el("host-game-panel").classList.remove("hidden");
      renderHostGame(code, hostToken, data);
    }
  }

  el("btn-start-game").addEventListener("click", async () => {
    const session = loadHostSession();
    if (!session) return;
    try {
      await gameAdvance(session.code, session.hostToken, "start");
      pollHost(session.code, session.hostToken);
    } catch (err) {
      showToast(err.message);
    }
  });

  function renderPlayersGrid(container, players) {
    container.innerHTML = "";
    players.forEach((p) => {
      const meta = ROLE_META[p.role] || {};
      const tile = document.createElement("div");
      tile.className = "player-tile" + (p.alive ? "" : " dead");
      tile.innerHTML = `
        ${!p.alive ? '<span class="tile-badge" title="Eliminado">💀</span>' : ""}
        <span class="tile-emoji">${p.role ? meta.emoji || "❔" : "❔"}</span>
        <span class="tile-name">${escapeHtml(p.name)}</span>
        ${p.role ? `<span class="tile-role">${meta.name || p.role}</span>` : ""}
      `;
      container.appendChild(tile);
    });
  }

  function renderPhaseBanner(container, data) {
    let icon = "🌙";
    let title = "";
    let subtitle = "";
    let cls = "phase-banner-night";
    if (data.phase === "night") {
      icon = "🌙";
      title = `Noche ${data.round}`;
      subtitle = "Los personajes con poderes actúan en secreto";
    } else if (data.phase === "day") {
      icon = "☀️";
      title = `Día ${data.round}`;
      subtitle = "Votación para eliminar a un sospechoso";
      cls = "phase-banner-day";
    } else if (data.phase === "cazador-wait") {
      icon = "🏹";
      title = "Turno del Cazador";
      subtitle = data.pendingCazador ? `${data.pendingCazador.name} debe disparar` : "";
      cls = "phase-banner-cazador";
    } else if (data.phase === "ended") {
      icon = data.winner === "lobos" ? "🐺" : "🧑‍🌾";
      title = `Ganan los ${data.winner === "lobos" ? "Lobos" : "Aldeanos"}`;
      subtitle = "Partida terminada";
      cls = "phase-banner-ended";
    }
    container.className = "phase-banner " + cls;
    container.innerHTML = `<span class="phase-icon">${icon}</span><h2>${title}</h2>${subtitle ? `<p>${subtitle}</p>` : ""}`;
  }

  function renderHostNightView(data) {
    const view = el("host-night-view");
    const n = data.hostNight;
    if (!n) {
      view.classList.add("hidden");
      return;
    }
    view.classList.remove("hidden");
    const ns = data.nightStatus || {};
    let html = '<h3>👁️ Lo que ve el anfitrión</h3>';

    html += `<div class="status-pill${ns.wolves?.acted >= ns.wolves?.total && ns.wolves?.total > 0 ? " ready" : ""}">🐺 Lobos: ${ns.wolves?.acted ?? 0}/${ns.wolves?.total ?? 0}</div>`;
    if (ns.seers?.total) html += `<div class="status-pill${ns.seers.acted >= ns.seers.total ? " ready" : ""}">🔮 Vidente: ${ns.seers.acted}/${ns.seers.total}</div>`;
    if (ns.cupidos && ns.cupidos.total) html += `<div class="status-pill${ns.cupidos.acted >= ns.cupidos.total ? " ready" : ""}">💘 Cupido: ${ns.cupidos.acted}/${ns.cupidos.total}</div>`;

    html += '<p class="section-label">Votos de los lobos</p>';
    if (n.wolfVotes.length === 0) {
      html += '<p class="hint">Todavía nadie ha votado.</p>';
    } else {
      n.wolfVotes.forEach((v) => {
        html += `<div class="info-row"><span>${escapeHtml(v.wolfName)}</span><span class="info-label">→ ${escapeHtml(v.targetName)}</span></div>`;
      });
    }

    if (n.seerResults.length > 0) {
      html += '<p class="section-label">Investigación de la vidente</p>';
      n.seerResults.forEach((r) => {
        html += `<div class="info-row"><span>${escapeHtml(r.seerName)} investigó a ${escapeHtml(r.targetName)}</span><span class="info-label">${escapeHtml(r.targetRole)}</span></div>`;
      });
    }

    html += '<p class="section-label">Bruja</p>';
    html += `<div class="info-row"><span>Poción de vida</span><span class="info-label">${n.witchUsed.life ? "usada" : n.witchSavedThisRound ? "salvando esta noche" : "disponible"}</span></div>`;
    html += `<div class="info-row"><span>Poción de muerte</span><span class="info-label">${n.witchKillTargetName ? `matando a ${escapeHtml(n.witchKillTargetName)}` : n.witchUsed.death ? "usada" : "disponible"}</span></div>`;

    if (n.lovers.length > 0) {
      html += '<p class="section-label">💘 Enamorados</p>';
      n.lovers.forEach((pair) => {
        html += `<div class="info-row"><span>${escapeHtml(pair.a)}</span><span class="info-label">💞 ${escapeHtml(pair.b)}</span></div>`;
      });
    }

    view.innerHTML = html;
  }

  function renderDeathBanner(container, deaths) {
    if (!deaths || deaths.length === 0) {
      container.innerHTML += '<div class="death-reveal peaceful"><span class="emoji">🕊️</span><span>Nadie murió esta noche.</span></div>';
      return;
    }
    deaths.forEach((d) => {
      const meta = ROLE_META[d.role] || {};
      container.innerHTML += `<div class="death-reveal"><span class="emoji">${meta.emoji || "💀"}</span><span><strong>${escapeHtml(d.name)}</strong> murió — era ${d.roleName || d.role}</span></div>`;
    });
  }

  function renderBarsFromCounts(container, entries) {
    if (entries.length === 0) {
      container.innerHTML = '<p class="hint">Nadie ha votado todavía.</p>';
      return;
    }
    const maxCount = Math.max(1, ...entries.map((e) => e.count));
    container.innerHTML = entries
      .sort((a, b) => b.count - a.count)
      .map((e) => {
        const pct = Math.round((e.count / maxCount) * 100);
        return `
          <div class="vote-bar-row">
            <div class="vote-bar-label"><span>${escapeHtml(e.name)}</span><span>${e.count} voto${e.count === 1 ? "" : "s"}</span></div>
            <div class="vote-bar-track"><div class="vote-bar-fill" style="width:${pct}%"></div></div>
          </div>`;
      })
      .join("");
  }

  function renderVoteBars(container, votes, players) {
    const tally = {};
    votes.forEach((v) => {
      tally[v.targetId] = (tally[v.targetId] || 0) + 1;
    });
    const entries = Object.entries(tally).map(([targetId, count]) => ({
      name: players.find((p) => p.id === targetId)?.name || "?",
      count,
    }));
    renderBarsFromCounts(container, entries);
  }

  function renderEliminationLog(container, log) {
    if (!log || log.length === 0) {
      container.innerHTML = "<li>Sin eliminaciones.</li>";
      return;
    }
    container.innerHTML = log
      .map((e) => {
        const causeLabel = e.cause === "night" ? "🌙 noche" : e.cause === "day" ? "☀️ votación" : "🏹 cazador";
        return `<li><span>${e.emoji || ""} ${escapeHtml(e.name)} — ${escapeHtml(e.roleName || e.role)}</span><span class="log-cause">Ronda ${e.round} · ${causeLabel}</span></li>`;
      })
      .join("");
  }

  function targetButton(target, selected, danger) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "target-btn" + (selected ? " selected" : "") + (danger ? " danger" : "");
    btn.textContent = target.name;
    return btn;
  }

  function renderHostDayView(data) {
    const view = el("host-day-view");
    if (data.phase !== "day") {
      view.classList.add("hidden");
      return;
    }
    view.classList.remove("hidden");
    let html = "";
    if (data.lastNightDeaths.length || data.round > 0) {
      html += '<h3>🌅 Amanecer</h3>';
      html += '<div id="host-death-reveal"></div>';
    }
    html += '<h3>🗳️ Votación en vivo</h3>';
    html += `<p class="hint">${data.dayVotes.length} de ${data.players.filter((p) => p.alive).length} jugadores vivos han votado.</p>`;
    html += '<div id="host-vote-bars"></div>';
    view.innerHTML = html;
    const revealWrap = view.querySelector("#host-death-reveal");
    if (revealWrap) renderDeathBanner(revealWrap, data.lastNightDeaths);
    renderVoteBars(view.querySelector("#host-vote-bars"), data.dayVotes, data.players);
  }

  function renderHostCazadorView(data) {
    const view = el("host-cazador-view");
    if (data.phase !== "cazador-wait") {
      view.classList.add("hidden");
      return;
    }
    view.classList.remove("hidden");
    view.innerHTML = `<h3>🏹 Esperando el disparo</h3><p class="hint">${escapeHtml(data.pendingCazador?.name || "El cazador")} fue eliminado y puede llevarse a alguien más. Esperando su elección…</p>`;
  }

  function renderHostEndedView(data) {
    const view = el("host-ended-view");
    if (data.phase !== "ended") {
      view.classList.add("hidden");
      return;
    }
    view.classList.remove("hidden");
    view.innerHTML = `
      <div class="winner-banner">
        <span class="winner-emoji">${data.winner === "lobos" ? "🐺" : "🏆"}</span>
        <h2>Ganan los ${data.winner === "lobos" ? "Lobos" : "Aldeanos"}</h2>
      </div>
      <p class="section-label">Historial de la partida</p>
      <ul class="elimination-log" id="host-elim-log"></ul>`;
    renderEliminationLog(view.querySelector("#host-elim-log"), data.eliminationLog);
  }

  function renderHostGame(code, hostToken, data) {
    renderPhaseBanner(el("host-phase-banner"), data);
    renderPlayersGrid(el("host-players-grid"), data.players);
    renderHostNightView(data);
    renderHostDayView(data);
    renderHostCazadorView(data);
    renderHostEndedView(data);

    const resolveNightBtn = el("btn-resolve-night");
    const resolveDayBtn = el("btn-resolve-day");
    resolveNightBtn.classList.toggle("hidden", data.phase !== "night");
    resolveDayBtn.classList.toggle("hidden", data.phase !== "day");

    resolveNightBtn.onclick = async () => {
      try {
        await gameAdvance(code, hostToken, "resolve-night");
        pollHost(code, hostToken);
      } catch (err) {
        showToast(err.message);
      }
    };
    resolveDayBtn.onclick = async () => {
      try {
        await gameAdvance(code, hostToken, "resolve-day");
        pollHost(code, hostToken);
      } catch (err) {
        showToast(err.message);
      }
    };
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
    document.body.classList.toggle("phase-day", data.phase === "day");

    if (data.phase === "lobby") {
      el("player-lobby-panel").classList.remove("hidden");
      el("player-game-panel").classList.add("hidden");
      renderPlayerList(data.players);
      if (data.me) {
        const meta = ROLE_META[data.me.role] || {};
        el("reveal-emoji-big").textContent = meta.emoji || "❔";
        el("reveal-role-name").textContent = data.me.roleInfo?.name || meta.name || "-";
        el("reveal-role-desc").textContent = data.me.roleInfo?.desc || "";
      }
    } else {
      el("player-lobby-panel").classList.add("hidden");
      el("player-game-panel").classList.remove("hidden");
      renderPlayerGame(code, playerToken, data);
    }
  }

  function renderMyRoleCard(data) {
    const wrap = el("player-my-card");
    const me = data.me;
    if (!me) {
      wrap.innerHTML = "";
      return;
    }
    const meta = ROLE_META[me.role] || {};
    let status = "";
    if (!me.alive) status += '<p class="my-role-status dead-banner">💀 Fuiste eliminado — ahora eres espectador</p>';
    if (me.loverName) status += `<p class="my-role-status lover-banner">💞 Estás enamorado de ${escapeHtml(me.loverName)}</p>`;
    wrap.innerHTML = `
      <span class="my-role-emoji">${meta.emoji || "❔"}</span>
      <div>
        <p class="my-role-name">${escapeHtml(me.roleInfo?.name || meta.name || "-")}</p>
        ${status}
      </div>`;
  }

  function renderPlayerNightAction(code, playerToken, data, container) {
    const night = data.me.night || {};
    const refresh = () => pollPlayer(code, playerToken);
    const runAction = async (type, extra) => {
      try {
        await gameAction(code, playerToken, type, extra);
        refresh();
      } catch (err) {
        showToast(err.message);
      }
    };

    if (!data.me.alive) {
      container.innerHTML = '<p class="hint">🌙 Estás eliminado. Observa cómo se desarrolla la noche.</p>';
      return;
    }

    if (night.wolf) {
      const w = night.wolf;
      container.innerHTML = `
        <h3>🐺 Elige a quién atacar</h3>
        <p class="hint">${w.packMates.length ? "Tu manada: " + w.packMates.map(escapeHtml).join(", ") : "Eres el único lobo en pie."}</p>
        <div class="target-grid" id="wolf-targets"></div>
        ${w.tally.length ? '<p class="section-label">Cómo va la votación de la manada</p><div id="wolf-tally"></div>' : ""}`;
      const grid = container.querySelector("#wolf-targets");
      w.targets.forEach((t) => {
        const btn = targetButton(t, t.id === w.myVote, true);
        btn.addEventListener("click", () => runAction("wolf-vote", { targetId: t.id }));
        grid.appendChild(btn);
      });
      if (w.tally.length) {
        renderBarsFromCounts(
          container.querySelector("#wolf-tally"),
          w.tally.map((t) => ({ name: t.name, count: t.count }))
        );
      }
      return;
    }

    if (night.seer) {
      const s = night.seer;
      if (s.result) {
        const meta = ROLE_META[s.result.targetRole] || {};
        container.innerHTML = `
          <h3>🔮 Tu investigación de esta noche</h3>
          <div class="info-row"><span>${escapeHtml(s.result.targetName)}</span><span class="info-label">${meta.emoji || ""} ${escapeHtml(s.result.roleName || s.result.targetRole)}</span></div>
          <p class="hint">Ya investigaste esta noche. Podrás investigar de nuevo mañana en la noche.</p>`;
        return;
      }
      container.innerHTML = '<h3>🔮 Investiga a un jugador</h3><div class="target-grid" id="seer-targets"></div>';
      const grid = container.querySelector("#seer-targets");
      s.targets.forEach((t) => {
        const btn = targetButton(t, false, false);
        btn.addEventListener("click", () => runAction("seer-inspect", { targetId: t.id }));
        grid.appendChild(btn);
      });
      return;
    }

    if (night.witch) {
      const w = night.witch;
      let html = "<h3>🧙 Tus pociones</h3>";
      html += `<p class="hint">Esta noche los lobos van tras: <strong>${w.wolfTargetName ? escapeHtml(w.wolfTargetName) : "nadie todavía"}</strong></p>`;
      html += '<p class="section-label">Poción de vida</p>';
      if (w.lifeUsed) {
        html += '<p class="hint">Ya usaste tu poción de vida.</p>';
      } else if (!w.wolfTargetName) {
        html += '<p class="hint">Espera a que los lobos elijan una víctima para poder salvarla.</p>';
      } else {
        html += `<button type="button" class="btn ${w.savedThisRound ? "btn-primary" : "btn-secondary"}" id="btn-witch-save">${w.savedThisRound ? "✓ Salvarás a " + escapeHtml(w.wolfTargetName) : "Salvar a " + escapeHtml(w.wolfTargetName)}</button>`;
      }
      html += '<p class="section-label">Poción de muerte</p>';
      html += w.deathUsed
        ? '<p class="hint">Ya usaste tu poción de muerte.</p>'
        : '<div class="target-grid" id="witch-kill-targets"></div>';
      container.innerHTML = html;

      const saveBtn = container.querySelector("#btn-witch-save");
      if (saveBtn) {
        saveBtn.addEventListener("click", () => runAction(w.savedThisRound ? "witch-unsave" : "witch-save"));
      }
      const killGrid = container.querySelector("#witch-kill-targets");
      if (killGrid) {
        w.targets.forEach((t) => {
          const selected = w.killTargetId === t.id;
          const btn = targetButton(t, selected, true);
          btn.addEventListener("click", () => runAction(selected ? "witch-unkill" : "witch-kill", selected ? {} : { targetId: t.id }));
          killGrid.appendChild(btn);
        });
      }
      return;
    }

    if (night.cupido) {
      const c = night.cupido;
      container.innerHTML = `
        <h3>💘 Elige a los enamorados</h3>
        <p class="hint">Selecciona a dos jugadores (puedes incluirte a ti mismo).</p>
        <div class="target-grid" id="cupid-targets"></div>
        <button type="button" class="btn btn-primary" id="btn-cupid-confirm" disabled>Confirmar pareja</button>`;
      const grid = container.querySelector("#cupid-targets");
      const confirmBtn = container.querySelector("#btn-cupid-confirm");
      const selected = [];
      c.targets.forEach((t) => {
        const btn = targetButton(t, false, false);
        btn.addEventListener("click", () => {
          const idx = selected.indexOf(t.id);
          if (idx >= 0) {
            selected.splice(idx, 1);
            btn.classList.remove("selected");
          } else if (selected.length < 2) {
            selected.push(t.id);
            btn.classList.add("selected");
          }
          confirmBtn.disabled = selected.length !== 2;
        });
        grid.appendChild(btn);
      });
      confirmBtn.addEventListener("click", () => runAction("cupid-pair", { targetId: selected[0], targetId2: selected[1] }));
      return;
    }

    const ns = data.nightStatus || {};
    const roleNote =
      data.me.role === "cazador"
        ? "Tu turno llega si te eliminan: entonces podrás disparar a alguien más."
        : "No tienes poderes nocturnos. De día podrás debatir y votar.";
    let html = `<h3>🌙 Es de noche</h3><p class="hint">${roleNote}</p>`;
    html += `<div class="status-pill${ns.wolves?.total > 0 && ns.wolves?.acted >= ns.wolves?.total ? " ready" : ""}">🐺 Lobos: ${ns.wolves?.acted ?? 0}/${ns.wolves?.total ?? 0}</div>`;
    if (ns.seers?.total) html += `<div class="status-pill${ns.seers.acted >= ns.seers.total ? " ready" : ""}">🔮 Vidente: ${ns.seers.acted}/${ns.seers.total}</div>`;
    container.innerHTML = html;
  }

  function renderPlayerDayVote(code, playerToken, data, container) {
    let html = '<div id="player-death-reveal"></div>';
    if (!data.me.alive) {
      html += '<h3>🗳️ Votación en vivo</h3><p class="hint">Ya fuiste eliminado, ahora observas la votación.</p><div id="player-vote-bars"></div>';
      container.innerHTML = html;
      renderDeathBanner(container.querySelector("#player-death-reveal"), data.lastNightDeaths);
      renderVoteBars(container.querySelector("#player-vote-bars"), data.dayVotes, data.players);
      return;
    }
    html += '<h3>🗳️ Vota para eliminar a alguien</h3><div class="target-grid" id="day-targets"></div>';
    html += '<p class="section-label">Resultado en vivo</p><div id="player-vote-bars"></div>';
    container.innerHTML = html;
    renderDeathBanner(container.querySelector("#player-death-reveal"), data.lastNightDeaths);
    const grid = container.querySelector("#day-targets");
    data.players
      .filter((p) => p.alive)
      .forEach((p) => {
        const selected = data.me.myDayVote === p.id;
        const label = p.id === data.me.id ? `${p.name} (tú)` : p.name;
        const btn = targetButton({ name: label }, selected, true);
        btn.addEventListener("click", async () => {
          try {
            await gameAction(code, playerToken, "day-vote", { targetId: p.id });
            pollPlayer(code, playerToken);
          } catch (err) {
            showToast(err.message);
          }
        });
        grid.appendChild(btn);
      });
    renderVoteBars(container.querySelector("#player-vote-bars"), data.dayVotes, data.players);
  }

  function renderPlayerCazadorView(code, playerToken, data, container) {
    if (data.me.isPendingCazador) {
      container.innerHTML =
        '<h3>🏹 ¡Te eliminaron! Dispara antes de irte</h3><p class="hint">Elige a quién te llevas contigo.</p><div class="target-grid" id="cazador-targets"></div>';
      const grid = container.querySelector("#cazador-targets");
      data.players
        .filter((p) => p.alive)
        .forEach((p) => {
          const btn = targetButton(p, false, true);
          btn.addEventListener("click", async () => {
            try {
              await gameAction(code, playerToken, "cazador-shoot", { targetId: p.id });
              pollPlayer(code, playerToken);
            } catch (err) {
              showToast(err.message);
            }
          });
          grid.appendChild(btn);
        });
    } else {
      container.innerHTML = `<h3>🏹 Turno del cazador</h3><p class="hint">Esperando a que ${escapeHtml(data.pendingCazador?.name || "el cazador")} elija a quién llevarse.</p>`;
    }
  }

  function renderPlayerEndedView(data, container) {
    container.innerHTML = `
      <div class="winner-banner">
        <span class="winner-emoji">${data.winner === "lobos" ? "🐺" : "🏆"}</span>
        <h2>Ganan los ${data.winner === "lobos" ? "Lobos" : "Aldeanos"}</h2>
      </div>
      <p class="section-label">Todos los personajes</p>
      <div id="ended-players-grid" class="players-grid"></div>
      <p class="section-label">Historial de la partida</p>
      <ul class="elimination-log" id="ended-log"></ul>`;
    renderPlayersGrid(container.querySelector("#ended-players-grid"), data.players);
    renderEliminationLog(container.querySelector("#ended-log"), data.eliminationLog);
  }

  function renderPlayerGame(code, playerToken, data) {
    renderPhaseBanner(el("player-phase-banner"), data);
    renderMyRoleCard(data);

    const actionView = el("player-action-view");
    const voteView = el("player-vote-view");
    const cazadorView = el("player-cazador-view");
    const endedView = el("player-ended-view");
    [actionView, voteView, cazadorView, endedView].forEach((v) => v.classList.add("hidden"));

    if (data.phase === "night") {
      actionView.classList.remove("hidden");
      renderPlayerNightAction(code, playerToken, data, actionView);
    } else if (data.phase === "day") {
      voteView.classList.remove("hidden");
      renderPlayerDayVote(code, playerToken, data, voteView);
    } else if (data.phase === "cazador-wait") {
      cazadorView.classList.remove("hidden");
      renderPlayerCazadorView(code, playerToken, data, cazadorView);
    } else if (data.phase === "ended") {
      endedView.classList.remove("hidden");
      renderPlayerEndedView(data, endedView);
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
