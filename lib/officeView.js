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
  const loungeWidth = 112;
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
    <canvas class="office-canvas" id="office-canvas" width="752" height="276"></canvas>
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

    let deskSlots = new Map();
    let layout = { items: [], rows: 2, colsPerRow: 4, canvasWidth: 752, canvasHeight: 276, totalActive: 0, truncated: false };
    let selectedId = null;
    let hoveredId = null;
    let tick = 0;
    let rafId = null;
    let isActive = IS_POPOUT;
    const celebrationUntil = new Map();

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

    function drawFloorAndProps(p) {
      const w = canvas.width;
      const h = canvas.height;
      for (let y = 0; y < h; y += 18) {
        for (let x = 0; x < w; x += 18) {
          const alt = ((x / 18) + (y / 18)) % 2 === 0;
          px(x, y, 18, 18, alt ? p.floorA : p.floorB);
        }
      }
      // Top office wall & header plaque
      px(0, 0, w, 24, p.wall);
      px(0, 24, w, 3, p.carpetBorder);
      px(Math.floor(w / 2) - 82, 5, 164, 14, '#1E293B');
      ctx.fillStyle = '#F8FAFC';
      ctx.font = 'bold 9.5px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('DEV-FLOOR · AI SESSIONS', Math.floor(w / 2), 15);

      // Carpet zone beneath desks
      const carpetW = Math.max(300, w - 134);
      const carpetH = Math.max(190, h - 54);
      px(30, 38, carpetW, carpetH, p.carpet);
      ctx.strokeStyle = p.carpetBorder;
      ctx.lineWidth = 2;
      ctx.strokeRect(30, 38, carpetW, carpetH);

      // Coffee corner on the right
      const kx = w - 92;
      const ky = 58;
      px(kx, ky, 74, 42, p.deskTop);
      px(kx, ky + 42, 74, 6, p.deskEdge);
      px(kx + 12, ky - 14, 22, 24, '#334155');
      px(kx + 16, ky - 8, 14, 9, '#1E293B');
      px(kx + 19, ky - 4, 8, 5, '#78350F');
      const steam = Math.sin(tick * 0.12) * 2;
      px(kx + 20 + steam, ky - 20, 3, 4, 'rgba(226, 232, 240, 0.6)');
      px(kx + 25 - steam, ky - 24, 3, 4, 'rgba(226, 232, 240, 0.45)');
      ctx.fillStyle = p.muted;
      ctx.font = '9.5px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('KAFFEE', kx + 37, ky + 62);

      // Office plant bottom right
      const py = h - 42;
      px(kx + 26, py, 20, 16, '#9A5B36');
      px(kx + 24, py - 4, 24, 5, '#B46F45');
      px(kx + 30, py - 18, 12, 14, '#2E8B57');
      px(kx + 23, py - 13, 9, 9, '#3CB371');
      px(kx + 40, py - 15, 9, 10, '#3CB371');
    }

    function drawAvatar(x, y, session, p) {
      const meta = PROVIDER_PALETTE[session.provider] || PROVIDER_PALETTE.claude;
      const typingBob = session.state === 'busy' ? (Math.floor(tick / 6) % 2) * 2 : 0;
      const waitBounce = session.state === 'waiting' ? Math.round(Math.sin(tick * 0.18) * 2) : 0;
      const ay = y + waitBounce;

      // Chair back
      px(x + 28, ay + 12, 22, 14, p.chair);
      // Torso
      px(x + 30, ay + 10, 18, 14, meta.shirt);
      // Head & hair
      px(x + 32, ay - 4, 14, 14, '#F1C27D');
      px(x + 31, ay - 6, 16, 5, meta.hair);
      // Eyes
      px(x + 35, ay + 2, 2, 2, '#1E293B');
      px(x + 41, ay + 2, 2, 2, '#1E293B');

      // Arms by state
      if (session.state === 'busy') {
        px(x + 26, ay + 13 + typingBob, 5, 7, meta.shirt);
        px(x + 47, ay + 13 + (2 - typingBob), 5, 7, meta.shirt);
      } else if (session.state === 'waiting') {
        px(x + 26, ay + 13, 5, 6, meta.shirt);
        px(x + 47, ay + 2 + waitBounce, 5, 11, meta.shirt);
      } else {
        px(x + 26, ay + 13, 5, 6, meta.shirt);
        px(x + 47, ay + 13, 5, 6, meta.shirt);
      }
    }

    function drawDesk(session, p, now) {
      const { x, y } = session.desk;
      const meta = PROVIDER_PALETTE[session.provider] || PROVIDER_PALETTE.claude;
      const isSelected = session.sessionId === selectedId;
      const isHovered = session.sessionId === hoveredId;
      const until = celebrationUntil.get(session.sessionId) || 0;
      const isCelebrating = until > now;

      if (isSelected || isHovered || isCelebrating) {
        ctx.strokeStyle = isCelebrating ? '#22C55E' : (isSelected ? p.selectRing : meta.color);
        ctx.lineWidth = isSelected || isCelebrating ? 2.5 : 1.5;
        ctx.strokeRect(x - 6, y - 16, 112, 88);
      }

      drawAvatar(x + 11, y - 6, session, p);

      // Desk surface & front edge
      px(x, y + 18, 100, 34, p.deskTop);
      px(x, y + 52, 100, 5, p.deskEdge);

      // Monitor
      px(x + 30, y + 4, 38, 22, p.monitorFrame);
      if (session.state === 'busy') {
        px(x + 33, y + 7, 32, 16, '#0F2942');
        const shift = Math.floor(tick / 8) % 3;
        px(x + 36, y + 10, 14 + shift * 3, 2, '#38BDF8');
        px(x + 36, y + 14, 22 - shift * 2, 2, '#4ADE80');
        px(x + 36, y + 18, 16, 2, '#A78BFA');
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

      // Coffee mug when idle/done
      if (session.state === 'idle') {
        px(x + 76, y + 26, 8, 8, '#F8FAFC');
        const d = Math.sin(tick * 0.15) * 1.5;
        px(x + 78 + d, y + 20, 2, 4, 'rgba(248, 250, 252, 0.65)');
      }

      // Project nameplate below desk
      px(x + 4, y + 59, 92, 15, p.badgeBg);
      px(x + 7, y + 63, 7, 7, meta.color);
      ctx.fillStyle = p.text;
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'left';
      const label = (session.project || 'ROOT').slice(0, 12);
      ctx.fillText(label, x + 17, y + 70);

      // Status speech bubble
      if (session.state === 'waiting') {
        const bob = Math.round(Math.sin(tick * 0.2) * 2);
        px(x + 72, y - 16 + bob, 22, 16, '#F59E0B');
        ctx.fillStyle = '#111827';
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('?!', x + 83, y - 4 + bob);
      } else if (session.state === 'busy') {
        const dots = '.'.repeat((Math.floor(tick / 12) % 3) + 1);
        px(x + 70, y - 13, 24, 13, '#2563EB');
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(dots, x + 82, y - 3);
      } else if (session.state === 'idle') {
        px(x + 74, y - 13, 18, 13, '#16A34A');
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('✓', x + 83, y - 3);
      } else if (session.state === 'bookmarked') {
        px(x + 74, y - 13, 18, 13, '#9333EA');
        ctx.fillStyle = '#FFFFFF';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('★', x + 83, y - 3);
      }
    }

    function draw() {
      if (!ctx) return;
      const p = getThemePalette();
      const now = Date.now();
      drawFloorAndProps(p);
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
      tooltipEl.innerHTML =
        '<div><strong>' + escapeHtml(session.project || 'ROOT') + '</strong> · <span style="color:' + pm.color + '">' + escapeHtml(pm.label) + '</span></div>' +
        '<div>' + escapeHtml(session.title || session.sessionId) + '</div>' +
        '<div style="opacity:0.8">' + escapeHtml(sm.label) + (session.detail ? ' · ' + escapeHtml(session.detail) : '') + '</div>';
      const left = Math.min(Math.max(8, clientX - rect.left + 12), Math.max(8, rect.width - 288));
      const top = Math.min(Math.max(8, clientY - rect.top + 12), Math.max(8, rect.height - 70));
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
      const step = () => {
        if (!isActive || document.hidden) {
          rafId = null;
          return;
        }
        tick++;
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
        const completed = Array.isArray(payload.justCompletedSessionIds) ? payload.justCompletedSessionIds : [];
        const until = Date.now() + 3000;
        for (const sid of completed) celebrationUntil.set(sid, until);

        layout = buildOfficeLayout(payload.columns || [], deskSlots);
        deskSlots = layout.slots;
        if (canvas) {
          if (canvas.width !== layout.canvasWidth) canvas.width = layout.canvasWidth;
          if (canvas.height !== layout.canvasHeight) canvas.height = layout.canvasHeight;
        }
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
