'use strict';

// Board view in an editor tab: one column per state, one card per session.

const vscode = require('vscode');
const crypto = require('crypto');
const { version } = require('../package.json');
const { STATES, STATE_ORDER, describe } = require('./format');
const { getAllAnalytics } = require('./analytics');

const ICONS = {
  claude: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z"/></svg>',
  antigravity: '<svg viewBox="0 0 113 113" width="14" height="14" fill="currentColor"><path d="M89.6992 93.695C94.3659 97.195 101.366 94.8617 94.9492 88.445C75.6992 69.7783 79.7825 18.445 55.8659 18.445C31.9492 18.445 36.0325 69.7783 16.7825 88.445C9.78251 95.445 17.3658 97.195 22.0325 93.695C40.1159 81.445 38.9492 59.8617 55.8659 59.8617C72.7825 59.8617 71.6159 81.445 89.6992 93.695Z"/></svg>',
  copilot: '<svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A7.995 7.995 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/></svg>',
  pin: '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a5.927 5.927 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182c-.195.195-1.219.923-1.414.728-.195-.195.533-1.22.728-1.414l3.182-3.182-2.828-2.829a.5.5 0 0 1 0-.707c.688-.688 1.673-.767 2.375-.72a5.922 5.922 0 0 1 1.013.16l3.134-3.133a2.772 2.772 0 0 1-.04-.461c0-.43.108-1.022.589-1.503a.5.5 0 0 1 .353-.146z"/></svg>',
  search: '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/></svg>',
  check: '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0z"/></svg>',
  undo: '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M8 3a5 5 0 1 0 4.546 2.914.5.5 0 0 1 .908-.417A6 6 0 1 1 8 2v1z"/><path d="M8 4.5V1l3.5 2.5L8 4.5z"/></svg>',
  details: '<svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor"><path d="M16 8s-3-5.5-8-5.5S0 8 0 8s3 5.5 8 5.5S16 8 16 8zM1.173 8a13.133 13.133 0 0 1 1.66-2.043C4.12 4.668 5.88 3.5 8 3.5c2.12 0 3.879 1.168 5.168 2.457A13.133 13.133 0 0 1 14.828 8c-.058.087-.122.183-.195.288-.335.48-.83 1.12-1.465 1.755C11.879 11.332 10.119 12.5 8 12.5c-2.12 0-3.879-1.168-5.168-2.457A13.134 13.134 0 0 1 1.172 8z"/><path d="M8 5.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM7 8a1 1 0 1 1 2 0 1 1 0 0 1-2 0z"/></svg>'
};

function isBoardTab(tab) {
  if (!tab || !tab.input) return false;
  const viewType = tab.input.viewType;
  if (typeof viewType === 'string' && (viewType === 'sessionDashboard.board' || viewType.endsWith('sessionDashboard.board'))) {
    return true;
  }
  if (tab.label === 'AI Sessions' && typeof viewType === 'string') {
    return true;
  }
  return false;
}

class BoardPanel {
  constructor(model) {
    this.model = model;
    this.panel = null;
    this.pendingSearch = '';
    this.viewMode = 'board';
    this.analyseFilter = 'all';
    this.analyseScope = 'today';
  }

  attach(panel) {
    this.panel = panel;
    this.panel.iconPath = vscode.Uri.joinPath(this.model.extensionUri, 'resources', 'icon.svg');
    this.panel.webview.options = { enableScripts: true };
    this.panel.webview.html = this.html();
    this.panel.webview.onDidReceiveMessage((msg) => {
      if (msg && msg.action === 'logError') {
        vscode.window.showErrorMessage(`[Dashboard Error] ${msg.message} (Zeile ${msg.lineno || '?'})`);
        console.error('[Dashboard Error]', msg);
        return;
      }
      if (msg && msg.action === 'ready') {
        this.update();
        return;
      }
      if (msg && msg.action === 'setViewMode') {
        this.viewMode = msg.mode === 'analyse' ? 'analyse' : 'board';
        return;
      }
      if (msg && msg.action === 'setAnalyseFilter') {
        this.analyseFilter = msg.filter || 'all';
        return;
      }
      if (msg && msg.action === 'setAnalyseScope') {
        this.analyseScope = msg.scope || 'today';
        return;
      }
      if (msg && msg.action === 'setFilter') {
        this.model.setFilter(msg.filter).then(() => {
          vscode.commands.executeCommand('sessionDashboard.refresh');
        });
        return;
      }
      if (msg && msg.action === 'setProjectFilter') {
        this.model.setProjectFilter(msg.filter).then(() => {
          vscode.commands.executeCommand('sessionDashboard.refresh');
        });
        return;
      }
      if (msg && msg.action === 'toggleSound') {
        vscode.commands.executeCommand('sessionDashboard.toggleSound');
        return;
      }
      if (msg && msg.action === 'toggleBookmark') {
        vscode.commands.executeCommand('sessionDashboard.toggleBookmark', msg.sessionId);
        return;
      }
      if (msg && msg.action === 'unbookmark') {
        vscode.commands.executeCommand('sessionDashboard.unbookmark', msg.sessionId);
        return;
      }
      if (msg && msg.action === 'unbookmarkAll') {
        vscode.commands.executeCommand('sessionDashboard.unbookmarkAll');
        return;
      }
      if (msg && msg.action === 'markAllDone') {
        vscode.commands.executeCommand('sessionDashboard.markAllDone', msg.sessionIds);
        return;
      }
      if (msg && msg.action === 'showDebugLog') {
        vscode.commands.executeCommand('sessionDashboard.showDebugLog');
        return;
      }
      if (!msg || typeof msg.sessionId !== 'string') return;
      if (msg.action === 'open') {
        vscode.commands.executeCommand('sessionDashboard.open', { sessionId: msg.sessionId, provider: msg.provider });
        return;
      }
      if (msg.action === 'viewTranscript') {
        vscode.commands.executeCommand('sessionDashboard.viewTranscript', { sessionId: msg.sessionId, provider: msg.provider });
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

  async closeDuplicateTabs() {
    try {
      if (!vscode.window.tabGroups || !vscode.window.tabGroups.all) return;
      const boardTabs = [];
      for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
          if (isBoardTab(tab)) {
            boardTabs.push(tab);
          }
        }
      }
      if (boardTabs.length > 1) {
        const keepTab = boardTabs.find((t) => t.isActive) || boardTabs[0];
        const duplicates = boardTabs.filter((t) => t !== keepTab);
        if (duplicates.length > 0) {
          await vscode.window.tabGroups.close(duplicates);
        }
      }
    } catch {
      // Non-critical
    }
  }

  async closeAllBoardTabs() {
    try {
      if (!vscode.window.tabGroups || !vscode.window.tabGroups.all) return;
      const toClose = [];
      for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
          if (isBoardTab(tab)) {
            toClose.push(tab);
          }
        }
      }
      if (toClose.length > 0) {
        await vscode.window.tabGroups.close(toClose);
      }
    } catch {
      // Non-critical
    }
  }

  ensurePinned() {
    const config = vscode.workspace.getConfiguration('sessionDashboard');
    if (!config.get('autoPinTab', true)) return;

    setTimeout(async () => {
      try {
        if (vscode.window.tabGroups && vscode.window.tabGroups.all) {
          for (const group of vscode.window.tabGroups.all) {
            for (const tab of group.tabs) {
              if (isBoardTab(tab)) {
                if (tab.isPinned) return;
              }
            }
          }
        }
        await vscode.commands.executeCommand('workbench.action.pinEditor');
      } catch {
        // Non-critical if pinning fails
      }
    }, 150);
  }

  async show(query, viewMode = 'board') {
    this.viewMode = viewMode === 'analyse' ? 'analyse' : 'board';
    if (typeof query === 'string') {
      this.pendingSearch = query;
    }
    if (this.panel) {
      this.panel.reveal();
      if (this.pendingSearch) {
        this.panel.webview.postMessage({ type: 'setSearch', query: this.pendingSearch });
        this.pendingSearch = '';
      }
      this.panel.webview.postMessage({ type: 'setViewMode', mode: this.viewMode });
      this.ensurePinned();
      await this.closeDuplicateTabs();
      return;
    }

    let targetViewColumn = vscode.ViewColumn.Active;
    if (vscode.window.tabGroups && vscode.window.tabGroups.all) {
      for (const group of vscode.window.tabGroups.all) {
        if (group.tabs.some(isBoardTab)) {
          targetViewColumn = group.viewColumn || vscode.ViewColumn.Active;
          break;
        }
      }
    }

    await this.closeAllBoardTabs();

    const panel = vscode.window.createWebviewPanel(
      'sessionDashboard.board',
      'AI Sessions',
      targetViewColumn,
      { enableScripts: true, retainContextWhenHidden: true }
    );
    this.attach(panel);
    this.ensurePinned();
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
          project: s.project || 'ROOT',
          isBookmarked: Boolean(s.isBookmarked),
          rateLimit: s.rateLimit || null,
          tokens: s.tokens || null,
          title: s.title,
          detail: describe(s, now),
          lastPrompt: s.lastPrompt,
          cwd: s.cwd || '',
          activity: s.activity || ''
        }))
    }));
    const initialSearch = this.pendingSearch;
    this.pendingSearch = '';

    let analytics = null;
    try {
      analytics = getAllAnalytics();
    } catch (err) {
      console.error('[SessionDashboard] Error calculating analytics:', err);
    }

    this.panel.webview.postMessage({
      type: 'render',
      filter: this.model.providerFilter,
      projectFilter: this.model.projectFilter,
      counts: this.model.counts(),
      quota: this.model.quota,
      enabledProviders: this.model.getEnabledProviders ? this.model.getEnabledProviders() : { claude: true, antigravity: true, copilot: true },
      initialSearch,
      columns,
      viewMode: this.viewMode,
      analyseFilter: this.analyseFilter,
      analyseScope: this.analyseScope,
      analytics,
      soundEnabled: vscode.workspace.getConfiguration('sessionDashboard.sound').get('enabled', true)
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
  }
  #dashboard-loader {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 70px 20px;
    gap: 16px;
    color: var(--vscode-descriptionForeground);
  }
  #dashboard-loader.hidden {
    display: none !important;
  }
  .loader-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid rgba(128, 128, 128, 0.2);
    border-top-color: var(--vscode-progressBar-background, #007acc);
    border-radius: 50%;
    animation: dashboard-spin 0.8s linear infinite;
  }
  @keyframes dashboard-spin {
    to { transform: rotate(360deg); }
  }
  .loader-text {
    font-size: 13.5px;
    font-weight: 500;
    color: var(--vscode-foreground);
    opacity: 0.85;
  }
  .board {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 14px;
    align-items: start;
  }
  .column h2 {
    font-size: 13px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0 0 10px;
    opacity: 0.85;
    font-weight: 600;
  }
  .column h2 .dot {
    display: inline-block;
    width: 9px;
    height: 9px;
    border-radius: 50%;
    margin-right: 6px;
  }
  .waiting .dot { background: var(--vscode-charts-orange); }
  .busy .dot { background: var(--vscode-charts-blue); }
  .bookmarked .dot { background: var(--vscode-charts-yellow, #e5c07b); }
  .idle .dot { background: var(--vscode-charts-green); }
  .done .dot { background: var(--vscode-disabledForeground); }
  .card {
    background: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-widget-border, transparent);
    border-left: 3px solid transparent;
    border-radius: 5px;
    padding: 10px 12px;
    margin-bottom: 10px;
    cursor: pointer;
  }
  .card:hover { background: var(--vscode-list-hoverBackground); }
  .waiting .card { border-left-color: var(--vscode-charts-orange); }
  .busy .card { border-left-color: var(--vscode-charts-blue); }
  .bookmarked .card { border-left-color: var(--vscode-charts-yellow, #e5c07b); }
  .idle .card { border-left-color: var(--vscode-charts-green); }
  .done .card { opacity: 0.6; }
  .load-more-wrap {
    margin-top: 10px;
    margin-bottom: 12px;
    text-align: center;
  }
  .load-more-btn {
    width: 100%;
    padding: 8px 12px;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
    border-radius: 4px;
    border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.3));
    background: var(--vscode-button-secondaryBackground, rgba(128, 128, 128, 0.15));
    color: var(--vscode-button-secondaryForeground, inherit);
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }
  .load-more-btn:hover {
    background: var(--vscode-button-secondaryHoverBackground, rgba(128, 128, 128, 0.25));
    border-color: var(--vscode-focusBorder, #007acc);
  }
  .mark-all-btn {
    float: right;
    font-size: 11.5px;
    padding: 2px 7px;
    text-transform: none;
    letter-spacing: normal;
    font-weight: normal;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .mark-all-btn svg {
    width: 11px;
    height: 11px;
    display: block;
    flex-shrink: 0;
  }
  .card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 4px;
  }
  .title {
    font-weight: 600;
    font-size: 13.5px;
    flex: 1;
    min-width: 0;
    overflow-wrap: anywhere;
    line-height: 1.4;
  }
  .header-badges {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    flex-shrink: 0;
    margin-top: -1px;
  }
  .pin-btn {
    background: transparent;
    border: none;
    padding: 3px 5px;
    border-radius: 3px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    color: var(--vscode-descriptionForeground);
    opacity: 0.35;
    transition: all 0.15s ease;
  }
  .card:hover .pin-btn { opacity: 0.75; }
  .pin-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground, rgba(128, 128, 128, 0.2)); }
  .pin-btn.active { opacity: 1; color: var(--vscode-charts-yellow, #e5c07b); }
  .pin-btn svg { width: 14px; height: 14px; display: block; }
  .provider-icon {
    flex-shrink: 0;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    line-height: 1;
  }
  .provider-icon svg { width: 15px; height: 15px; display: block; }
  .provider-icon.claude { color: #ff9e79; background: rgba(242, 101, 34, 0.18); border: 1px solid rgba(255, 158, 121, 0.35); }
  .provider-icon.antigravity { color: #70a9ff; background: rgba(66, 133, 244, 0.18); border: 1px solid rgba(112, 169, 255, 0.35); }
  .provider-icon.copilot { color: #34d399; background: rgba(16, 185, 129, 0.18); border: 1px solid rgba(52, 211, 153, 0.35); }
  .detail { font-size: 12.5px; opacity: 0.8; }
  .prompt {
    font-size: 12.5px;
    opacity: 0.8;
    margin-top: 6px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    overflow-wrap: anywhere;
    line-height: 1.4;
  }
  .actions { margin-top: 8px; display: flex; justify-content: flex-end; gap: 6px; align-items: center; }
  .actions button {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    line-height: 1.2;
  }
  .actions button svg {
    width: 12px;
    height: 12px;
    display: block;
    flex-shrink: 0;
  }
  button {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    border: none;
    border-radius: 3px;
    padding: 3px 9px;
    cursor: pointer;
    font-size: 12.5px;
  }
  button:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .empty { font-size: 12.5px; opacity: 0.55; font-style: italic; }
  .toolbar {
    display: flex;
    flex-direction: column;
    gap: 10px;
    margin-bottom: 16px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
  }
  .toolbar-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 12px;
    width: 100%;
  }
  .filter-group { display: flex; gap: 8px; align-items: center; }
  .filter-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 12px;
    border-radius: 4px;
    font-size: 13.5px;
    font-weight: 500;
    cursor: pointer;
    border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.25));
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    transition: all 0.15s ease;
  }
  .filter-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .filter-btn svg { width: 15px; height: 15px; display: block; }
  .filter-btn .count { opacity: 0.8; font-size: 12.5px; margin-left: 3px; font-weight: 600; }
  .filter-btn.active { font-weight: 600; border-color: transparent; }
  .filter-btn.active[data-filter="all"] { background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .filter-btn.active.filter-claude { background: rgba(242, 101, 34, 0.25); color: #ff9e79; border-color: rgba(255, 158, 121, 0.5); }
  .filter-btn.active.filter-antigravity { background: rgba(66, 133, 244, 0.25); color: #70a9ff; border-color: rgba(112, 169, 255, 0.5); }
  .filter-btn.active.filter-copilot { background: rgba(16, 185, 129, 0.25); color: #34d399; border-color: rgba(52, 211, 153, 0.5); }
  .project-chips-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; width: 100%; padding-top: 4px; }
  .project-chips-label { font-size: 12.5px; opacity: 0.75; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; margin-right: 4px; }
  .project-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 12.5px;
    padding: 3px 10px;
    border-radius: 12px;
    cursor: pointer;
    border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.25));
    background: var(--vscode-button-secondaryBackground, rgba(128, 128, 128, 0.1));
    color: var(--vscode-button-secondaryForeground, inherit);
    transition: all 0.15s ease;
  }
  .project-chip:hover { background: var(--vscode-button-secondaryHoverBackground, rgba(128, 128, 128, 0.2)); }
  .project-chip.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: transparent; font-weight: 600; }
  .project-chip .count { opacity: 0.8; font-size: 12px; font-weight: 600; }
  .project-chip-more {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    padding: 3px 9px;
    border-radius: 12px;
    cursor: pointer;
    border: 1px dashed var(--vscode-widget-border, rgba(128, 128, 128, 0.4));
    background: transparent;
    color: var(--vscode-textLink-foreground, #3794ff);
    transition: all 0.15s ease;
    font-weight: 500;
  }
  .project-chip-more:hover {
    background: var(--vscode-button-secondaryHoverBackground, rgba(128, 128, 128, 0.2));
    border-style: solid;
  }
  .card-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin: 4px 0 5px; }
  .project-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 12.5px;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 500;
    line-height: 1.35;
    background: var(--vscode-badge-background, rgba(128, 128, 128, 0.2));
    color: var(--vscode-badge-foreground);
    border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.3));
    cursor: pointer;
    transition: all 0.15s ease;
  }
  .project-badge:hover { filter: brightness(1.2); border-color: var(--vscode-focusBorder, #007acc); }
  .search-group { display: flex; align-items: center; gap: 8px; flex: 1; max-width: 440px; min-width: 240px; justify-content: flex-end; }
  .search-box { position: relative; display: flex; align-items: center; width: 100%; }
  .search-icon {
    position: absolute;
    left: 9px;
    pointer-events: none;
    display: flex;
    align-items: center;
    color: var(--vscode-descriptionForeground, rgba(128, 128, 128, 0.7));
    opacity: 0.8;
    z-index: 1;
  }
  .search-icon svg { width: 14px; height: 14px; display: block; }
  #search-input, .search-input {
    width: 100%;
    height: 28px;
    padding: 4px 28px 4px 30px;
    border-radius: 4px;
    font-size: 13px;
    background: transparent !important;
    color: var(--vscode-foreground) !important;
    border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.35));
    outline: none;
    box-sizing: border-box;
    font-family: inherit;
    transition: all 0.15s ease;
  }
  #search-input:focus, .search-input:focus { border-color: var(--vscode-focusBorder, #007acc); background: rgba(128, 128, 128, 0.08) !important; }
  #search-input::placeholder, .search-input::placeholder { color: var(--vscode-descriptionForeground, rgba(128, 128, 128, 0.6)); opacity: 0.8; }
  .search-clear-btn {
    position: absolute;
    right: 6px;
    background: transparent;
    border: none;
    color: var(--vscode-descriptionForeground, rgba(128, 128, 128, 0.7));
    cursor: pointer;
    padding: 2px 4px;
    font-size: 13px;
    line-height: 1;
    border-radius: 2px;
    z-index: 2;
  }
  .search-clear-btn:hover { color: var(--vscode-foreground); background: var(--vscode-toolbar-hoverBackground, rgba(128, 128, 128, 0.2)); }
  .search-kbd {
    position: absolute;
    right: 8px;
    top: 50%;
    transform: translateY(-50%);
    font-family: inherit;
    font-size: 11px;
    line-height: 14px;
    padding: 1px 5px;
    border-radius: 3px;
    background: var(--vscode-editor-background, rgba(128, 128, 128, 0.15));
    border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.3));
    color: var(--vscode-descriptionForeground, rgba(128, 128, 128, 0.7));
    pointer-events: none;
    user-select: none;
    z-index: 1;
    transition: opacity 0.15s ease;
  }
  #search-input:focus ~ .search-kbd,
  .search-box.has-query .search-kbd {
    display: none;
  }
  .search-status {
    font-size: 12px;
    opacity: 0.9;
    white-space: nowrap;
    padding: 2px 8px;
    border-radius: 3px;
    background: var(--vscode-badge-background, rgba(128, 128, 128, 0.2));
    color: var(--vscode-badge-foreground);
  }
  .search-status.no-matches { background: rgba(229, 192, 123, 0.2); color: #e5c07b; }
  .search-highlight { background: rgba(234, 92, 0, 0.4); color: inherit; border-radius: 2px; padding: 0 1px; font-style: normal; }
  .search-empty-banner {
    grid-column: 1 / -1;
    padding: 32px 16px;
    text-align: center;
    border: 1px dashed var(--vscode-widget-border, rgba(128, 128, 128, 0.3));
    border-radius: 6px;
    margin: 12px 0;
  }
  .search-empty-title { font-size: 1.1em; font-weight: 600; margin-bottom: 6px; }
  .search-empty-text { font-size: 13px; opacity: 0.7; margin-bottom: 12px; }
  .card.rate-limited { border-color: rgba(229, 192, 123, 0.45); }
  .card.rate-limited .detail { color: #e5c07b; opacity: 1; font-weight: 500; }
  .rate-limit-badge {
    display: inline-flex;
    align-items: center;
    font-size: 12px;
    padding: 2px 6px;
    border-radius: 3px;
    font-weight: 600;
    line-height: 1.25;
    background: rgba(229, 192, 123, 0.2);
    color: #e5c07b;
    border: 1px solid rgba(229, 192, 123, 0.4);
  }
  .activity {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12.5px;
    margin-top: 6px;
    padding: 3px 8px;
    border-radius: 4px;
    overflow: hidden;
    line-height: 1.35;
    background: rgba(112, 169, 255, 0.1);
    color: var(--vscode-charts-blue, #70a9ff);
    border: 1px solid rgba(112, 169, 255, 0.25);
  }
  .activity-pulse {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--vscode-charts-blue, #70a9ff);
    flex-shrink: 0;
    box-shadow: 0 0 6px var(--vscode-charts-blue, #70a9ff);
    animation: act-pulse 1.8s ease-in-out infinite;
  }
  @keyframes act-pulse {
    0% { opacity: 0.35; transform: scale(0.85); }
    50% { opacity: 1; transform: scale(1.2); }
    100% { opacity: 0.35; transform: scale(0.85); }
  }
  .activity-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; font-weight: 500; }
  .token-bar {
    margin: 6px 0 2px;
    padding: 4px 6px;
    border-radius: 4px;
    background: rgba(128, 128, 128, 0.08);
    border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.18));
    cursor: default;
    transition: background 0.15s ease;
  }
  .token-bar:hover { background: rgba(128, 128, 128, 0.14); }
  .token-track {
    width: 100%;
    height: 5px;
    border-radius: 2.5px;
    background: rgba(128, 128, 128, 0.2);
    overflow: hidden;
    margin-bottom: 4px;
  }
  .token-fill { height: 100%; border-radius: 2.5px; transition: width 0.3s ease; }
  .token-fill.level-low { background: var(--vscode-charts-blue, #70a9ff); }
  .token-fill.level-medium { background: var(--vscode-charts-yellow, #e5c07b); }
  .token-fill.level-high { background: var(--vscode-charts-red, #f48771); }
  .token-meta { display: flex; align-items: center; justify-content: space-between; font-size: 12px; line-height: 1.25; }
  .token-stats { display: inline-flex; align-items: center; gap: 4px; }
  .token-pct { font-weight: 600; font-size: 12px; }
  .token-pct.level-low { color: var(--vscode-charts-blue, #70a9ff); }
  .token-pct.level-medium { color: var(--vscode-charts-yellow, #e5c07b); }
  .token-pct.level-high { color: var(--vscode-charts-red, #f48771); }
  .token-counts { opacity: 0.8; }
  .token-model-badge {
    opacity: 0.9;
    font-size: 12px;
    font-weight: 500;
    padding: 1px 6px;
    border-radius: 3px;
    background: rgba(128, 128, 128, 0.15);
  }
  .quota-strip { display: flex; flex-wrap: wrap; gap: 10px; width: 100%; padding-top: 6px; }
  .quota-card {
    flex: 1;
    min-width: 280px;
    background: rgba(128, 128, 128, 0.06);
    border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
    border-radius: 6px;
    padding: 8px 12px;
  }
  .quota-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
  .quota-provider { display: inline-flex; align-items: center; gap: 6px; font-size: 13.5px; font-weight: 600; }
  .quota-provider svg { width: 15px; height: 15px; display: block; }
  .quota-provider.claude { color: #ff9e79; }
  .quota-provider.antigravity { color: #70a9ff; }
  .quota-status-pill { font-size: 12px; padding: 2px 8px; border-radius: 10px; font-weight: 600; }
  .quota-status-pill.status-ok { background: rgba(78, 201, 176, 0.15); color: #4ec9b0; border: 1px solid rgba(78, 201, 176, 0.3); }
  .quota-status-pill.status-warn { background: rgba(229, 192, 123, 0.2); color: #e5c07b; border: 1px solid rgba(229, 192, 123, 0.4); }
  .quota-status-pill.status-danger { background: rgba(244, 135, 113, 0.2); color: #f48771; border: 1px solid rgba(244, 135, 113, 0.4); }
  .quota-meters { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  .quota-meter { display: flex; flex-direction: column; gap: 3px; }
  .quota-meter-label { display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; opacity: 0.9; }
  .quota-val { font-weight: 700; font-size: 13.5px; }
  .quota-val.level-low { color: var(--vscode-charts-blue, #70a9ff); }
  .quota-val.level-medium { color: var(--vscode-charts-yellow, #e5c07b); }
  .quota-val.level-high { color: var(--vscode-charts-red, #f48771); }
  .quota-progress-track { width: 100%; height: 6px; border-radius: 3px; background: rgba(128, 128, 128, 0.2); overflow: hidden; margin: 3px 0 2px; }
  .quota-progress-fill { height: 100%; border-radius: 3px; transition: width 0.3s ease; }
  .quota-progress-fill.level-low { background: var(--vscode-charts-blue, #70a9ff); }
  .quota-progress-fill.level-medium { background: var(--vscode-charts-yellow, #e5c07b); }
  .quota-progress-fill.level-high { background: var(--vscode-charts-red, #f48771); }
  .quota-sub { font-size: 12px; opacity: 0.75; font-family: var(--vscode-editor-font-family, monospace); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* Mode Switcher Bar */
  .view-mode-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 12px;
    padding-bottom: 10px;
    border-bottom: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
  }
  .mode-tabs {
    display: inline-flex;
    background: rgba(128, 128, 128, 0.1);
    border-radius: 6px;
    padding: 3px;
    gap: 3px;
    border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
  }
  .mode-tab-btn {
    background: transparent;
    border: none;
    padding: 7px 16px;
    border-radius: 4px;
    font-size: 14px;
    font-weight: 600;
    color: var(--vscode-foreground);
    cursor: pointer;
    transition: all 0.15s ease;
    opacity: 0.8;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }
  .mode-tab-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground, rgba(128, 128, 128, 0.15)); }
  .mode-tab-btn.active { opacity: 1; font-weight: 600; background: var(--vscode-button-background); color: var(--vscode-button-foreground); }
  .mode-badge { font-size: 12px; padding: 2px 8px; border-radius: 10px; background: rgba(128, 128, 128, 0.25); color: inherit; font-weight: 600; }
  .toolbar-actions { display: inline-flex; align-items: center; gap: 8px; }
  .sound-toggle-btn {
    background: rgba(128, 128, 128, 0.12);
    border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.25));
    border-radius: 4px;
    padding: 6px 11px;
    font-size: 14px;
    cursor: pointer;
    line-height: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  }
  .sound-toggle-btn:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128, 128, 128, 0.2)); }
  .sound-toggle-btn.muted { opacity: 0.7; background: rgba(255, 0, 0, 0.1); border-color: rgba(255, 0, 0, 0.3); }

  /* Analyse View Styles */
  .analyse-view { display: flex; flex-direction: column; gap: 16px; width: 100%; }
  .analyse-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
    padding-bottom: 6px;
    border-bottom: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.15));
  }
  .analyse-filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .analyse-label { font-size: 12.5px; opacity: 0.8; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; margin-right: 2px; }
  .analyse-filter-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    padding: 5px 12px;
    border-radius: 4px;
    cursor: pointer;
    border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.25));
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    transition: all 0.15s ease;
    font-weight: 500;
  }
  .analyse-filter-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .analyse-filter-btn svg { width: 14px; height: 14px; display: block; }
  .analyse-filter-btn.active { font-weight: 600; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: transparent; }
  .analyse-filter-btn.active.filter-claude { background: rgba(242, 101, 34, 0.25); color: #ff9e79; border-color: rgba(255, 158, 121, 0.5); }
  .analyse-filter-btn.active.filter-antigravity { background: rgba(66, 133, 244, 0.25); color: #70a9ff; border-color: rgba(112, 169, 255, 0.5); }
  .analyse-filter-btn.active.filter-copilot { background: rgba(16, 185, 129, 0.25); color: #34d399; border-color: rgba(52, 211, 153, 0.5); }
  .analyse-scope-tabs { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .analyse-scope-label { font-size: 12.5px; opacity: 0.8; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; margin-right: 2px; }
  .analyse-scope-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    padding: 5px 12px;
    border-radius: 4px;
    cursor: pointer;
    border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.25));
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
    transition: all 0.15s ease;
    font-weight: 500;
  }
  .analyse-scope-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
  .analyse-scope-btn.active { font-weight: 600; background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: transparent; }

  /* KPI Grid */
  .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px; }
  .kpi-card {
    background: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
    border-radius: 6px;
    padding: 14px 16px;
    transition: border-color 0.15s ease;
  }
  .kpi-card:hover { border-color: var(--vscode-focusBorder, rgba(128, 128, 128, 0.4)); }
  .kpi-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    font-weight: 600;
    opacity: 0.85;
    margin-bottom: 6px;
  }
  .kpi-tag { font-size: 11.5px; padding: 2px 7px; border-radius: 3px; font-weight: 600; text-transform: none; }
  .kpi-tag.blue { background: rgba(112, 169, 255, 0.2); color: #70a9ff; }
  .kpi-tag.amber { background: rgba(229, 192, 123, 0.2); color: #e5c07b; }
  .kpi-tag.green { background: rgba(78, 201, 176, 0.2); color: #4ec9b0; }
  .kpi-value {
    font-size: 26px;
    font-weight: 700;
    line-height: 1.2;
    margin-bottom: 10px;
    font-family: var(--vscode-editor-font-family, monospace);
    letter-spacing: -0.02em;
  }
  .kpi-value.green { color: #4ec9b0; }
  .kpi-rows { display: flex; flex-direction: column; gap: 5px; font-size: 13px; opacity: 0.9; }
  .kpi-row { display: flex; justify-content: space-between; align-items: center; }
  .kpi-num { font-family: var(--vscode-editor-font-family, monospace); font-weight: 600; font-size: 13px; }
  .kpi-num.green { color: #4ec9b0; }
  .kpi-sub-note { opacity: 0.65; font-size: 12px; }

  /* Hourly / Daily Chart */
  .chart-card {
    background: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
    border-radius: 6px;
    padding: 14px 16px;
    position: relative;
  }
  .chart-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    flex-wrap: wrap;
    gap: 10px;
  }
  .chart-title { font-weight: 600; font-size: 14px; display: flex; align-items: center; gap: 8px; }
  .chart-title-icon { display: inline-flex; align-items: center; }
  .chart-actions { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  .chart-toggle-group {
    display: inline-flex;
    border-radius: 4px;
    background: rgba(128, 128, 128, 0.12);
    padding: 2px;
    border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.25));
    gap: 2px;
  }
  .chart-toggle-btn {
    font-size: 12.5px;
    padding: 3px 10px;
    border: none;
    background: transparent;
    color: var(--vscode-foreground);
    cursor: pointer;
    border-radius: 3px;
    font-weight: 500;
    transition: all 0.15s ease;
  }
  .chart-toggle-btn.active {
    background: var(--vscode-button-background, #0e639c);
    color: var(--vscode-button-foreground, #fff);
    font-weight: 600;
  }
  .chart-legend { display: flex; gap: 12px; font-size: 12.5px; align-items: center; }
  .legend-item { display: inline-flex; align-items: center; gap: 5px; }
  .legend-dot { width: 10px; height: 10px; border-radius: 2px; }
  .chart-svg-wrap { width: 100%; height: 130px; position: relative; box-sizing: border-box; overflow: hidden; }
  .chart-svg-wrap svg { width: 100%; height: 100%; display: block; overflow: hidden; }
  .chart-x-axis {
    display: flex;
    justify-content: space-between;
    width: 100%;
    height: 20px;
    margin-top: 6px;
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 12px;
    color: var(--vscode-descriptionForeground, rgba(255, 255, 255, 0.7));
  }
  .bar-group { cursor: pointer; }
  .bar-group:hover rect { filter: brightness(1.25); }

  /* Details Grid (Models & Tools) */
  .details-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 14px; }
  .detail-card {
    background: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
    border-radius: 6px;
    padding: 14px 16px;
    overflow: hidden;
  }
  .full-card {
    background: var(--vscode-editorWidget-background);
    border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2));
    border-radius: 6px;
    padding: 14px 16px;
    overflow: hidden;
  }
  .detail-card-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
  .detail-card-title { font-weight: 700; font-size: 13px; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.85; }
  .detail-card-sub { font-size: 12px; opacity: 0.7; }
  .model-list { display: flex; flex-direction: column; gap: 10px; }
  .model-row { display: flex; flex-direction: column; gap: 4px; font-size: 13.5px; }
  .model-meta { display: flex; justify-content: space-between; align-items: center; }
  .model-name { font-weight: 600; font-size: 13.5px; display: inline-flex; align-items: center; gap: 6px; }
  .prov-badge { display: inline-flex; align-items: center; }
  .prov-badge svg { width: 14px; height: 14px; }
  .model-stat { opacity: 0.9; font-family: var(--vscode-editor-font-family, monospace); font-size: 12.5px; }
  .model-bar-track { width: 100%; height: 7px; border-radius: 3.5px; background: rgba(128, 128, 128, 0.2); overflow: hidden; margin-top: 3px; }
  .model-bar-fill { height: 100%; border-radius: 3.5px; transition: width 0.25s ease; }
  .model-bar-fill.claude { background-color: #f26522; }
  .model-bar-fill.antigravity { background-color: #4285f4; }
  .model-bar-fill.copilot { background-color: #10b981; }

  /* Tool & Content Distribution */
  .tool-content-wrap { display: flex; flex-direction: column; gap: 14px; }
  .tool-list { display: flex; flex-direction: column; gap: 9px; }
  .tool-row { display: flex; flex-direction: column; gap: 4px; font-size: 13.5px; }
  .tool-meta { display: flex; justify-content: space-between; align-items: center; }
  .tool-name { font-weight: 600; font-size: 13px; display: inline-flex; align-items: center; gap: 6px; }
  .tool-stat { opacity: 0.9; font-family: var(--vscode-editor-font-family, monospace); font-size: 12.5px; }
  .tool-bar-track { width: 100%; height: 7px; border-radius: 3.5px; background: rgba(128, 128, 128, 0.2); overflow: hidden; margin-top: 2px; }
  .tool-bar-fill { height: 100%; border-radius: 3.5px; transition: width 0.25s ease; }

  .token-comp-wrap {
    margin-top: 6px;
    padding-top: 12px;
    border-top: 1px dashed var(--vscode-widget-border, rgba(128, 128, 128, 0.25));
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .token-comp-header { display: flex; justify-content: space-between; align-items: center; }
  .token-comp-title { font-size: 12.5px; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 700; opacity: 0.85; }
  .token-comp-sub { font-size: 12.5px; opacity: 0.75; font-family: var(--vscode-editor-font-family, monospace); }
  .token-comp-track {
    width: 100%;
    height: 12px;
    border-radius: 6px;
    background: rgba(128, 128, 128, 0.18);
    display: flex;
    overflow: hidden;
  }
  .token-comp-seg { height: 100%; transition: width 0.25s ease; }
  .token-comp-legend { display: flex; flex-wrap: wrap; gap: 8px 14px; font-size: 12.5px; margin-top: 2px; }
  .token-comp-item { display: inline-flex; align-items: center; gap: 5px; opacity: 0.9; }
  .token-comp-dot { width: 9px; height: 9px; border-radius: 2px; flex-shrink: 0; }

  /* Project Table */
  .proj-table-wrap { overflow-x: auto; }
  .proj-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .proj-table th {
    text-align: left;
    padding: 8px 12px;
    opacity: 0.8;
    border-bottom: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.25));
    font-weight: 600;
    font-size: 12.5px;
    position: sticky;
    top: 0;
    background: var(--vscode-editorWidget-background);
    z-index: 1;
  }
  .proj-table td { padding: 8px 12px; border-bottom: 1px solid rgba(128, 128, 128, 0.08); font-size: 13px; }
  .proj-table tr:hover td { background: var(--vscode-list-hoverBackground); }
  .font-mono { font-family: var(--vscode-editor-font-family, monospace); }

  /* Dashboard Footer */
  .dashboard-footer {
    margin-top: 40px;
    padding: 16px 0 12px;
    border-top: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.18));
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 11.5px;
    color: var(--vscode-descriptionForeground, rgba(128, 128, 128, 0.7));
    user-select: none;
  }
  .dashboard-footer a {
    color: inherit;
    text-decoration: underline;
    text-underline-offset: 2px;
    opacity: 0.85;
  }
  .dashboard-footer a:hover {
    color: var(--vscode-textLink-foreground, #3794ff);
    opacity: 1;
  }
  .dashboard-footer .footer-sep {
    opacity: 0.5;
  }
</style>
</head>
<body>
<header class="toolbar">
  <div class="view-mode-bar">
    <div class="mode-tabs">
      <button class="mode-tab-btn active" id="btn-mode-board" title="Operatives Session-Board">
        📋 Board <span class="mode-badge" id="mode-badge-board">0</span>
      </button>
      <button class="mode-tab-btn" id="btn-mode-analyse" title="Token- & Verbrauchsanalyse Heute">
        📊 Analyse & Verbrauch
      </button>
    </div>
    <div class="toolbar-actions">
      <button class="sound-toggle-btn" id="btn-debug-log" title="Debug-Log öffnen (Ereignisse & Navigation)">🐞</button>
      <button class="sound-toggle-btn" id="btn-sound-toggle" title="Sounds aktiv (Klicken zum Stummschalten)">🔊</button>
    </div>
  </div>

  <div id="board-controls-wrap">
    <div class="toolbar-main">
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
        <button class="filter-btn filter-copilot" data-filter="copilot" id="btn-copilot">
          ${ICONS.copilot} Copilot <span class="count" id="count-copilot">0</span>
        </button>
      </div>
      <div class="search-group">
        <div class="search-box" id="search-box-wrap">
          <span class="search-icon">${ICONS.search}</span>
          <input type="text" class="search-input" id="search-input" placeholder="Sessions suchen (Titel, Prompt, ID, Projekt)..." autocomplete="off" spellcheck="false">
          <kbd class="search-kbd" id="search-kbd" title="Taste / drücken zum Suchen">/</kbd>
          <button class="search-clear-btn" id="search-clear" title="Suche leeren" style="display: none;">✕</button>
        </div>
        <span class="search-status" id="search-status" style="display: none;"></span>
      </div>
    </div>
    <div class="project-chips-row" id="project-chips" style="display: none;"></div>
  </div>

  <div class="quota-strip" id="quota-strip" style="display: none;"></div>
</header>

<div id="dashboard-loader">
  <div class="loader-spinner"></div>
  <div class="loader-text">Lade Sessions & Quotas...</div>
</div>

<div class="board" id="board"></div>

<div class="analyse-view" id="analyse-view" style="display: none;">
  <div class="analyse-toolbar">
    <div class="analyse-filters">
      <span class="analyse-label">Provider:</span>
      <button class="analyse-filter-btn active" data-filter="all" id="af-all">Alle</button>
      <button class="analyse-filter-btn filter-claude" data-filter="claude" id="af-claude">${ICONS.claude} Claude Code</button>
      <button class="analyse-filter-btn filter-antigravity" data-filter="antigravity" id="af-antigravity">${ICONS.antigravity} Antigravity</button>
      <button class="analyse-filter-btn filter-copilot" data-filter="copilot" id="af-copilot">${ICONS.copilot} Copilot</button>
    </div>
    <div class="analyse-scope-tabs">
      <span class="analyse-scope-label">Zeitraum:</span>
      <button class="analyse-scope-btn active" data-scope="today" id="as-today">Heute</button>
      <button class="analyse-scope-btn" data-scope="7d" id="as-7d">7 Tage</button>
      <button class="analyse-scope-btn" data-scope="30d" id="as-30d">30 Tage</button>
    </div>
  </div>

  <div class="kpi-grid">
    <div class="kpi-card">
      <div class="kpi-header">
        <span id="kpi-total-tokens-title">Gesamt-Tokens Heute</span>
        <span class="kpi-tag blue">Aktiv</span>
      </div>
      <div class="kpi-value" id="kpi-total-tokens">0</div>
      <div class="kpi-rows">
        <div class="kpi-row"><span>Input:</span><span id="kpi-input-tokens" class="kpi-num">0</span></div>
        <div class="kpi-row"><span>Output / Thinking:</span><span id="kpi-output-tokens" class="kpi-num">0</span></div>
        <div class="kpi-row"><span>Cache Read:</span><span id="kpi-cache-tokens" class="kpi-num green">0</span></div>
      </div>
    </div>

    <div class="kpi-card">
      <div class="kpi-header">
        <span>Geschätzte Kosten</span>
        <span class="kpi-tag amber">API-Basis</span>
      </div>
      <div class="kpi-value green" id="kpi-cost">$0.00</div>
      <div class="kpi-rows">
        <div class="kpi-row"><span>Claude Code:</span><span id="kpi-claude-cost" class="kpi-num">$0.00</span></div>
        <div class="kpi-row"><span>Antigravity:</span><span id="kpi-agy-cost" class="kpi-num">$0.00</span></div>
        <div class="kpi-row"><span>Copilot:</span><span id="kpi-copilot-cost" class="kpi-num">$0.00</span></div>
        <div class="kpi-row" style="opacity: 0.6; font-size: 0.9em;"><span>Keine offizielle Rechnung</span></div>
      </div>
    </div>

    <div class="kpi-card">
      <div class="kpi-header">
        <span>Cache Hit-Rate</span>
        <span class="kpi-tag green">Effizient</span>
      </div>
      <div class="kpi-value" id="kpi-cache-rate">0%</div>
      <div class="kpi-rows">
        <div class="kpi-row"><span>Cache-Reads:</span><span id="kpi-cache-reads" class="kpi-num">0</span></div>
        <div class="kpi-row"><span>Cache-Writes:</span><span id="kpi-cache-writes" class="kpi-num">0</span></div>
        <div class="kpi-row" style="opacity: 0.6; font-size: 0.9em;"><span>Prompt Caching aktiv</span></div>
      </div>
    </div>

    <div class="kpi-card">
      <div class="kpi-header">
        <span>Arbeitszeit & Turns</span>
        <span class="kpi-tag" id="kpi-sessions-count">0 Sessions</span>
      </div>
      <div class="kpi-value" id="kpi-active-time">0 Min.</div>
      <div class="kpi-rows">
        <div class="kpi-row"><span>Dialog-Turns:</span><span id="kpi-turns-count" class="kpi-num">0</span></div>
        <div class="kpi-row"><span id="kpi-sessions-label">Sessions heute:</span><span id="kpi-sessions-val" class="kpi-num">0</span></div>
        <div class="kpi-row" style="opacity: 0.6; font-size: 0.9em;"><span id="kpi-netto-note">Geschätzte Netto-Zeit</span></div>
      </div>
    </div>
  </div>

  <div class="chart-card">
    <div class="chart-header">
      <div class="chart-title">
        <span class="chart-title-icon"><svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor"><path d="M1 14h14v1H0V0h1v14zm2-2h2V6H3v6zm4 0h2V2H7v10zm4 0h2V9h-2v3z"/></svg></span>
        <span id="chart-title-text">Stündlicher Verlauf Heute (00:00 – 23:00 Uhr)</span>
      </div>
      <div class="chart-actions">
        <div class="chart-toggle-group">
          <button class="chart-toggle-btn active" id="btn-chart-mode-all" title="Gesamtes Tokenvolumen inkl. Cache-Reads anzeigen">Inkl. Cache</button>
          <button class="chart-toggle-btn" id="btn-chart-mode-net" title="Nur neue Tokens (Input + Output) anzeigen">Nur Input & Output</button>
        </div>
        <div class="chart-legend">
          <span class="legend-item"><span class="legend-dot" style="background: var(--vscode-charts-blue, #70a9ff);"></span> Input</span>
          <span class="legend-item"><span class="legend-dot" style="background: #f26522;"></span> Output / Thinking</span>
          <span class="legend-item" id="legend-cache-dot"><span class="legend-dot" style="background: #10b981;"></span> Cache Read</span>
        </div>
      </div>
    </div>
    <div class="chart-svg-wrap" id="chart-svg-container"></div>
    <div class="chart-x-axis" id="chart-x-axis"></div>
  </div>

  <div class="details-grid">
    <div class="detail-card">
      <div class="detail-card-header">
        <span class="detail-card-title">Modelle & Provider</span>
        <span class="detail-card-sub" id="model-count-label">Heute</span>
      </div>
      <div class="model-list" id="model-list"></div>
    </div>
    <div class="detail-card">
      <div class="detail-card-header">
        <span class="detail-card-title">Tool- & Content-Verteilung</span>
        <span class="detail-card-sub" id="tools-count-label">Heute</span>
      </div>
      <div class="tool-content-wrap">
        <div class="tool-list" id="tool-list"></div>
        <div class="token-comp-wrap">
          <div class="token-comp-header">
            <span class="token-comp-title">Token-Zusammensetzung</span>
            <span class="token-comp-sub" id="token-comp-total">0 Tokens</span>
          </div>
          <div class="token-comp-track" id="token-comp-track"></div>
          <div class="token-comp-legend" id="token-comp-legend"></div>
        </div>
      </div>
    </div>
  </div>

  <div class="full-card">
    <div class="detail-card-header">
      <span class="detail-card-title" id="proj-card-title">Projekt-Verbrauch Heute</span>
      <span class="detail-card-sub" id="proj-count-label">Heute</span>
    </div>
    <div class="proj-table-wrap">
      <table class="proj-table">
        <thead>
          <tr>
            <th>Projekt</th>
            <th>Sessions</th>
            <th>Turns</th>
            <th>Tokens</th>
            <th>Gesch. Kosten</th>
          </tr>
        </thead>
        <tbody id="proj-table-body"></tbody>
      </table>
    </div>
  </div>
</div>

<footer class="dashboard-footer">
  <span class="footer-meta">AI Sessions v${version}</span>
  <span class="footer-sep">&middot;</span>
  <span class="footer-brand">Ein Tool von <a href="https://schueri.de" target="_blank" rel="noopener">tools@schüri</a></span>
</footer>

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
  window.addEventListener('unhandledrejection', (e) => {
    vscode.postMessage({
      action: 'logError',
      message: 'Unhandled Promise: ' + (e.reason ? (e.reason.message || String(e.reason)) : '')
    });
  });

  const board = document.getElementById('board');
  const ICONS = ${JSON.stringify(ICONS)};

  let cachedColumns = [];
  let currentSearch = '';
  let cachedQuota = null;
  let cachedAnalytics = null;
  let currentViewMode = 'board';
  let currentAnalyseFilter = 'all';
  let currentAnalyseScope = 'today';
  const expandedColumns = new Set();

  const modeBadgeBoard = document.getElementById('mode-badge-board');
  const btnModeBoard = document.getElementById('btn-mode-board');
  const btnModeAnalyse = document.getElementById('btn-mode-analyse');
  const boardEl = document.getElementById('board');
  const analyseEl = document.getElementById('analyse-view');
  const boardControlsWrap = document.getElementById('board-controls-wrap');
  const analyseFilterBtns = document.querySelectorAll('.analyse-filter-btn');
  const analyseScopeBtns = document.querySelectorAll('.analyse-scope-btn');

  const searchBoxWrap = document.getElementById('search-box-wrap');
  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');
  const searchStatus = document.getElementById('search-status');

  let currentEnabledProviders = { claude: true, antigravity: true, copilot: true };

  function updateProviderButtonsUI(enabled) {
    if (!enabled) return;
    const btnClaude = document.getElementById('btn-claude');
    const btnAntigravity = document.getElementById('btn-antigravity');
    const btnCopilot = document.getElementById('btn-copilot');
    if (btnClaude) btnClaude.style.display = enabled.claude !== false ? '' : 'none';
    if (btnAntigravity) btnAntigravity.style.display = enabled.antigravity !== false ? '' : 'none';
    if (btnCopilot) btnCopilot.style.display = enabled.copilot !== false ? '' : 'none';

    const afClaude = document.getElementById('af-claude');
    const afAntigravity = document.getElementById('af-antigravity');
    const afCopilot = document.getElementById('af-copilot');
    if (afClaude) afClaude.style.display = enabled.claude !== false ? '' : 'none';
    if (afAntigravity) afAntigravity.style.display = enabled.antigravity !== false ? '' : 'none';
    if (afCopilot) afCopilot.style.display = enabled.copilot !== false ? '' : 'none';
  }

  const btnSoundToggle = document.getElementById('btn-sound-toggle');
  if (btnSoundToggle) {
    btnSoundToggle.addEventListener('click', () => {
      vscode.postMessage({ action: 'toggleSound' });
    });
  }

  const btnDebugLog = document.getElementById('btn-debug-log');
  if (btnDebugLog) {
    btnDebugLog.addEventListener('click', () => {
      vscode.postMessage({ action: 'showDebugLog' });
    });
  }

  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const filter = btn.getAttribute('data-filter');
      updateQuotaUI(cachedQuota, filter);
      vscode.postMessage({ action: 'setFilter', filter });
    });
  });

  function updateFilterUI(filter, counts) {
    if (counts) {
      document.getElementById('count-all').textContent = counts.all || 0;
      document.getElementById('count-claude').textContent = counts.claude || 0;
      document.getElementById('count-antigravity').textContent = counts.antigravity || 0;
      const copilotCnt = document.getElementById('count-copilot');
      if (copilotCnt) copilotCnt.textContent = counts.copilot || 0;
    }
    filterBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-filter') === (filter || 'all'));
    });
  }

  const projectChips = document.getElementById('project-chips');
  let isProjectChipsExpanded = false;
  function updateProjectChipsUI(currentProjectFilter, counts) {
    if (!projectChips) return;
    projectChips.replaceChildren();

    const byProj = (counts && counts.byProject) || {};
    const allEntries = Object.entries(byProj);
    if (allEntries.length === 0) {
      projectChips.style.display = 'none';
      return;
    }
    projectChips.style.display = 'flex';

    const lbl = el('span', 'project-chips-label', 'Projekt:');
    projectChips.append(lbl);

    const isAll = !currentProjectFilter || currentProjectFilter === 'all';
    const allChip = el('button', 'project-chip' + (isAll ? ' active' : ''));
    allChip.append('Alle ', el('span', 'count', String(counts.all || 0)));
    allChip.addEventListener('click', () => {
      vscode.postMessage({ action: 'setProjectFilter', filter: 'all' });
    });
    projectChips.append(allChip);

    const sortAlpha = (entries) => {
      return entries.slice().sort((a, b) =>
        a[0].localeCompare(b[0], undefined, { sensitivity: 'base', numeric: true }) || a[0].localeCompare(b[0])
      );
    };

    const maxVisible = 5;
    const hasMore = allEntries.length > maxVisible;
    let visibleEntries;

    if (hasMore && !isProjectChipsExpanded) {
      // Top 5 nach Session-Anzahl auswählen, aktive Auswahl ggf. ergänzen
      const byCount = allEntries.slice().sort((a, b) => {
        const countDiff = b[1] - a[1];
        if (countDiff !== 0) return countDiff;
        return a[0].localeCompare(b[0], undefined, { sensitivity: 'base', numeric: true }) || a[0].localeCompare(b[0]);
      });
      const topProjects = byCount.slice(0, maxVisible);
      if (currentProjectFilter && currentProjectFilter !== 'all' && !topProjects.some(([p]) => p === currentProjectFilter)) {
        const found = allEntries.find(([p]) => p === currentProjectFilter);
        if (found) {
          topProjects.push(found);
        }
      }
      // Top 5 auch in eingeklapptem Zustand alphabetisch sortieren
      visibleEntries = sortAlpha(topProjects);
    } else {
      // Ausgeklappt (oder <= 5): Alle Projekte komplett alphabetisch A-Z sortieren
      visibleEntries = sortAlpha(allEntries);
    }

    for (const [proj, cnt] of visibleEntries) {
      const isActive = currentProjectFilter === proj;
      const chip = el('button', 'project-chip' + (isActive ? ' active' : ''));
      chip.append(proj + ' ', el('span', 'count', String(cnt)));
      chip.title = 'Nur Sessions für „' + proj + '“ anzeigen';
      chip.addEventListener('click', () => {
        const nextFilter = isActive ? 'all' : proj;
        vscode.postMessage({ action: 'setProjectFilter', filter: nextFilter });
      });
      projectChips.append(chip);
    }

    if (hasMore) {
      const hiddenCount = allEntries.length - visibleEntries.length;
      const moreBtn = el(
        'button',
        'project-chip-more',
        isProjectChipsExpanded ? 'weniger ▴' : ('+' + (hiddenCount > 0 ? hiddenCount : (allEntries.length - maxVisible)) + ' mehr ▾')
      );
      moreBtn.title = isProjectChipsExpanded ? 'Projekt-Filter einklappen' : 'Alle weiteren Projekt-Filter anzeigen';
      moreBtn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        isProjectChipsExpanded = !isProjectChipsExpanded;
        updateProjectChipsUI(currentProjectFilter, counts);
      });
      projectChips.append(moreBtn);
    }
  }

  const quotaStrip = document.getElementById('quota-strip');

  function updateQuotaUI(quota, filter) {
    if (!quotaStrip) return;
    quotaStrip.replaceChildren();
    if (!quota) {
      quotaStrip.style.display = 'none';
      return;
    }

    const showClaude = (!filter || filter === 'all' || filter === 'claude') && currentEnabledProviders.claude !== false && quota.claude && quota.claude.available;
    const showAntigravity = (!filter || filter === 'all' || filter === 'antigravity') && currentEnabledProviders.antigravity !== false && quota.antigravity && quota.antigravity.available;

    if (!showClaude && !showAntigravity) {
      quotaStrip.style.display = 'none';
      return;
    }
    quotaStrip.style.display = 'flex';

    if (showClaude) {
      const c = quota.claude;
      const card = el('div', 'quota-card quota-claude');
      const header = el('div', 'quota-header');
      const prov = el('span', 'quota-provider claude');
      prov.innerHTML = ICONS.claude + ' Claude Code';
      header.append(prov);

      const maxPct = Math.max(c.fiveHour?.percent || 0, c.sevenDay?.percent || 0);
      const statusPill = el('span', 'quota-status-pill ' + (maxPct >= 85 ? 'status-danger' : (maxPct >= 65 ? 'status-warn' : 'status-ok')));
      statusPill.textContent = maxPct >= 85 ? 'Fast voll' : (maxPct >= 65 ? 'Erhöht' : 'Normal');
      header.append(statusPill);
      card.append(header);

      const meters = el('div', 'quota-meters');

      // 5h meter
      const m5 = el('div', 'quota-meter');
      const p5 = Math.min(100, Math.max(0, c.fiveHour?.percent ?? 0));
      const lvl5 = p5 >= 85 ? 'high' : (p5 >= 65 ? 'medium' : 'low');
      const lbl5 = el('div', 'quota-meter-label');
      lbl5.append(el('span', '', '5h-Limit'), el('span', 'quota-val level-' + lvl5, p5 + '%'));
      m5.append(lbl5);
      const tr5 = el('div', 'quota-progress-track');
      const fl5 = el('div', 'quota-progress-fill level-' + lvl5);
      fl5.style.width = p5 + '%';
      tr5.append(fl5);
      m5.append(tr5);
      const sub5 = el('div', 'quota-sub', c.fiveHour?.resetLabel ? 'Reset ' + c.fiveHour.resetLabel : 'Laufendes Fenster');
      sub5.title = '5-Stunden-Sitzungslimit: ' + p5 + '% genutzt' + (c.fiveHour?.resetLabel ? ' · Zurücksetzung um ' + c.fiveHour.resetLabel : '');
      m5.append(sub5);
      meters.append(m5);

      // 7d meter
      const m7 = el('div', 'quota-meter');
      const p7 = Math.min(100, Math.max(0, c.sevenDay?.percent ?? 0));
      const lvl7 = p7 >= 85 ? 'high' : (p7 >= 65 ? 'medium' : 'low');
      const lbl7 = el('div', 'quota-meter-label');
      lbl7.append(el('span', '', '7d-Woche'), el('span', 'quota-val level-' + lvl7, p7 + '%'));
      m7.append(lbl7);
      const tr7 = el('div', 'quota-progress-track');
      const fl7 = el('div', 'quota-progress-fill level-' + lvl7);
      fl7.style.width = p7 + '%';
      tr7.append(fl7);
      m7.append(tr7);
      const sub7 = el('div', 'quota-sub', c.sevenDay?.resetLabel ? 'Reset ' + c.sevenDay.resetLabel : 'Wöchentliches Fenster');
      sub7.title = '7-Tage-Gesamtlimit: ' + p7 + '% genutzt' + (c.sevenDay?.resetLabel ? ' · Zurücksetzung am ' + c.sevenDay.resetLabel : '');
      m7.append(sub7);
      meters.append(m7);

      card.append(meters);
      quotaStrip.append(card);
    }

    if (showAntigravity) {
      const a = quota.antigravity;
      const card = el('div', 'quota-card quota-antigravity');
      const header = el('div', 'quota-header');
      const prov = el('span', 'quota-provider antigravity');
      prov.innerHTML = ICONS.antigravity + ' Google Antigravity';
      header.append(prov);

      if (a.hasLiveQuota && a.gemini) {
        const maxPct = Math.max(a.gemini.fiveHour?.percent || 0, a.gemini.weekly?.percent || 0);
        const statusClass = a.isRateLimited ? 'status-danger' : (maxPct >= 85 ? 'status-danger' : (maxPct >= 65 ? 'status-warn' : 'status-ok'));
        const statusText = a.isRateLimited ? 'Limit (429)' : (maxPct >= 85 ? 'Fast voll' : (maxPct >= 65 ? 'Erhöht' : 'Normal'));
        const statusPill = el('span', 'quota-status-pill ' + statusClass, statusText);
        if (a.isRateLimited && a.rateLimitMessage) statusPill.title = a.rateLimitMessage;
        header.append(statusPill);
        card.append(header);

        const meters = el('div', 'quota-meters');

        // Gemini 5h meter
        const m5 = el('div', 'quota-meter');
        const p5 = Math.min(100, Math.max(0, a.gemini.fiveHour?.percent ?? 0));
        const lvl5 = p5 >= 85 ? 'high' : (p5 >= 65 ? 'medium' : 'low');
        const lbl5 = el('div', 'quota-meter-label');
        lbl5.append(el('span', '', '5h-Limit'), el('span', 'quota-val level-' + lvl5, p5 + '%'));
        m5.append(lbl5);
        const tr5 = el('div', 'quota-progress-track');
        const fl5 = el('div', 'quota-progress-fill level-' + lvl5);
        fl5.style.width = p5 + '%';
        tr5.append(fl5);
        m5.append(tr5);
        const r5Text = a.gemini.fiveHour?.resetLabel ? 'Reset ' + a.gemini.fiveHour.resetLabel : '5-Stunden-Fenster';
        const sub5 = el('div', 'quota-sub', r5Text);
        sub5.title = 'Gemini 5-Stunden-Limit: ' + p5 + '% genutzt' +
          (a.gemini.fiveHour?.resetLabel ? ' · Zurücksetzung um ' + a.gemini.fiveHour.resetLabel : '') +
          (a.tokens5h ? ' · ~' + formatTokens(a.tokens5h) + ' Tokens verbraucht' : '') +
          (a.gemini.fiveHour?.description ? ' · ' + a.gemini.fiveHour.description : '');
        m5.append(sub5);
        meters.append(m5);

        // Gemini Weekly meter
        const m7 = el('div', 'quota-meter');
        const p7 = Math.min(100, Math.max(0, a.gemini.weekly?.percent ?? 0));
        const lvl7 = p7 >= 85 ? 'high' : (p7 >= 65 ? 'medium' : 'low');
        const lbl7 = el('div', 'quota-meter-label');
        lbl7.append(el('span', '', '7d-Woche'), el('span', 'quota-val level-' + lvl7, p7 + '%'));
        m7.append(lbl7);
        const tr7 = el('div', 'quota-progress-track');
        const fl7 = el('div', 'quota-progress-fill level-' + lvl7);
        fl7.style.width = p7 + '%';
        tr7.append(fl7);
        m7.append(tr7);
        const r7Text = a.gemini.weekly?.resetLabel ? 'Reset ' + a.gemini.weekly.resetLabel : 'Wöchentliches Fenster';
        const sub7 = el('div', 'quota-sub', r7Text);
        sub7.title = 'Gemini Wöchentliches Limit: ' + p7 + '% genutzt' +
          (a.gemini.weekly?.resetLabel ? ' · Zurücksetzung am ' + a.gemini.weekly.resetLabel : '') +
          (a.tokens7d ? ' · ~' + formatTokens(a.tokens7d) + ' Tokens verbraucht' : '') +
          (a.gemini.weekly?.description ? ' · ' + a.gemini.weekly.description : '');
        m7.append(sub7);
        meters.append(m7);

        // Optional 3p meter if 3p has usage
        const p3p = Math.max(a.thirdParty?.fiveHour?.percent || 0, a.thirdParty?.weekly?.percent || 0);
        if (p3p > 0) {
          const m3p = el('div', 'quota-meter');
          const lvl3p = p3p >= 85 ? 'high' : (p3p >= 65 ? 'medium' : 'low');
          const lbl3p = el('div', 'quota-meter-label');
          lbl3p.append(el('span', '', 'Claude/GPT'), el('span', 'quota-val level-' + lvl3p, p3p + '%'));
          m3p.append(lbl3p);
          const tr3p = el('div', 'quota-progress-track');
          const fl3p = el('div', 'quota-progress-fill level-' + lvl3p);
          fl3p.style.width = p3p + '%';
          tr3p.append(fl3p);
          m3p.append(tr3p);
          const sub3p = el('div', 'quota-sub', a.thirdParty?.fiveHour?.resetLabel ? 'Reset ' + a.thirdParty.fiveHour.resetLabel : '3p-Limit');
          m3p.append(sub3p);
          meters.append(m3p);
        }

        card.append(meters);
      } else {
        const statusPill = el('span', 'quota-status-pill ' + (a.isRateLimited ? 'status-danger' : 'status-ok'));
        statusPill.textContent = a.isRateLimited ? 'Limit (429)' : 'Bereit';
        if (a.isRateLimited) statusPill.title = a.rateLimitMessage;
        header.append(statusPill);
        card.append(header);

        const meters = el('div', 'quota-meters');

        // 5h Antigravity fallback
        const m5 = el('div', 'quota-meter');
        const lbl5 = el('div', 'quota-meter-label');
        lbl5.append(el('span', '', '5h-Verbrauch'), el('span', 'quota-val', formatTokens(a.tokens5h)));
        m5.append(lbl5);
        const sub5 = el('div', 'quota-sub', 'Letzte 5 Stunden');
        sub5.title = 'Tokens in den letzten 5 Stunden über alle Antigravity-Sessions: ' + (a.tokens5h || 0).toLocaleString('de-DE');
        m5.append(sub5);
        meters.append(m5);

        // 7d Antigravity fallback
        const m7 = el('div', 'quota-meter');
        const lbl7 = el('div', 'quota-meter-label');
        lbl7.append(el('span', '', '7d-Verbrauch'), el('span', 'quota-val', formatTokens(a.tokens7d)));
        m7.append(lbl7);
        const sub7 = el('div', 'quota-sub', 'Letzte 7 Tage');
        sub7.title = 'Tokens in den letzten 7 Tagen über alle Antigravity-Sessions: ' + (a.tokens7d || 0).toLocaleString('de-DE');
        m7.append(sub7);
        meters.append(m7);

        card.append(meters);
      }

      quotaStrip.append(card);
    }
  }

  function updateSearchUI() {
    searchClear.style.display = currentSearch ? 'inline-block' : 'none';
    if (searchBoxWrap) {
      searchBoxWrap.classList.toggle('has-query', Boolean(currentSearch));
    }
  }

  function setSearch(query) {
    currentSearch = query || '';
    if (searchInput.value !== currentSearch) {
      searchInput.value = currentSearch;
    }
    updateSearchUI();
    applySearchAndRender();
  }

  searchInput.addEventListener('input', () => {
    currentSearch = searchInput.value;
    updateSearchUI();
    applySearchAndRender();
  });

  searchInput.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') {
      if (searchInput.value) {
        setSearch('');
      } else {
        searchInput.blur();
      }
      ev.stopPropagation();
    }
  });

  searchClear.addEventListener('click', () => {
    setSearch('');
    searchInput.focus();
  });

  window.addEventListener('keydown', (ev) => {
    const isCtrlF = (ev.ctrlKey || ev.metaKey) && (ev.key === 'f' || ev.key === 'F');
    const isSlash = ev.key === '/' && document.activeElement !== searchInput && document.activeElement.tagName !== 'INPUT';
    if (isCtrlF || isSlash) {
      ev.preventDefault();
      searchInput.focus();
      searchInput.select();
    }
  });

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^\${}()|[\]\\]/g, '\\$&');
  }

  function highlightText(text, terms) {
    const escaped = escapeHtml(text);
    if (!terms || terms.length === 0) return escaped;
    const pattern = new RegExp('(' + terms.map(escapeRegex).join('|') + ')', 'gi');
    return escaped.replace(pattern, '<mark class="search-highlight">$1</mark>');
  }

  function formatTokens(n) {
    if (!n || typeof n !== 'number') return '0';
    if (n >= 1000000000) {
      const b = n / 1000000000;
      return (b >= 10 ? b.toFixed(1) : b.toFixed(2)) + ' Mrd.';
    }
    if (n >= 1000000) {
      const m = n / 1000000;
      return (m >= 100 ? Math.round(m) : (m % 1 === 0 ? m.toFixed(0) : m.toFixed(1))) + 'M';
    }
    if (n >= 1000) {
      const k = n / 1000;
      return (k >= 100 ? Math.round(k) : (k % 1 === 0 ? k.toFixed(0) : k.toFixed(1))) + 'k';
    }
    return String(n);
  }

  function friendlyModel(m) {
    if (!m) return '';
    const lower = m.toLowerCase();
    if (lower.includes('opus-5-5') || lower.includes('opus-5.5')) return 'Opus 5.5';
    if (lower.includes('opus-5') || lower.includes('opus-5.')) return 'Opus 5';
    if (lower.includes('opus-4-8') || lower.includes('opus-4.8')) return 'Opus 4.8';
    if (lower.includes('opus-4-7') || lower.includes('opus-4.7')) return 'Opus 4.7';
    if (lower.includes('opus-4-6') || lower.includes('opus-4.6')) return 'Opus 4.6';
    if (lower.includes('opus-4-5') || lower.includes('opus-4.5')) return 'Opus 4.5';
    if (lower.includes('opus')) return 'Opus';
    if (lower.includes('sonnet-5-5') || lower.includes('sonnet-5.5')) return 'Sonnet 5.5';
    if (lower.includes('sonnet-5') || lower.includes('sonnet-5.')) return 'Sonnet 5';
    if (lower.includes('sonnet-4-6') || lower.includes('sonnet-4.6')) return 'Sonnet 4.6';
    if (lower.includes('sonnet-4-5') || lower.includes('sonnet-4.5')) return 'Sonnet 4.5';
    if (lower.includes('sonnet-3-7') || lower.includes('3.7-sonnet')) return 'Sonnet 3.7';
    if (lower.includes('sonnet-3-5') || lower.includes('3.5-sonnet') || lower.includes('sonnet-20241022')) return 'Sonnet 3.5';
    if (lower.includes('sonnet')) return 'Sonnet';
    if (lower.includes('haiku-4-5') || lower.includes('haiku-4.5')) return 'Haiku 4.5';
    if (lower.includes('haiku-3-5') || lower.includes('haiku-3.5')) return 'Haiku 3.5';
    if (lower.includes('haiku')) return 'Haiku';
    if (lower.includes('fable-5-1') || lower.includes('fable-5.1')) return 'Fable 5.1';
    if (lower.includes('fable')) return 'Fable';
    if (lower.includes('mythos')) return 'Mythos';
    if (lower.includes('gemini-2.5-pro') || lower.includes('gemini-2-5-pro')) return 'Gemini 2.5 Pro';
    if (lower.includes('gemini-2.5-flash') || lower.includes('gemini-2-5-flash')) return 'Gemini 2.5 Flash';
    if (lower.includes('gemini-2.0-pro') || lower.includes('gemini-2-pro')) return 'Gemini 2.0 Pro';
    if (lower.includes('gemini-2.0-flash') || lower.includes('gemini-2-flash')) return 'Gemini 2.0 Flash';
    if (lower.includes('gemini-1.5-pro')) return 'Gemini 1.5 Pro';
    if (lower.includes('gemini-1.5-flash')) return 'Gemini 1.5 Flash';
    if (lower.includes('gpt-4o-mini')) return 'GPT-4o mini';
    if (lower.includes('gpt-4o')) return 'GPT-4o';
    if (lower.includes('o3-mini')) return 'o3-mini';
    if (lower.includes('o1')) return 'o1';
    if (lower.includes('raptor')) return 'Raptor';
    if (lower.includes('copilot')) return 'Copilot';
    if (lower.includes('gemini-ultra')) return 'Gemini Ultra';
    if (lower.includes('gemini')) return 'Gemini';
    return m.replace(/^claude-/, '');
  }

  function matchesSession(s, terms) {
    if (terms.length === 0) return true;
    const modelText = s.tokens && s.tokens.model ? s.tokens.model : '';
    const haystack = [
      s.title,
      s.project || '',
      s.lastPrompt,
      s.activity,
      s.sessionId,
      s.detail,
      s.cwd,
      modelText,
      s.provider === 'antigravity' ? 'antigravity google' : 'claude code anthropic'
    ].join(' ').toLowerCase();

    return terms.every((term) => haystack.includes(term));
  }

  function applySearchAndRender() {
    const rawTerms = currentSearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let totalSessions = 0;
    let totalMatches = 0;

    const filteredColumns = cachedColumns.map((col) => {
      totalSessions += col.sessions.length;
      const matched = col.sessions.filter((s) => matchesSession(s, rawTerms));
      totalMatches += matched.length;
      return {
        ...col,
        rawSessions: col.sessions,
        sessions: matched
      };
    });

    if (rawTerms.length > 0) {
      searchStatus.style.display = 'inline-block';
      if (totalMatches === 0) {
        searchStatus.textContent = '0 Treffer';
        searchStatus.className = 'search-status no-matches';
      } else {
        searchStatus.textContent = totalMatches === 1 ? '1 Treffer' : totalMatches + ' Treffer';
        searchStatus.className = 'search-status';
      }
    } else {
      searchStatus.style.display = 'none';
    }

    render(filteredColumns, rawTerms, totalMatches, totalSessions);
  }

  function render(columns, terms, totalMatches, totalSessions) {
    board.replaceChildren();

    if (terms && terms.length > 0 && totalMatches === 0) {
      const emptyBanner = el('div', 'search-empty-banner');
      emptyBanner.append(
        el('div', 'search-empty-title', 'Keine Sessions gefunden'),
        el('div', 'search-empty-text', 'Keine Treffer für „' + currentSearch + '“ in ' + totalSessions + ' Sessions.')
      );
      const resetBtn = el('button', 'filter-btn', 'Suche zurücksetzen');
      resetBtn.addEventListener('click', () => {
        setSearch('');
        searchInput.focus();
      });
      emptyBanner.append(resetBtn);
      board.append(emptyBanner);
      return;
    }

    for (const col of columns) {
      const column = el('section', 'column ' + col.state);
      const heading = el('h2');
      const countLabel = terms && terms.length > 0
        ? col.label + ' (' + col.sessions.length + '/' + col.rawSessions.length + ')'
        : col.label + ' (' + col.sessions.length + ')';
      heading.append(el('span', 'dot'), countLabel);
      if (col.state === 'bookmarked' && col.sessions.length > 0) {
        const unpinAllBtn = el('button', 'mark-all-btn');
        unpinAllBtn.innerHTML = ICONS.check + ' Alle geprüft';
        unpinAllBtn.title = 'Alle gemerkten Sessions freigeben';
        unpinAllBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          vscode.postMessage({ action: 'unbookmarkAll' });
        });
        heading.append(unpinAllBtn);
      }
      if (col.state === 'idle' && col.sessions.length > 10) {
        const markAllBtn = el('button', 'mark-all-btn');
        markAllBtn.innerHTML = ICONS.check + ' Alles erledigt markieren';
        markAllBtn.title = 'Alle fertigen Sessions als erledigt markieren';
        markAllBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          const sessionIds = col.sessions.map((s) => s.sessionId);
          vscode.postMessage({ action: 'markAllDone', sessionIds });
        });
        heading.append(markAllBtn);
      }
      column.append(heading);
      if (col.sessions.length === 0) {
        column.append(el('div', 'empty', terms && terms.length > 0 ? 'keine Treffer' : 'keine'));
      }

      const isExpanded = expandedColumns.has(col.state);
      const limit = isExpanded ? Infinity : 20;
      const visibleSessions = col.sessions.slice(0, limit);
      const remainingCount = col.sessions.length - visibleSessions.length;

      for (const s of visibleSessions) {
        const card = el('div', 'card' + (s.rateLimit ? ' rate-limited' : ''));
        card.title = 'Chat öffnen';
        const cardHeader = el('div', 'card-header');
        const titleDiv = el('div', 'title');
        if (terms && terms.length > 0) {
          titleDiv.innerHTML = highlightText(s.title, terms);
        } else {
          titleDiv.textContent = s.title;
        }
        cardHeader.append(titleDiv);
        const badges = el('div', 'header-badges');
        if (s.rateLimit) {
          const isPastReset = s.rateLimit.resetsAt && Date.now() >= s.rateLimit.resetsAt;
          const badge = el('span', 'rate-limit-badge', isPastReset ? '⚠️ Limit vorbei' : '⏳ Limit erreicht');
          if (s.rateLimit.humanText) badge.title = s.rateLimit.humanText;
          badges.append(badge);
        }
        const pinBtn = el('button', 'pin-btn' + (s.isBookmarked ? ' active' : ''));
        pinBtn.title = s.isBookmarked ? 'Nicht mehr merken' : 'Session merken';
        pinBtn.innerHTML = ICONS.pin;
        pinBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          vscode.postMessage({ action: 'toggleBookmark', sessionId: s.sessionId });
        });
        badges.append(pinBtn);
        const icon = el('span', 'provider-icon ' + (s.provider || 'claude'));
        icon.title = s.provider === 'copilot' ? 'GitHub Copilot' : (s.provider === 'antigravity' ? 'Google Antigravity' : 'Claude Code');
        icon.innerHTML = ICONS[s.provider] || ICONS.claude;
        badges.append(icon);
        cardHeader.append(badges);
        card.append(cardHeader);
        if (s.project || s.detail) {
          const metaDiv = el('div', 'card-meta');
          if (s.project) {
            const pBadge = el('span', 'project-badge', '📁 ' + s.project);
            pBadge.title = 'Nach Projekt „' + s.project + '“ filtern';
            pBadge.addEventListener('click', (ev) => {
              ev.stopPropagation();
              vscode.postMessage({ action: 'setProjectFilter', filter: s.project });
            });
            metaDiv.append(pBadge);
          }
          if (s.detail) {
            metaDiv.append(el('span', 'detail', s.detail));
          }
          card.append(metaDiv);
        }
        if (s.tokens && typeof s.tokens.context === 'number') {
          const t = s.tokens;
          const pct = Math.min(100, Math.max(0, t.percent || 0));
          const level = pct >= 85 ? 'high' : (pct >= 65 ? 'medium' : 'low');

          const tokenBar = el('div', 'token-bar');
          const tooltipParts = [
            'Kontextfenster: ' + formatTokens(t.context) + ' / ' + formatTokens(t.maxContext) + ' (' + pct + '% belegt)'
          ];
          if (t.model) tooltipParts.push('Modell: ' + friendlyModel(t.model));
          if (t.cacheReadTokens || t.cacheCreationTokens || t.inputTokens) {
            tooltipParts.push('Input: ' + formatTokens(t.cacheReadTokens || 0) + ' Cache-Read, ' + formatTokens(t.cacheCreationTokens || 0) + ' Cache-Create, ' + formatTokens(t.inputTokens || 0) + ' Neu');
          }
          if (t.outputTokens) {
            tooltipParts.push('Output: ' + formatTokens(t.outputTokens) + ' Tokens');
          }
          tokenBar.title = tooltipParts.join('\\n');

          const track = el('div', 'token-track');
          const fill = el('div', 'token-fill level-' + level);
          fill.style.width = pct + '%';
          track.append(fill);
          tokenBar.append(track);

          const meta = el('div', 'token-meta');
          const stats = el('div', 'token-stats');
          stats.append(el('span', 'token-pct level-' + level, pct + '%'));
          stats.append(el('span', 'token-counts', '· ' + formatTokens(t.context) + '/' + formatTokens(t.maxContext)));
          meta.append(stats);

          if (t.model) {
            meta.append(el('span', 'token-model-badge', friendlyModel(t.model)));
          }
          tokenBar.append(meta);
          card.append(tokenBar);
        }
        if (s.activity && (col.state === 'busy' || s.displayState === 'busy' || s.state === 'busy')) {
          const actDiv = el('div', 'activity');
          actDiv.title = 'Aktuelle Aktivität: ' + s.activity;
          actDiv.append(el('span', 'activity-pulse'), el('span', 'activity-text', s.activity));
          card.append(actDiv);
        }
        if (s.lastPrompt) {
          const promptDiv = el('div', 'prompt');
          if (terms && terms.length > 0) {
            promptDiv.innerHTML = highlightText(s.lastPrompt, terms);
          } else {
            promptDiv.textContent = s.lastPrompt;
          }
          card.append(promptDiv);
        }
        const actions = el('div', 'actions');
        if (col.state === 'bookmarked') {
          const unpinBtn = el('button', '');
          unpinBtn.innerHTML = ICONS.check + ' Geprüft';
          unpinBtn.title = 'Nicht mehr merken';
          unpinBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            vscode.postMessage({ action: 'unbookmark', sessionId: s.sessionId });
          });
          actions.append(unpinBtn);
        }

        const viewBtn = el('button', '');
        viewBtn.innerHTML = ICONS.details + ' Details';
        viewBtn.title = 'Transkript & Verlauf im Read-Only Viewer ansehen';
        viewBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          vscode.postMessage({ action: 'viewTranscript', sessionId: s.sessionId, provider: s.provider });
        });
        actions.append(viewBtn);

        const toggle = el('button', '');
        if (col.state === 'done') {
          toggle.innerHTML = ICONS.undo + ' Wieder aktiv';
        } else {
          toggle.innerHTML = ICONS.check + ' Erledigt';
        }
        toggle.addEventListener('click', (ev) => {
          ev.stopPropagation();
          vscode.postMessage({ action: col.state === 'done' ? 'unmarkDone' : 'markDone', sessionId: s.sessionId });
        });
        actions.append(toggle);
        card.append(actions);
        card.addEventListener('click', () => vscode.postMessage({ action: 'open', sessionId: s.sessionId, provider: s.provider }));
        column.append(card);
      }

      if (remainingCount > 0) {
        const loadMoreWrap = el('div', 'load-more-wrap');
        const loadMoreBtn = el('button', 'load-more-btn', 'Alle restlichen ' + remainingCount + ' Sessions laden');
        loadMoreBtn.title = 'Alle ' + remainingCount + ' weiteren Sessions in „' + col.label + '“ sofort laden';
        loadMoreBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          expandedColumns.add(col.state);
          applySearchAndRender();
        });
        loadMoreWrap.append(loadMoreBtn);
        column.append(loadMoreWrap);
      }

      board.append(column);
    }
  }

  // Mode Switcher Logic
  function setViewMode(mode) {
    currentViewMode = mode === 'analyse' ? 'analyse' : 'board';
    btnModeBoard.classList.toggle('active', currentViewMode === 'board');
    btnModeAnalyse.classList.toggle('active', currentViewMode === 'analyse');
    boardEl.style.display = currentViewMode === 'board' ? 'grid' : 'none';
    boardControlsWrap.style.display = currentViewMode === 'board' ? 'block' : 'none';
    analyseEl.style.display = currentViewMode === 'analyse' ? 'flex' : 'none';
    vscode.postMessage({ action: 'setViewMode', mode: currentViewMode });
    if (currentViewMode === 'analyse') {
      renderAnalyseView();
    }
  }

  btnModeBoard.addEventListener('click', () => setViewMode('board'));
  btnModeAnalyse.addEventListener('click', () => setViewMode('analyse'));

  analyseFilterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      currentAnalyseFilter = btn.getAttribute('data-filter') || 'all';
      analyseFilterBtns.forEach((b) => b.classList.toggle('active', b === btn));
      vscode.postMessage({ action: 'setAnalyseFilter', filter: currentAnalyseFilter });
      renderAnalyseView();
    });
  });

  analyseScopeBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      currentAnalyseScope = btn.getAttribute('data-scope') || 'today';
      analyseScopeBtns.forEach((b) => b.classList.toggle('active', b === btn));
      vscode.postMessage({ action: 'setAnalyseScope', scope: currentAnalyseScope });
      renderAnalyseView();
    });
  });

  function formatCurrency(val) {
    if (typeof val !== 'number' || isNaN(val)) return '$0.00';
    return '$' + val.toFixed(2);
  }

  function formatActiveDuration(minutes) {
    if (!minutes || minutes < 1) return '0 Min.';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return m + ' Min.';
    return h + 'h ' + (m < 10 ? '0' : '') + m + 'm';
  }

  function renderAnalyseView() {
    if (!cachedAnalytics) return;
    const providerData = cachedAnalytics[currentAnalyseFilter] || cachedAnalytics.all;
    if (!providerData) return;
    const data = providerData[currentAnalyseScope] || providerData.today;
    if (!data) return;

    const s = data.summary || {};
    document.getElementById('kpi-total-tokens').textContent = formatTokens(s.totalTokens);
    document.getElementById('kpi-input-tokens').textContent = formatTokens(s.inputTokens);
    document.getElementById('kpi-output-tokens').textContent = formatTokens(s.outputTokens);
    document.getElementById('kpi-cache-tokens').textContent = formatTokens(s.cacheReadTokens);

    document.getElementById('kpi-cost').textContent = formatCurrency(s.estimatedCost);
    document.getElementById('kpi-claude-cost').textContent = formatCurrency(s.claudeCost);
    document.getElementById('kpi-agy-cost').textContent = formatCurrency(s.antigravityCost);
    const copilotCostEl = document.getElementById('kpi-copilot-cost');
    if (copilotCostEl) copilotCostEl.textContent = formatCurrency(s.copilotCost || 0);

    document.getElementById('kpi-cache-rate').textContent = (s.cacheHitRate || 0) + '%';
    document.getElementById('kpi-cache-reads').textContent = formatTokens(s.cacheReadTokens);
    document.getElementById('kpi-cache-writes').textContent = formatTokens(s.cacheWriteTokens);

    document.getElementById('kpi-active-time').textContent = formatActiveDuration(s.activeMinutes);
    document.getElementById('kpi-turns-count').textContent = (s.turnsCount || 0) + ' Turns';
    document.getElementById('kpi-sessions-val').textContent = (s.sessionsCount || 0) + ' Sessions';
    document.getElementById('kpi-sessions-count').textContent = (s.sessionsCount || 0) + ' Sessions';

    // Scope-dependent titles and labels
    const scopeTitles = {
      today: {
        tokens: 'Tokens Heute (Gesamt)',
        chart: 'Stündlicher Verlauf Heute (00:00 - 23:00)',
        chartIcon: '⚡',
        sessions: 'Aktive Sessions Heute',
        nettoNote: 'Netto = Input + Output (ohne Cache-Read)'
      },
      '7d': {
        tokens: 'Tokens Letzte 7 Tage',
        chart: 'Täglicher Verlauf der letzten 7 Tage',
        chartIcon: '📅',
        sessions: 'Sessions in 7 Tagen',
        nettoNote: 'Netto = Input + Output (ohne Cache-Read)'
      },
      '30d': {
        tokens: 'Tokens Letzte 30 Tage',
        chart: 'Täglicher Verlauf der letzten 30 Tage',
        chartIcon: '🗓️',
        sessions: 'Sessions in 30 Tagen',
        nettoNote: 'Netto = Input + Output (ohne Cache-Read)'
      }
    };
    const titles = scopeTitles[currentAnalyseScope] || scopeTitles.today;

    const elTotalTokensTitle = document.getElementById('kpi-total-tokens-title');
    if (elTotalTokensTitle) elTotalTokensTitle.textContent = titles.tokens;

    const elChartTitle = document.getElementById('chart-title-text');
    if (elChartTitle) elChartTitle.textContent = titles.chart;

    const elChartIcon = document.querySelector('.chart-title-icon');
    if (elChartIcon) elChartIcon.textContent = titles.chartIcon;

    const elSessionsLabel = document.getElementById('kpi-sessions-label');
    if (elSessionsLabel) elSessionsLabel.textContent = titles.sessions;

    const elNettoNote = document.getElementById('kpi-netto-note');
    if (elNettoNote) elNettoNote.textContent = titles.nettoNote;

    const elModelCount = document.getElementById('model-count-label');
    if (elModelCount) {
      elModelCount.textContent = (data.models || []).length + ' aktiv';
    }

    const elProjCount = document.getElementById('proj-count-label');
    if (elProjCount) {
      elProjCount.textContent = (data.projects || []).length + ' aktiv';
    }

    const elProjTitle = document.getElementById('proj-card-title');
    if (elProjTitle) {
      if (currentAnalyseScope === 'today') elProjTitle.textContent = 'Projekt-Verbrauch Heute';
      else if (currentAnalyseScope === '7d') elProjTitle.textContent = 'Projekt-Verbrauch (Letzte 7 Tage)';
      else if (currentAnalyseScope === '30d') elProjTitle.textContent = 'Projekt-Verbrauch (Letzte 30 Tage)';
    }

    const elToolsCount = document.getElementById('tools-count-label');
    if (elToolsCount) {
      const calls = (data.tools && data.tools.totalCalls) || 0;
      elToolsCount.textContent = calls > 0 ? (calls.toLocaleString('de-DE') + ' Tool-Aufrufe') : 'Keine Aufrufe';
    }

    renderTimelineChart(data.timeline || [], data.maxTimelineTokens || 1, data.timelineType || 'hourly', currentAnalyseScope);
    renderModelsList(data.models || []);
    renderToolsAndContent(data.tools || {}, data.content || {}, currentAnalyseScope);
    renderProjectsTable(data.projects || []);
  }

  let currentChartMode = 'all'; // 'all' or 'net'

  const btnChartModeAll = document.getElementById('btn-chart-mode-all');
  const btnChartModeNet = document.getElementById('btn-chart-mode-net');
  const legendCacheDot = document.getElementById('legend-cache-dot');

  if (btnChartModeAll && btnChartModeNet) {
    btnChartModeAll.addEventListener('click', () => {
      currentChartMode = 'all';
      btnChartModeAll.classList.add('active');
      btnChartModeNet.classList.remove('active');
      if (legendCacheDot) legendCacheDot.style.display = 'inline-flex';
      renderAnalyseView();
    });
    btnChartModeNet.addEventListener('click', () => {
      currentChartMode = 'net';
      btnChartModeNet.classList.add('active');
      btnChartModeAll.classList.remove('active');
      if (legendCacheDot) legendCacheDot.style.display = 'none';
      renderAnalyseView();
    });
  }

  function renderTimelineChart(timeline, maxTimelineTokens, timelineType, scope) {
    const container = document.getElementById('chart-svg-container');
    const xAxis = document.getElementById('chart-x-axis');
    if (!container || !xAxis) return;

    const w = 960;
    const h = 130;
    const chartH = 118; // maximum bar height
    const yBase = 126;  // baseline axis

    const isNet = currentChartMode === 'net';

    let max = 1000;
    if (isNet) {
      for (const d of (timeline || [])) {
        const net = (d.inputTokens || 0) + (d.outputTokens || 0);
        if (net > max) max = net;
      }
    } else {
      max = Math.max(maxTimelineTokens || 1, 1000);
    }

    let svgInner = '';

    // Subtle horizontal dashed guide lines
    for (let step = 1; step <= 3; step++) {
      const y = Math.round(yBase - (chartH * (step / 4)));
      svgInner += '<line x1="0" y1="' + y + '" x2="' + w + '" y2="' + y + '" stroke="rgba(128,128,128,0.14)" stroke-dasharray="3,3" />';
    }

    // Baseline axis line
    svgInner += '<line x1="0" y1="' + yBase + '" x2="' + w + '" y2="' + yBase + '" stroke="var(--vscode-widget-border, rgba(128,128,128,0.3))" stroke-width="1" />';

    const count = (timeline && timeline.length) ? timeline.length : 1;
    const slotW = w / count;
    const barW = scope === '7d' ? 52 : (scope === '30d' ? 18 : 20);

    for (let i = 0; i < count; i++) {
      const cx = Math.round(i * slotW + slotW / 2);
      const bx = Math.round(cx - barW / 2);
      const d = (timeline && timeline[i]) || { inputTokens: 0, outputTokens: 0, cacheTokens: 0, totalTokens: 0, turns: 0, cost: 0, label: '' };

      const inTok = d.inputTokens || 0;
      const outTok = d.outputTokens || 0;
      const cacheTok = isNet ? 0 : (d.cacheTokens || 0);
      const activeTok = isNet ? (inTok + outTok) : (d.totalTokens || (inTok + outTok + cacheTok));

      if (activeTok > 0) {
        const totalBarH = Math.min(chartH, Math.max(4, Math.round((activeTok / max) * chartH)));

        let inH = 0;
        let outH = 0;
        let cacheH = 0;

        if (isNet) {
          inH = inTok > 0 ? Math.max(2, Math.round((inTok / activeTok) * totalBarH)) : 0;
          outH = outTok > 0 ? Math.max(2, totalBarH - inH) : 0;
        } else {
          inH = inTok > 0 ? Math.max(3, Math.round((inTok / activeTok) * totalBarH)) : 0;
          outH = outTok > 0 ? Math.max(3, Math.round((outTok / activeTok) * totalBarH)) : 0;
          cacheH = cacheTok > 0 ? Math.max(2, totalBarH - inH - outH) : 0;
        }

        const yIn = yBase - inH;
        const yCache = yIn - cacheH;
        const yOut = yCache - outH;

        const timeTitle = d.fullDateLabel || (d.label + (scope === 'today' ? ' Uhr' : ''));
        const tip = timeTitle + ': ' + (d.turns || 0) + ' Turns · ' +
          formatTokens(d.totalTokens) + ' Tokens' +
          ' (' + formatTokens(inTok) + ' In · ' + formatTokens(outTok) + ' Out · ' + formatTokens(d.cacheTokens || 0) + ' Cache) · ' +
          formatCurrency(d.cost);

        svgInner += '<g class="bar-group">';
        svgInner += '<title>' + escapeHtml(tip) + '</title>';
        if (inH > 0) svgInner += '<rect x="' + bx + '" y="' + yIn + '" width="' + barW + '" height="' + inH + '" fill="var(--vscode-charts-blue, #70a9ff)" rx="1" />';
        if (cacheH > 0) svgInner += '<rect x="' + bx + '" y="' + yCache + '" width="' + barW + '" height="' + cacheH + '" fill="#10b981" rx="1" />';
        if (outH > 0) svgInner += '<rect x="' + bx + '" y="' + yOut + '" width="' + barW + '" height="' + outH + '" fill="#f26522" rx="1" />';
        svgInner += '<rect x="' + Math.max(0, bx - 4) + '" y="0" width="' + (barW + 8) + '" height="' + yBase + '" fill="transparent" />';
        svgInner += '</g>';
      }

      // Tick marks on baseline
      if (scope === 'today') {
        if (i % 2 === 0) {
          const tickX = Math.round(i * slotW);
          svgInner += '<line x1="' + tickX + '" y1="' + yBase + '" x2="' + tickX + '" y2="' + (yBase + 4) + '" stroke="rgba(128,128,128,0.4)" />';
        }
      } else if (scope === '7d') {
        svgInner += '<line x1="' + cx + '" y1="' + yBase + '" x2="' + cx + '" y2="' + (yBase + 4) + '" stroke="rgba(128,128,128,0.4)" />';
      } else {
        // 30d
        if (i % 5 === 0 || i === (count - 1)) {
          svgInner += '<line x1="' + cx + '" y1="' + yBase + '" x2="' + cx + '" y2="' + (yBase + 4) + '" stroke="rgba(128,128,128,0.4)" />';
        }
      }
    }

    if (scope === 'today') {
      // Final tick mark at 24:00 (right edge)
      svgInner += '<line x1="' + w + '" y1="' + yBase + '" x2="' + w + '" y2="' + (yBase + 4) + '" stroke="rgba(128,128,128,0.4)" />';
    }

    container.innerHTML = '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="100%" preserveAspectRatio="none" style="width: 100%; height: 100%; display: block; overflow: hidden;">' + svgInner + '</svg>';

    // X-Axis labels
    let xLabels = '';
    if (scope === 'today') {
      xAxis.style.justifyContent = 'space-between';
      for (let i = 0; i <= 24; i += 2) {
        xLabels += '<span>' + String(i).padStart(2, '0') + ':00</span>';
      }
    } else if (scope === '7d') {
      xAxis.style.justifyContent = 'space-between';
      for (let i = 0; i < count; i++) {
        const item = timeline[i] || {};
        xLabels += '<span style="flex: 1; text-align: center; font-size: 12px; font-weight: 500;">' + escapeHtml(item.label || '') + '</span>';
      }
    } else {
      // 30d
      xAxis.style.justifyContent = 'space-between';
      for (let i = 0; i < count; i++) {
        const item = timeline[i] || {};
        const show = (i % 5 === 0) || (i === count - 1);
        xLabels += '<span style="flex: 1; text-align: center; font-size: 11.5px;">' + (show ? escapeHtml(item.label || '') : '&nbsp;') + '</span>';
      }
    }
    xAxis.innerHTML = xLabels;
  }

  function renderHourlyChart(hourly, maxHourlyTokens) {
    renderTimelineChart(hourly, maxHourlyTokens, 'hourly', 'today');
  }

  function renderModelsList(models) {
    const container = document.getElementById('model-list');
    if (!container) return;
    const validModels = (models || []).filter((m) => m.tokens > 0 && m.name !== '<synthetic>');
    if (validModels.length === 0) {
      container.innerHTML = '<div style="opacity: 0.6; font-style: italic; font-size: 12px; padding: 12px 0;">Keine Modell-Aktivität im gewählten Zeitraum</div>';
      return;
    }
    container.innerHTML = validModels.map((m) => {
      const isClaude = m.provider === 'claude';
      const isCopilot = m.provider === 'copilot';
      const color = isClaude ? '#f26522' : (isCopilot ? '#10b981' : '#4285f4');
      const icon = isClaude ? ICONS.claude : (isCopilot ? ICONS.copilot : ICONS.antigravity);
      const displayName = friendlyModel(m.name) || m.name;
      return '<div class="model-row">' +
        '<div class="model-meta">' +
          '<span class="model-name"><span class="prov-badge ' + m.provider + '">' + icon + '</span> ' + escapeHtml(displayName) + '</span>' +
          '<span class="model-stat">' + formatTokens(m.tokens) + ' Tokens · ' + formatCurrency(m.cost) + ' (' + m.percent + '%)</span>' +
        '</div>' +
        '<div class="model-bar-track">' +
          '<div class="model-bar-fill ' + m.provider + '" style="width: ' + Math.max(3, m.percent) + '%; background-color: ' + color + ';"></div>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function renderToolsAndContent(tools, content, scope) {
    const listEl = document.getElementById('tool-list');
    const trackEl = document.getElementById('token-comp-track');
    const legendEl = document.getElementById('token-comp-legend');
    const totalEl = document.getElementById('token-comp-total');

    if (listEl) {
      const categories = (tools && tools.categories) || [];
      const activeCats = categories.filter((c) => c.count > 0);
      if (activeCats.length === 0) {
        listEl.innerHTML = '<div style="opacity: 0.6; font-style: italic; font-size: 12.5px; padding: 10px 0;">Keine Tool-Aufrufe im gewählten Zeitraum</div>';
      } else {
        const topTools = (tools && tools.topTools) || [];
        listEl.innerHTML = activeCats.map((c) => {
          const catTop = topTools.filter((t) => t.category === c.key);
          const tip = catTop.length > 0
            ? (c.label + ' (' + c.count + ' Aufrufe): ' + catTop.map((t) => t.name + ': ' + t.count).join(' · '))
            : (c.label + ': ' + c.count + ' Aufrufe');
          return '<div class="tool-row" title="' + escapeHtml(tip) + '">' +
            '<div class="tool-meta">' +
              '<span class="tool-name">' + c.icon + ' ' + escapeHtml(c.label) + '</span>' +
              '<span class="tool-stat">' + c.count.toLocaleString('de-DE') + ' (' + c.percent + '%)</span>' +
            '</div>' +
            '<div class="tool-bar-track">' +
              '<div class="tool-bar-fill" style="width: ' + Math.max(2, c.percent) + '%; background-color: ' + c.color + ';"></div>' +
            '</div>' +
          '</div>';
        }).join('');
      }
    }

  if (totalEl) {
    const tot = (content && content.totalTokens) || 0;
    totalEl.textContent = formatTokens(tot) + ' Gesamt';
  }

  if (trackEl && legendEl) {
    const inTok = (content && content.inputTokens) || 0;
    const outTok = (content && content.outputTokens) || 0;
    const cacheReadTok = (content && content.cacheReadTokens) || 0;
    const cacheWriteTok = (content && content.cacheWriteTokens) || 0;
    const totTok = (content && content.totalTokens) || 0;

    if (totTok === 0) {
      trackEl.innerHTML = '<div style="width: 100%; height: 100%; background: rgba(128,128,128,0.15); border-radius: 6px;"></div>';
      legendEl.innerHTML = '<span style="opacity: 0.6; font-style: italic; font-size: 12px;">Keine Token-Aktivität</span>';
    } else {
      const pctIn = content.inputPercent || 0;
      const pctOut = content.outputPercent || 0;
      const pctCacheRead = content.cacheReadPercent || 0;
      const pctCacheWrite = content.cacheWritePercent || 0;

      let segsHtml = '';
      if (pctIn > 0) {
        segsHtml += '<div class="token-comp-seg" style="width: ' + pctIn + '%; background: var(--vscode-charts-blue, #70a9ff);" title="Input: ' + formatTokens(inTok) + ' (' + pctIn + '%)"></div>';
      }
      if (pctCacheRead > 0) {
        segsHtml += '<div class="token-comp-seg" style="width: ' + pctCacheRead + '%; background: #10b981;" title="Cache Read: ' + formatTokens(cacheReadTok) + ' (' + pctCacheRead + '%)"></div>';
      }
      if (pctCacheWrite > 0) {
        segsHtml += '<div class="token-comp-seg" style="width: ' + pctCacheWrite + '%; background: #8b5cf6;" title="Cache Write: ' + formatTokens(cacheWriteTok) + ' (' + pctCacheWrite + '%)"></div>';
      }
      if (pctOut > 0) {
        segsHtml += '<div class="token-comp-seg" style="width: ' + pctOut + '%; background: #f26522;" title="Output / Thinking: ' + formatTokens(outTok) + ' (' + pctOut + '%)"></div>';
      }
      trackEl.innerHTML = segsHtml;

      let legendHtml = '';
      legendHtml += '<span class="token-comp-item"><span class="token-comp-dot" style="background: var(--vscode-charts-blue, #70a9ff);"></span> Input: ' + pctIn + '% (' + formatTokens(inTok) + ')</span>';
      legendHtml += '<span class="token-comp-item"><span class="token-comp-dot" style="background: #f26522;"></span> Output: ' + pctOut + '% (' + formatTokens(outTok) + ')</span>';
      if (cacheReadTok > 0) {
        legendHtml += '<span class="token-comp-item"><span class="token-comp-dot" style="background: #10b981;"></span> Cache Read: ' + pctCacheRead + '% (' + formatTokens(cacheReadTok) + ')</span>';
      }
      if (cacheWriteTok > 0) {
        legendHtml += '<span class="token-comp-item"><span class="token-comp-dot" style="background: #8b5cf6;"></span> Cache Write: ' + pctCacheWrite + '% (' + formatTokens(cacheWriteTok) + ')</span>';
      }
      if (content && content.thinkingTurns > 0) {
        legendHtml += '<span class="token-comp-item" style="color: #e5c07b; font-weight: 500;">⚡ ' + content.thinkingTurns + ' Turns mit Thinking</span>';
      }
      legendEl.innerHTML = legendHtml;
    }
  }
}

function renderProjectsTable(projects) {
  const tbody = document.getElementById('proj-table-body');
  if (!tbody) return;
  if (!projects || projects.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="opacity: 0.6; font-style: italic; padding: 12px 0;">Keine Projekt-Aktivität im gewählten Zeitraum</td></tr>';
    return;
  }
  tbody.innerHTML = (projects || []).map((p) => {
    return '<tr>' +
      '<td><span class="project-badge" style="font-size: 12.5px; padding: 2px 8px;">📁 ' + escapeHtml(p.name) + '</span></td>' +
      '<td>' + p.sessionsCount + '</td>' +
      '<td>' + p.turns + '</td>' +
      '<td class="font-mono">' + formatTokens(p.tokens) + '</td>' +
      '<td class="font-mono" style="color: #4ec9b0; font-weight: 600;">' + formatCurrency(p.cost) + '</td>' +
    '</tr>';
  }).join('');
}

  window.addEventListener('message', (ev) => {
    if (!ev.data) return;
    if (ev.data.type === 'render') {
      const loader = document.getElementById('dashboard-loader');
      if (loader && !loader.classList.contains('hidden')) {
        loader.classList.add('hidden');
      }
      if (ev.data.enabledProviders) {
        currentEnabledProviders = ev.data.enabledProviders;
        updateProviderButtonsUI(currentEnabledProviders);
      }
      cachedColumns = ev.data.columns || [];
      cachedQuota = ev.data.quota || null;
      cachedAnalytics = ev.data.analytics || null;
      if (ev.data.analyseFilter) {
        currentAnalyseFilter = ev.data.analyseFilter;
        analyseFilterBtns.forEach((b) => b.classList.toggle('active', b.getAttribute('data-filter') === currentAnalyseFilter));
      }
      if (ev.data.analyseScope) {
        currentAnalyseScope = ev.data.analyseScope;
        analyseScopeBtns.forEach((b) => b.classList.toggle('active', b.getAttribute('data-scope') === currentAnalyseScope));
      }
      if (modeBadgeBoard) {
        modeBadgeBoard.textContent = ev.data.counts ? (ev.data.counts.all || 0) : 0;
      }
      if (btnSoundToggle && typeof ev.data.soundEnabled === 'boolean') {
        btnSoundToggle.textContent = ev.data.soundEnabled ? '🔊' : '🔇';
        btnSoundToggle.classList.toggle('muted', !ev.data.soundEnabled);
        btnSoundToggle.title = ev.data.soundEnabled
          ? 'Sounds aktiv (Klicken zum Stummschalten)'
          : 'Sounds stummgeschaltet (Klicken zum Aktivieren)';
      }
      updateFilterUI(ev.data.filter, ev.data.counts);
      updateProjectChipsUI(ev.data.projectFilter, ev.data.counts);
      updateQuotaUI(cachedQuota, ev.data.filter);
      if (typeof ev.data.initialSearch === 'string' && ev.data.initialSearch && !currentSearch) {
        setSearch(ev.data.initialSearch);
      } else {
        applySearchAndRender();
      }
      if (ev.data.viewMode && ev.data.viewMode !== currentViewMode) {
        setViewMode(ev.data.viewMode);
      } else if (currentViewMode === 'analyse') {
        renderAnalyseView();
      }
      return;
    }
    if (ev.data.type === 'setViewMode') {
      setViewMode(ev.data.mode || 'board');
      return;
    }
    if (ev.data.type === 'setSearch') {
      setSearch(ev.data.query || '');
      searchInput.focus();
      return;
    }
  });

  vscode.postMessage({ action: 'ready' });
</script>
</body>
</html>`;
  }
}

module.exports = { BoardPanel };
