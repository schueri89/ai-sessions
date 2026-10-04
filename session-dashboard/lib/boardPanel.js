'use strict';

// Board view in an editor tab: one column per state, one card per session.

const vscode = require('vscode');
const crypto = require('crypto');
const { STATES, STATE_ORDER, describe } = require('./format');

const ICONS = {
  claude: '<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><path d="M4.709 15.955l4.72-2.647.08-.23-.08-.128H9.2l-.79-.048-2.698-.073-2.339-.097-2.266-.122-.571-.121L0 11.784l.055-.352.48-.321.686.06 1.52.103 2.278.158 1.652.097 2.449.255h.389l.055-.157-.134-.098-.103-.097-2.358-1.596-2.552-1.688-1.336-.972-.724-.491-.364-.462-.158-1.008.656-.722.881.06.225.061.893.686 1.908 1.476 2.491 1.833.365.304.145-.103.019-.073-.164-.274-1.355-2.446-1.446-2.49-.644-1.032-.17-.619a2.97 2.97 0 01-.104-.729L6.283.134 6.696 0l.996.134.42.364.62 1.414 1.002 2.229 1.555 3.03.456.898.243.832.091.255h.158V9.01l.128-1.706.237-2.095.23-2.695.08-.76.376-.91.747-.492.584.28.48.685-.067.444-.286 1.851-.559 2.903-.364 1.942h.212l.243-.242.985-1.306 1.652-2.064.73-.82.85-.904.547-.431h1.033l.76 1.129-.34 1.166-1.064 1.347-.881 1.142-1.264 1.7-.79 1.36.073.11.188-.02 2.856-.606 1.543-.28 1.841-.315.833.388.091.395-.328.807-1.969.486-2.309.462-3.439.813-.042.03.049.061 1.549.146.662.036h1.622l3.02.225.79.522.474.638-.079.485-1.215.62-1.64-.389-3.829-.91-1.312-.329h-.182v.11l1.093 1.068 2.006 1.81 2.509 2.33.127.578-.322.455-.34-.049-2.205-1.657-.851-.747-1.926-1.62h-.128v.17l.444.649 2.345 3.521.122 1.08-.17.353-.608.213-.668-.122-1.374-1.925-1.415-2.167-1.143-1.943-.14.08-.674 7.254-.316.37-.729.28-.607-.461-.322-.747.322-1.476.389-1.924.315-1.53.286-1.9.17-.632-.012-.042-.14.018-1.434 1.967-2.18 2.945-1.726 1.845-.414.164-.717-.37.067-.662.401-.589 2.388-3.036 1.44-1.882.93-1.086-.006-.158h-.055L4.132 18.56l-1.13.146-.487-.456.061-.746.231-.243 1.908-1.312-.006.006z"/></svg>',
  antigravity: '<svg viewBox="0 0 113 113" width="14" height="14" fill="currentColor"><path d="M89.6992 93.695C94.3659 97.195 101.366 94.8617 94.9492 88.445C75.6992 69.7783 79.7825 18.445 55.8659 18.445C31.9492 18.445 36.0325 69.7783 16.7825 88.445C9.78251 95.445 17.3658 97.195 22.0325 93.695C40.1159 81.445 38.9492 59.8617 55.8659 59.8617C72.7825 59.8617 71.6159 81.445 89.6992 93.695Z"/></svg>',
  pin: '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a5.927 5.927 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182c-.195.195-1.219.923-1.414.728-.195-.195.533-1.22.728-1.414l3.182-3.182-2.828-2.829a.5.5 0 0 1 0-.707c.688-.688 1.673-.767 2.375-.72a5.922 5.922 0 0 1 1.013.16l3.134-3.133a2.772 2.772 0 0 1-.04-.461c0-.43.108-1.022.589-1.503a.5.5 0 0 1 .353-.146z"/></svg>',
  search: '<svg viewBox="0 0 16 16" width="13" height="13" fill="currentColor"><path d="M11.742 10.344a6.5 6.5 0 1 0-1.397 1.398h-.001c.03.04.062.078.098.115l3.85 3.85a1 1 0 0 0 1.415-1.414l-3.85-3.85a1.007 1.007 0 0 0-.115-.1zM12 6.5a5.5 5.5 0 1 1-11 0 5.5 5.5 0 0 1 11 0z"/></svg>'
};

class BoardPanel {
  constructor(model) {
    this.model = model;
    this.panel = null;
    this.pendingSearch = '';
  }

  attach(panel) {
    this.panel = panel;
    this.panel.iconPath = vscode.Uri.joinPath(this.model.extensionUri, 'resources', 'icon.svg');
    this.panel.webview.options = { enableScripts: true };
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
      if (msg && msg.action === 'setProjectFilter') {
        this.model.setProjectFilter(msg.filter).then(() => {
          vscode.commands.executeCommand('sessionDashboard.refresh');
        });
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

  ensurePinned() {
    const config = vscode.workspace.getConfiguration('sessionDashboard');
    if (!config.get('autoPinTab', true)) return;

    setTimeout(async () => {
      try {
        if (vscode.window.tabGroups && vscode.window.tabGroups.all) {
          for (const group of vscode.window.tabGroups.all) {
            for (const tab of group.tabs) {
              const viewType = tab.input && tab.input.viewType;
              if (viewType && (viewType === 'sessionDashboard.board' || viewType.endsWith('sessionDashboard.board'))) {
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

  show(query) {
    if (typeof query === 'string') {
      this.pendingSearch = query;
    }
    if (this.panel) {
      this.panel.reveal();
      if (this.pendingSearch) {
        this.panel.webview.postMessage({ type: 'setSearch', query: this.pendingSearch });
        this.pendingSearch = '';
      }
      this.ensurePinned();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'sessionDashboard.board',
      'AI Sessions',
      vscode.ViewColumn.Active,
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
    this.panel.webview.postMessage({
      type: 'render',
      filter: this.model.providerFilter,
      projectFilter: this.model.projectFilter,
      counts: this.model.counts(),
      quota: this.model.quota,
      initialSearch,
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
  .bookmarked .dot { background: var(--vscode-charts-yellow, #e5c07b); }
  .idle .dot { background: var(--vscode-charts-green); }
  .done .dot { background: var(--vscode-disabledForeground); }
  .card { background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-widget-border, transparent);
    border-left: 3px solid transparent; border-radius: 4px; padding: 8px 10px; margin-bottom: 8px; cursor: pointer; }
  .card:hover { background: var(--vscode-list-hoverBackground); }
  .waiting .card { border-left-color: var(--vscode-charts-orange); }
  .busy .card { border-left-color: var(--vscode-charts-blue); }
  .bookmarked .card { border-left-color: var(--vscode-charts-yellow, #e5c07b); }
  .idle .card { border-left-color: var(--vscode-charts-green); }
  .done .card { opacity: 0.6; }
  .mark-all-btn { float: right; font-size: 0.75em; padding: 1px 6px; }
  .card-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 3px; }
  .title { font-weight: 600; flex: 1; min-width: 0; overflow-wrap: anywhere; line-height: 1.35; }
  .header-badges { display: inline-flex; align-items: center; gap: 4px; flex-shrink: 0; margin-top: -1px; }
  .pin-btn { background: transparent; border: none; padding: 3px 4px; border-radius: 3px; cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center; line-height: 1;
    color: var(--vscode-descriptionForeground); opacity: 0.35; transition: all 0.15s ease; }
  .card:hover .pin-btn { opacity: 0.75; }
  .pin-btn:hover { opacity: 1; background: var(--vscode-toolbar-hoverBackground, rgba(128, 128, 128, 0.2)); }
  .pin-btn.active { opacity: 1; color: var(--vscode-charts-yellow, #e5c07b); }
  .pin-btn svg { width: 13px; height: 13px; display: block; }
  .provider-icon { flex-shrink: 0; display: inline-flex; align-items: center; justify-content: center;
    width: 22px; height: 22px; border-radius: 4px; line-height: 1; }
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
  .toolbar { display: flex; flex-direction: column; gap: 8px; margin-bottom: 14px; padding-bottom: 8px; border-bottom: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2)); }
  .toolbar-main { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 10px; width: 100%; }
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
  .project-chips-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; width: 100%; padding-top: 4px; }
  .project-chips-label { font-size: 0.74em; opacity: 0.65; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; margin-right: 2px; }
  .project-chip { display: inline-flex; align-items: center; gap: 4px; font-size: 0.78em; padding: 2px 8px; border-radius: 12px;
    cursor: pointer; border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.25));
    background: var(--vscode-button-secondaryBackground, rgba(128, 128, 128, 0.1));
    color: var(--vscode-button-secondaryForeground, inherit); transition: all 0.15s ease; }
  .project-chip:hover { background: var(--vscode-button-secondaryHoverBackground, rgba(128, 128, 128, 0.2)); }
  .project-chip.active { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border-color: transparent; font-weight: 600; }
  .project-chip .count { opacity: 0.75; font-size: 0.9em; }
  .card-meta { display: flex; align-items: center; flex-wrap: wrap; gap: 6px; margin: 3px 0 4px; }
  .project-badge { display: inline-flex; align-items: center; gap: 3px; font-size: 0.72em;
    padding: 1px 6px; border-radius: 3px; font-weight: 600; line-height: 1.3;
    background: var(--vscode-badge-background, rgba(128, 128, 128, 0.2));
    color: var(--vscode-badge-foreground);
    border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.3));
    cursor: pointer; transition: all 0.15s ease; }
  .project-badge:hover { filter: brightness(1.2); border-color: var(--vscode-focusBorder, #007acc); }
  .search-group { display: flex; align-items: center; gap: 8px; flex: 1; max-width: 420px; min-width: 220px; justify-content: flex-end; }
  .search-box { position: relative; display: flex; align-items: center; width: 100%; }
  .search-icon { position: absolute; left: 8px; pointer-events: none; display: flex; align-items: center;
    color: var(--vscode-descriptionForeground, rgba(128, 128, 128, 0.7)); opacity: 0.8; z-index: 1; }
  .search-icon svg { width: 13px; height: 13px; display: block; }
  #search-input, .search-input { width: 100%; height: 26px; padding: 4px 26px 4px 28px; border-radius: 4px; font-size: 0.85em;
    background: transparent !important; color: var(--vscode-foreground) !important;
    border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.35)); outline: none;
    box-sizing: border-box; font-family: inherit; transition: all 0.15s ease; }
  #search-input:focus, .search-input:focus { border-color: var(--vscode-focusBorder, #007acc); background: rgba(128, 128, 128, 0.08) !important; }
  #search-input::placeholder, .search-input::placeholder { color: var(--vscode-descriptionForeground, rgba(128, 128, 128, 0.6)); opacity: 0.8; }
  .search-clear-btn { position: absolute; right: 5px; background: transparent; border: none;
    color: var(--vscode-descriptionForeground, rgba(128, 128, 128, 0.7)); cursor: pointer; padding: 2px 4px; font-size: 0.8em;
    line-height: 1; border-radius: 2px; z-index: 1; }
  .search-clear-btn:hover { color: var(--vscode-foreground); background: var(--vscode-toolbar-hoverBackground, rgba(128, 128, 128, 0.2)); }
  .search-status { font-size: 0.75em; opacity: 0.85; white-space: nowrap; padding: 2px 6px; border-radius: 3px;
    background: var(--vscode-badge-background, rgba(128, 128, 128, 0.2)); color: var(--vscode-badge-foreground); }
  .search-status.no-matches { background: rgba(229, 192, 123, 0.2); color: #e5c07b; }
  .search-highlight { background: rgba(234, 92, 0, 0.4); color: inherit; border-radius: 2px; padding: 0 1px; font-style: normal; }
  .search-empty-banner { grid-column: 1 / -1; padding: 32px 16px; text-align: center;
    border: 1px dashed var(--vscode-widget-border, rgba(128, 128, 128, 0.3)); border-radius: 6px; margin: 12px 0; }
  .search-empty-title { font-size: 1.1em; font-weight: 600; margin-bottom: 6px; }
  .search-empty-text { font-size: 0.85em; opacity: 0.7; margin-bottom: 12px; }
  .card.rate-limited { border-color: rgba(229, 192, 123, 0.45); }
  .card.rate-limited .detail { color: #e5c07b; opacity: 1; font-weight: 500; }
  .rate-limit-badge { display: inline-flex; align-items: center; font-size: 0.72em;
    padding: 1px 5px; border-radius: 3px; font-weight: 600; line-height: 1.2;
    background: rgba(229, 192, 123, 0.2); color: #e5c07b; border: 1px solid rgba(229, 192, 123, 0.4); }
  .activity { display: flex; align-items: center; gap: 6px; font-size: 0.8em; margin-top: 6px;
    padding: 3px 8px; border-radius: 4px; overflow: hidden; line-height: 1.35;
    background: rgba(112, 169, 255, 0.1); color: var(--vscode-charts-blue, #70a9ff);
    border: 1px solid rgba(112, 169, 255, 0.25); }
  .activity-pulse { width: 6px; height: 6px; border-radius: 50%;
    background: var(--vscode-charts-blue, #70a9ff); flex-shrink: 0;
    box-shadow: 0 0 6px var(--vscode-charts-blue, #70a9ff);
    animation: act-pulse 1.8s ease-in-out infinite; }
  @keyframes act-pulse {
    0% { opacity: 0.35; transform: scale(0.85); }
    50% { opacity: 1; transform: scale(1.2); }
    100% { opacity: 0.35; transform: scale(0.85); }
  }
  .activity-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; font-weight: 500; }
  .token-bar { margin: 6px 0 2px; padding: 4px 6px; border-radius: 4px;
    background: rgba(128, 128, 128, 0.08); border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.18));
    cursor: default; transition: background 0.15s ease; }
  .token-bar:hover { background: rgba(128, 128, 128, 0.14); }
  .token-track { width: 100%; height: 4px; border-radius: 2px;
    background: rgba(128, 128, 128, 0.2); overflow: hidden; margin-bottom: 4px; }
  .token-fill { height: 100%; border-radius: 2px; transition: width 0.3s ease; }
  .token-fill.level-low { background: var(--vscode-charts-blue, #70a9ff); }
  .token-fill.level-medium { background: var(--vscode-charts-yellow, #e5c07b); }
  .token-fill.level-high { background: var(--vscode-charts-red, #f48771); }
  .token-meta { display: flex; align-items: center; justify-content: space-between; font-size: 0.73em; line-height: 1.2; }
  .token-stats { display: inline-flex; align-items: center; gap: 4px; }
  .token-pct { font-weight: 600; }
  .token-pct.level-low { color: var(--vscode-charts-blue, #70a9ff); }
  .token-pct.level-medium { color: var(--vscode-charts-yellow, #e5c07b); }
  .token-pct.level-high { color: var(--vscode-charts-red, #f48771); }
  .token-counts { opacity: 0.75; }
  .token-model-badge { opacity: 0.85; font-size: 0.95em; font-weight: 500;
    padding: 1px 5px; border-radius: 3px; background: rgba(128, 128, 128, 0.15); }
  .quota-strip { display: flex; flex-wrap: wrap; gap: 8px; width: 100%; padding-top: 6px; }
  .quota-card { flex: 1; min-width: 250px; background: rgba(128, 128, 128, 0.06);
    border: 1px solid var(--vscode-widget-border, rgba(128, 128, 128, 0.2)); border-radius: 5px; padding: 6px 10px; }
  .quota-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 5px; }
  .quota-provider { display: inline-flex; align-items: center; gap: 5px; font-size: 0.8em; font-weight: 600; }
  .quota-provider svg { width: 13px; height: 13px; display: block; }
  .quota-provider.claude { color: #ff9e79; }
  .quota-provider.antigravity { color: #70a9ff; }
  .quota-status-pill { font-size: 0.72em; padding: 1px 6px; border-radius: 10px; font-weight: 600; }
  .quota-status-pill.status-ok { background: rgba(78, 201, 176, 0.15); color: #4ec9b0; border: 1px solid rgba(78, 201, 176, 0.3); }
  .quota-status-pill.status-warn { background: rgba(229, 192, 123, 0.2); color: #e5c07b; border: 1px solid rgba(229, 192, 123, 0.4); }
  .quota-status-pill.status-danger { background: rgba(244, 135, 113, 0.2); color: #f48771; border: 1px solid rgba(244, 135, 113, 0.4); }
  .quota-meters { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .quota-meter { display: flex; flex-direction: column; gap: 2px; }
  .quota-meter-label { display: flex; justify-content: space-between; align-items: center; font-size: 0.74em; opacity: 0.85; }
  .quota-val { font-weight: 600; font-size: 0.92em; }
  .quota-val.level-low { color: var(--vscode-charts-blue, #70a9ff); }
  .quota-val.level-medium { color: var(--vscode-charts-yellow, #e5c07b); }
  .quota-val.level-high { color: var(--vscode-charts-red, #f48771); }
  .quota-progress-track { width: 100%; height: 4px; border-radius: 2px; background: rgba(128, 128, 128, 0.2); overflow: hidden; margin: 3px 0 2px; }
  .quota-progress-fill { height: 100%; border-radius: 2px; transition: width 0.3s ease; }
  .quota-progress-fill.level-low { background: var(--vscode-charts-blue, #70a9ff); }
  .quota-progress-fill.level-medium { background: var(--vscode-charts-yellow, #e5c07b); }
  .quota-progress-fill.level-high { background: var(--vscode-charts-red, #f48771); }
  .quota-sub { font-size: 0.72em; opacity: 0.65; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
</head>
<body>
<header class="toolbar">
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
    </div>
    <div class="search-group">
      <div class="search-box">
        <span class="search-icon">${ICONS.search}</span>
        <input type="text" class="search-input" id="search-input" placeholder="Sessions suchen (Titel, Prompt, ID, Projekt)... [/]" autocomplete="off" spellcheck="false">
        <button class="search-clear-btn" id="search-clear" title="Suche leeren" style="display: none;">✕</button>
      </div>
      <span class="search-status" id="search-status" style="display: none;"></span>
    </div>
  </div>
  <div class="project-chips-row" id="project-chips" style="display: none;"></div>
  <div class="quota-strip" id="quota-strip" style="display: none;"></div>
</header>
<div class="board" id="board"></div>
<script nonce="${nonce}">
  const vscode = acquireVsCodeApi();
  const board = document.getElementById('board');
  const ICONS = ${JSON.stringify(ICONS)};

  let cachedColumns = [];
  let currentSearch = '';

  const searchInput = document.getElementById('search-input');
  const searchClear = document.getElementById('search-clear');
  const searchStatus = document.getElementById('search-status');

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
    }
    filterBtns.forEach((btn) => {
      btn.classList.toggle('active', btn.getAttribute('data-filter') === (filter || 'all'));
    });
  }

  const projectChips = document.getElementById('project-chips');
  function updateProjectChipsUI(currentProjectFilter, counts) {
    if (!projectChips) return;
    projectChips.replaceChildren();

    const byProj = (counts && counts.byProject) || {};
    const projEntries = Object.entries(byProj).sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: 'base', numeric: true }) || a[0].localeCompare(b[0]));
    if (projEntries.length === 0) {
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

    for (const [proj, cnt] of projEntries) {
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
  }

  const quotaStrip = document.getElementById('quota-strip');
  let cachedQuota = null;

  function updateQuotaUI(quota, filter) {
    if (!quotaStrip) return;
    quotaStrip.replaceChildren();
    if (!quota) {
      quotaStrip.style.display = 'none';
      return;
    }

    const showClaude = (!filter || filter === 'all' || filter === 'claude') && quota.claude && quota.claude.available;
    const showAntigravity = (!filter || filter === 'all' || filter === 'antigravity') && quota.antigravity && quota.antigravity.available;

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
    if (n >= 1000000) {
      const m = n / 1000000;
      return (m % 1 === 0 ? m.toFixed(0) : m.toFixed(1)) + 'M';
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
    if (lower.includes('gemini-2.0-pro') || lower.includes('gemini-2-pro')) return 'Gemini 2.0 Pro';
    if (lower.includes('gemini-2.0-flash') || lower.includes('gemini-2-flash')) return 'Gemini 2.0 Flash';
    if (lower.includes('gemini-1.5-pro')) return 'Gemini 1.5 Pro';
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
        const unpinAllBtn = el('button', 'mark-all-btn', 'Alle geprüft');
        unpinAllBtn.title = 'Alle gemerkten Sessions freigeben';
        unpinAllBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          vscode.postMessage({ action: 'unbookmarkAll' });
        });
        heading.append(unpinAllBtn);
      }
      column.append(heading);
      if (col.sessions.length === 0) {
        column.append(el('div', 'empty', terms && terms.length > 0 ? 'keine Treffer' : 'keine'));
      }
      for (const s of col.sessions) {
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
        icon.title = s.provider === 'antigravity' ? 'Google Antigravity' : 'Claude Code';
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
          const unpinBtn = el('button', '', 'Geprüft');
          unpinBtn.title = 'Nicht mehr merken';
          unpinBtn.addEventListener('click', (ev) => {
            ev.stopPropagation();
            vscode.postMessage({ action: 'unbookmark', sessionId: s.sessionId });
          });
          actions.append(unpinBtn);
        }
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
      cachedColumns = ev.data.columns || [];
      cachedQuota = ev.data.quota || null;
      updateFilterUI(ev.data.filter, ev.data.counts);
      updateProjectChipsUI(ev.data.projectFilter, ev.data.counts);
      updateQuotaUI(cachedQuota, ev.data.filter);
      if (typeof ev.data.initialSearch === 'string' && ev.data.initialSearch && !currentSearch) {
        setSearch(ev.data.initialSearch);
      } else {
        applySearchAndRender();
      }
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
