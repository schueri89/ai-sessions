'use strict';

const vscode = require('vscode');
const fs = require('fs');
const { readSessions, sessionsDir } = require('./lib/registry');
const { readTranscriptInfo, prune } = require('./lib/transcripts');
const { DoneStore } = require('./lib/doneStore');
const { SessionTreeProvider } = require('./lib/treeView');
const { BoardPanel } = require('./lib/boardPanel');
const { describe } = require('./lib/format');

const POLL_MS = 5000;
const DEBOUNCE_MS = 300;

// Waiting sessions: longest wait first. Everything else: most recent first.
function compareSessions(a, b) {
  if (a.displayState === 'waiting' && b.displayState === 'waiting') return a.statusUpdatedAt - b.statusUpdatedAt;
  return b.statusUpdatedAt - a.statusUpdatedAt;
}

class SessionModel {
  constructor(context) {
    this.extensionUri = context.extensionUri;
    this.done = new DoneStore(context.globalState);
    this.sessions = [];
    this.signature = '';
  }

  // Re-reads registry and transcripts. Returns true if anything visible changed.
  async refresh() {
    const live = readSessions();
    await this.done.reconcile(live);
    prune(new Set(live.map((s) => s.sessionId)));
    this.sessions = live
      .map((s) => {
        const info = readTranscriptInfo(s.sessionId);
        return {
          ...s,
          title: info.title || s.registryName || s.sessionId.slice(0, 8),
          lastPrompt: info.lastPrompt,
          displayState: this.done.isDone(s.sessionId) ? 'done' : s.state
        };
      })
      .sort(compareSessions);
    const signature = JSON.stringify(this.sessions.map((s) => [s.sessionId, s.displayState, s.title, describe(s), s.lastPrompt]));
    const changed = signature !== this.signature;
    this.signature = signature;
    return changed;
  }
}

// Tree items pass their element, the board and the tree's click pass the id.
function sessionIdOf(arg) {
  if (typeof arg === 'string') return arg;
  return arg && arg.session ? arg.session.sessionId : undefined;
}

async function openSession(sessionId) {
  try {
    await vscode.commands.executeCommand('claude-vscode.editor.open', sessionId);
  } catch {
    // Command missing or renamed: fall back to the extension's URI handler.
    const uri = vscode.Uri.parse(`${vscode.env.uriScheme}://anthropic.claude-code/open?session=${encodeURIComponent(sessionId)}`);
    await vscode.env.openExternal(uri);
  }
}

function activate(context) {
  const model = new SessionModel(context);
  const tree = new SessionTreeProvider(model);
  const board = new BoardPanel(model);
  const view = vscode.window.createTreeView('sessionDashboard.sessions', { treeDataProvider: tree });
  context.subscriptions.push(view);

  let running = false;
  let pending = false;
  let pendingForce = false;
  async function update(force = false) {
    if (running) {
      pending = true;
      pendingForce = pendingForce || force === true;
      return;
    }
    running = true;
    try {
      const changed = await model.refresh();
      if (changed || force === true) {
        tree.refresh();
        board.update();
        const waiting = model.sessions.filter((s) => s.displayState === 'waiting').length;
        view.badge = waiting > 0
          ? { value: waiting, tooltip: waiting === 1 ? '1 Session wartet auf dich' : `${waiting} Sessions warten auf dich` }
          : undefined;
        view.message = model.sessions.length === 0 ? 'Keine laufende Claude-Code-Session gefunden.' : undefined;
      }
    } catch (err) {
      console.error('[session-dashboard] refresh failed', err);
    } finally {
      running = false;
      if (pending) {
        const nextForce = pendingForce;
        pending = false;
        pendingForce = false;
        update(nextForce);
      }
    }
  }

  let debounce;
  function scheduleUpdate() {
    clearTimeout(debounce);
    debounce = setTimeout(update, DEBOUNCE_MS);
  }

  try {
    const watcher = fs.watch(sessionsDir(), scheduleUpdate);
    context.subscriptions.push({ dispose: () => watcher.close() });
  } catch {
    // Directory missing (Claude Code never ran): polling alone picks it up later.
  }
  const timer = setInterval(update, POLL_MS);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });
  context.subscriptions.push({ dispose: () => clearTimeout(debounce) });

  context.subscriptions.push(
    vscode.commands.registerCommand('sessionDashboard.open', (arg) => {
      const id = sessionIdOf(arg);
      if (id) return openSession(id);
    }),
    vscode.commands.registerCommand('sessionDashboard.markDone', async (arg) => {
      const id = sessionIdOf(arg);
      if (!id) return;
      await model.done.mark(id);
      await update(true);
    }),
    vscode.commands.registerCommand('sessionDashboard.unmarkDone', async (arg) => {
      const id = sessionIdOf(arg);
      if (!id) return;
      await model.done.unmark(id);
      await update(true);
    }),
    vscode.commands.registerCommand('sessionDashboard.showBoard', () => board.show()),
    vscode.commands.registerCommand('sessionDashboard.refresh', () => update(true))
  );

  update(true);
}

function deactivate() {}

module.exports = { activate, deactivate };
