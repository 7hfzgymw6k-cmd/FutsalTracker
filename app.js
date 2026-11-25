/*
 * Futsal Tracker Web
 * Copyright © 2026 Suunnittelu ja laskenta Oy Saga. All rights reserved.
 * Licensed for personal, non-commercial use only. See LICENSE.txt.
 */

(() => {
  const STORAGE_KEYS = {
    ACTIVE_MATCH: "futsal_tracker_active_match_v1",
    LATEST_STATS: "futsal_tracker_latest_statistics_v1"
  };

  const EVENT_META = {
    goal: { title: "Goal", icon: "⚽️" },
    shot: { title: "Shot", icon: "🎯" },
    foul: { title: "Foul", icon: "✋" },
    corner: { title: "Corner", icon: "🚩" },
    pass: { title: "Pass", icon: "➡️" },
    possessionChange: { title: "Possession", icon: "⇄" },
    lostBall: { title: "Turnover", icon: "🔄" },
    turnover: { title: "Turnover", icon: "🔄" },
    freeKick10m: { title: "Free Kick 10m", icon: "👟" }
  };

  const RECORDABLE_TYPES = ["goal", "shot", "foul", "corner", "pass"];
  const SUMMARY_TYPES = ["goal", "shot", "foul", "corner", "pass", "turnover", "freeKick10m"];

  function generateUUID() {
    if (crypto && crypto.randomUUID) return crypto.randomUUID();
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function formatMatchTime(seconds) {
    const totalSeconds = Math.max(0, Math.floor(seconds));
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }

  function formatDate(isoString) {
    const date = new Date(isoString);
    return date.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short"
    });
  }

  function escapeHTML(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const MatchLogic = {
    isClockRunning(match) {
      return match.status === "active" && match.clockStartedAt !== null;
    },

    elapsedTime(match, nowMs = Date.now()) {
      if (!match.clockStartedAt || match.status !== "active") {
        return Math.max(0, match.elapsedBeforeRun);
      }
      const deltaSec = (nowMs - new Date(match.clockStartedAt).getTime()) / 1000;
      return Math.max(0, match.elapsedBeforeRun + deltaSec);
    },

    teamName(match, teamID) {
      return teamID === match.homeTeam.id ? match.homeTeam.name : match.awayTeam.name;
    },

    opponentID(match, teamID) {
      if (teamID === match.homeTeam.id) return match.awayTeam.id;
      if (teamID === match.awayTeam.id) return match.homeTeam.id;
      return null;
    },

    currentPossessionTeamID(match) {
      for (let i = match.events.length - 1; i >= 0; i--) {
        if (match.events[i].type === "possessionChange") {
          return match.events[i].teamID;
        }
      }
      return match.homeTeam.id;
    },

    totals(match, teamID, half = null) {
      const t = {
        goal: 0,
        shot: 0,
        foul: 0,
        corner: 0,
        pass: 0,
        possessionChange: 0,
        lostBall: 0,
        turnover: 0,
        freeKick10m: 0
      };
      for (const ev of match.events) {
        if (ev.teamID === teamID && (half === null || ev.half === half)) {
          if (ev.type === "goal") {
            t.goal += 1;
            t.shot += 1;
          } else if (ev.type in t) {
            t[ev.type] += 1;
          }
        }
      }
      return t;
    },

    score(match, teamID, half = null) {
      return this.totals(match, teamID, half).goal;
    },

    visibleEvents(match) {
      return match.events.filter(ev => ev.type !== "lostBall");
    },

    eventLogTitle(ev) {
      if (ev.type === "pass" && ev.successfulPassSequence >= 5) {
        return `Pass (${ev.successfulPassSequence})`;
      }
      return EVENT_META[ev.type]?.title || ev.type;
    },

    currentSuccessfulPassSequence(match, teamID, half) {
      for (let i = match.events.length - 1; i >= 0; i--) {
        const ev = match.events[i];
        if (ev.half !== half) continue;
        if (ev.type === "possessionChange") return 0;
        if (ev.type === "pass" && ev.teamID === teamID) {
          return ev.successfulPassSequence || 0;
        }
      }
      return 0;
    },

    highestSuccessfulPassSequence(match, teamID, half = null) {
      let maxSeq = 0;
      for (const ev of match.events) {
        if (
          ev.teamID === teamID &&
          ev.type === "pass" &&
          (half === null || ev.half === half) &&
          typeof ev.successfulPassSequence === "number"
        ) {
          if (ev.successfulPassSequence > maxSeq) {
            maxSeq = ev.successfulPassSequence;
          }
        }
      }
      return maxSeq;
    },

    durationOfHalf(match, half, nowMs = Date.now()) {
      if (match.completedHalfDurations && match.completedHalfDurations[half] !== undefined) {
        return Math.max(0, match.completedHalfDurations[half]);
      }
      if (half === match.currentHalf) {
        return this.elapsedTime(match, nowMs);
      }
      let maxTime = 0;
      for (const ev of match.events) {
        if (ev.half === half && ev.matchTime > maxTime) {
          maxTime = ev.matchTime;
        }
      }
      return maxTime;
    },

    possessionTeamIDAtStart(match, half) {
      if (half <= 1) return match.homeTeam.id;
      for (let i = match.events.length - 1; i >= 0; i--) {
        const ev = match.events[i];
        if (ev.half < half && ev.type === "possessionChange") {
          return ev.teamID;
        }
      }
      return match.homeTeam.id;
    },

    possessionDuration(match, teamID, half, nowMs = Date.now()) {
      const halfDuration = this.durationOfHalf(match, half, nowMs);
      if (halfDuration <= 0) return 0;

      let possessionID = this.possessionTeamIDAtStart(match, half);
      let prevTime = 0;
      let teamDuration = 0;

      for (const ev of match.events) {
        if (ev.half === half && ev.type === "possessionChange") {
          const eventTime = Math.min(halfDuration, Math.max(prevTime, ev.matchTime));
          if (possessionID === teamID) {
            teamDuration += eventTime - prevTime;
          }
          possessionID = ev.teamID;
          prevTime = eventTime;
        }
      }

      if (possessionID === teamID) {
        teamDuration += halfDuration - prevTime;
      }
      return teamDuration;
    },

    possessionPercentage(match, teamID, half = null, nowMs = Date.now()) {
      const halves = half !== null ? [half] : Array.from({ length: Math.max(1, match.currentHalf) }, (_, i) => i + 1);
      const totalDuration = halves.reduce((acc, h) => acc + this.durationOfHalf(match, h, nowMs), 0);
      if (totalDuration <= 0) return 0;
      const teamDuration = halves.reduce((acc, h) => acc + this.possessionDuration(match, teamID, h, nowMs), 0);
      return Math.min(100, Math.max(0, (teamDuration / totalDuration) * 100));
    },

    roundedPossessionPercentages(match, half = null) {
      const homePct = this.possessionPercentage(match, match.homeTeam.id, half);
      const awayPct = this.possessionPercentage(match, match.awayTeam.id, half);
      if (homePct + awayPct <= 0) return { home: 0, away: 0 };
      const roundedHome = Math.round(homePct);
      return { home: roundedHome, away: 100 - roundedHome };
    }
  };

  function buildSummaryText(match) {
    const lines = [
      "Futsal Tracker — Match Summary",
      `${match.homeTeam.name} ${MatchLogic.score(match, match.homeTeam.id)}–${MatchLogic.score(match, match.awayTeam.id)} ${match.awayTeam.name}`,
      `Played: ${formatDate(match.startedAt)}`,
      ""
    ];

    const appendStats = (title, half) => {
      const homeTotals = MatchLogic.totals(match, match.homeTeam.id, half);
      const awayTotals = MatchLogic.totals(match, match.awayTeam.id, half);
      const poss = MatchLogic.roundedPossessionPercentages(match, half);

      lines.push(title);
      lines.push(
        `${match.homeTeam.name} ${MatchLogic.score(match, match.homeTeam.id, half)}–${MatchLogic.score(match, match.awayTeam.id, half)} ${match.awayTeam.name}`
      );
      lines.push(`Possession: ${poss.home}%–${poss.away}%`);
      lines.push(
        `Highest Pass Sequence: ${MatchLogic.highestSuccessfulPassSequence(match, match.homeTeam.id, half)}–${MatchLogic.highestSuccessfulPassSequence(match, match.awayTeam.id, half)}`
      );

      for (const type of SUMMARY_TYPES) {
        lines.push(`${EVENT_META[type].title}: ${homeTotals[type]}–${awayTotals[type]}`);
      }
      lines.push("");
    };

    appendStats("Whole Match", null);
    appendStats("First Half", 1);
    appendStats("Second Half", 2);

    lines.push("Event Log");
    const visible = MatchLogic.visibleEvents(match);
    if (visible.length === 0) {
      lines.push("No events recorded");
    } else {
      for (const ev of visible) {
        lines.push(
          `H${ev.half} ${formatMatchTime(ev.matchTime)} · ${MatchLogic.teamName(match, ev.teamID)} · ${MatchLogic.eventLogTitle(ev)}`
        );
      }
    }

    lines.push("");
    lines.push("Created with Futsal Tracker");
    lines.push("© 2026 Suunnittelu ja laskenta Oy Saga");
    return lines.join("\n");
  }

  function encodeMatchLink(match) {
    const compact = {
      v: 1,
      id: match.id,
      h: match.homeTeam,
      a: match.awayTeam,
      ch: match.currentHalf,
      eb: match.elapsedBeforeRun,
      cd: match.completedHalfDurations,
      st: "finished",
      sa: match.startedAt,
      ea: match.endedAt || new Date().toISOString(),
      ev: match.events.map(e => ({
        i: e.id,
        ai: e.actionID,
        ti: e.teamID,
        t: e.type,
        h: e.half,
        mt: Number(e.matchTime.toFixed(2)),
        ra: e.recordedAt,
        ps: e.successfulPassSequence || undefined
      }))
    };
    const json = JSON.stringify(compact);
    const bytes = new TextEncoder().encode(json);
    let binary = "";
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    const base64url = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    const baseUrl = window.location.origin + window.location.pathname;
    return `${baseUrl}#match=${base64url}`;
  }

  function decodeMatchFromHash() {
    const hash = window.location.hash;
    if (!hash || !hash.startsWith("#match=")) return null;
    try {
      let b64 = hash.slice(7).replace(/-/g, "+").replace(/_/g, "/");
      while (b64.length % 4) b64 += "=";
      const binary = atob(b64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const json = new TextDecoder().decode(bytes);
      const c = JSON.parse(json);
      return {
        id: c.id || generateUUID(),
        homeTeam: c.h,
        awayTeam: c.a,
        currentHalf: c.ch || 2,
        elapsedBeforeRun: c.eb || 0,
        clockStartedAt: null,
        hasClockStarted: true,
        completedHalfDurations: c.cd || {},
        status: "finished",
        startedAt: c.sa || new Date().toISOString(),
        endedAt: c.ea || new Date().toISOString(),
        events: (c.ev || []).map(e => ({
          id: e.i || generateUUID(),
          actionID: e.ai || e.i || generateUUID(),
          teamID: e.ti,
          type: e.t,
          half: e.h,
          matchTime: e.mt || 0,
          recordedAt: e.ra || new Date().toISOString(),
          successfulPassSequence: e.ps ?? null
        }))
      };
    } catch (err) {
      console.error("Failed to decode shared match link:", err);
      return null;
    }
  }

  const Store = {
    match: null,
    latestStatistics: null,
    viewingArchived: false,
    viewingLegal: false,
    sharedMatch: null,
    setupDraft: { home: "", away: "" },

    init() {
      try {
        const savedActive = localStorage.getItem(STORAGE_KEYS.ACTIVE_MATCH);
        if (savedActive) this.match = JSON.parse(savedActive);
      } catch (e) {
        this.match = null;
      }

      try {
        const savedLatest = localStorage.getItem(STORAGE_KEYS.LATEST_STATS);
        if (savedLatest) this.latestStatistics = JSON.parse(savedLatest);
        if (!this.latestStatistics && this.match && this.match.status === "finished") {
          this.latestStatistics = this.match;
          localStorage.setItem(STORAGE_KEYS.LATEST_STATS, JSON.stringify(this.match));
        }
      } catch (e) {
        this.latestStatistics = null;
      }

      const incomingShared = decodeMatchFromHash();
      if (incomingShared) {
        this.sharedMatch = incomingShared;
        this.viewingArchived = true;
      }
    },

    persist() {
      if (!this.match) return;
      try {
        localStorage.setItem(STORAGE_KEYS.ACTIVE_MATCH, JSON.stringify(this.match));
      } catch (e) {
        showToast("Local save error");
      }
    },

    archiveLatest(matchObj) {
      try {
        localStorage.setItem(STORAGE_KEYS.LATEST_STATS, JSON.stringify(matchObj));
        this.latestStatistics = matchObj;
      } catch (e) {
        showToast("Could not archive latest statistics");
      }
    },

    startMatch(homeName, awayName) {
      const h = homeName.trim();
      const a = awayName.trim();
      if (!h || !a) return;

      this.match = {
        id: generateUUID(),
        homeTeam: { id: generateUUID(), name: h },
        awayTeam: { id: generateUUID(), name: a },
        events: [],
        currentHalf: 1,
        elapsedBeforeRun: 0,
        clockStartedAt: null,
        hasClockStarted: false,
        completedHalfDurations: {},
        status: "active",
        startedAt: new Date().toISOString(),
        endedAt: null
      };
      this.setupDraft = { home: "", away: "" };
      this.persist();
      render();
    },

    toggleClock() {
      if (!this.match || this.match.status !== "active") return;
      const nowMs = Date.now();
      if (MatchLogic.isClockRunning(this.match)) {
        this.match.elapsedBeforeRun = MatchLogic.elapsedTime(this.match, nowMs);
        this.match.clockStartedAt = null;
      } else {
        this.match.clockStartedAt = new Date(nowMs).toISOString();
        this.match.hasClockStarted = true;
      }
      this.persist();
      render();
    },

    record(type, teamID) {
      const m = this.match;
      if (!m || m.status !== "active") return;
      if (teamID !== m.homeTeam.id && teamID !== m.awayTeam.id) return;
      if (!RECORDABLE_TYPES.includes(type)) return;

      const nowMs = Date.now();
      const nowISO = new Date(nowMs).toISOString();

      if (m.hasClockStarted && !MatchLogic.isClockRunning(m)) {
        m.clockStartedAt = nowISO;
      }

      const eventTime = MatchLogic.elapsedTime(m, nowMs);
      const actionID = generateUUID();

      const appendEvent = (evType, evTeamID, passSeq = null) => {
        m.events.push({
          id: generateUUID(),
          actionID,
          teamID: evTeamID,
          type: evType,
          half: m.currentHalf,
          matchTime: eventTime,
          recordedAt: nowISO,
          successfulPassSequence: passSeq
        });
      };

      const appendPossessionIfNeeded = targetTeamID => {
        if (MatchLogic.currentPossessionTeamID(m) !== targetTeamID) {
          appendEvent("possessionChange", targetTeamID);
        }
      };

      if (type === "foul") {
        const foulsBefore = MatchLogic.totals(m, teamID, m.currentHalf).foul;
        appendEvent("foul", teamID);
        const oppID = MatchLogic.opponentID(m, teamID);
        if (oppID) {
          appendPossessionIfNeeded(oppID);
          if (foulsBefore >= 5) {
            appendEvent("freeKick10m", oppID);
          }
        }
      } else if (type === "pass") {
        const prevPossID = MatchLogic.currentPossessionTeamID(m);
        const seq = prevPossID === teamID
          ? MatchLogic.currentSuccessfulPassSequence(m, teamID, m.currentHalf) + 1
          : null;
        appendEvent("pass", teamID, seq);
        if (prevPossID !== teamID) {
          if (prevPossID) appendEvent("turnover", prevPossID);
          appendPossessionIfNeeded(teamID);
        }
      } else if (type === "goal") {
        appendEvent("goal", teamID);
        const oppID = MatchLogic.opponentID(m, teamID);
        if (oppID) appendPossessionIfNeeded(oppID);
      } else if (type === "shot" || type === "corner") {
        appendEvent(type, teamID);
      }

      this.persist();
      render();
    },

    undoLastEvent() {
      const m = this.match;
      if (!m || m.status !== "active" || m.events.length === 0) return;
      const lastActionID = m.events[m.events.length - 1].actionID;
      m.events = m.events.filter(ev => ev.actionID !== lastActionID);
      this.persist();
      render();
    },

    startSecondHalf() {
      const m = this.match;
      if (!m || m.status !== "active" || m.currentHalf !== 1) return;
      const nowMs = Date.now();
      m.completedHalfDurations[1] = MatchLogic.elapsedTime(m, nowMs);
      m.currentHalf = 2;
      m.elapsedBeforeRun = 0;
      m.clockStartedAt = null;
      this.persist();
      render();
    },

    endMatch() {
      const m = this.match;
      if (!m || m.status !== "active") return;
      const nowMs = Date.now();
      m.elapsedBeforeRun = MatchLogic.elapsedTime(m, nowMs);
      m.completedHalfDurations[m.currentHalf] = m.elapsedBeforeRun;
      m.clockStartedAt = null;
      m.status = "finished";
      m.endedAt = new Date(nowMs).toISOString();
      this.persist();
      this.archiveLatest(m);
      render();
    },

    startNewMatch() {
      if (this.match && this.match.status === "finished") {
        this.archiveLatest(this.match);
      }
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_MATCH);
      this.match = null;
      this.viewingArchived = false;
      this.sharedMatch = null;
      if (window.location.hash.startsWith("#match=")) {
        history.replaceState(null, "", window.location.pathname);
      }
      render();
    },

    saveSharedToDevice() {
      if (!this.sharedMatch) return;
      this.archiveLatest(this.sharedMatch);
      this.sharedMatch = null;
      if (window.location.hash.startsWith("#match=")) {
        history.replaceState(null, "", window.location.pathname);
      }
      showToast("Saved to Latest Statistics");
      render();
    }
  };

  let toastTimeout = null;
  function showToast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.remove("hidden");
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.add("hidden"), 2600);
  }

  function showModal({ title, message, actions }) {
    const overlay = document.getElementById("modal-overlay");
    document.getElementById("modal-title").textContent = title;
    document.getElementById("modal-message").textContent = message;
    const actionsEl = document.getElementById("modal-actions");
    actionsEl.innerHTML = "";

    for (const act of actions) {
      const btn = document.createElement("button");
      btn.className = `btn ${act.style || "btn-secondary"}`;
      btn.textContent = act.label;
      btn.onclick = () => {
        overlay.classList.add("hidden");
        if (act.onClick) act.onClick();
      };
      actionsEl.appendChild(btn);
    }
    overlay.classList.remove("hidden");
  }

  async function shareOrCopy(payload, fallbackToast) {
    if (navigator.share) {
      try {
        await navigator.share(payload);
        return;
      } catch (err) {
        if (err.name === "AbortError") return;
      }
    }
    const textToCopy = payload.url || payload.text;
    try {
      await navigator.clipboard.writeText(textToCopy);
      showToast(fallbackToast);
    } catch {
      prompt("Copy to share:", textToCopy);
    }
  }

  function renderBrandHeader(wide = false) {
    if (wide) {
      return `
        <img src="FutsalTrackerWideBrand.png" alt="19163, in the game, by SLK Saga" class="brand-wide-img"
             onerror="this.style.display='none'" />
      `;
    }
    return `
      <div class="brand-card">
        <img src="FutsalTrackerBrand.png" alt="19163, in the game, by SLK Saga" class="brand-img"
             onerror="this.style.display='none'; this.nextElementSibling.classList.remove('hidden');" />
        <div class="brand-fallback hidden">
          <div class="brand-fallback-title">FUTSAL TRACKER</div>
          <div class="brand-fallback-sub">19163 · In the game · by SLK Saga</div>
        </div>
      </div>
    `;
  }

  function renderSetupView(container) {
    document.getElementById("nav-title").textContent = "Futsal Tracker";
    document.getElementById("back-btn").classList.add("hidden");

    const latest = Store.latestStatistics;
    const latestSection = latest
      ? `
        <div>
          <div class="section-label">Saved Statistics</div>
          <button id="view-latest-btn" class="btn-row-item">
            <span>🕒 View Latest Statistics</span>
            <strong>${MatchLogic.score(latest, latest.homeTeam.id)}–${MatchLogic.score(latest, latest.awayTeam.id)}</strong>
          </button>
        </div>
      `
      : "";

    container.innerHTML = `
      ${renderBrandHeader(false)}

      <div>
        <div class="section-label">Teams</div>
        <div class="input-group">
          <div class="input-row">
            <input id="home-input" class="text-input" type="text" placeholder="Home team" autocapitalize="words" value="${escapeHTML(Store.setupDraft.home)}" />
          </div>
          <div class="input-row">
            <input id="away-input" class="text-input" type="text" placeholder="Away team" autocapitalize="words" value="${escapeHTML(Store.setupDraft.away)}" />
          </div>
        </div>
        <div class="section-footer">The match is saved on this device. Tap the clock to start play.</div>
      </div>

      <button id="start-match-btn" class="btn btn-primary" disabled>▶ Start Match</button>

      ${latestSection}
    `;

    const homeInput = document.getElementById("home-input");
    const awayInput = document.getElementById("away-input");
    const startBtn = document.getElementById("start-match-btn");

    const updateStartState = () => {
      Store.setupDraft.home = homeInput.value;
      Store.setupDraft.away = awayInput.value;
      startBtn.disabled = !homeInput.value.trim() || !awayInput.value.trim();
    };

    homeInput.addEventListener("input", updateStartState);
    awayInput.addEventListener("input", updateStartState);
    updateStartState();

    startBtn.addEventListener("click", () => {
      Store.startMatch(homeInput.value, awayInput.value);
    });

    if (latest) {
      document.getElementById("view-latest-btn").addEventListener("click", () => {
        Store.viewingArchived = true;
        render();
      });
    }
  }

  function renderLiveMatchView(container) {
    const match = Store.match;
    document.getElementById("nav-title").textContent = "Live Match";
    document.getElementById("back-btn").classList.add("hidden");

    const isRunning = MatchLogic.isClockRunning(match);
    const possID = MatchLogic.currentPossessionTeamID(match);
    const isAwayPoss = possID === match.awayTeam.id;
    const homeScore = MatchLogic.score(match, match.homeTeam.id);
    const awayScore = MatchLogic.score(match, match.awayTeam.id);

    const homeHalfTotals = MatchLogic.totals(match, match.homeTeam.id, match.currentHalf);
    const awayHalfTotals = MatchLogic.totals(match, match.awayTeam.id, match.currentHalf);

    const renderTeamColumn = (team, totals, sideClass) => {
      const buttonsHTML = RECORDABLE_TYPES.map(type => {
        const meta = EVENT_META[type];
        const passClass = type === "pass" ? "pass-btn" : "";
        return `
          <button class="event-btn ${sideClass} ${passClass}" data-team="${team.id}" data-type="${type}">
            <span>${meta.icon} ${meta.title}</span>
            <span class="event-count">${totals[type]}</span>
          </button>
        `;
      }).join("");

      return `
        <div class="team-column">
          <div class="team-col-header">${escapeHTML(team.name)}</div>
          ${buttonsHTML}
        </div>
      `;
    };

    const visibleEvents = MatchLogic.visibleEvents(match);
    const lastEvent = visibleEvents[visibleEvents.length - 1];
    const recentHTML = lastEvent
      ? `
        <div class="recent-row">
          <div>
            <span>${EVENT_META[lastEvent.type]?.icon || ""}</span>
            <strong>${escapeHTML(MatchLogic.teamName(match, lastEvent.teamID))}</strong>
            <span>${escapeHTML(MatchLogic.eventLogTitle(lastEvent))}</span>
          </div>
          <span class="log-sub">H${lastEvent.half} ${formatMatchTime(lastEvent.matchTime)}</span>
        </div>
      `
      : `<div class="log-sub">No events recorded</div>`;

    const clockBtnLabel = isRunning
      ? "⏸ Pause Clock"
      : match.hasClockStarted
      ? "▶ Resume Clock"
      : "▶ Start Clock";

    const secondHalfBtn =
      match.currentHalf === 1
        ? `<button id="second-half-btn" class="btn btn-secondary">⏭ Start Second Half</button>`
        : "";

    container.innerHTML = `
      <div class="card">
        ${renderBrandHeader(true)}
        <div class="scoreboard-banner ${isAwayPoss ? "away-possession" : "home-possession"}">
          <div class="team-banner-name">${escapeHTML(match.homeTeam.name)}</div>
          <div class="score-digits">${homeScore}–${awayScore}</div>
          <div class="team-banner-name">${escapeHTML(match.awayTeam.name)}</div>
        </div>
        <div class="possession-pill">Possession: ${escapeHTML(MatchLogic.teamName(match, possID))}</div>
      </div>

      <div class="card clock-bar">
        <span class="half-label">🏟 Half ${match.currentHalf}</span>
        <button id="clock-tap-btn" class="clock-btn">${formatMatchTime(MatchLogic.elapsedTime(match))}</button>
        <span class="clock-status-dot ${isRunning ? "running" : "paused"}" title="${isRunning ? "Running" : "Paused"}"></span>
      </div>

      <div class="columns-grid">
        ${renderTeamColumn(match.homeTeam, homeHalfTotals, "home-btn")}
        ${renderTeamColumn(match.awayTeam, awayHalfTotals, "away-btn")}
      </div>

      <div class="recent-box">
        <div class="recent-caption">Most Recent Event</div>
        ${recentHTML}
      </div>

      <button id="undo-btn" class="btn btn-destructive" ${match.events.length === 0 ? "disabled" : ""}>
        ↩ Undo Last Event
      </button>

      <div class="stack-10">
        <button id="toggle-clock-btn" class="btn btn-primary">${clockBtnLabel}</button>
        ${secondHalfBtn}
        <button id="end-match-btn" class="btn btn-destructive">End Match</button>
      </div>
    `;

    document.getElementById("clock-tap-btn").addEventListener("click", () => Store.toggleClock());
    document.getElementById("toggle-clock-btn").addEventListener("click", () => Store.toggleClock());
    document.getElementById("undo-btn").addEventListener("click", () => Store.undoLastEvent());

    container.querySelectorAll(".event-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        Store.record(btn.dataset.type, btn.dataset.team);
      });
    });

    if (match.currentHalf === 1) {
      document.getElementById("second-half-btn").addEventListener("click", () => {
        showModal({
          title: "Start the second half?",
          message: "The half changes to 2. Fouls and the clock reset to zero, and the clock pauses.",
          actions: [
            { label: "Start Second Half", style: "btn-primary", onClick: () => Store.startSecondHalf() },
            { label: "Cancel", style: "btn-secondary" }
          ]
        });
      });
    }

    document.getElementById("end-match-btn").addEventListener("click", () => {
      showModal({
        title: "End this match?",
        message: "Final statistics will be calculated and saved.",
        actions: [
          { label: "End Match", style: "btn-destructive", onClick: () => Store.endMatch() },
          { label: "Cancel", style: "btn-secondary" }
        ]
      });
    });
  }

  function renderSummaryView(container, match, isArchived) {
    document.getElementById("nav-title").textContent = isArchived ? "Latest Statistics" : "Match Statistics";
    const backBtn = document.getElementById("back-btn");
    if (isArchived) {
      backBtn.classList.remove("hidden");
      backBtn.onclick = () => {
        Store.viewingArchived = false;
        Store.sharedMatch = null;
        if (window.location.hash.startsWith("#match=")) {
          history.replaceState(null, "", window.location.pathname);
        }
        render();
      };
    } else {
      backBtn.classList.add("hidden");
    }

    const renderStatsCard = (title, half) => {
      const homeTotals = MatchLogic.totals(match, match.homeTeam.id, half);
      const awayTotals = MatchLogic.totals(match, match.awayTeam.id, half);
      const poss = MatchLogic.roundedPossessionPercentages(match, half);
      const homeSeq = MatchLogic.highestSuccessfulPassSequence(match, match.homeTeam.id, half);
      const awaySeq = MatchLogic.highestSuccessfulPassSequence(match, match.awayTeam.id, half);

      const rows = SUMMARY_TYPES.map(
        type => `
          <tr>
            <td>${EVENT_META[type].icon} ${EVENT_META[type].title}</td>
            <td>${homeTotals[type]}</td>
            <td>${awayTotals[type]}</td>
          </tr>
        `
      ).join("");

      return `
        <div>
          <div class="section-label">${title}</div>
          <div class="card">
            <table class="stats-table">
              <thead>
                <tr>
                  <th>Event</th>
                  <th>${escapeHTML(match.homeTeam.name)}</th>
                  <th>${escapeHTML(match.awayTeam.name)}</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>📊 Possession</td>
                  <td>${poss.home}%</td>
                  <td>${poss.away}%</td>
                </tr>
                <tr>
                  <td>🔗 Highest Pass Seq.</td>
                  <td>${homeSeq}</td>
                  <td>${awaySeq}</td>
                </tr>
                ${rows}
              </tbody>
            </table>
          </div>
        </div>
      `;
    };

    const visibleEvents = MatchLogic.visibleEvents(match);
    const eventsHTML =
      visibleEvents.length === 0
        ? `<div class="log-sub">No events recorded</div>`
        : visibleEvents
            .map(
              ev => `
            <div class="log-item">
              <div>
                <div><strong>${EVENT_META[ev.type]?.icon || ""} ${escapeHTML(MatchLogic.teamName(match, ev.teamID))}</strong> · ${escapeHTML(MatchLogic.eventLogTitle(ev))}</div>
                <div class="log-sub">Half ${ev.half}</div>
              </div>
              <div class="log-time">${formatMatchTime(ev.matchTime)}</div>
            </div>
          `
            )
            .join("");

    const saveSharedBtn = Store.sharedMatch
      ? `<button id="save-shared-btn" class="btn btn-primary">💾 Save Match to My Device</button>`
      : "";

    const newMatchBtn = !isArchived
      ? `<button id="new-match-btn" class="btn btn-secondary">➕ Start New Match</button>`
      : "";

    container.innerHTML = `
      <div class="stack-10">
        ${saveSharedBtn}
        <button id="share-text-btn" class="btn btn-primary">📤 Share Summary (Text)</button>
        <button id="share-link-btn" class="btn btn-secondary">🔗 Share Interactive Match Link</button>
        ${newMatchBtn}
        <div class="section-footer">Share text directly to WhatsApp/Messages, or send the link so teammates can open & save the full match stats on their phone.</div>
      </div>

      <div>
        <div class="section-label">Final Score</div>
        <div class="card final-score-grid">
          <div>
            <div class="team-banner-name">${escapeHTML(match.homeTeam.name)}</div>
            <div class="final-score-num">${MatchLogic.score(match, match.homeTeam.id)}</div>
          </div>
          <div class="final-score-num">–</div>
          <div>
            <div class="team-banner-name">${escapeHTML(match.awayTeam.name)}</div>
            <div class="final-score-num">${MatchLogic.score(match, match.awayTeam.id)}</div>
          </div>
        </div>
      </div>

      ${renderStatsCard("Whole Match", null)}
      ${renderStatsCard("First Half", 1)}
      ${renderStatsCard("Second Half", 2)}

      <div>
        <div class="section-label">Event Log</div>
        <div class="card">${eventsHTML}</div>
      </div>
    `;

    document.getElementById("share-text-btn").addEventListener("click", () => {
      shareOrCopy({ text: buildSummaryText(match) }, "Match summary copied to clipboard");
    });

    document.getElementById("share-link-btn").addEventListener("click", () => {
      const url = encodeMatchLink(match);
      shareOrCopy(
        {
          title: `${match.homeTeam.name} vs ${match.awayTeam.name}`,
          text: `${match.homeTeam.name} ${MatchLogic.score(match, match.homeTeam.id)}–${MatchLogic.score(match, match.awayTeam.id)} ${match.awayTeam.name}`,
          url
        },
        "Shareable match link copied!"
      );
    });

    if (Store.sharedMatch) {
      document.getElementById("save-shared-btn").addEventListener("click", () => {
        Store.saveSharedToDevice();
      });
    }

    if (!isArchived) {
      document.getElementById("new-match-btn").addEventListener("click", () => {
        Store.startNewMatch();
      });
    }
  }

  function renderLegalView(container) {
    document.getElementById("nav-title").textContent = "Legal";
    const backBtn = document.getElementById("back-btn");
    backBtn.classList.remove("hidden");
    backBtn.onclick = () => {
      Store.viewingLegal = false;
      render();
    };

    container.innerHTML = `
      ${renderBrandHeader(false)}
      <div class="card stack-10">
        <div>
          <strong>Futsal Tracker</strong>
          <div class="log-sub">Web App Edition · Version 1.0 (1)</div>
        </div>
        <hr style="border:none;border-top:1px solid var(--border-color);width:100%;" />
        <div>
          <strong>Copyright</strong>
          <p class="legal-text">© 2026 Suunnittelu ja laskenta Oy Saga. All rights reserved.</p>
        </div>
        <hr style="border:none;border-top:1px solid var(--border-color);width:100%;" />
        <div>
          <strong>Personal Use & Team Sharing</strong>
          <p class="legal-text">All match statistics are stored locally on your device. Shared match links encode match data directly inside the URL without external servers.</p>
          <p class="legal-text"><a class="legal-link" href="LICENSE.txt" target="_blank" rel="license noopener">Read the full personal-use license</a></p>
        </div>
      </div>
    `;
  }

  function render() {
    const container = document.getElementById("view-container");
    if (Store.viewingLegal) {
      renderLegalView(container);
      return;
    }
    if (Store.viewingArchived) {
      const target = Store.sharedMatch || Store.latestStatistics;
      if (target) {
        renderSummaryView(container, target, true);
        return;
      }
    }
    if (Store.match?.status === "active") {
      renderLiveMatchView(container);
    } else if (Store.match?.status === "finished") {
      renderSummaryView(container, Store.match, false);
    } else {
      renderSetupView(container);
    }
  }

  setInterval(() => {
    if (!Store.viewingLegal && !Store.viewingArchived && Store.match?.status === "active" && MatchLogic.isClockRunning(Store.match)) {
      const clockBtn = document.getElementById("clock-tap-btn");
      if (clockBtn) {
        clockBtn.textContent = formatMatchTime(MatchLogic.elapsedTime(Store.match));
      }
    }
  }, 250);

  document.getElementById("legal-btn").addEventListener("click", () => {
    Store.viewingLegal = !Store.viewingLegal;
    render();
  });

  window.addEventListener("hashchange", () => {
    const incoming = decodeMatchFromHash();
    if (incoming) {
      Store.sharedMatch = incoming;
      Store.viewingArchived = true;
      Store.viewingLegal = false;
      render();
    }
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }

  Store.init();
  render();
})();
