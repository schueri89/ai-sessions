'use strict';

// Board view in an editor tab: one column per state, one card per session.

const vscode = require('vscode');
const crypto = require('crypto');
const { STATES, STATE_ORDER, describe } = require('./format');

const ICONS = {
  claude: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z"/></svg>',
  antigravity: '<svg viewBox="0 0 113 113" width="14" height="14" fill="currentColor"><path d="M89.6992 93.695C94.3659 97.195 101.366 94.8617 94.9492 88.445C75.6992 69.7783 79.7825 18.445 55.8659 18.445C31.9492 18.445 36.0325 69.7783 16.7825 88.445C9.78251 95.445 17.3658 97.195 22.0325 93.695C40.1159 81.445 38.9492 59.8617 55.8659 59.8617C72.7825 59.8617 71.6159 81.445 89.6992 93.695Z"/></svg>'
};

class BoardPanel {
  constructor(model) {
    this.model = model;
    this.panel = null;
  }

  show() {
    if (this.panel) {
      this.panel.reveal();
      return;
    }
    this.panel = vscode.window.createWebviewPanel(
      'sessionDashboard.board',
      'AI Sessions',
      vscode.ViewColumn.Active,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    this.panel.iconPath = vscode.Uri.joinPath(this.model.extensionUri, 'resources', 'icon.svg');
    this.panel.webview.html = this.html();
    this.panel.webview.onDidReceiveMessage((msg) => {
      if (msg && msg.action === 'ready') {
        this.update();
        return;
      }
      if (msg && msg.action === 'setFilter') {
        this.model.setFilter(msg.filter).then(() => {
          vscode.commands.executeCommand('sessionDashboard.refresh');
        });
        return;
      }
      if (msg && msg.action === 'markAllClosedDone') {
        vscode.commands.executeCommand('sessionDashboard.markAllClosedDone');
        return;
      }
      if (!msg || typeof msg.sessionId !== 'string') return;
      if (msg.action === 'open') {
        vscode.commands.executeCommand('sessionDashboard.open', { sessionId: msg.sessionId, provider: msg.provider });
        return;
      }
      if (msg.action === 'markDone') {
        vscode.commands.executeCommand('sessionDashboard.markDone', msg.sessionId);
        return;
      }
      if (msg.action === 'unmarkDone') {
        vscode.commands.executeCommand('sessionDashboard.unmarkDone', msg.sessionId);
        return;
      }
    });
    this.panel.onDidDispose(() => {
      this.panel = null;
    });
  }

  update() {
    if (!this.panel) return;
    const now = Date.now();
    const visible = this.model.visibleSessions();
    const columns = STATE_ORDER.map((state) => ({
      state,
      label: STATES[state].label,
      sessions: visible
        .filter((s) => s.displayState === state)
        .map((s) => ({
          sessionId: s.sessionId,
          provider: s.provider || 'claude',
          title: s.title,
          detail: describe(s, now),
          lastPrompt: s.lastPrompt
        }))
    }));
    this.panel.webview.postMessage({
      type: 'render',
      filter: this.model.providerFilter,
      counts: this.model.counts(),
      columns
    });
  }

  html() {
    const nonce = crypto.randomBytes(16).toString('base64');
    const csp = `default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}';`;
    return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style nonce="${nonce}">
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 12px; }
  .board { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; align-items: start; }
  .column h2 { font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 8px; opacity: 0.8; }
  .column h2 .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
  .waiting .dot { background: var(--vscode-charts-orange); }
  .busy .dot { background: var(--vscode-charts-blue); }
  .idle .dot { background: var(--vscode-charts-green); }
  .closed .dot { background: var(--vscode-descriptionForeground); }
  .done .dot { background: var(--vscode-disabledForeground); }
  .card { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-widget-border, transparent);
    border-left: 3px solid transparent; border-radius: 4px; padding: 8px 10px; margin-bottom: 8px; cursor: pointer; }
  .card:hover { background: var(--vscode-list-hoverBackground); }
  .waiting .card { border-left-color: var(--vscode-charts-orange); }
  .busy .card { border-left-color: var(--vscode-charts-blue); }
  .idle .card { border-left-color: var(--vscode-charts-green); }
  .closed .card { border-left-color: var(--vscode-descriptionForeground); opacity: 0.85; }
  .done .card { opacity: 0.6; }
  .mark-all-btn { float: right; font-size: 0.75em; padding: 1px 6px; }
  .card-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 3px; }
  .title { font-weight: 600; flex: 1; min-width: 0; overflow-wrap: anywhere; line-height: 1.35; }
  .provider-icon { flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center;
    width: 22px; height: 22px; border-radius: 4px; line-height: 1; margin-top: -1px; }
  .provider-icon svg { width: 14px; height: 14px; display: block; }
  .provider-icon.claude { color: #ff9e79; background: rgba(242, 101, 34, 0.18); border: 1px solid rgba(255, 158, 121, 0.35); }
  .provider-icon.antigravity { color: #70a9ff; background: rgba(66, 133, 244, 0.18); border: 1px solid rgba(112, 169, 255, 0.35); }
  .detail { font-size: 0.85em; opacity: 0.75; }
  .prompt { font-size: 0.85em; opacity: 0.75; margin-top: 6px; display: -webkit-box; -webkit-line-clamp: 2;
    -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
  .actions { margin-top: 6px; text-align: right; }
  button { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground);
    border: none; border-radius: 2px; padding: 2px 8px; cursor: pointer; font-size: 0.85em; }
  button:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .empty { font-size: 0.85em; opacity: 0.5; font-style: italic; }
  .toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; padding-bottom: 8px; border-bottom: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2)); }
  .filter-group { display: flex; gap: 8px; align-items: center; }
  .filter-btn { display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px; border-radius: 4px;
    font-size: 0.85em; font-weight: 500; cursor: pointer; border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.25));
    background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); transition: all 0.15s ease; }
  .filter-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .filter-btn svg { width: 14px; height: 14px; display: block; }
  .filter-btn .count { opacity: 0.75; font-size: 0.9em; margin-left: 2px; }
  .filter-btn.active { font-weight: 600; border-color: transparent; }
  .filter-btn.active[data-filter="all"] { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .filter-btn.active.filter-claude { background: rgba(242, 101, 34, 0.25); color: #ff9e79; border-color: rgba(255, 158, 121, 0.5); }
  .filter-btn.active.filter-antigravity { background: rgba(66, 133, 244, 0.25); color: #70a9ff; border-color: rgba(112, 169, 255, 0.5); }
</style>
</head>
<body>
<header class="toolbar">
  <div class="filter-group">
    <button class="filter-btn active" data-filter="all" id="btn-all">
      Alle <span class="count" id="count-all">0</span>
    </button>
    <button class="filter-btn filter-claude" data-filter="claude" id="btn-claude">
      ${ICONS.claude} Claude Code <span class="count" id="count-claude">0</span>
    </button>
    <button class="filter-btn filter-antigravity" data-filter="antigravity" id="btn-antigravity">
      ${ICONS.antigravity} Antigravity <span class="count" id="count-antigravity">0</span>
    </button>
  </div>
</header>
<div class="board" id="board"></div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const board = document.getElementById('board');
  const ICONS = ${JSON.stringify(ICONS)};

  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const filter = btn.getAttribute('data-filter');
      vscode.postMessage({ action: 'setFilter', filter });
    });
  });

  function updateFilterUI(filter, counts) {
    if (counts) {
      document.getElementById('count-all').textContent = counts.all || 0;
      document.getElementById('count-claude').textContent = counts.claude || 0;
      document.getElementById('count-antigravity').textContent = counts.antigravity || 0;
    }
    filterBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-filter') === (filter || 'all'));
    });
  }

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  }

  function render(columns) {
    board.replaceChildren();
    for (const col of columns) {
      const column = el('section', 'column ' + col.state);
      const heading = el('h2');
      heading.append(el('span', 'dot'), col.label + ' (' + col.sessions.length + ')');
      if (col.state === 'closed' && col.sessions.length > 0) {
        const markAllBtn = el('button', 'mark-all-btn', 'Alle erledigt');
        markAllBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          vscode.postMessage({ action: 'markAllClosedDone' });
        });
        heading.append(markAllBtn);
      }
      column.append(heading);
      if (col.sessions.length === 0) column.append(el('div', 'empty', 'keine'));
      for (const s of col.sessions) {
        const card = el('div', 'card');
        card.title = 'Chat öffnen';
        const cardHeader = el('div', 'card-header');
        cardHeader.append(el('div', 'title', s.title));
        const icon = el('span', 'provider-icon ' + (s.provider || 'claude'));
        icon.title = s.provider === 'antigravity' ? 'Google Antigravity' : 'Claude Code';
        icon.innerHTML = ICONS[s.provider] || ICONS.claude;
        cardHeader.append(icon);
        card.append(cardHeader);
        if (s.detail) card.append(el('div', 'detail', s.detail));
        if (s.lastPrompt) card.append(el('div', 'prompt', s.lastPrompt));
        const actions = el('div', 'actions');
        const toggle = col.state === 'done'
          ? el('button', '', 'Wieder aktiv')
          : el('button', '', 'Erledigt');
        toggle.addEventListener('click', (ev) => {
          ev.stopPropagation();
          vscode.postMessage({ action: col.state === 'done' ? 'unmarkDone' : 'markDone', sessionId: s.sessionId });
        });
        actions.append(toggle);
        card.append(actions);
        card.addEventListener('click', () => vscode.postMessage({ action: 'open', sessionId: s.sessionId, provider: s.provider }));
        column.append(card);
      }
      board.append(column);
    }
  }

  window.addEventListener('message', (ev) => {
    if (!ev.data) return;
    if (ev.data.type === 'render') {
      updateFilterUI(ev.data.filter, ev.data.counts);
      render(ev.data.columns);
    }
  });
  vscode.postMessage({ action: 'ready' });
</script>
</body>
</html>`;
  }
}

module.exports = { BoardPanel };
