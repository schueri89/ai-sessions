'use strict';

// Shared HTML5 Canvas office floor view used by both BoardPanel (sub-tab) and OfficePanel (popout).

const OFFICE_ACTIVE_STATES = ['waiting', 'busy', 'bookmarked', 'idle'];

const PROVIDER_PALETTE = {
  claude: { label: 'Claude Code', color: '#E87040', shirt: '#D96336', hair: '#3B281E' },
  antigravity: { label: 'Antigravity', color: '#4B8BF4', shirt: '#3B78DB', hair: '#1E293B' },
  copilot: { label: 'GitHub Copilot', color: '#9D6BFF', shirt: '#7C4DFF', hair: '#4A3728' },
  codex: { label: 'OpenAI Codex', color: '#2FA87E', shirt: '#238A66', hair: '#2D2D2D' },
  cline: { label: 'Cline', color: '#06B6D4', shirt: '#0891B2', hair: '#1F2937' }
};

function buildOfficeLayout(columns, previousSlots, options = {}) {
  const colsPerRow = Math.max(2, Number(options.colsPerRow) || 4);
  const maxDesks = options && options.maxDesks !== undefined && options.maxDesks !== null
    ? Math.max(4, Number(options.maxDesks))
    : Infinity;
  const activeSet = new Set(Array.isArray(options.activeStates) ? options.activeStates : OFFICE_ACTIVE_STATES);

  const flatSessions = [];
  const colList = Array.isArray(columns) ? columns : [];
  for (const col of colList) {
    if (!col || !activeSet.has(col.state) || !Array.isArray(col.sessions)) continue;
    for (const s of col.sessions) {
      if (!s || !s.sessionId) continue;
      flatSessions.push({
        ...s,
        state: col.state,
        stateLabel: col.label || col.state
      });
    }
  }

  // Sort desks by date (newest first).
  flatSessions.sort((a, b) => (Number(b.statusUpdatedAt) || 0) - (Number(a.statusUpdatedAt) || 0));

  const bounded = Number.isFinite(maxDesks) ? flatSessions.slice(0, maxDesks) : flatSessions;
  const nextSlots = new Map();
  bounded.forEach((s, idx) => {
    nextSlots.set(s.sessionId, idx);
  });

  const maxSlot = bounded.length > 0 ? bounded.length - 1 : 0;
  const rows = Math.max(2, Math.ceil(Math.max(bounded.length, maxSlot + 1) / colsPerRow));
  const deskWidth = 100;
  const deskStepX = 148;
  const deskStepY = 108;
  const originX = 48;
  const originY = 58;
  const loungeWidth = 128;
  const canvasWidth = originX + colsPerRow * deskStepX + loungeWidth;
  const canvasHeight = Math.max(276, originY + rows * deskStepY + 24);

  const items = bounded.map((s) => {
    const slot = nextSlots.get(s.sessionId) || 0;
    const colIdx = slot % colsPerRow;
    const rowIdx = Math.floor(slot / colsPerRow);
    return {
      ...s,
      slot,
      desk: {
        x: originX + colIdx * deskStepX,
        y: originY + rowIdx * deskStepY,
        w: deskWidth
      }
    };
  });

  return {
    items,
    slots: nextSlots,
    rows,
    colsPerRow,
    canvasWidth,
    canvasHeight,
    totalActive: flatSessions.length,
    truncated: flatSessions.length > bounded.length
  };
}

function getOfficeStyles() {
  return `
  .office-view {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
  }
  .office-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 12px;
    border-radius: 6px;
    background: var(--vscode-editorWidget-background, rgba(128, 128, 128, 0.08));
    border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
  }
  .office-toolbar-left {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }
  .office-toolbar-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .office-legend {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
    font-size: 12px;
    color: var(--vscode-descriptionForeground);
  }
  .office-legend-item {
    display: inline-flex;
    align-items: center;
    gap: 5px;
  }
  .office-legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
  }
  .office-popout-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.3));
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  .office-popout-btn:hover {
    background: var(--vscode-button-secondaryHoverBackground);
  }
  .office-canvas-wrap {
    position: relative;
    width: 100%;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.25));
    background: var(--vscode-editor-background);
  }
  .office-canvas {
    display: block;
    width: 100%;
    height: auto;
    image-rendering: pixelated;
    cursor: default;
  }
  .office-tooltip {
    position: absolute;
    pointer-events: none;
    z-index: 20;
    max-width: 280px;
    padding: 6px 9px;
    border-radius: 5px;
    font-size: 11.5px;
    line-height: 1.35;
    background: var(--vscode-editorHoverWidget-background, #1e293b);
    color: var(--vscode-editorHoverWidget-foreground, #f8fafc);
    border: 1px solid var(--vscode-editorHoverWidget-border, rgba(148, 163, 184, 0.35));
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
    display: none;
  }
  .office-inspector {
    position: sticky;
    top: 6px;
    z-index: 15;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 9px 12px;
    border-radius: 6px;
    min-height: 38px;
    font-size: 12.5px;
    background: var(--vscode-editorWidget-background, var(--vscode-editor-background, #1e1e1e));
    border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.25));
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.14);
  }
  .office-inspector-info {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    color: var(--vscode-descriptionForeground);
    min-width: 0;
  }
  .office-inspector-title {
    font-weight: 600;
    color: var(--vscode-foreground);
  }
  .office-inspector-actions {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }
  .office-act-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 9px;
    border-radius: 4px;
    font-size: 12px;
    cursor: pointer;
    border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.3));
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }
  .office-act-btn:hover {
    background: var(--vscode-button-secondaryHoverBackground);
  }
  .office-act-btn.primary {
    border-color: transparent;
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
    font-weight: 500;
  }
  .office-act-btn.primary:hover {
    background: var(--vscode-button-hoverBackground);
  }
  .office-popout-filters {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .office-popout-select {
    font-size: 12px;
    padding: 3px 8px;
    border-radius: 4px;
    background: var(--vscode-dropdown-background, var(--vscode-input-background));
    color: var(--vscode-dropdown-foreground, var(--vscode-foreground));
    border: 1px solid var(--vscode-dropdown-border, var(--vscode-widget-border, rgba(128, 128, 128, 0.3)));
  }
  .office-popout-hint {
    font-size: 11.5px;
    color: var(--vscode-descriptionForeground);
  }`;
}

function getOfficeHtml(options = {}) {
  const isPopout = Boolean(options.isPopout);
  const popoutFilters = isPopout
    ? `<div class="office-popout-filters">
        <select id="office-provider-select" class="office-popout-select" title="Nach Provider filtern">
          <option value="all">Alle Provider</option>
          <option value="claude">Claude Code</option>
          <option value="antigravity">Antigravity</option>
          <option value="copilot">Copilot</option>
          <option value="codex">Codex</option>
          <option value="cline">Cline</option>
        </select>
        <select id="office-project-select" class="office-popout-select" title="Nach Projekt filtern">
          <option value="all">Alle Projekte</option>
        </select>
      </div>`
    : '';
  const rightAction = isPopout
    ? '<span class="office-popout-hint" title="Tab per Rechtsklick in ein neues Fenster verschieben, um es dauerhaft auf einem zweiten Monitor anzuzeigen.">Tipp: Rechtsklick auf Tab → „In neues Fenster verschieben“</span>'
    : '<button type="button" class="office-popout-btn" id="btn-office-popout" title="Büro-Ansicht im eigenen Tab öffnen (ideal für Zweitmonitor)">↗ Popout</button>';

  return `
  <div class="office-toolbar">
    <div class="office-toolbar-left">
      ${popoutFilters}
      <div class="office-legend" id="office-legend"></div>
    </div>
    <div class="office-toolbar-right">
      <span id="office-truncation-note" class="office-popout-hint" style="display: none;"></span>
      ${rightAction}
    </div>
  </div>
  <div class="office-inspector" id="office-inspector">
    <div class="office-inspector-info" id="office-inspector-info">
      Klicke auf einen Schreibtisch im Büro, um Details zu sehen; Doppelklick öffnet direkt den Chat.
    </div>
    <div class="office-inspector-actions" id="office-inspector-actions"></div>
  </div>
  <div class="office-canvas-wrap">
    <canvas class="office-canvas" id="office-canvas" width="768" height="276"></canvas>
    <div class="office-tooltip" id="office-tooltip"></div>
  </div>`;
}

function getOfficeClientScript(options = {}) {
  const isPopout = Boolean(options.isPopout);
  return `
  (function () {
    const IS_POPOUT = ${isPopout ? 'true' : 'false'};
    const OFFICE_ACTIVE_STATES = ${JSON.stringify(OFFICE_ACTIVE_STATES)};
    const PROVIDER_PALETTE = ${JSON.stringify(PROVIDER_PALETTE)};
    const STATE_META = {
      waiting: { label: 'Wartet auf dich', color: '#F59E0B' },
      busy: { label: 'Arbeitet', color: '#3B82F6' },
      bookmarked: { label: 'Gemerkt', color: '#A855F7' },
      idle: { label: 'Fertig', color: '#22C55E' }
    };

    const buildOfficeLayout = ${buildOfficeLayout.toString()};

    const canvas = document.getElementById('office-canvas');
    const ctx = canvas ? canvas.getContext('2d') : null;
    const legendEl = document.getElementById('office-legend');
    const truncEl = document.getElementById('office-truncation-note');
    const tooltipEl = document.getElementById('office-tooltip');
    const infoEl = document.getElementById('office-inspector-info');
    const actionsEl = document.getElementById('office-inspector-actions');
    const popoutBtn = document.getElementById('btn-office-popout');
    const providerSelect = document.getElementById('office-provider-select');
    const projectSelect = document.getElementById('office-project-select');

    const MAX_COFFEE_QUEUE = 3;
    const IDLE_COLD_COFFEE_MS = 30 * 60 * 1000;
    const CELEBRATE_DURATION_MS = 2200;
    const BREW_DURATION_MS = 2600;
    const MAX_AT_COFFEE_MS = 12000;

    let deskSlots = new Map();
    let layout = { items: [], rows: 2, colsPerRow: 4, canvasWidth: 768, canvasHeight: 276, totalActive: 0, truncated: false };
    let selectedId = null;
    let hoveredId = null;
    let tick = 0;
    let lastFrameAt = Date.now();
    let rafId = null;
    let isActive = IS_POPOUT;
    let hasInitializedActors = false;
    const celebrationUntil = new Map();
    const actors = new Map();
    const handledCompletionAt = new Map();
    let confetti = [];
    const vacuum = { x: 46, dir: 1 };

    if (popoutBtn) {
      popoutBtn.addEventListener('click', () => {
        vscode.postMessage({ action: 'openOfficePopout' });
      });
    }
    if (providerSelect) {
      providerSelect.addEventListener('change', () => {
        vscode.postMessage({ action: 'setFilter', filter: providerSelect.value });
      });
    }
    if (projectSelect) {
      projectSelect.addEventListener('change', () => {
        vscode.postMessage({ action: 'setProjectFilter', filter: projectSelect.value });
      });
    }

    function escapeHtml(val) {
      return String(val || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function parseRgbColor(str) {
      if (!str) return null;
      const s = str.trim();
      if (s.startsWith('#') && s.length >= 7) {
        return [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
      }
      const m = s.match(/rgba?\\(\\s*(\\d+)\\s*,\\s*(\\d+)\\s*,\\s*(\\d+)/i);
      if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
      return null;
    }

    function isLightTheme() {
      if (document.body.classList.contains('vscode-light') || document.body.classList.contains('vscode-high-contrast-light')) {
        return true;
      }
      const bg = getComputedStyle(document.body).backgroundColor;
      const rgb = parseRgbColor(bg);
      if (rgb) {
        return (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000 > 140;
      }
      return false;
    }

    function getThemePalette() {
      const style = getComputedStyle(document.body);
      const focusBorder = style.getPropertyValue('--vscode-focusBorder').trim() || '#3B82F6';
      if (isLightTheme()) {
        return {
          floorA: '#EAE7DC',
          floorB: '#E2DFD3',
          wall: '#D3CFC2',
          carpet: '#DCE3EB',
          carpetBorder: '#B9C7D6',
          deskTop: '#C99B6B',
          deskEdge: '#9E7247',
          monitorFrame: '#334155',
          chair: '#475569',
          text: '#1E293B',
          muted: '#475569',
          badgeBg: 'rgba(255, 255, 255, 0.92)',
          selectRing: focusBorder
        };
      }
      return {
        floorA: '#1A1D24',
        floorB: '#1E222B',
        wall: '#272C37',
        carpet: '#222836',
        carpetBorder: '#344055',
        deskTop: '#8C6239',
        deskEdge: '#634222',
        monitorFrame: '#0F172A',
        chair: '#475569',
        text: '#E2E8F0',
        muted: '#94A3B8',
        badgeBg: 'rgba(15, 23, 42, 0.88)',
        selectRing: focusBorder
      };
    }

    function px(x, y, w, h, color) {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
    }

    function hashId(str) {
      const s = String(str || '');
      let h = 2166136261;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    }

    function getTimeOfDay(now) {
      const hour = new Date(now).getHours();
      if (hour >= 6 && hour < 18) return 'day';
      if (hour >= 18 && hour < 21) return 'evening';
      return 'night';
    }

    function isRateLimitedActive(session, now) {
      if (!session || !session.rateLimit) return false;
      const resetsAt = Number(session.rateLimit.resetsAt) || 0;
      return !(resetsAt > 0 && now >= resetsAt);
    }

    function isRateLimitPast(session, now) {
      if (!session || !session.rateLimit) return false;
      const resetsAt = Number(session.rateLimit.resetsAt) || 0;
      return resetsAt > 0 && now >= resetsAt;
    }

    function classifyBusyActivity(activity) {
      const text = String(activity || '').toLowerCase();
      if (/🛠️|bash|command|terminal|exec|npm|git|build|test|run_command|shell|deploy|compile/.test(text)) {
        return 'terminal';
      }
      if (/📖|🔍|read|view|grep|search|find|list|glob|liest|sucht|prüft/.test(text)) {
        return 'read';
      }
      if (/🧠|think|denkt|plan|überleg/.test(text)) {
        return 'think';
      }
      return 'write';
    }

    function classifyWaitingType(session, now) {
      if (isRateLimitPast(session, now)) return 'limitPast';
      const combined = (String(session.waitingFor || '') + ' ' + String(session.detail || '')).toLowerCase();
      if (/permission|freigabe|sandbox|approval|confirm|dialog/.test(combined)) return 'permission';
      return 'question';
    }

    function getCoffeeSlotCoords(slotIdx) {
      const kx = canvas.width - 96;
      const ky = 58;
      if (slotIdx === 0) return { x: kx - 52, y: ky + 2 };
      if (slotIdx === 1) return { x: kx - 56, y: ky + 36 };
      return { x: kx - 56, y: ky + 70 };
    }

    function getCorridorX() {
      return canvas.width - 170;
    }

    function getSeatCoords(session) {
      return { x: session.desk.x + 11, y: session.desk.y - 6 };
    }

    function countActiveCoffeeActors() {
      let count = 0;
      actors.forEach((a) => {
        if (a.phase === 'toCoffee' || a.phase === 'atCoffee') count++;
      });
      return count;
    }

    function findFreeCoffeeSlot() {
      const used = new Set();
      actors.forEach((a) => {
        if ((a.phase === 'toCoffee' || a.phase === 'atCoffee') && a.coffeeSlot !== null) {
          used.add(a.coffeeSlot);
        }
      });
      for (let i = 0; i < MAX_COFFEE_QUEUE; i++) {
        if (!used.has(i)) return i;
      }
      return null;
    }

    function spawnConfetti(cx, cy) {
      const palette = ['#22C55E', '#FACC15', '#38BDF8', '#F472B6', '#A855F7'];
      for (let i = 0; i < 14; i++) {
        const angle = -Math.PI * (0.15 + (i / 13) * 0.7);
        const speed = 1.2 + (i % 4) * 0.45;
        confetti.push({
          x: cx + ((i % 3) - 1) * 8,
          y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed - 0.6,
          color: palette[i % palette.length],
          life: 0,
          maxLife: 45 + (i % 4) * 8
        });
      }
    }

    function buildWaypointsToCoffee(session, slotIdx) {
      const seat = getSeatCoords(session);
      const laneY = session.desk.y - 16;
      const corridorX = getCorridorX();
      const slot = getCoffeeSlotCoords(slotIdx);
      return [
        { x: seat.x, y: laneY },
        { x: corridorX, y: laneY },
        { x: corridorX, y: slot.y },
        { x: slot.x, y: slot.y }
      ];
    }

    function buildWaypointsToDesk(session) {
      const seat = getSeatCoords(session);
      const laneY = session.desk.y - 16;
      const corridorX = getCorridorX();
      return [
        { x: corridorX, y: laneY },
        { x: seat.x, y: laneY },
        { x: seat.x, y: seat.y }
      ];
    }

    function startCoffeeWalk(actor, session, now) {
      if (countActiveCoffeeActors() >= MAX_COFFEE_QUEUE) {
        actor.phase = 'seated';
        actor.coffeeSlot = null;
        actor.waypoints = [];
        actor.hasCoffeeCup = true;
        return;
      }
      const slot = findFreeCoffeeSlot();
      if (slot === null) {
        actor.phase = 'seated';
        actor.coffeeSlot = null;
        actor.waypoints = [];
        actor.hasCoffeeCup = true;
        return;
      }
      actor.phase = 'toCoffee';
      actor.phaseStartedAt = now;
      actor.coffeeSlot = slot;
      actor.hasCoffeeCup = false;
      actor.waypoints = buildWaypointsToCoffee(session, slot);
    }

    function returnToDesk(actor, session, now, fast) {
      const corridorX = getCorridorX();
      const seat = getSeatCoords(session);
      const laneY = session.desk.y - 16;
      actor.phase = 'fromCoffee';
      actor.phaseStartedAt = now;
      actor.coffeeSlot = null;
      actor.fastReturn = Boolean(fast);
      if (Math.abs(actor.x - seat.x) <= 6 && Math.abs(actor.y - seat.y) <= 18) {
        actor.waypoints = [{ x: seat.x, y: seat.y }];
      } else if (actor.x >= corridorX - 18) {
        actor.waypoints = buildWaypointsToDesk(session);
      } else {
        actor.waypoints = [
          { x: corridorX, y: actor.y },
          { x: corridorX, y: laneY },
          { x: seat.x, y: laneY },
          { x: seat.x, y: seat.y }
        ];
      }
    }

    function syncActorsWithLayout(items, completedIds, now) {
      const completedSet = new Set(Array.isArray(completedIds) ? completedIds : []);
      const seenIds = new Set();

      for (const s of items) {
        seenIds.add(s.sessionId);
        const seat = getSeatCoords(s);
        let actor = actors.get(s.sessionId);

        if (!actor) {
          actor = {
            sessionId: s.sessionId,
            lastState: s.state,
            phase: 'seated',
            phaseStartedAt: now,
            x: seat.x,
            y: seat.y,
            facing: 'front',
            coffeeSlot: null,
            waypoints: [],
            hasCoffeeCup: s.state === 'idle',
            fastReturn: false
          };
          actors.set(s.sessionId, actor);
        }

        const prevHandled = handledCompletionAt.get(s.sessionId) || 0;
        const transitionToIdle = hasInitializedActors && actor.lastState !== 'idle' && s.state === 'idle' && !isRateLimitedActive(s, now);
        const flaggedComplete = completedSet.has(s.sessionId) && (now - prevHandled > 6000);

        if (transitionToIdle || flaggedComplete) {
          handledCompletionAt.set(s.sessionId, now);
          celebrationUntil.set(s.sessionId, now + CELEBRATE_DURATION_MS);
          spawnConfetti(s.desk.x + 50, s.desk.y + 4);
          if (s.state === 'idle' && actor.phase === 'seated') {
            actor.phase = 'celebrating';
            actor.phaseStartedAt = now;
            actor.hasCoffeeCup = false;
          }
        }

        if (s.state !== 'idle') {
          handledCompletionAt.delete(s.sessionId);
          if (actor.phase === 'celebrating') {
            actor.phase = 'seated';
            actor.x = seat.x;
            actor.y = seat.y;
          } else if (actor.phase === 'toCoffee' || actor.phase === 'atCoffee') {
            returnToDesk(actor, s, now, true);
          }
        }

        if (actor.phase === 'fromCoffee' && actor.waypoints && actor.waypoints.length > 0) {
          const lastWp = actor.waypoints[actor.waypoints.length - 1];
          if (lastWp.x !== seat.x || lastWp.y !== seat.y) {
            returnToDesk(actor, s, now, actor.fastReturn);
          }
        }
        if (actor.phase === 'seated') {
          actor.x = seat.x;
          actor.y = seat.y;
          actor.facing = 'front';
          if (s.state === 'idle') actor.hasCoffeeCup = true;
        }
        actor.lastState = s.state;
      }

      actors.forEach((_, id) => {
        if (!seenIds.has(id)) actors.delete(id);
      });
      hasInitializedActors = true;
    }

    function advanceSingleActor(actor, session, now, dtSec) {
      const seat = getSeatCoords(session);
      if (actor.phase === 'celebrating') {
        actor.x = seat.x;
        actor.y = seat.y;
        if (now - actor.phaseStartedAt >= CELEBRATE_DURATION_MS) {
          if (session.state === 'idle' && !isRateLimitedActive(session, now)) {
            startCoffeeWalk(actor, session, now);
          } else {
            actor.phase = 'seated';
          }
        }
        return;
      }

      if (actor.phase === 'atCoffee') {
        if (actor.coffeeSlot > 0) {
          let lowerOccupied = false;
          actors.forEach((other) => {
            if (other !== actor && (other.phase === 'toCoffee' || other.phase === 'atCoffee') && other.coffeeSlot === actor.coffeeSlot - 1) {
              lowerOccupied = true;
            }
          });
          if (!lowerOccupied) {
            actor.coffeeSlot -= 1;
            actor.phaseStartedAt = now;
            const nextPos = getCoffeeSlotCoords(actor.coffeeSlot);
            actor.waypoints = [nextPos];
          }
        }

        if (actor.waypoints && actor.waypoints.length > 0) {
          moveAlongWaypoints(actor, dtSec * 70);
          return;
        }

        actor.facing = 'right';
        const elapsed = now - actor.phaseStartedAt;
        if ((actor.coffeeSlot === 0 && elapsed >= BREW_DURATION_MS) || elapsed >= MAX_AT_COFFEE_MS) {
          actor.hasCoffeeCup = true;
          returnToDesk(actor, session, now, false);
        }
        return;
      }

      if (actor.phase === 'toCoffee' || actor.phase === 'fromCoffee') {
        const speed = actor.fastReturn ? 145 : 88;
        const arrived = moveAlongWaypoints(actor, dtSec * speed);
        if (arrived) {
          if (actor.phase === 'toCoffee') {
            actor.phase = 'atCoffee';
            actor.phaseStartedAt = now;
            actor.facing = 'right';
          } else {
            actor.phase = 'seated';
            actor.phaseStartedAt = now;
            actor.x = seat.x;
            actor.y = seat.y;
            actor.facing = 'front';
            actor.fastReturn = false;
          }
        }
      }
    }

    function moveAlongWaypoints(actor, maxDist) {
      let remaining = maxDist;
      while (actor.waypoints && actor.waypoints.length > 0 && remaining > 0) {
        const target = actor.waypoints[0];
        const dx = target.x - actor.x;
        const dy = target.y - actor.y;
        const dist = Math.hypot(dx, dy);
        if (Math.abs(dx) > Math.abs(dy)) {
          actor.facing = dx >= 0 ? 'right' : 'left';
        }
        if (dist <= remaining) {
          actor.x = target.x;
          actor.y = target.y;
          actor.waypoints.shift();
          remaining -= dist;
        } else {
          actor.x += (dx / dist) * remaining;
          actor.y += (dy / dist) * remaining;
          remaining = 0;
        }
      }
      return !actor.waypoints || actor.waypoints.length === 0;
    }

    function stepSimulation(now) {
      const dtMs = Math.min(80, Math.max(8, now - lastFrameAt));
      lastFrameAt = now;
      const dtSec = dtMs / 1000;

      // Advance vacuum robot smoothly along bottom corridor
      const minVx = 40;
      const maxVx = Math.max(minVx + 40, canvas.width - 142);
      vacuum.x += vacuum.dir * 24 * dtSec;
      if (vacuum.x >= maxVx) {
        vacuum.x = maxVx;
        vacuum.dir = -1;
      } else if (vacuum.x <= minVx) {
        vacuum.x = minVx;
        vacuum.dir = 1;
      }

      // Advance confetti particles
      if (confetti.length > 0) {
        const nextConfetti = [];
        for (const c of confetti) {
          c.life += 1;
          if (c.life < c.maxLife) {
            c.x += c.vx;
            c.y += c.vy;
            c.vy += 0.06;
            nextConfetti.push(c);
          }
        }
        confetti = nextConfetti;
      }

      // Advance actors
      const byId = new Map();
      for (const s of layout.items) byId.set(s.sessionId, s);
      actors.forEach((actor, sid) => {
        const session = byId.get(sid);
        if (session) advanceSingleActor(actor, session, now, dtSec);
      });
    }

    function drawWindow(x, y, tod) {
      px(x, y, 58, 22, '#334155');
      if (tod === 'day') {
        px(x + 2, y + 2, 54, 18, '#38BDF8');
        // Sun & drifting cloud
        px(x + 42, y + 4, 8, 8, '#FDE047');
        const cloudX = x + 4 + (Math.floor(tick * 0.12) % 32);
        px(cloudX, y + 11, 14, 4, '#F8FAFC');
        px(cloudX + 3, y + 8, 8, 3, '#F8FAFC');
      } else if (tod === 'evening') {
        px(x + 2, y + 2, 54, 6, '#7C3AED');
        px(x + 2, y + 8, 54, 6, '#EA580C');
        px(x + 2, y + 14, 54, 6, '#FB923C');
        px(x + 22, y + 12, 10, 7, '#FDE047');
      } else {
        px(x + 2, y + 2, 54, 18, '#0F172A');
        // Moon & twinkling stars
        px(x + 41, y + 5, 7, 7, '#FEF08A');
        px(x + 43, y + 5, 4, 4, '#0F172A');
        if (Math.floor(tick / 20) % 2 === 0) px(x + 9, y + 6, 2, 2, '#E2E8F0');
        else px(x + 10, y + 6, 1, 1, '#94A3B8');
        px(x + 22, y + 13, 2, 2, '#F8FAFC');
        if (Math.floor(tick / 28) % 2 === 1) px(x + 31, y + 7, 2, 2, '#BAE6FD');
      }
      // Window frame crossbars
      px(x + 28, y + 2, 2, 18, '#334155');
      px(x + 2, y + 10, 54, 2, '#334155');
    }

    function drawWallClock(cx, cy, now) {
      px(cx - 10, cy - 10, 20, 20, '#334155');
      px(cx - 8, cy - 8, 16, 16, '#F8FAFC');
      px(cx - 1, cy - 1, 2, 2, '#1E293B');
      const d = new Date(now);
      const secAngle = (d.getSeconds() / 60) * Math.PI * 2 - Math.PI / 2;
      const minAngle = ((d.getMinutes() + d.getSeconds() / 60) / 60) * Math.PI * 2 - Math.PI / 2;
      const hrAngle = (((d.getHours() % 12) + d.getMinutes() / 60) / 12) * Math.PI * 2 - Math.PI / 2;

      ctx.strokeStyle = '#1E293B';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(hrAngle) * 4.2, cy + Math.sin(hrAngle) * 4.2);
      ctx.stroke();

      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(minAngle) * 6.5, cy + Math.sin(minAngle) * 6.5);
      ctx.stroke();

      ctx.strokeStyle = '#EF4444';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(secAngle) * 6.5, cy + Math.sin(secAngle) * 6.5);
      ctx.stroke();
    }

    function drawFloorAndProps(p, now) {
      const w = canvas.width;
      const h = canvas.height;
      const tod = getTimeOfDay(now);

      for (let y = 0; y < h; y += 18) {
        for (let x = 0; x < w; x += 18) {
          const alt = ((x / 18) + (y / 18)) % 2 === 0;
          px(x, y, 18, 18, alt ? p.floorA : p.floorB);
        }
      }

      // Top office wall, window, header plaque & live wall clock
      px(0, 0, w, 28, p.wall);
      px(0, 28, w, 3, p.carpetBorder);
      drawWindow(32, 3, tod);

      px(Math.floor(w / 2) - 82, 7, 164, 14, '#1E293B');
      ctx.fillStyle = '#F8FAFC';
      ctx.font = 'bold 9.5px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('DEV-FLOOR · AI SESSIONS', Math.floor(w / 2), 17);

      drawWallClock(w - 58, 14, now);

      // Carpet zone beneath desks
      const carpetW = Math.max(300, w - 148);
      const carpetH = Math.max(190, h - 54);
      px(30, 38, carpetW, carpetH, p.carpet);
      ctx.strokeStyle = p.carpetBorder;
      ctx.lineWidth = 2;
      ctx.strokeRect(30, 38, carpetW, carpetH);

      // Coffee corner on the right
      const kx = w - 96;
      const ky = 58;
      let someoneBrewing = false;
      actors.forEach((a) => {
        if (a.phase === 'atCoffee' && a.coffeeSlot === 0 && (!a.waypoints || a.waypoints.length === 0)) {
          someoneBrewing = true;
        }
      });

      px(kx, ky, 74, 42, p.deskTop);
      px(kx, ky + 42, 74, 6, p.deskEdge);
      px(kx + 12, ky - 14, 22, 24, '#334155');
      px(kx + 16, ky - 8, 14, 9, '#1E293B');
      px(kx + 19, ky - 4, 8, 5, '#78350F');
      // Machine status LED + extra cup/steam when someone is brewing
      px(kx + 30, ky - 11, 2, 2, someoneBrewing ? ((Math.floor(tick / 6) % 2 === 0) ? '#22C55E' : '#FACC15') : '#38BDF8');
      if (someoneBrewing) {
        px(kx + 20, ky - 2, 6, 5, '#F8FAFC');
      }
      const steam = Math.sin(tick * 0.12) * 2;
      const steamBoost = someoneBrewing ? 3 : 0;
      px(kx + 20 + steam, ky - 20 - steamBoost, 3, 4, 'rgba(226, 232, 240, 0.7)');
      px(kx + 25 - steam, ky - 24 - steamBoost, 3, 4, 'rgba(226, 232, 240, 0.5)');
      ctx.fillStyle = p.muted;
      ctx.font = '9.5px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('KAFFEE', kx + 37, ky + 62);

      // Swaying office plant bottom right
      const py = h - 42;
      const sway = Math.round(Math.sin(tick * 0.04) * 1.2);
      px(kx + 26, py, 20, 16, '#9A5B36');
      px(kx + 24, py - 4, 24, 5, '#B46F45');
      px(kx + 30 + sway, py - 18, 12, 14, '#2E8B57');
      px(kx + 23 + sway, py - 13, 9, 9, '#3CB371');
      px(kx + 40 + sway, py - 15, 9, 10, '#3CB371');

      // Robotic vacuum patrolling bottom floor strip
      const vy = h - 14;
      const vx = Math.round(vacuum.x);
      px(vx, vy, 14, 9, '#334155');
      px(vx + 2, vy + 1, 10, 6, '#1E293B');
      px(vacuum.dir > 0 ? vx + 12 : vx, vy + 2, 2, 5, '#38BDF8');
      if (Math.floor(tick / 12) % 2 === 0) {
        px(vx + 6, vy + 3, 2, 2, '#22C55E');
      }
    }

    function drawSeatedAvatar(x, y, session, actor, p, now) {
      const meta = PROVIDER_PALETTE[session.provider] || PROVIDER_PALETTE.claude;
      const seed = hashId(session.sessionId);
      const rateLimited = isRateLimitedActive(session, now);
      const isCelebrating = (celebrationUntil.get(session.sessionId) || 0) > now;
      const busyKind = session.state === 'busy' && !rateLimited ? classifyBusyActivity(session.activity) : null;
      const idleAgeMs = session.state === 'idle' && session.statusUpdatedAt ? (now - session.statusUpdatedAt) : 0;
      const isDozing = rateLimited || (session.state === 'idle' && idleAgeMs >= IDLE_COLD_COFFEE_MS && Math.sin(tick * 0.02 + seed) > 0.3);

      const typingBob = busyKind === 'write' || busyKind === 'terminal' ? (Math.floor(tick / 6) % 2) * 2 : 0;
      const waitBounce = session.state === 'waiting' ? Math.round(Math.sin(tick * 0.18) * 2) : 0;
      const celebrateBounce = isCelebrating ? -Math.round(Math.abs(Math.sin(tick * 0.35)) * 4) : 0;
      const ay = y + waitBounce + celebrateBounce;

      // Chair back
      px(x + 28, y + 12, 22, 14, p.chair);
      // Torso
      px(x + 30, ay + 10, 18, 14, meta.shirt);
      // Head & hair
      px(x + 32, ay - 4, 14, 14, '#F1C27D');
      px(x + 31, ay - 6, 16, 5, meta.hair);

      // Asynchronous blink & occasional glance left/right
      const blinkCycle = (tick + (seed % 190)) % 210;
      const isBlinking = blinkCycle >= 203 || isDozing;
      let gazeShift = 0;
      if (!isBlinking && (session.state === 'idle' || session.state === 'bookmarked' || session.state === 'waiting')) {
        const glance = Math.sin(tick * 0.03 + (seed % 50));
        if (glance > 0.78) gazeShift = 1;
        else if (glance < -0.78) gazeShift = -1;
      }

      if (isBlinking) {
        px(x + 35, ay + 3, 2, 1, '#1E293B');
        px(x + 41, ay + 3, 2, 1, '#1E293B');
      } else {
        px(x + 35 + gazeShift, ay + 2, 2, 2, '#1E293B');
        px(x + 41 + gazeShift, ay + 2, 2, 2, '#1E293B');
      }

      // Arms by state / activity
      if (isCelebrating) {
        px(x + 25, ay + 1, 5, 11, meta.shirt);
        px(x + 48, ay + 1, 5, 11, meta.shirt);
      } else if (session.state === 'waiting') {
        px(x + 26, ay + 13, 5, 6, meta.shirt);
        px(x + 47, ay + 2 + waitBounce, 5, 11, meta.shirt);
      } else if (rateLimited) {
        px(x + 26, ay + 14, 5, 6, meta.shirt);
        px(x + 47, ay + 14, 5, 6, meta.shirt);
      } else if (busyKind === 'think') {
        px(x + 26, ay + 13, 5, 6, meta.shirt);
        px(x + 46, ay + 7, 5, 9, meta.shirt);
      } else if (busyKind === 'read') {
        px(x + 26, ay + 14, 5, 6, meta.shirt);
        px(x + 47, ay + 12 + (Math.floor(tick / 18) % 2), 5, 6, meta.shirt);
      } else if (session.state === 'busy') {
        px(x + 26, ay + 13 + typingBob, 5, 7, meta.shirt);
        px(x + 47, ay + 13 + (2 - typingBob), 5, 7, meta.shirt);
      } else if (session.state === 'idle' && actor && actor.hasCoffeeCup && idleAgeMs < IDLE_COLD_COFFEE_MS && ((tick + (seed % 80)) % 140) < 28) {
        // Periodic sip of coffee
        px(x + 26, ay + 13, 5, 6, meta.shirt);
        px(x + 47, ay + 6, 5, 8, meta.shirt);
        px(x + 48, ay + 3, 5, 5, '#F8FAFC');
      } else {
        px(x + 26, ay + 13, 5, 6, meta.shirt);
        px(x + 47, ay + 13, 5, 6, meta.shirt);
      }

      // Floating Zzz for active rate-limit or long-idle nap
      if (isDozing) {
        const zOff = (tick % 36) / 6;
        ctx.fillStyle = '#94A3B8';
        ctx.font = 'bold 8px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('z', x + 50, ay - 7 - zOff);
        if (tick % 36 > 12) ctx.fillText('Z', x + 54, ay - 12 - zOff);
      }

      // Floating thought dots when thinking
      if (busyKind === 'think' && !isCelebrating) {
        const pulse = Math.floor(tick / 14) % 3;
        px(x + 48, ay - 9, 2, 2, '#E2E8F0');
        if (pulse >= 1) px(x + 52, ay - 13, 3, 3, '#E2E8F0');
        if (pulse >= 2) px(x + 56, ay - 17, 5, 4, '#CBD5E1');
      }
    }

    function drawWalkingAvatar(actor, session, p) {
      const meta = PROVIDER_PALETTE[session.provider] || PROVIDER_PALETTE.claude;
      const x = actor.x;
      const y = actor.y;
      const isMoving = actor.waypoints && actor.waypoints.length > 0;
      const stride = isMoving ? Math.round(Math.sin(tick * 0.4) * 2) : 0;
      const stepBob = isMoving ? Math.abs(Math.round(Math.sin(tick * 0.4))) : 0;
      const ay = y - stepBob;

      // Legs
      px(x + 32, ay + 24, 5, 5 + Math.max(0, stride), '#1E293B');
      px(x + 41, ay + 24, 5, 5 + Math.max(0, -stride), '#1E293B');
      // Torso
      px(x + 30, ay + 10, 18, 14, meta.shirt);
      // Head & hair
      px(x + 32, ay - 4, 14, 14, '#F1C27D');
      px(x + 31, ay - 6, 16, 5, meta.hair);

      // Eyes turned toward facing direction
      const eyeOffset = actor.facing === 'right' ? 2 : (actor.facing === 'left' ? -2 : 0);
      px(x + 35 + eyeOffset, ay + 2, 2, 2, '#1E293B');
      px(x + 41 + eyeOffset, ay + 2, 2, 2, '#1E293B');

      // Arms + coffee cup if carrying one
      px(x + 26, ay + 12 + stride, 4, 7, meta.shirt);
      px(x + 48, ay + 12 - stride, 4, 7, meta.shirt);
      if (actor.hasCoffeeCup) {
        const cupX = actor.facing === 'left' ? x + 22 : x + 50;
        px(cupX, ay + 14, 6, 6, '#F8FAFC');
        px(cupX + 1, ay + 11, 2, 2, 'rgba(248, 250, 252, 0.7)');
      }

      // Small project pill above walking avatar so owner stays recognizable
      const tag = (session.project || 'ROOT').slice(0, 10);
      px(x + 15, ay - 20, 48, 11, p.badgeBg);
      px(x + 17, ay - 17, 5, 5, meta.color);
      ctx.fillStyle = p.text;
      ctx.font = 'bold 8.5px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(tag, x + 24, ay - 12);
    }

    function drawDeskLamp(x, y, lit, tod) {
      // Base, arm & shade on left desk corner
      px(x + 6, y + 20, 10, 3, '#475569');
      px(x + 9, y + 12, 3, 8, '#64748B');
      px(x + 8, y + 8, 11, 5, lit ? '#FDE047' : '#64748B');
      if (lit) {
        const alpha = tod === 'day' ? 0.14 : (tod === 'evening' ? 0.24 : 0.30);
        const glow = 'rgba(253, 224, 71, ' + alpha + ')';
        px(x + 6, y + 13, 15, 6, glow);
        px(x + 4, y + 19, 21, 9, glow);
        px(x + 2, y + 28, 25, 10, glow);
      }
    }

    function drawContextStack(x, y, session) {
      const pct = session.tokens && typeof session.tokens.percent === 'number' ? session.tokens.percent : null;
      if (pct === null || pct <= 0) return;
      const baseX = x + 6;
      const baseY = y + 45;
      const layers = pct >= 80 ? 5 : (pct >= 60 ? 4 : (pct >= 25 ? 2 : 1));
      for (let i = 0; i < layers; i++) {
        const wobble = (pct >= 80 && i % 2 === 1) ? 1 : 0;
        let col = i % 2 === 0 ? '#E2E8F0' : '#CBD5E1';
        if (i === layers - 1) {
          if (pct >= 80) col = '#EF4444';
          else if (pct >= 60) col = '#F59E0B';
        }
        px(baseX + wobble, baseY - i * 3, 14, 2, col);
      }
      if (pct >= 90 && (Math.floor(tick / 14) % 2 === 0)) {
        px(baseX + 16, baseY - layers * 3, 3, 3, '#EF4444');
      }
    }

    function drawMonitorScreen(x, y, session, now) {
      const rateLimited = isRateLimitedActive(session, now);
      if (rateLimited) {
        px(x + 33, y + 7, 32, 16, '#1E293B');
        // Animated pixel hourglass
        const phase = Math.floor(tick / 20) % 2;
        px(x + 45, y + 9, 8, 2, '#94A3B8');
        px(x + 46, y + 11, 6, 3, phase === 0 ? '#F59E0B' : '#334155');
        px(x + 48, y + 14, 2, 2, '#F59E0B');
        px(x + 46, y + 16, 6, 3, phase === 1 ? '#F59E0B' : '#334155');
        px(x + 45, y + 19, 8, 2, '#94A3B8');
        return;
      }

      if (session.state === 'busy') {
        const kind = classifyBusyActivity(session.activity);
        if (kind === 'terminal') {
          px(x + 33, y + 7, 32, 16, '#052E16');
          const lineOff = Math.floor(tick / 10) % 3;
          px(x + 35, y + 9, 18 + lineOff * 2, 2, '#4ADE80');
          px(x + 35, y + 13, 24 - lineOff * 3, 2, '#86EFAC');
          px(x + 35, y + 17, 12, 2, '#22C55E');
          if (Math.floor(tick / 10) % 2 === 0) px(x + 49, y + 17, 4, 2, '#F8FAFC');
        } else if (kind === 'read') {
          px(x + 33, y + 7, 32, 16, '#0F172A');
          const scanRow = 9 + (Math.floor(tick / 10) % 4) * 3;
          px(x + 35, y + 9, 26, 2, '#64748B');
          px(x + 35, y + 12, 22, 2, '#64748B');
          px(x + 35, y + 15, 25, 2, '#64748B');
          px(x + 35, y + 18, 19, 2, '#64748B');
          px(x + 35, y + scanRow, 26, 2, '#38BDF8');
        } else if (kind === 'think') {
          px(x + 33, y + 7, 32, 16, '#1E1B4B');
          const pulseW = 8 + Math.round((Math.sin(tick * 0.14) + 1) * 9);
          px(x + 36, y + 12, pulseW, 4, '#A78BFA');
          px(x + 36, y + 18, 12, 2, '#818CF8');
        } else {
          px(x + 33, y + 7, 32, 16, '#0F2942');
          const shift = Math.floor(tick / 8) % 3;
          px(x + 36, y + 10, 14 + shift * 3, 2, '#38BDF8');
          px(x + 36, y + 14, 22 - shift * 2, 2, '#4ADE80');
          px(x + 36, y + 18, 16, 2, '#A78BFA');
        }
      } else if (session.state === 'waiting') {
        px(x + 33, y + 7, 32, 16, '#451A03');
        px(x + 46, y + 10, 5, 8, '#FBBF24');
      } else if (session.state === 'idle') {
        px(x + 33, y + 7, 32, 16, '#052E16');
        px(x + 42, y + 12, 12, 4, '#4ADE80');
      } else {
        px(x + 33, y + 7, 32, 16, '#2E1065');
        px(x + 44, y + 11, 10, 7, '#C084FC');
      }
    }

    function drawDeskBubble(x, y, session, actor, now) {
      if (isRateLimitedActive(session, now)) {
        px(x + 70, y - 14, 22, 14, '#475569');
        ctx.fillStyle = '#FDE68A';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('⏳', x + 81, y - 3);
        return;
      }

      if (session.state === 'waiting') {
        const wType = classifyWaitingType(session, now);
        const bob = Math.round(Math.sin(tick * 0.2) * 2);
        if (wType === 'permission') {
          const blink = Math.floor(tick / 14) % 2 === 0;
          px(x + 71, y - 16 + bob, 24, 16, blink ? '#EA580C' : '#F59E0B');
          // Pixel padlock icon
          px(x + 79, y - 13 + bob, 8, 4, '#111827');
          px(x + 81, y - 12 + bob, 4, 3, blink ? '#EA580C' : '#F59E0B');
          px(x + 77, y - 9 + bob, 12, 7, '#111827');
          px(x + 82, y - 7 + bob, 2, 3, '#FEF08A');
        } else if (wType === 'limitPast') {
          px(x + 70, y - 16 + bob, 26, 16, '#22C55E');
          ctx.fillStyle = '#052E16';
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('⏰!', x + 83, y - 4 + bob);
        } else {
          px(x + 72, y - 16 + bob, 22, 16, '#F59E0B');
          ctx.fillStyle = '#111827';
          ctx.font = 'bold 11px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('?!', x + 83, y - 4 + bob);
        }
      } else if (session.state === 'busy') {
        const kind = classifyBusyActivity(session.activity);
        if (kind === 'terminal') {
          const spin = ['|', '/', '-', '\\\\'][Math.floor(tick / 8) % 4];
          px(x + 70, y - 13, 24, 13, '#1D4ED8');
          ctx.fillStyle = '#86EFAC';
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('>' + spin, x + 82, y - 3);
        } else if (kind === 'read') {
          px(x + 70, y - 13, 24, 13, '#0284C7');
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 9.5px monospace';
          ctx.textAlign = 'center';
          ctx.fillText('📖', x + 82, y - 3);
        } else if (kind === 'think') {
          const dots = ['.', '..', '...'][Math.floor(tick / 14) % 3];
          px(x + 70, y - 13, 24, 13, '#6D28D9');
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(dots, x + 82, y - 3);
        } else {
          const dots = '.'.repeat((Math.floor(tick / 12) % 3) + 1);
          px(x + 70, y - 13, 24, 13, '#2563EB');
          ctx.fillStyle = '#FFFFFF';
          ctx.font = 'bold 10px monospace';
          ctx.textAlign = 'center';
          ctx.fillText(dots, x + 82, y - 3);
        }
      } else if (session.state === 'idle') {
        const awayForCoffee = actor && (actor.phase === 'toCoffee' || actor.phase === 'atCoffee' || actor.phase === 'fromCoffee');
        px(x + 74, y - 13, 18, 13, '#16A34A');
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(awayForCoffee ? '☕' : '✓', x + 83, y - 3);
      } else if (session.state === 'bookmarked') {
        px(x + 74, y - 13, 18, 13, '#9333EA');
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('★', x + 83, y - 3);
      }
    }

    function drawDesk(session, p, now) {
      const { x, y } = session.desk;
      const meta = PROVIDER_PALETTE[session.provider] || PROVIDER_PALETTE.claude;
      const isSelected = session.sessionId === selectedId;
      const isHovered = session.sessionId === hoveredId;
      const until = celebrationUntil.get(session.sessionId) || 0;
      const isCelebrating = until > now;
      const actor = actors.get(session.sessionId);
      const isSeated = !actor || actor.phase === 'seated' || actor.phase === 'celebrating';
      const rateLimited = isRateLimitedActive(session, now);
      const tod = getTimeOfDay(now);

      if (isSelected || isHovered || isCelebrating) {
        ctx.strokeStyle = isCelebrating ? '#22C55E' : (isSelected ? p.selectRing : meta.color);
        ctx.lineWidth = isSelected || isCelebrating ? 2.5 : 1.5;
        ctx.strokeRect(x - 6, y - 16, 112, 88);
      }

      if (isSeated) {
        drawSeatedAvatar(x + 11, y - 6, session, actor, p, now);
      } else {
        // Empty chair while developer is getting coffee
        px(x + 39, y + 6, 22, 14, p.chair);
      }

      // Desk surface & front edge
      px(x, y + 18, 100, 34, p.deskTop);
      px(x, y + 52, 100, 5, p.deskEdge);

      // Desk lamp (lit when actively working without rate limit)
      drawDeskLamp(x, y, session.state === 'busy' && !rateLimited, tod);

      // Monitor
      px(x + 30, y + 4, 38, 22, p.monitorFrame);
      drawMonitorScreen(x, y, session, now);

      // Context usage paper stack on left desk edge
      drawContextStack(x, y, session);

      // Coffee mug when idle at desk (steams while warm, cold after 30 min)
      if (session.state === 'idle' && isSeated && (!actor || actor.hasCoffeeCup)) {
        const idleAgeMs = session.statusUpdatedAt ? (now - session.statusUpdatedAt) : 0;
        px(x + 76, y + 26, 8, 8, '#F8FAFC');
        if (idleAgeMs < IDLE_COLD_COFFEE_MS) {
          const d = Math.sin(tick * 0.15) * 1.5;
          px(x + 78 + d, y + 20, 2, 4, 'rgba(248, 250, 252, 0.65)');
        }
      }

      // Project nameplate below desk
      px(x + 4, y + 59, 92, 15, p.badgeBg);
      px(x + 7, y + 63, 7, 7, meta.color);
      ctx.fillStyle = p.text;
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'left';
      const label = (session.project || 'ROOT').slice(0, 12);
      ctx.fillText(label, x + 17, y + 70);

      drawDeskBubble(x, y, session, actor, now);
    }

    function draw() {
      if (!ctx) return;
      const p = getThemePalette();
      const now = Date.now();
      drawFloorAndProps(p, now);
      if (layout.items.length === 0) {
        ctx.fillStyle = p.muted;
        ctx.font = '13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Keine aktiven Sessions für den gewählten Filter im Büro.', Math.floor((canvas.width - 100) / 2), Math.floor(canvas.height / 2));
        return;
      }

      for (const session of layout.items) {
        drawDesk(session, p, now);
      }

      // Draw walking / coffee-corner avatars sorted by Y for proper depth
      const walkers = [];
      const byId = new Map();
      for (const s of layout.items) byId.set(s.sessionId, s);
      actors.forEach((actor, sid) => {
        if (actor.phase === 'toCoffee' || actor.phase === 'atCoffee' || actor.phase === 'fromCoffee') {
          const s = byId.get(sid);
          if (s) walkers.push({ actor, session: s });
        }
      });
      walkers.sort((a, b) => a.actor.y - b.actor.y);
      for (const w of walkers) {
        drawWalkingAvatar(w.actor, w.session, p);
      }

      // Confetti particles on top
      for (const c of confetti) {
        px(c.x, c.y, 3, 3, c.color);
      }
    }

    function updateLegend() {
      if (!legendEl) return;
      const counts = { waiting: 0, busy: 0, bookmarked: 0, idle: 0 };
      for (const item of layout.items) {
        if (counts[item.state] !== undefined) counts[item.state]++;
      }
      legendEl.innerHTML = OFFICE_ACTIVE_STATES.map((st) => {
        const m = STATE_META[st];
        return '<span class="office-legend-item"><span class="office-legend-dot" style="background:' + m.color + '"></span>' + counts[st] + ' ' + m.label + '</span>';
      }).join('');
      if (truncEl) {
        if (layout.truncated) {
          truncEl.textContent = 'Zeige ' + layout.items.length + ' von ' + layout.totalActive + ' aktiven Sessions';
          truncEl.style.display = '';
        } else {
          truncEl.style.display = 'none';
        }
      }
    }

    function updateInspector() {
      if (!infoEl || !actionsEl) return;
      const s = layout.items.find((item) => item.sessionId === selectedId) || null;
      if (!s) {
        infoEl.innerHTML = 'Klicke auf einen Schreibtisch im Büro, um Details zu sehen; Doppelklick öffnet direkt den Chat.';
        actionsEl.innerHTML = '';
        return;
      }
      const pm = PROVIDER_PALETTE[s.provider] || PROVIDER_PALETTE.claude;
      const sm = STATE_META[s.state] || { label: s.state, color: '#94A3B8' };
      const title = s.title || s.sessionId;
      const activity = s.activity || s.detail || sm.label;
      infoEl.innerHTML =
        '<span class="office-inspector-title">' + escapeHtml(s.project || 'ROOT') + '</span>' +
        '<span>·</span>' +
        '<span style="color:' + pm.color + ';font-weight:500;">' + escapeHtml(pm.label) + '</span>' +
        '<span>·</span>' +
        '<span class="office-inspector-title">' + escapeHtml(title) + '</span>' +
        '<span>(' + escapeHtml(sm.label) + ': ' + escapeHtml(activity) + ')</span>';

      const bookmarkLabel = s.isBookmarked ? '★ Gemerkt' : '☆ Merken';
      actionsEl.innerHTML =
        '<button type="button" class="office-act-btn primary" data-office-act="open">💬 Chat öffnen</button>' +
        '<button type="button" class="office-act-btn" data-office-act="viewTranscript">👁️ Details</button>' +
        '<button type="button" class="office-act-btn" data-office-act="toggleBookmark">' + bookmarkLabel + '</button>' +
        '<button type="button" class="office-act-btn" data-office-act="markDone">✓ Erledigt</button>';

      actionsEl.querySelectorAll('[data-office-act]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const act = btn.getAttribute('data-office-act');
          if (!act) return;
          vscode.postMessage({ action: act, sessionId: s.sessionId, provider: s.provider });
        });
      });
    }

    function hitTest(clientX, clientY) {
      if (!canvas) return null;
      const rect = canvas.getBoundingClientRect();
      if (!rect.width || !rect.height) return null;
      const x = ((clientX - rect.left) / rect.width) * canvas.width;
      const y = ((clientY - rect.top) / rect.height) * canvas.height;
      for (const s of layout.items) {
        const actor = actors.get(s.sessionId);
        if (actor && (actor.phase === 'toCoffee' || actor.phase === 'atCoffee' || actor.phase === 'fromCoffee')) {
          if (x >= actor.x + 20 && x <= actor.x + 58 && y >= actor.y - 12 && y <= actor.y + 32) {
            return s;
          }
        }
      }
      return layout.items.find((s) => x >= s.desk.x - 6 && x <= s.desk.x + 106 && y >= s.desk.y - 16 && y <= s.desk.y + 74) || null;
    }

    function hideTooltip() {
      if (tooltipEl) tooltipEl.style.display = 'none';
    }

    function showTooltip(session, clientX, clientY) {
      if (!tooltipEl || !canvas) return;
      const rect = canvas.parentElement.getBoundingClientRect();
      const pm = PROVIDER_PALETTE[session.provider] || PROVIDER_PALETTE.claude;
      const sm = STATE_META[session.state] || { label: session.state };
      const ctxPct = session.tokens && typeof session.tokens.percent === 'number' ? ' · Context ' + Math.round(session.tokens.percent) + '%' : '';
      const actLine = session.activity ? '<div style="opacity:0.85">' + escapeHtml(session.activity) + '</div>' : '';
      tooltipEl.innerHTML =
        '<div><strong>' + escapeHtml(session.project || 'ROOT') + '</strong> · <span style="color:' + pm.color + '">' + escapeHtml(pm.label) + '</span></div>' +
        '<div>' + escapeHtml(session.title || session.sessionId) + '</div>' +
        actLine +
        '<div style="opacity:0.8">' + escapeHtml(sm.label) + (session.detail ? ' · ' + escapeHtml(session.detail) : '') + escapeHtml(ctxPct) + '</div>';
      const left = Math.min(Math.max(8, clientX - rect.left + 12), Math.max(8, rect.width - 288));
      const top = Math.min(Math.max(8, clientY - rect.top + 12), Math.max(8, rect.height - 86));
      tooltipEl.style.left = left + 'px';
      tooltipEl.style.top = top + 'px';
      tooltipEl.style.display = 'block';
    }

    if (canvas) {
      canvas.addEventListener('mousemove', (e) => {
        const hit = hitTest(e.clientX, e.clientY);
        hoveredId = hit ? hit.sessionId : null;
        canvas.style.cursor = hit ? 'pointer' : 'default';
        if (hit) showTooltip(hit, e.clientX, e.clientY);
        else hideTooltip();
      });
      canvas.addEventListener('mouseleave', () => {
        hoveredId = null;
        canvas.style.cursor = 'default';
        hideTooltip();
      });
      canvas.addEventListener('click', (e) => {
        const hit = hitTest(e.clientX, e.clientY);
        if (hit) {
          selectedId = hit.sessionId;
          updateInspector();
          draw();
        }
      });
      canvas.addEventListener('dblclick', (e) => {
        const hit = hitTest(e.clientX, e.clientY);
        if (hit) {
          vscode.postMessage({ action: 'open', sessionId: hit.sessionId, provider: hit.provider });
        }
      });
    }

    function startLoop() {
      if (rafId !== null || !isActive || document.hidden) return;
      lastFrameAt = Date.now();
      const step = () => {
        if (!isActive || document.hidden) {
          rafId = null;
          return;
        }
        tick++;
        stepSimulation(Date.now());
        draw();
        rafId = requestAnimationFrame(step);
      };
      rafId = requestAnimationFrame(step);
    }

    function stopLoop() {
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    }

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stopLoop();
      else if (isActive) startLoop();
    });

    function syncPopoutSelects(payload) {
      if (providerSelect && payload.filter) {
        providerSelect.value = payload.filter;
      }
      if (projectSelect && payload.counts && payload.counts.byProject) {
        const currentProj = payload.projectFilter || 'all';
        const names = Object.keys(payload.counts.byProject).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base', numeric: true }));
        projectSelect.innerHTML = '<option value="all">Alle Projekte (' + (payload.counts.all || 0) + ')</option>' +
          names.map((n) => '<option value="' + escapeHtml(n) + '">' + escapeHtml(n) + ' (' + payload.counts.byProject[n] + ')</option>').join('');
        projectSelect.value = currentProj;
      }
    }

    window.__aiOffice = {
      update(payload) {
        if (!payload) return;
        const now = Date.now();
        const completed = Array.isArray(payload.justCompletedSessionIds) ? payload.justCompletedSessionIds : [];

        layout = buildOfficeLayout(payload.columns || [], deskSlots);
        deskSlots = layout.slots;
        if (canvas) {
          if (canvas.width !== layout.canvasWidth) canvas.width = layout.canvasWidth;
          if (canvas.height !== layout.canvasHeight) canvas.height = layout.canvasHeight;
        }
        syncActorsWithLayout(layout.items, completed, now);

        if (selectedId && !layout.items.some((s) => s.sessionId === selectedId)) {
          selectedId = null;
        }
        if (!selectedId && layout.items.length > 0) {
          selectedId = layout.items[0].sessionId;
        }
        if (IS_POPOUT) syncPopoutSelects(payload);
        updateLegend();
        updateInspector();
        draw();
      },
      setActive(active) {
        isActive = Boolean(active);
        if (isActive) {
          draw();
          startLoop();
        } else {
          stopLoop();
          hideTooltip();
        }
      },
      getStats() {
        const phases = {};
        actors.forEach((a, sid) => {
          phases[sid] = { phase: a.phase, coffeeSlot: a.coffeeSlot, hasCoffeeCup: a.hasCoffeeCup };
        });
        return {
          coffeeQueueCount: countActiveCoffeeActors(),
          confettiCount: confetti.length,
          phases
        };
      }
    };

    if (IS_POPOUT) {
      startLoop();
    }
  })();`;
}

module.exports = {
  OFFICE_ACTIVE_STATES,
  PROVIDER_PALETTE,
  buildOfficeLayout,
  getOfficeStyles,
  getOfficeHtml,
  getOfficeClientScript
};
