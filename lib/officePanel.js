'use strict';

// Standalone popout WebviewPanel for the Office Floor view (supports second monitor placement).

const vscode = require('vscode');
const crypto = require('crypto');
const { buildSessionColumns } = require('./format');
const { getOfficeStyles, getOfficeHtml, getOfficeClientScript } = require('./officeView');

class OfficePanel {
  constructor(model) {
    this.model = model;
    this.panel = null;
  }

  show(viewColumn = vscode.ViewColumn.Beside) {
    if (this.panel) {
      this.panel.reveal(viewColumn);
      this.update();
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'sessionDashboard.office',
      'AI Sessions · Büro',
      viewColumn,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    this.attach(panel);
  }

  attach(panel) {
    this.panel = panel;
    if (this.model && this.model.extensionUri) {
      this.panel.iconPath = vscode.Uri.joinPath(this.model.extensionUri, 'resources', 'icon.svg');
    }
    this.panel.webview.options = { enableScripts: true };
    this.panel.webview.html = this.html();

    this.panel.webview.onDidReceiveMessage((msg) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.action === 'logError') {
        console.error('[OfficePanel Error]', msg);
        return;
      }
      if (msg.action === 'ready') {
        this.update();
        return;
      }
      if (msg.action === 'setFilter') {
        if (this.model && typeof this.model.setFilter === 'function') {
          this.model.setFilter(msg.filter).then(() => {
            this.update();
            vscode.commands.executeCommand('sessionDashboard.syncViews');
          });
        }
        return;
      }
      if (msg.action === 'setProjectFilter') {
        if (this.model && typeof this.model.setProjectFilter === 'function') {
          this.model.setProjectFilter(msg.filter).then(() => {
            this.update();
            vscode.commands.executeCommand('sessionDashboard.syncViews');
          });
        }
        return;
      }
      if (typeof msg.sessionId !== 'string' || !msg.sessionId) return;
      if (msg.action === 'open') {
        vscode.commands.executeCommand('sessionDashboard.open', { sessionId: msg.sessionId, provider: msg.provider });
      } else if (msg.action === 'viewTranscript') {
        vscode.commands.executeCommand('sessionDashboard.viewTranscript', { sessionId: msg.sessionId, provider: msg.provider });
      } else if (msg.action === 'openJira') {
        vscode.commands.executeCommand('sessionDashboard.openJira', msg.sessionId);
      } else if (msg.action === 'assignTicket') {
        vscode.commands.executeCommand('sessionDashboard.assignTicket', msg.sessionId);
      } else if (msg.action === 'toggleBookmark') {
        vscode.commands.executeCommand('sessionDashboard.toggleBookmark', msg.sessionId);
      } else if (msg.action === 'markDone') {
        vscode.commands.executeCommand('sessionDashboard.markDone', msg.sessionId);
      }
    });

    this.panel.onDidDispose(() => {
      this.panel = null;
    });
  }

  update(justCompletedSessionIds = []) {
    if (!this.panel) return;
    const now = Date.now();
    const columns = buildSessionColumns(this.model, now);
    const jiraBaseUrl = vscode.workspace.getConfiguration('sessionDashboard').get('jiraBaseUrl', '');
    this.panel.webview.postMessage({
      type: 'render',
      isLoaded: Boolean(this.model && this.model.isInitialLoaded),
      jiraEnabled: Boolean(jiraBaseUrl && String(jiraBaseUrl).trim()),
      filter: this.model ? this.model.providerFilter : 'all',
      projectFilter: this.model ? this.model.projectFilter : 'all',
      counts: this.model && typeof this.model.counts === 'function' ? this.model.counts() : { all: 0, byProject: {} },
      columns,
      justCompletedSessionIds: Array.isArray(justCompletedSessionIds) ? justCompletedSessionIds : []
    });
  }

  html() {
    const nonce = crypto.randomBytes(16).toString('base64');
    const csp = `default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';`;
    return `<!DOCTYPE html>
<html lang="de">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
  body {
    font-family: var(--vscode-font-family);
    color: var(--vscode-foreground);
    padding: 14px;
    font-size: 13px;
    line-height: 1.4;
    box-sizing: border-box;
    margin: 0;
  }
  #office-loader {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 60px 20px;
    gap: 14px;
    color: var(--vscode-descriptionForeground);
  }
  #office-loader.hidden {
    display: none !important;
  }
  .office-spinner {
    width: 28px;
    height: 28px;
    border: 3px solid rgba(128, 128, 128, 0.2);
    border-top-color: var(--vscode-progressBar-background, #007acc);
    border-radius: 50%;
    animation: office-spin 0.8s linear infinite;
  }
  @keyframes office-spin {
    to { transform: rotate(360deg); }
  }
  ${getOfficeStyles()}
</style>
</head>
<body>
<div id="office-loader">
  <div class="office-spinner"></div>
  <div>Lade Büro-Ansicht…</div>
</div>
<div class="office-view" id="office-view" style="display: none;">
  ${getOfficeHtml({ isPopout: true })}
</div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();

  window.addEventListener('error', (e) => {
    vscode.postMessage({
      action: 'logError',
      message: e.message || 'Unknown error',
      lineno: e.lineno,
      colno: e.colno
    });
  });

  ${getOfficeClientScript({ isPopout: true })}

  const loaderEl = document.getElementById('office-loader');
  const officeEl = document.getElementById('office-view');

  window.addEventListener('message', (ev) => {
    if (!ev.data || ev.data.type !== 'render') return;
    if (ev.data.isLoaded === false) {
      if (loaderEl) loaderEl.classList.remove('hidden');
      if (officeEl) officeEl.style.display = 'none';
      return;
    }
    if (loaderEl) loaderEl.classList.add('hidden');
    if (officeEl) officeEl.style.display = 'flex';
    if (window.__aiOffice) {
      window.__aiOffice.update(ev.data);
      window.__aiOffice.setActive(true);
    }
  });

  vscode.postMessage({ action: 'ready' });
</script>
</body>
</html>`;
  }
}

module.exports = { OfficePanel };
