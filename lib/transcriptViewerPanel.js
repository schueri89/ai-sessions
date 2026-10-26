'use strict';

const vscode = require('vscode');
const path = require('path');
const { getSessionTranscript } = require('./transcriptParser');
const { formatTokens } = require('./format');

// Active viewer panels by sessionId
const activePanels = new Map();

function formatCurrency(val) {
  if (typeof val !== 'number' || isNaN(val)) return '$0.00';
  return '$' + val.toFixed(2);
}

function formatActiveMinutes(minutes) {
  if (!minutes || minutes <= 0) return '0m';
  if (minutes < 60) return minutes + 'm';
  const hrs = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins === 0 ? (hrs + 'h') : (hrs + 'h ' + mins + 'm');
}

function formatSpan(spanMs) {
  if (!spanMs || spanMs <= 0) return '–';
  const totalMin = Math.round(spanMs / 60000);
  if (totalMin < 60) return totalMin + 'm';
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  if (hrs < 24) return mins === 0 ? (hrs + 'h') : (hrs + 'h ' + mins + 'm');
  const days = Math.floor(hrs / 24);
  const remHrs = hrs % 24;
  return remHrs === 0 ? (days + 'd') : (days + 'd ' + remHrs + 'h');
}

function formatTurnDuration(ms) {
  if (!ms || ms <= 0) return '';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return sec + 's';
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s === 0 ? (m + 'm') : (m + 'm ' + s + 's');
}

function formatDate(ts, withSeconds = false) {
  if (!ts) return '–';
  const d = new Date(ts);
  const timeOpt = withSeconds
    ? { hour: '2-digit', minute: '2-digit', second: '2-digit' }
    : { hour: '2-digit', minute: '2-digit' };
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ', ' +
    d.toLocaleTimeString('de-DE', timeOpt) + ' Uhr';
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

class TranscriptViewerPanel {
  static show(context, sessionInfo) {
    if (!sessionInfo || !sessionInfo.sessionId) return;
    const sessionId = sessionInfo.sessionId;
    const provider = sessionInfo.provider || 'claude';

    const existing = activePanels.get(sessionId);
    if (existing) {
      existing.panel.reveal();
      return;
    }

    const transcript = getSessionTranscript(sessionId, provider);
    if (!transcript) {
      vscode.window.showWarningMessage(`Für Session ${sessionId} wurde keine Transkript-Datei gefunden.`);
      return;
    }

    const titlePrefix = provider === 'cline' ? '🤖 ' : (provider === 'codex' ? '🟢 ' : (provider === 'claude' ? '🟣 ' : (provider === 'copilot' ? '🤖 ' : '🔷 ')));
    const tabTitle = `${titlePrefix}${transcript.title.slice(0, 24) || 'Session'} (Read-Only)`;

    const panel = vscode.window.createWebviewPanel(
      'sessionDashboard.transcriptViewer',
      tabTitle,
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    const viewer = new TranscriptViewerPanel(panel, transcript, context);
    activePanels.set(sessionId, viewer);

    panel.onDidDispose(() => {
      activePanels.delete(sessionId);
    });
  }

  constructor(panel, transcript, context) {
    this.panel = panel;
    this.transcript = transcript;
    this.context = context;

    this.panel.webview.onDidReceiveMessage((msg) => {
      if (!msg) return;
      if (msg.action === 'openInCli') {
        vscode.commands.executeCommand('sessionDashboard.open', {
          sessionId: this.transcript.sessionId,
          provider: this.transcript.provider
        });
      } else if (msg.action === 'copyPath') {
        if (this.transcript.filePath) {
          vscode.env.clipboard.writeText(this.transcript.filePath);
          vscode.window.showInformationMessage('Transkript-Pfad in Zwischenablage kopiert!');
        }
      } else if (msg.action === 'copyText' && msg.text) {
        vscode.env.clipboard.writeText(msg.text);
        vscode.window.showInformationMessage('In Zwischenablage kopiert!');
      }
    });

    this.render();
  }

  render() {
    this.panel.webview.html = this.getHtml();
  }

  getHtml() {
    const t = this.transcript;
    const isClaude = t.provider === 'claude';
    const isCopilot = t.provider === 'copilot';
    const isCodex = t.provider === 'codex';
    const isCline = t.provider === 'cline';
    const provName = isCline ? 'Cline' : (isCodex ? 'OpenAI Codex' : (isClaude ? 'Claude Code' : (isCopilot ? 'GitHub Copilot' : 'Antigravity')));
    const provColor = isCline ? '#388bfd' : (isCodex ? '#10a37f' : (isClaude ? '#f26522' : (isCopilot ? '#10b981' : '#4285f4')));
    const provIcon = isCline ? '🤖' : (isCodex ? '🟢' : (isClaude ? '🟣' : (isCopilot ? '🤖' : '🔷')));

    return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(t.title)} - Read-Only Viewer</title>
<style>
  :root {
    --bg-card: var(--vscode-editorWidget-background, #252526);
    --border-card: var(--vscode-widget-border, rgba(128, 128, 128, 0.25));
    --font-mono: var(--vscode-editor-font-family, monospace);
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 0;
    background: var(--vscode-editor-background, #1e1e1e);
    color: var(--vscode-editor-foreground, #cccccc);
    font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif);
    font-size: 13.5px;
    line-height: 1.5;
  }

  /* Sticky Top Header */
  .top-header {
    position: sticky;
    top: 0;
    z-index: 100;
    background: var(--vscode-editor-background, #1e1e1e);
    border-bottom: 1px solid var(--border-card);
    padding: 14px 20px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.25);
  }
  .title-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 10px;
  }
  .title-left {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-width: 75%;
  }
  .title-heading {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 17px;
    font-weight: 700;
    color: var(--vscode-foreground, #fff);
    margin: 0;
  }
  .prov-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    background: rgba(128, 128, 128, 0.15);
  }
  .meta-sub-row {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12.5px;
    opacity: 0.85;
    flex-wrap: wrap;
  }
  .project-badge {
    background: rgba(112, 169, 255, 0.18);
    color: #70a9ff;
    padding: 2px 7px;
    border-radius: 4px;
    font-weight: 600;
    font-size: 12px;
  }
  .actions-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }
  .btn-action {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    padding: 5px 12px;
    border-radius: 4px;
    cursor: pointer;
    border: 1px solid var(--border-card);
    background: var(--vscode-button-secondaryBackground, #3a3d41);
    color: var(--vscode-button-secondaryForeground, #ffffff);
    font-weight: 500;
    transition: all 0.15s ease;
  }
  .btn-action:hover { background: var(--vscode-button-secondaryHoverBackground, #45494e); }
  .btn-action.primary {
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #ffffff);
    border-color: transparent;
    font-weight: 600;
  }
  .btn-action.primary:hover { background: var(--vscode-button-hoverBackground, #1177bb); }

  /* KPI Metric Chips */
  .kpi-row {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    align-items: center;
    margin-top: 10px;
  }
  .kpi-pill {
    background: var(--bg-card);
    border: 1px solid var(--border-card);
    border-radius: 5px;
    padding: 4px 10px;
    font-size: 12.5px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  .kpi-pill-val { font-family: var(--font-mono); font-weight: 600; color: #4ec9b0; }
  .kpi-pill-val.blue { color: #70a9ff; }
  .kpi-pill-val.amber { color: #e5c07b; }

  /* Filter & Search Bar */
  .filter-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 12px;
    margin-top: 12px;
    flex-wrap: wrap;
  }
  .search-wrap {
    flex: 1;
    min-width: 240px;
    max-width: 480px;
    position: relative;
  }
  .search-input {
    width: 100%;
    padding: 6px 12px 6px 30px;
    border-radius: 4px;
    background: var(--vscode-input-background, #3c3c3c);
    color: var(--vscode-input-foreground, #cccccc);
    border: 1px solid var(--vscode-input-border, #3c3c3c);
    font-size: 13px;
    outline: none;
  }
  .search-input:focus { border-color: var(--vscode-focusBorder, #007acc); }
  .search-icon {
    position: absolute;
    left: 9px;
    top: 50%;
    transform: translateY(-50%);
    opacity: 0.6;
    pointer-events: none;
    font-size: 12px;
  }
  .toggles-wrap {
    display: flex;
    gap: 8px;
    align-items: center;
  }
  .toggle-btn {
    font-size: 12px;
    padding: 4px 10px;
    border-radius: 4px;
    border: 1px solid var(--border-card);
    background: rgba(128,128,128,0.12);
    color: var(--vscode-foreground);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    transition: all 0.15s ease;
  }
  .toggle-btn.active {
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #fff);
    font-weight: 600;
    border-color: transparent;
  }

  /* Turns Container */
  .turns-wrapper {
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  /* Single Turn Card */
  .turn-card {
    background: var(--bg-card);
    border: 1px solid var(--border-card);
    border-radius: 6px;
    overflow: hidden;
    transition: border-color 0.15s ease;
  }
  .turn-card:hover { border-color: var(--vscode-focusBorder, rgba(128, 128, 128, 0.4)); }
  .turn-card.collapsed .turn-body {
    display: none;
  }
  .turn-card.collapsed .turn-topbar {
    border-bottom: none;
  }
  .turn-topbar {
    background: rgba(128, 128, 128, 0.08);
    border-bottom: 1px solid var(--border-card);
    padding: 8px 14px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12.5px;
    cursor: pointer;
    user-select: none;
    transition: background 0.1s ease;
  }
  .turn-topbar:hover {
    background: rgba(128, 128, 128, 0.14);
  }
  .turn-topbar-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    overflow: hidden;
    flex: 1;
    margin-right: 12px;
  }
  .turn-chevron {
    display: inline-block;
    transition: transform 0.15s ease;
    font-size: 10px;
    opacity: 0.7;
    width: 14px;
    text-align: center;
    flex-shrink: 0;
  }
  .turn-card.collapsed .turn-chevron {
    transform: rotate(-90deg);
  }
  .turn-prompt-preview {
    display: none;
    opacity: 0.75;
    font-size: 12px;
    font-style: italic;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .turn-card.collapsed .turn-prompt-preview {
    display: inline;
  }
  .turn-badge { font-weight: 700; color: #70a9ff; font-family: var(--font-mono); flex-shrink: 0; }
  .turn-meta { opacity: 0.8; font-family: var(--font-mono); font-size: 12px; flex-shrink: 0; white-space: nowrap; }

  /* Turn Sections */
  .turn-body { padding: 14px; display: flex; flex-direction: column; gap: 14px; }

  /* User Prompt */
  .user-box {
    background: rgba(112, 169, 255, 0.07);
    border-left: 3px solid #70a9ff;
    border-radius: 0 4px 4px 0;
    padding: 10px 14px;
  }
  .box-label {
    font-size: 11.5px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    opacity: 0.8;
    margin-bottom: 6px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .user-text {
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 13.5px;
    line-height: 1.5;
  }

  /* Thinking Box (Collapsible) */
  .thinking-box {
    background: rgba(229, 192, 123, 0.05);
    border: 1px dashed rgba(229, 192, 123, 0.3);
    border-radius: 4px;
    padding: 8px 12px;
  }
  .thinking-summary {
    cursor: pointer;
    font-weight: 600;
    font-size: 12.5px;
    color: #e5c07b;
    display: flex;
    align-items: center;
    gap: 6px;
    user-select: none;
  }
  .thinking-content {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid rgba(229, 192, 123, 0.15);
    white-space: pre-wrap;
    word-break: break-word;
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.5;
    opacity: 0.85;
    max-height: 380px;
    overflow-y: auto;
  }

  /* Tools List */
  .tools-section {
    background: rgba(16, 185, 129, 0.05);
    border: 1px solid rgba(16, 185, 129, 0.2);
    border-radius: 4px;
    padding: 8px 12px;
  }
  .tools-summary {
    cursor: pointer;
    font-weight: 600;
    font-size: 12.5px;
    color: #10b981;
    display: flex;
    align-items: center;
    gap: 6px;
    user-select: none;
  }
  .tools-list {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid rgba(16, 185, 129, 0.15);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .tool-item {
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(128, 128, 128, 0.15);
    border-radius: 3px;
    padding: 6px 10px;
    font-size: 12.5px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .tool-item-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 600;
  }
  .tool-params {
    font-family: var(--font-mono);
    font-size: 11.5px;
    opacity: 0.8;
    word-break: break-all;
  }

  /* Assistant Response */
  .assistant-box {
    background: rgba(255, 255, 255, 0.02);
    border-left: 3px solid ${provColor};
    border-radius: 0 4px 4px 0;
    padding: 10px 14px;
  }
  .assistant-content {
    font-size: 13.5px;
    line-height: 1.6;
    word-break: break-word;
  }
  .assistant-content p { margin: 0 0 10px 0; }
  .assistant-content p:last-child { margin-bottom: 0; }
  .assistant-content h1, .assistant-content h2, .assistant-content h3 {
    margin: 14px 0 8px 0;
    color: var(--vscode-foreground, #fff);
  }
  .assistant-content h1 { font-size: 16px; }
  .assistant-content h2 { font-size: 15px; }
  .assistant-content h3 { font-size: 14px; }
  .assistant-content pre {
    background: var(--vscode-textCodeBlock-background, rgba(0,0,0,0.3));
    border: 1px solid var(--border-card);
    border-radius: 4px;
    padding: 10px 12px;
    overflow-x: auto;
    font-family: var(--font-mono);
    font-size: 12.5px;
    margin: 10px 0;
  }
  .assistant-content code {
    font-family: var(--font-mono);
    background: rgba(128,128,128,0.15);
    padding: 2px 5px;
    border-radius: 3px;
    font-size: 12px;
  }
  .assistant-content pre code {
    background: transparent;
    padding: 0;
  }
  .copy-btn {
    border: none;
    background: transparent;
    color: var(--vscode-foreground);
    cursor: pointer;
    opacity: 0.6;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 11.5px;
    transition: opacity 0.15s ease;
  }
  .copy-btn:hover { opacity: 1; background: rgba(128, 128, 128, 0.2); }

  .empty-note {
    text-align: center;
    padding: 40px 20px;
    opacity: 0.7;
    font-style: italic;
  }
</style>
</head>
<body>

<header class="top-header">
  <div class="title-row">
    <div class="title-left">
      <h1 class="title-heading">
        <span class="prov-badge" style="border-left: 3px solid ${provColor};">
          ${provIcon} ${provName}
        </span>
        ${escapeHtml(t.title)}
      </h1>
      <div class="meta-sub-row">
        <span class="project-badge">📁 ${escapeHtml(t.project)}</span>
        <span>🤖 <strong>${escapeHtml(t.model)}</strong></span>
        <span>📅 ${formatDate(t.startedAt)}</span>
        <span title="Aktive Arbeitszeit: ${formatActiveMinutes(t.activeMinutes)} (Minuten mit Aktivität) · Zeitspanne: ${formatSpan(t.spanMs)} (vom Beginn bis zum Ende)">⏱️ Aktiv: <strong>${formatActiveMinutes(t.activeMinutes)}</strong> <span style="opacity: 0.75; font-weight: normal;">(Spanne: ${formatSpan(t.spanMs)})</span></span>
      </div>
    </div>
    <div class="actions-right">
      <button class="btn-action primary" id="btn-open-cli" title="In interaktiver CLI oder Chat weiterarbeiten">
        🚀 In CLI öffnen
      </button>
      <button class="btn-action" id="btn-copy-path" title="Pfad zur Transkriptdatei kopieren">
        📋 Pfad kopieren
      </button>
    </div>
  </div>

  <div class="kpi-row">
    <div class="kpi-pill">
      <span>⚡ Gesamt-Tokens:</span>
      <span class="kpi-pill-val blue">${formatTokens(t.totalTokens)}</span>
    </div>
    <div class="kpi-pill">
      <span>💲 Gesch. Kosten:</span>
      <span class="kpi-pill-val">${formatCurrency(t.cost)}</span>
    </div>
    <div class="kpi-pill">
      <span>💬 Dialog-Turns:</span>
      <span class="kpi-pill-val amber">${t.turnsCount}</span>
    </div>
    <div class="kpi-pill">
      <span>🛠️ Tool-Aufrufe:</span>
      <span class="kpi-pill-val">${t.toolsCount}</span>
    </div>
  </div>

  <div class="filter-row">
    <div class="search-wrap">
      <span class="search-icon">🔍</span>
      <input type="text" class="search-input" id="search-input" placeholder="Im Transkript suchen (Prompts, Antworten, Tools)..." autocomplete="off" spellcheck="false">
    </div>
    <div class="toggles-wrap">
      <button class="toggle-btn" id="toggle-collapse-all" title="Alle Turns einklappen oder ausklappen">↕️ Alle einklappen</button>
      <button class="toggle-btn active" id="toggle-tools">🛠️ Tools anzeigen</button>
      <button class="toggle-btn active" id="toggle-thinking">🧠 Thinking anzeigen</button>
      <button class="toggle-btn" id="toggle-prompts-only">Nur Prompts</button>
    </div>
  </div>
</header>

<main class="turns-wrapper" id="turns-container">
  ${t.turns.length === 0 ? '<div class="empty-note">Keine Turns in diesem Transkript gefunden.</div>' : ''}
  ${t.turns.map((turn) => this.renderTurnCard(turn)).join('')}
</main>

<script>
  const vscode = acquireVsCodeApi();

  document.getElementById('btn-open-cli')?.addEventListener('click', () => {
    vscode.postMessage({ action: 'openInCli' });
  });

  document.getElementById('btn-copy-path')?.addEventListener('click', () => {
    vscode.postMessage({ action: 'copyPath' });
  });

  // Copy buttons
  document.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const text = btn.getAttribute('data-copy') || '';
      if (text) {
        vscode.postMessage({ action: 'copyText', text });
        const old = btn.textContent;
        btn.textContent = '✓ Kopiert';
        setTimeout(() => { btn.textContent = old; }, 1500);
      }
    });
  });

  // Search and Filters
  const searchInput = document.getElementById('search-input');
  const turnCards = document.querySelectorAll('.turn-card');
  const btnToggleTools = document.getElementById('toggle-tools');
  const btnToggleThinking = document.getElementById('toggle-thinking');
  const btnTogglePromptsOnly = document.getElementById('toggle-prompts-only');

  let showTools = true;
  let showThinking = true;
  let promptsOnly = false;

  function updateView() {
    const q = (searchInput.value || '').toLowerCase().trim();

    turnCards.forEach((card) => {
      const text = card.textContent.toLowerCase();
      const matchesSearch = !q || text.includes(q);

      card.style.display = matchesSearch ? 'block' : 'none';
      if (q && matchesSearch) {
        card.classList.remove('collapsed');
      }

      // Toggle elements inside
      const toolsSec = card.querySelector('.tools-section');
      if (toolsSec) toolsSec.style.display = (showTools && !promptsOnly) ? 'block' : 'none';

      const thinkingSec = card.querySelector('.thinking-box');
      if (thinkingSec) thinkingSec.style.display = (showThinking && !promptsOnly) ? 'block' : 'none';

      const assistantSec = card.querySelector('.assistant-box');
      if (assistantSec) assistantSec.style.display = promptsOnly ? 'none' : 'block';
    });
    if (q) updateCollapseAllButtonState();
  }

  searchInput.addEventListener('input', updateView);

  // Turn card collapse / expand toggle
  document.querySelectorAll('.turn-topbar').forEach((topbar) => {
    topbar.addEventListener('click', (ev) => {
      if (ev.target.closest('.copy-btn') || ev.target.closest('a')) return;
      const card = topbar.closest('.turn-card');
      if (card) {
        card.classList.toggle('collapsed');
        updateCollapseAllButtonState();
      }
    });
  });

  const btnCollapseAll = document.getElementById('toggle-collapse-all');
  let allCollapsed = false;

  function updateCollapseAllButtonState() {
    if (!btnCollapseAll) return;
    const cards = Array.from(document.querySelectorAll('.turn-card'));
    if (cards.length === 0) return;
    const visibleCards = cards.filter((c) => c.style.display !== 'none');
    if (visibleCards.length === 0) return;
    const collapsedCount = visibleCards.filter((c) => c.classList.contains('collapsed')).length;
    allCollapsed = (collapsedCount === visibleCards.length);
    btnCollapseAll.textContent = allCollapsed ? '↕️ Alle ausklappen' : '↕️ Alle einklappen';
    btnCollapseAll.classList.toggle('active', allCollapsed);
  }

  if (btnCollapseAll) {
    btnCollapseAll.addEventListener('click', () => {
      allCollapsed = !allCollapsed;
      document.querySelectorAll('.turn-card').forEach((card) => {
        card.classList.toggle('collapsed', allCollapsed);
      });
      btnCollapseAll.textContent = allCollapsed ? '↕️ Alle ausklappen' : '↕️ Alle einklappen';
      btnCollapseAll.classList.toggle('active', allCollapsed);
    });
  }

  btnToggleTools.addEventListener('click', () => {
    showTools = !showTools;
    btnToggleTools.classList.toggle('active', showTools);
    updateView();
  });

  btnToggleThinking.addEventListener('click', () => {
    showThinking = !showThinking;
    btnToggleThinking.classList.toggle('active', showThinking);
    updateView();
  });

  btnTogglePromptsOnly.addEventListener('click', () => {
    promptsOnly = !promptsOnly;
    btnTogglePromptsOnly.classList.toggle('active', promptsOnly);
    updateView();
  });
</script>
</body>
</html>`;
  }

  renderTurnCard(turn) {
    const dateTimeStr = formatDate(turn.timestamp, true);
    const durStr = formatTurnDuration(turn.durationMs);
    const totalTurnTok = turn.inputTokens + turn.outputTokens + turn.cacheReadTokens + turn.cacheWriteTokens;

    let thinkingHtml = '';
    if (turn.thinking && turn.thinking.length > 0) {
      const fullThought = turn.thinking.join('\n\n---\n\n');
      thinkingHtml = `
        <details class="thinking-box" open>
          <summary class="thinking-summary">🧠 Denkprozess (${fullThought.length.toLocaleString('de-DE')} Zeichen)</summary>
          <div class="thinking-content">${escapeHtml(fullThought)}</div>
        </details>
      `;
    }

    let toolsHtml = '';
    if (turn.tools && turn.tools.length > 0) {
      toolsHtml = `
        <details class="tools-section" open>
          <summary class="tools-summary">🛠️ Tool-Aufrufe (${turn.tools.length} Aktionen)</summary>
          <div class="tools-list">
            ${turn.tools.map((t) => {
              const name = t.name || 'tool';
              const inputStr = typeof t.input === 'object' ? JSON.stringify(t.input) : String(t.input || '');
              const cleanInput = inputStr.length > 180 ? inputStr.slice(0, 178) + '…' : inputStr;
              return `
                <div class="tool-item">
                  <div class="tool-item-header">
                    <span>⚙️ <strong>${escapeHtml(name)}</strong></span>
                    ${t.summary ? `<span style="opacity:0.75; font-size:11.5px;">${escapeHtml(t.summary)}</span>` : ''}
                  </div>
                  ${cleanInput ? `<div class="tool-params">${escapeHtml(cleanInput)}</div>` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </details>
      `;
    }

    let assistantHtml = '';
    if (turn.response && turn.response.trim()) {
      assistantHtml = `
        <div class="assistant-box">
          <div class="box-label">
            <span>🤖 Antwort (${this.transcript.provider === 'cline' ? 'Cline' : (this.transcript.provider === 'codex' ? 'Codex' : (this.transcript.provider === 'claude' ? 'Claude' : (this.transcript.provider === 'copilot' ? 'Copilot' : 'Antigravity')))})</span>
            <button class="copy-btn" data-copy="${escapeHtml(turn.response)}">Kopieren</button>
          </div>
          <div class="assistant-content">
            ${this.renderSimpleMarkdown(turn.response)}
          </div>
        </div>
      `;
    }

    const promptTeaser = turn.userPrompt
      ? (turn.userPrompt.replace(/\s+/g, ' ').trim().slice(0, 85) + (turn.userPrompt.length > 85 ? '…' : ''))
      : '';

    return `
      <article class="turn-card">
        <div class="turn-topbar" title="Klicken zum Ein-/Ausklappen dieses Turns">
          <div class="turn-topbar-left">
            <span class="turn-chevron">▼</span>
            <span class="turn-badge">Turn #${turn.index}</span>
            ${promptTeaser ? `<span class="turn-prompt-preview">: „${escapeHtml(promptTeaser)}“</span>` : ''}
          </div>
          <span class="turn-meta">
            📅 ${dateTimeStr}${durStr ? ' · ⏱️ ' + durStr : ''} · ⚡ ${formatTokens(totalTurnTok)} Tokens · ${formatCurrency(turn.cost)}
          </span>
        </div>
        <div class="turn-body">
          ${turn.userPrompt ? `
            <div class="user-box">
              <div class="box-label">
                <span>👤 User Prompt</span>
                <button class="copy-btn" data-copy="${escapeHtml(turn.userPrompt)}">Kopieren</button>
              </div>
              <div class="user-text">${escapeHtml(turn.userPrompt)}</div>
            </div>
          ` : ''}

          ${thinkingHtml}
          ${toolsHtml}
          ${assistantHtml}
        </div>
      </article>
    `;
  }

  renderSimpleMarkdown(text) {
    if (!text) return '';
    let escaped = escapeHtml(text);

    // Code blocks with pre/code
    escaped = escaped.replace(/```([a-zA-Z0-9_\-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
      return `<pre><code>${code.trim()}</code></pre>`;
    });

    // Inline code
    escaped = escaped.replace(/`([^`\n]+)`/g, '<code>$1</code>');

    // Bold
    escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

    // Headers
    escaped = escaped.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    escaped = escaped.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    escaped = escaped.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // Paragraphs
    const paragraphs = escaped.split(/\n\n+/).map((p) => {
      p = p.trim();
      if (!p) return '';
      if (p.startsWith('<pre>') || p.startsWith('<h1>') || p.startsWith('<h2>') || p.startsWith('<h3>')) {
        return p;
      }
      return `<p>${p.replace(/\n/g, '<br/>')}</p>`;
    });

    return paragraphs.join('\n');
  }
}

module.exports = {
  TranscriptViewerPanel
};
