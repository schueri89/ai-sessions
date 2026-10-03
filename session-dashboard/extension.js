'use strict';

const vscode = require('vscode');
const fs = require('fs');
const { readSessions, watchTargets } = require('./lib/registry');
const { DoneStore } = require('./lib/doneStore');
const { BookmarkStore } = require('./lib/bookmarkStore');
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
    this.context = context;
    this.extensionUri = context.extensionUri;
    this.done = new DoneStore(context.globalState);
    this.bookmarks = new BookmarkStore(context.globalState);
    this.providerFilter = context.globalState.get('sessionDashboard.providerFilter', 'all');
    this.sessions = [];
    this.signature = '';
  }

  async setFilter(filter) {
    if (!['all', 'claude', 'antigravity'].includes(filter)) filter = 'all';
    this.providerFilter = filter;
    await this.context.globalState.update('sessionDashboard.providerFilter', filter);
  }

  visibleSessions() {
    if (this.providerFilter === 'claude') return this.sessions.filter((s) => s.provider === 'claude');
    if (this.providerFilter === 'antigravity') return this.sessions.filter((s) => s.provider === 'antigravity');
    return this.sessions;
  }

  counts() {
    let claude = 0;
    let antigravity = 0;
    for (const s of this.sessions) {
      if (s.provider === 'claude') claude++;
      else if (s.provider === 'antigravity') antigravity++;
    }
    return { all: this.sessions.length, claude, antigravity };
  }

  // Re-reads registry across all providers. Returns true if anything visible changed.
  async refresh() {
    const live = await readSessions();
    const knownIds = new Set(live.map((s) => s.sessionId));
    await this.done.reconcile(live, knownIds);
    await this.bookmarks.reconcile(live, knownIds);
    const now = Date.now();
    this.sessions = live
      .map((s) => {
        const isDone = this.done.isDone(s.sessionId);
        const isBookmarked = this.bookmarks.isBookmarked(s.sessionId);
        let displayState = s.state;
        if (isDone) {
          displayState = 'done';
        } else if (s.rateLimit) {
          const isPastReset = s.rateLimit.resetsAt && now >= s.rateLimit.resetsAt;
          displayState = isPastReset ? 'waiting' : 'busy';
          if (isPastReset && !s.waitingFor) {
            s.waitingFor = 'Limit abgelaufen';
          }
        } else if (isBookmarked && (s.state === 'idle' || s.state === 'closed')) {
          displayState = 'bookmarked';
        }
        return {
          ...s,
          isBookmarked,
          displayState
        };
      })
      .sort(compareSessions);
    const signature = JSON.stringify([
      this.providerFilter,
      this.sessions.map((s) => [s.sessionId, s.provider, s.displayState, s.isBookmarked, s.rateLimit ? [s.rateLimit.resetsAt, s.rateLimit.humanText] : null, s.title, describe(s, now), s.lastPrompt])
    ]);
    const changed = signature !== this.signature;
    this.signature = signature;
    return changed;
  }
}

// Resolves sessionId and provider from various caller formats (string, tree item, card payload).
function sessionInfoOf(arg, model) {
  if (!arg) return null;
  if (typeof arg === 'string') {
    const found = model.sessions.find((s) => s.sessionId === arg);
    return { sessionId: arg, provider: found ? found.provider : 'claude' };
  }
  if (arg.session) {
    return { sessionId: arg.session.sessionId, provider: arg.session.provider };
  }
  if (arg.sessionId) {
    return { sessionId: arg.sessionId, provider: arg.provider || 'claude' };
  }
  return null;
}

function sessionIdOf(arg) {
  if (typeof arg === 'string') return arg;
  if (arg && arg.sessionId) return arg.sessionId;
  if (arg && arg.session) return arg.session.sessionId;
  return undefined;
}

async function openSession(info) {
  if (!info || !info.sessionId) return;
  if (info.provider === 'antigravity') {
    try {
      await vscode.commands.executeCommand('antigravity.openConversation', info.sessionId);
    } catch (err) {
      vscode.window.showErrorMessage(`Antigravity-Chat konnte nicht geöffnet werden: ${err.message || err}`);
    }
    return;
  }
  // Default: Claude Code
  try {
    await vscode.commands.executeCommand('claude-vscode.editor.open', info.sessionId);
  } catch {
    // Command missing or renamed: fall back to the extension's URI handler.
    const uri = vscode.Uri.parse(`${vscode.env.uriScheme}://anthropic.claude-code/open?session=${encodeURIComponent(info.sessionId)}`);
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
        const visible = model.visibleSessions();
        const waiting = visible.filter((s) => s.displayState === 'waiting').length;
        view.badge = waiting > 0
          ? { value: waiting, tooltip: waiting === 1 ? '1 Session wartet auf dich' : `${waiting} Sessions warten auf dich` }
          : undefined;
        view.description = model.providerFilter === 'claude'
          ? 'Claude Code'
          : (model.providerFilter === 'antigravity' ? 'Antigravity' : '');
        view.message = visible.length === 0
          ? (model.sessions.length === 0 ? 'Keine laufenden KI-Sessions gefunden.' : 'Keine Sessions für diesen Filter.')
          : undefined;
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

  for (const target of watchTargets()) {
    try {
      if (fs.existsSync(target)) {
        const watcher = fs.watch(target, scheduleUpdate);
        context.subscriptions.push({ dispose: () => watcher.close() });
      }
    } catch {
      // Directory/file missing: polling alone picks it up later.
    }
  }

  const timer = setInterval(update, POLL_MS);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });
  context.subscriptions.push({ dispose: () => clearTimeout(debounce) });

  context.subscriptions.push(
    vscode.commands.registerCommand('sessionDashboard.filter', async () => {
      const counts = model.counts();
      const current = model.providerFilter;
      const items = [
        {
          label: '$(list-unordered) Alle Sessions',
          description: `${counts.all}`,
          detail: current === 'all' ? '✓ Aktiver Filter' : '',
          filter: 'all'
        },
        {
          label: '$(sparkle) Claude Code',
          description: `${counts.claude}`,
          detail: current === 'claude' ? '✓ Aktiver Filter' : '',
          filter: 'claude'
        },
        {
          label: '$(rocket) Google Antigravity',
          description: `${counts.antigravity}`,
          detail: current === 'antigravity' ? '✓ Aktiver Filter' : '',
          filter: 'antigravity'
        }
      ];

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Nach Provider filtern...'
      });
      if (picked && picked.filter) {
        await model.setFilter(picked.filter);
        await update(true);
      }
    }),
    vscode.commands.registerCommand('sessionDashboard.open', (arg) => {
      const info = sessionInfoOf(arg, model);
      if (info) return openSession(info);
    }),
    vscode.commands.registerCommand('sessionDashboard.markDone', async (arg) => {
      const id = sessionIdOf(arg);
      if (!id) return;
      await model.done.mark(id);
      await model.bookmarks.unmark(id);
      await update(true);
    }),
    vscode.commands.registerCommand('sessionDashboard.unmarkDone', async (arg) => {
      const id = sessionIdOf(arg);
      if (!id) return;
      await model.done.unmark(id);
      await update(true);
    }),
    vscode.commands.registerCommand('sessionDashboard.bookmark', async (arg) => {
      const id = sessionIdOf(arg);
      if (!id) return;
      await model.bookmarks.mark(id);
      await update(true);
    }),
    vscode.commands.registerCommand('sessionDashboard.unbookmark', async (arg) => {
      const id = sessionIdOf(arg);
      if (!id) return;
      await model.bookmarks.unmark(id);
      await update(true);
    }),
    vscode.commands.registerCommand('sessionDashboard.toggleBookmark', async (arg) => {
      const id = sessionIdOf(arg);
      if (!id) return;
      await model.bookmarks.toggle(id);
      await update(true);
    }),
    vscode.commands.registerCommand('sessionDashboard.unbookmarkAll', async () => {
      const bookmarkedIds = model.sessions.filter((s) => s.isBookmarked).map((s) => s.sessionId);
      if (bookmarkedIds.length > 0) {
        await model.bookmarks.unmarkMany(bookmarkedIds);
        await update(true);
      }
    }),
    vscode.commands.registerCommand('sessionDashboard.markAllClosedDone', async () => {
      const closedIds = model.sessions.filter((s) => s.displayState === 'closed').map((s) => s.sessionId);
      if (closedIds.length > 0) {
        await model.done.markMany(closedIds);
        await update(true);
      }
    }),
    vscode.commands.registerCommand('sessionDashboard.showBoard', () => board.show()),
    vscode.commands.registerCommand('sessionDashboard.refresh', () => update(true))
  );

  update(true);
}

function deactivate() {}

module.exports = { activate, deactivate };
