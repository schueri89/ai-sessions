'use strict';

const vscode = require('vscode');
const fs = require('fs');
const { readSessions, watchTargets, getQuotaSummary } = require('./lib/registry');
const { DoneStore } = require('./lib/doneStore');
const { BookmarkStore } = require('./lib/bookmarkStore');
const { SessionTreeProvider } = require('./lib/treeView');
const { BoardPanel } = require('./lib/boardPanel');
const { StatusBarWidget } = require('./lib/statusBar');
const { STATES, describe, formatTokens, friendlyModel } = require('./lib/format');

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
    this.projectFilter = context.globalState.get('sessionDashboard.projectFilter', 'all');
    this.sessions = [];
    this.quota = null;
    this.signature = '';
  }

  async setFilter(filter) {
    if (!['all', 'claude', 'antigravity'].includes(filter)) filter = 'all';
    this.providerFilter = filter;
    await this.context.globalState.update('sessionDashboard.providerFilter', filter);
  }

  async setProjectFilter(filter) {
    this.projectFilter = filter || 'all';
    await this.context.globalState.update('sessionDashboard.projectFilter', this.projectFilter);
  }

  visibleSessions() {
    let list = this.sessions;
    if (this.providerFilter === 'claude') list = list.filter((s) => s.provider === 'claude');
    else if (this.providerFilter === 'antigravity') list = list.filter((s) => s.provider === 'antigravity');
    if (this.projectFilter && this.projectFilter !== 'all') {
      list = list.filter((s) => s.project === this.projectFilter);
    }
    return list;
  }

  counts() {
    let claude = 0;
    let antigravity = 0;
    const byProject = {};
    for (const s of this.sessions) {
      if (s.provider === 'claude') claude++;
      else if (s.provider === 'antigravity') antigravity++;
      const p = s.project || 'ROOT';
      byProject[p] = (byProject[p] || 0) + 1;
    }
    return { all: this.sessions.length, claude, antigravity, byProject };
  }

  // Re-reads registry across all providers. Returns true if anything visible changed.
  async refresh() {
    const [live, quota] = await Promise.all([
      readSessions(),
      getQuotaSummary().catch(() => null)
    ]);
    this.quota = quota;
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
        } else if (isBookmarked) {
          displayState = 'bookmarked';
        } else if (s.state === 'closed') {
          displayState = 'done';
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
      this.projectFilter,
      this.quota ? [
        this.quota.claude ? [this.quota.claude.fiveHour?.percent, this.quota.claude.sevenDay?.percent] : null,
        this.quota.antigravity ? [
          this.quota.antigravity.tokens5h,
          this.quota.antigravity.isRateLimited,
          this.quota.antigravity.gemini ? [this.quota.antigravity.gemini.fiveHour?.percent, this.quota.antigravity.gemini.weekly?.percent] : null
        ] : null
      ] : null,
      this.sessions.map((s) => [s.sessionId, s.provider, s.project, s.displayState, s.isBookmarked, s.rateLimit ? [s.rateLimit.resetsAt, s.rateLimit.humanText] : null, s.tokens ? [s.tokens.context, s.tokens.percent] : null, s.title, describe(s, now), s.lastPrompt, s.activity])
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
  const statusBar = new StatusBarWidget(model);
  const view = vscode.window.createTreeView('sessionDashboard.sessions', { treeDataProvider: tree });
  context.subscriptions.push(
    view,
    statusBar,
    vscode.window.registerWebviewPanelSerializer('sessionDashboard.board', {
      async deserializeWebviewPanel(webviewPanel) {
        board.attach(webviewPanel);
      }
    })
  );
  statusBar.show();

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
        statusBar.update();
        const visible = model.visibleSessions();
        const waiting = visible.filter((s) => s.displayState === 'waiting').length;
        view.badge = waiting > 0
          ? { value: waiting, tooltip: waiting === 1 ? '1 Session wartet auf dich' : `${waiting} Sessions warten auf dich` }
          : undefined;
        const filterParts = [];
        if (model.providerFilter === 'claude') {
          const c5 = model.quota?.claude?.fiveHour?.percent;
          filterParts.push(c5 !== undefined && c5 !== null ? `Claude (${c5}% 5h)` : 'Claude Code');
        } else if (model.providerFilter === 'antigravity') {
          const a5 = model.quota?.antigravity?.tokens5h;
          filterParts.push(a5 ? `Antigravity (~${formatTokens(a5)})` : 'Antigravity');
        }
        if (model.projectFilter && model.projectFilter !== 'all') filterParts.push(model.projectFilter);
        view.description = filterParts.join(' · ');
        view.message = visible.length === 0
          ? (model.sessions.length === 0 ? 'Keine laufenden KI-Sessions gefunden.' : `Keine Sessions für Filter (${filterParts.join(', ')}).`)
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
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('sessionDashboard')) {
        statusBar.update();
      }
    })
  );

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
          label: '$(claude) Claude Code',
          description: `${counts.claude}`,
          detail: current === 'claude' ? '✓ Aktiver Filter' : '',
          filter: 'claude'
        },
        {
          label: '$(antigravity) Google Antigravity',
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
    vscode.commands.registerCommand('sessionDashboard.filterProject', async () => {
      const counts = model.counts();
      const current = model.projectFilter;
      const sortedProjects = Object.entries(counts.byProject)
        .sort((a, b) => b[1] - a[1]);
      const items = [
        {
          label: '$(list-unordered) Alle Projekte',
          description: `${counts.all}`,
          detail: current === 'all' ? '✓ Aktiver Filter' : '',
          filter: 'all'
        },
        ...sortedProjects.map(([proj, cnt]) => ({
          label: `$(folder) ${proj}`,
          description: `${cnt}`,
          detail: current === proj ? '✓ Aktiver Filter' : '',
          filter: proj
        }))
      ];
      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Nach Projekt/Unterordner filtern...'
      });
      if (picked && picked.filter) {
        await model.setProjectFilter(picked.filter);
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
    vscode.commands.registerCommand('sessionDashboard.showBoard', (query) => board.show(query)),
    vscode.commands.registerCommand('sessionDashboard.search', async () => {
      const visible = model.visibleSessions();
      const now = Date.now();
      const items = visible.map((s) => {
        const providerLabel = s.provider === 'antigravity' ? 'Antigravity' : 'Claude';
        const state = STATES[s.displayState] || { label: s.displayState, icon: 'circle-outline' };
        const isBookmarked = s.isBookmarked ? '📌 ' : '';
        const projectPrefix = s.project ? `[${s.project}] ` : '';
        const activityPrefix = s.displayState === 'busy' && s.activity ? `[${s.activity}] ` : '';
        const detail = describe(s, now);
        const tokenDetail = s.tokens ? ` · 🧠 ${formatTokens(s.tokens.context)} (${s.tokens.percent}%)${s.tokens.model ? ' ' + friendlyModel(s.tokens.model) : ''}` : '';
        return {
          label: `${isBookmarked}${projectPrefix}${s.title}`,
          description: `[${providerLabel}] ${state.label}${detail ? ' · ' + detail : ''}${tokenDetail}`,
          detail: activityPrefix + (s.lastPrompt || (s.cwd ? `Ordner: ${s.cwd}` : s.sessionId)),
          session: s
        };
      });

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Session suchen nach Titel, Projekt, Prompt, ID, Modell...',
        matchOnDescription: true,
        matchOnDetail: true
      });

      if (picked && picked.session) {
        await openSession(picked.session);
      }
    }),
    vscode.commands.registerCommand('sessionDashboard.statusBarClick', async () => {
      const action = vscode.workspace.getConfiguration('sessionDashboard').get('statusBarClickAction', 'board');
      if (action === 'quickpick') {
        return vscode.commands.executeCommand('sessionDashboard.quickMenu');
      }
      if (action === 'firstWaiting') {
        const visible = model.visibleSessions();
        const waiting = visible.find((s) => s.displayState === 'waiting');
        if (waiting) {
          return openSession(waiting);
        }
      }
      return vscode.commands.executeCommand('sessionDashboard.showBoard');
    }),
    vscode.commands.registerCommand('sessionDashboard.quickMenu', async () => {
      const visible = model.visibleSessions();
      const waitingSessions = visible.filter((s) => s.displayState === 'waiting');
      const busySessions = visible.filter((s) => s.displayState === 'busy');
      const idleSessions = visible.filter((s) => s.displayState === 'idle');

      const items = [
        {
          label: '$(layout) AI Sessions Übersicht öffnen',
          description: `${model.sessions.length} Sessions`,
          action: 'board'
        }
      ];

      const q = model.quota;
      if (q && ((q.claude && q.claude.available) || (q.antigravity && q.antigravity.available))) {
        const qParts = [];
        if (q.claude && q.claude.available && q.claude.fiveHour && typeof q.claude.fiveHour.percent === 'number') {
          qParts.push(`$(claude) ${q.claude.fiveHour.percent}% (5h)`);
        }
        if (q.antigravity && q.antigravity.available) {
          const bucket = q.antigravity.gemini || q.antigravity.thirdParty;
          if (bucket?.fiveHour && typeof bucket.fiveHour.percent === 'number') {
            qParts.push(`$(antigravity) ${bucket.fiveHour.percent}% (5h)`);
          } else if (q.antigravity.tokens5h) {
            qParts.push(`$(antigravity) ~${formatTokens(q.antigravity.tokens5h)}`);
          }
        }
        if (qParts.length > 0) {
          items.push({
            label: `$(dashboard) Quota: ${qParts.join(' · ')}`,
            description: 'Übersicht anzeigen',
            action: 'board'
          });
        }
      }

      if (waitingSessions.length > 0) {
        items.push({ label: 'Wartet auf dich', kind: vscode.QuickPickItemKind.Separator });
        for (const s of waitingSessions) {
          const providerLabel = s.provider === 'antigravity' ? 'Antigravity' : 'Claude';
          const proj = s.project ? `[${s.project}] ` : '';
          const tokenStr = s.tokens ? ` · 🧠 ${formatTokens(s.tokens.context)}` : '';
          items.push({
            label: `$(bell-dot) ${proj}${s.title}`,
            description: `${providerLabel}${tokenStr}`,
            detail: s.lastPrompt || s.waitingFor || 'Wartet auf deine Eingabe',
            session: s,
            action: 'session'
          });
        }
      }

      if (busySessions.length > 0) {
        items.push({ label: 'Arbeitet', kind: vscode.QuickPickItemKind.Separator });
        for (const s of busySessions) {
          const providerLabel = s.provider === 'antigravity' ? 'Antigravity' : 'Claude';
          const proj = s.project ? `[${s.project}] ` : '';
          const tokenStr = s.tokens ? ` · 🧠 ${formatTokens(s.tokens.context)}` : '';
          items.push({
            label: `$(loading~spin) ${proj}${s.title}`,
            description: (s.activity || providerLabel) + tokenStr,
            detail: s.lastPrompt || 'Wird ausgeführt...',
            session: s,
            action: 'session'
          });
        }
      }

      if (idleSessions.length > 0) {
        items.push({ label: 'Fertig', kind: vscode.QuickPickItemKind.Separator });
        for (const s of idleSessions) {
          const providerLabel = s.provider === 'antigravity' ? 'Antigravity' : 'Claude';
          const proj = s.project ? `[${s.project}] ` : '';
          const tokenStr = s.tokens ? ` · 🧠 ${formatTokens(s.tokens.context)}` : '';
          items.push({
            label: `$(pass) ${proj}${s.title}`,
            description: providerLabel + tokenStr,
            detail: s.lastPrompt || 'Aufgabe abgeschlossen',
            session: s,
            action: 'session'
          });
        }
      }

      items.push({ label: 'Aktionen', kind: vscode.QuickPickItemKind.Separator });
      items.push({
        label: '$(search) Session suchen...',
        action: 'search'
      });
      items.push({
        label: '$(folder) Nach Projekt filtern...',
        description: model.projectFilter !== 'all' ? `Aktiv: ${model.projectFilter}` : 'Alle',
        action: 'filterProject'
      });
      items.push({
        label: '$(filter) Nach Provider filtern...',
        description: model.providerFilter !== 'all' ? `Aktiv: ${model.providerFilter}` : 'Alle',
        action: 'filter'
      });

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Direktzugriff: Session öffnen oder Aktion wählen...'
      });

      if (picked) {
        if (picked.action === 'session' && picked.session) {
          await openSession(picked.session);
        } else if (picked.action === 'board') {
          await vscode.commands.executeCommand('sessionDashboard.showBoard');
        } else if (picked.action === 'search') {
          await vscode.commands.executeCommand('sessionDashboard.search');
        } else if (picked.action === 'filterProject') {
          await vscode.commands.executeCommand('sessionDashboard.filterProject');
        } else if (picked.action === 'filter') {
          await vscode.commands.executeCommand('sessionDashboard.filter');
        }
      }
    }),
    vscode.commands.registerCommand('sessionDashboard.refresh', () => update(true))
  );

  update(true);

  const config = vscode.workspace.getConfiguration('sessionDashboard');
  if (config.get('openOnStartup', false)) {
    setTimeout(() => {
      if (!board.panel) {
        board.show();
      }
    }, 500);
  }
}

function deactivate() {}

module.exports = { activate, deactivate };
