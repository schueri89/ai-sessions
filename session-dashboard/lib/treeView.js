'use strict';

const vscode = require('vscode');
const { STATES, STATE_ORDER, describe, formatDateTime } = require('./format');

function tooltipFor(s) {
  const md = new vscode.MarkdownString(undefined, true);
  const providerLabel = s.provider === 'antigravity' ? 'Antigravity' : 'Claude';
  md.appendMarkdown(`**[${providerLabel}] ${escapeMd(s.title)}**\n\n`);
  md.appendMarkdown(`$(${STATES[s.displayState].icon}) ${STATES[s.displayState].label}`);
  const detail = describe(s);
  if (detail) md.appendMarkdown(` · ${escapeMd(detail)}`);
  md.appendMarkdown('\n\n');
  if (s.lastPrompt) {
    md.appendMarkdown('Letzter Prompt:\n');
    md.appendCodeblock(truncate(s.lastPrompt, 400), 'text');
  }
  if (s.startedAt) md.appendMarkdown(`Gestartet ${formatDateTime(s.startedAt)} · `);
  md.appendMarkdown(`\`${s.sessionId}\``);
  return md;
}

function escapeMd(text) {
  return String(text).replace(/[\\`*_{}[\]()#+\-.!|<>]/g, '\\$&');
}

function truncate(text, max) {
  return text.length > max ? `${text.slice(0, max)} …` : text;
}

class SessionTreeProvider {
  constructor(model) {
    this.model = model;
    this.emitter = new vscode.EventEmitter();
    this.onDidChangeTreeData = this.emitter.event;
  }

  refresh() {
    this.emitter.fire();
  }

  getTreeItem(element) {
    return element.item;
  }

  getChildren(element) {
    const sessions = this.model.visibleSessions();
    if (!element) {
      return STATE_ORDER
        .map((state) => ({ state, members: sessions.filter((s) => s.displayState === state) }))
        .filter((g) => g.members.length > 0)
        .map((g) => ({ kind: 'group', state: g.state, item: this.groupItem(g.state, g.members.length) }));
    }
    if (element.kind === 'group') {
      return sessions
        .filter((s) => s.displayState === element.state)
        .map((s) => ({ kind: 'session', session: s, item: this.sessionItem(s) }));
    }
    return [];
  }

  groupItem(state, count) {
    const collapsed = state === 'done'
      ? vscode.TreeItemCollapsibleState.Collapsed
      : vscode.TreeItemCollapsibleState.Expanded;
    const item = new vscode.TreeItem(`${STATES[state].label} (${count})`, collapsed);
    item.id = `group:${state}`;
    item.contextValue = `group-${state}`;
    return item;
  }

  sessionItem(s) {
    const item = new vscode.TreeItem(s.title, vscode.TreeItemCollapsibleState.None);
    item.id = `session:${s.sessionId}`;
    const providerPrefix = s.provider === 'antigravity' ? 'Antigravity' : 'Claude';
    const detail = describe(s);
    item.description = detail ? `${providerPrefix} · ${detail}` : providerPrefix;
    item.tooltip = tooltipFor(s);
    const state = STATES[s.displayState];
    item.iconPath = new vscode.ThemeIcon(state.icon, new vscode.ThemeColor(state.color));
    item.contextValue = s.displayState === 'done' ? 'session-done' : 'session';
    item.command = {
      command: 'sessionDashboard.open',
      title: 'Chat öffnen',
      arguments: [{ sessionId: s.sessionId, provider: s.provider }]
    };
    return item;
  }
}

module.exports = { SessionTreeProvider };
