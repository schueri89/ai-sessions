'use strict';

// Board view in an editor tab: one column per state, one card per session.

const vscode = require('vscode');
const crypto = require('crypto');
const { STATES, STATE_ORDER, describe } = require('./format');

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
      'Claude Sessions',
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
      if (!msg || typeof msg.sessionId !== 'string') return;
      const commands = {
        open: 'sessionDashboard.open',
        markDone: 'sessionDashboard.markDone',
        unmarkDone: 'sessionDashboard.unmarkDone'
      };
      if (msg && msg.action === 'markAllClosedDone') {
        vscode.commands.executeCommand('sessionDashboard.markAllClosedDone');
        return;
      }
      if (!msg || typeof msg.sessionId !== 'string') return;
      const commands = {
        open: 'sessionDashboard.open',
        markDone: 'sessionDashboard.markDone',
        unmarkDone: 'sessionDashboard.unmarkDone'
      };
      if (commands[msg.action]) vscode.commands.executeCommand(commands[msg.action], msg.sessionId);
    });
    this.panel.onDidDispose(() => {
      this.panel = null;
    });
  }

  update() {
    if (!this.panel) return;
    const now = Date.now();
    const columns = STATE_ORDER.map((state) => ({
      state,
      label: STATES[state].label,
      sessions: this.model.sessions
        .filter((s) => s.displayState === state)
        .map((s) => ({
          sessionId: s.sessionId,
          title: s.title,
          detail: describe(s, now),
          lastPrompt: s.lastPrompt
        }))
    }));
    this.panel.webview.postMessage({ type: 'render', columns });
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
  .board { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; align-items: start; }
  .column h2 { font-size: 0.85em; text-transform: uppercase; letter-spacing: 0.05em; margin: 0 0 8px; opacity: 0.8; }
  .column h2 .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
  .waiting .dot { background: var(--vscode-charts-orange); }
  .busy .dot { background: var(--vscode-charts-blue); }
  .idle .dot { background: var(--vscode-charts-green); }
  .done .dot { background: var(--vscode-disabledForeground); }
  .card { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-widget-border, transparent);
    border-left: 3px solid transparent; border-radius: 4px; padding: 8px 10px; margin-bottom: 8px; cursor: pointer; }
  .card:hover { background: var(--vscode-list-hoverBackground); }
  .waiting .card { border-left-color: var(--vscode-charts-orange); }
  .busy .card { border-left-color: var(--vscode-charts-blue); }
  .idle .card { border-left-color: var(--vscode-charts-green); }
  .done .card { opacity: 0.6; }
  .title { font-weight: 600; margin-bottom: 2px; overflow-wrap: anywhere; }
  .detail { font-size: 0.85em; opacity: 0.75; }
  .prompt { font-size: 0.85em; opacity: 0.75; margin-top: 6px; display: -webkit-box; -webkit-line-clamp: 2;
    -webkit-box-orient: vertical; overflow: hidden; overflow-wrap: anywhere; }
  .actions { margin-top: 6px; text-align: right; }
  button { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground);
    border: none; border-radius: 2px; padding: 2px 8px; cursor: pointer; font-size: 0.85em; }
  button:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .empty { font-size: 0.85em; opacity: 0.5; font-style: italic; }
</style>
</head>
<body>
<div class="board" id="board"></div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const board = document.getElementById('board');

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
      column.append(heading);
      if (col.sessions.length === 0) column.append(el('div', 'empty', 'keine'));
      for (const s of col.sessions) {
        const card = el('div', 'card');
        card.title = 'Chat öffnen';
        card.append(el('div', 'title', s.title));
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
        card.addEventListener('click', () => vscode.postMessage({ action: 'open', sessionId: s.sessionId }));
        column.append(card);
      }
      board.append(column);
    }
  }

  window.addEventListener('message', (ev) => {
    if (ev.data && ev.data.type === 'render') render(ev.data.columns);
  });
  vscode.postMessage({ action: 'ready' });
</script>
</body>
</html>`;
  }
}

module.exports = { BoardPanel };
