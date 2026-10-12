'use strict';

const vscode = require('vscode');
const fs = require('fs');
const { readSessions, watchTargets, getQuotaSummary } = require('./lib/registry');
const { DoneStore } = require('./lib/doneStore');
const { BookmarkStore } = require('./lib/bookmarkStore');
const { TicketStore, detectTicket, buildJiraUrl } = require('./lib/ticketStore');
const { ProjectStore } = require('./lib/projectStore');
const { getKnownSubfolders } = require('./lib/project');
const { SessionTreeProvider } = require('./lib/treeView');
const { BoardPanel } = require('./lib/boardPanel');
const { StatusBarWidget } = require('./lib/statusBar');
const { TranscriptViewerPanel } = require('./lib/transcriptViewerPanel');
const { SoundNotifier, SOUND_OPTIONS } = require('./lib/soundNotifier');
const { resolveAntigravityReset, setCopilotTokenProvider } = require('./lib/quota');
const { STATES, describe, formatTokens, friendlyModel } = require('./lib/format');
const { setJenkinsCredentials } = require('./lib/jenkins');

const POLL_MS = 5000;
const DEBOUNCE_MS = 300;

const GITHUB_SCOPES = ['user:email'];

// Mirrors Copilot's own auth setup (github.com vs. GitHub Enterprise incl. GHE.com data residency).
function resolveGitHubAuth() {
  const advanced = vscode.workspace.getConfiguration('github.copilot').get('advanced') || {};
  if (advanced.authProvider !== 'github-enterprise') {
    return { providerId: 'github', apiBaseUrl: 'https://api.github.com' };
  }
  const raw = vscode.workspace.getConfiguration('github-enterprise').get('uri');
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { providerId: 'github-enterprise', apiBaseUrl: '', error: 'github-enterprise.uri fehlt oder ist ungültig' };
  }
  const apiBaseUrl = url.hostname.endsWith('.ghe.com')
    ? `https://api.${url.hostname}`
    : `${url.origin}/api/v3`;
  return { providerId: 'github-enterprise', apiBaseUrl };
}

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
    this.tickets = new TicketStore(context.globalState);
    this.projects = new ProjectStore(context.globalState);
    this.providerFilter = context.globalState.get('sessionDashboard.providerFilter', 'all');
    this.projectFilter = context.globalState.get('sessionDashboard.projectFilter', 'all');
    this.sessions = [];
    this.quota = null;
    this.signature = '';
    this.isInitialLoaded = false;
  }

  async setFilter(filter) {
    if (!['all', 'claude', 'antigravity', 'copilot', 'codex'].includes(filter)) filter = 'all';
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
    else if (this.providerFilter === 'copilot') list = list.filter((s) => s.provider === 'copilot');
    else if (this.providerFilter === 'codex') list = list.filter((s) => s.provider === 'codex');
    if (this.projectFilter && this.projectFilter !== 'all') {
      list = list.filter((s) => s.project === this.projectFilter);
    }
    return list;
  }

  counts() {
    let claude = 0;
    let antigravity = 0;
    let copilot = 0;
    let codex = 0;
    const byProject = {};
    for (const s of this.sessions) {
      if (s.provider === 'claude') claude++;
      else if (s.provider === 'antigravity') antigravity++;
      else if (s.provider === 'copilot') copilot++;
      else if (s.provider === 'codex') codex++;
      const p = s.project || (this.getProjectDetectionMode() === 'auto' ? 'ROOT' : 'Nicht zugewiesen');
      byProject[p] = (byProject[p] || 0) + 1;
    }
    return { all: this.sessions.length, claude, antigravity, copilot, codex, byProject };
  }

  getEnabledProviders() {
    const config = vscode.workspace.getConfiguration('sessionDashboard.providers');
    return {
      claude: config.get('claude', true),
      antigravity: config.get('antigravity', true),
      copilot: config.get('copilot', true),
      codex: config.get('codex', true)
    };
  }

  getProjectDetectionMode() {
    return vscode.workspace.getConfiguration('sessionDashboard').get('projectDetection', 'auto');
  }

  // Re-reads registry across all providers. Returns true if anything visible changed.
  async refresh() {
    const enabled = this.getEnabledProviders();
    const detectionMode = this.getProjectDetectionMode();
    if (this.providerFilter !== 'all' && enabled[this.providerFilter] === false) {
      this.providerFilter = 'all';
      await this.context.globalState.update('sessionDashboard.providerFilter', 'all');
    }
    const [live, quota] = await Promise.all([
      readSessions(enabled, { detectionMode }),
      getQuotaSummary(false, enabled).catch(() => null)
    ]);
    this.quota = quota;
    await this.done.reconcile(live);
    await this.bookmarks.reconcile(live);
    const now = Date.now();
    this.sessions = live
      .map((s) => {
        const isDone = this.done.isDone(s.sessionId);
        const isBookmarked = this.bookmarks.isBookmarked(s.sessionId);
        const ticket = this.tickets.getTicket(s.sessionId) || null;
        const manualProject = this.projects.getOverride(s.sessionId);
        const autoProj = s.project || (detectionMode === 'auto' ? 'ROOT' : 'Nicht zugewiesen');
        const effectiveProject = manualProject || autoProj;
        const isProjectOverridden = Boolean(manualProject);
        if (s.provider === 'antigravity' && s.rateLimit) {
          s.rateLimit.resetsAt = resolveAntigravityReset(s.sessionId, s.rateLimit.blockedAt, quota && quota.antigravity);
        }
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
          displayState = 'idle';
        }
        return {
          ...s,
          project: effectiveProject,
          autoProject: autoProj,
          isProjectOverridden,
          isBookmarked,
          ticket,
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
        ] : null,
        this.quota.copilot ? [
          this.quota.copilot.available,
          this.quota.copilot.needsAuth,
          this.quota.copilot.error,
          this.quota.copilot.premium?.percent,
          this.quota.copilot.premium?.overageCount,
          this.quota.copilot.budget?.used
        ] : null,
        this.quota.codex ? [
          this.quota.codex.available,
          this.quota.codex.fiveHour?.percent,
          this.quota.codex.sevenDay?.percent,
          this.quota.codex.plan,
          this.quota.codex.credits?.balance
        ] : null
      ] : null,
      this.sessions.map((s) => [s.sessionId, s.provider, s.project, s.isProjectOverridden, s.displayState, s.isBookmarked, s.ticket, s.rateLimit ? [s.rateLimit.resetsAt, s.rateLimit.humanText] : null, s.tokens ? [s.tokens.context, s.tokens.percent] : null, s.title, describe(s, now), s.lastPrompt, s.activity])
    ]);
    const changed = signature !== this.signature;
    this.signature = signature;
    this.isInitialLoaded = true;
    return changed;
  }
}

// Resolves sessionId and provider from various caller formats (string, tree item, card payload).
function sessionInfoOf(arg, model) {
  if (!arg) return null;
  if (typeof arg === 'string') {
    const found = model ? model.sessions.find((s) => s.sessionId === arg) : null;
    return { sessionId: arg, provider: found ? found.provider : 'claude', session: found };
  }
  if (arg.session) {
    return { sessionId: arg.session.sessionId, provider: arg.session.provider, session: arg.session };
  }
  if (arg.sessionId) {
    const found = model ? model.sessions.find((s) => s.sessionId === arg.sessionId) : null;
    return { sessionId: arg.sessionId, provider: arg.provider || (found ? found.provider : 'claude'), session: found || arg };
  }
  return null;
}

function sessionIdOf(arg) {
  if (typeof arg === 'string') return arg;
  if (arg && arg.sessionId) return arg.sessionId;
  if (arg && arg.session) return arg.session.sessionId;
  return undefined;
}

let debugChannel = null;
function getDebugChannel() {
  if (!debugChannel) {
    debugChannel = vscode.window.createOutputChannel('AI Sessions');
  }
  return debugChannel;
}

function logDebug(message, extra) {
  const ch = getDebugChannel();
  const time = new Date().toLocaleTimeString('de-DE');
  let line = `[${time}] ${message}`;
  if (extra !== undefined) {
    try {
      line += '\n' + (typeof extra === 'string' ? extra : JSON.stringify(extra, null, 2));
    } catch {
      line += '\n' + String(extra);
    }
  }
  ch.appendLine(line);
}

function isClaudeTab(tab) {
  if (!tab || !tab.input) return false;
  const vt = tab.input.viewType;
  if (typeof vt === 'string' && (vt.includes('claudeVSCodePanel') || vt.includes('claude-vscode'))) {
    return true;
  }
  if (typeof tab.label === 'string' && (tab.label.includes('Claude Code') || tab.label.includes('Claude'))) {
    return true;
  }
  return false;
}

function isChatSessionTab(tab) {
  if (!tab || !tab.input) return false;
  const constructorName = tab.input.constructor?.name || '';
  if (constructorName === 'TabInputChat' || constructorName.includes('Chat')) {
    return true;
  }
  const vt = tab.input.viewType;
  if (typeof vt === 'string' && (vt.includes('chatSession') || vt.includes('vscode-chat-session') || vt.includes('workbench.editor.chatSession'))) {
    return true;
  }
  const uri = tab.input.uri;
  if (uri && typeof uri.scheme === 'string' && uri.scheme.includes('chat-session')) {
    return true;
  }
  if (typeof tab.label === 'string' && (tab.label.includes('GitHub Copilot') || tab.label.includes('Copilot Chat'))) {
    return true;
  }
  return false;
}

async function openClaudeSession(info) {
  logDebug(`[Claude Code] Öffne Session: ${info.sessionId}`, {
    title: info.title || info.session?.title,
    project: info.project || info.session?.project
  });

  // 1. Schließe eventuell im mittleren Editorbereich noch offene Claude-Panels
  try {
    if (vscode.window.tabGroups && vscode.window.tabGroups.all) {
      const toClose = [];
      for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
          if (isClaudeTab(tab)) {
            toClose.push(tab);
          }
        }
      }
      if (toClose.length > 0) {
        logDebug(`[Claude Code] Schließe ${toClose.length} offene Claude-Tabs im mittleren Bereich.`);
        await vscode.window.tabGroups.close(toClose);
      }
    }
  } catch (err) {
    logDebug(`[Claude Code] Fehler beim Schließen vorheriger Tabs: ${err.message}`);
  }

  // 2. Stelle sicher, dass die bevorzugte Position von Claude Code auf "sidebar" steht
  try {
    const config = vscode.workspace.getConfiguration('claudeCode');
    if (config.get('preferredLocation') !== 'sidebar') {
      logDebug(`[Claude Code] Setze claudeCode.preferredLocation auf 'sidebar'`);
      await config.update('preferredLocation', 'sidebar', vscode.ConfigurationTarget.Global);
    }
  } catch (err) {
    logDebug(`[Claude Code] Konnte preferredLocation nicht aktualisieren: ${err.message}`);
  }

  // 3. Fokussiere die Claude-Code-Ansicht in der Secondary Sidebar
  try {
    logDebug(`[Claude Code] Fokussiere Secondary Sidebar (claudeVSCodeSidebarSecondary.focus)`);
    await vscode.commands.executeCommand('claudeVSCodeSidebarSecondary.focus');
  } catch {
    try {
      logDebug(`[Claude Code] Fallback: claude-vscode.sidebar.open`);
      await vscode.commands.executeCommand('claude-vscode.sidebar.open');
    } catch (err) {
      logDebug(`[Claude Code] Sidebar-Focus fehlgeschlagen: ${err.message}`);
    }
  }

  // 4. Öffne die Session programmatisch mit 'honor-preferred-location'
  try {
    logDebug(`[Claude Code] Rufe claude-vscode.editor.open auf mit programmatic: honor-preferred-location`);
    await vscode.commands.executeCommand(
      'claude-vscode.editor.open',
      info.sessionId,
      undefined,
      undefined,
      undefined,
      undefined,
      { programmatic: 'honor-preferred-location' }
    );
  } catch (err) {
    logDebug(`[Claude Code] editor.open fehlgeschlagen: ${err.message}`);
    try {
      const uri = vscode.Uri.parse(`${vscode.env.uriScheme}://anthropic.claude-code/open?session=${encodeURIComponent(info.sessionId)}`);
      await vscode.env.openExternal(uri);
    } catch (e2) {
      logDebug(`[Claude Code] URI openExternal fehlgeschlagen: ${e2.message}`);
    }
  }

  // 5. Sicherheits-Bereinigung: Falls Claude Code dennoch einen Tab im Editorbereich geöffnet hat, schließen
  setTimeout(async () => {
    try {
      if (!vscode.window.tabGroups || !vscode.window.tabGroups.all) return;
      const lingering = [];
      for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
          if (isClaudeTab(tab)) lingering.push(tab);
        }
      }
      if (lingering.length > 0) {
        logDebug(`[Claude Code] Bereinige nachlaufend ${lingering.length} versehentlich geöffnete Editor-Tabs.`);
        await vscode.window.tabGroups.close(lingering);
      }
    } catch {}
  }, 350);
}

async function openAntigravitySession(info) {
  const currentWorkspaces = (vscode.workspace.workspaceFolders || []).map((f) => f.uri.fsPath);
  const sessionWorkspace = info.session?.cwd || (info.session?.workspaces && info.session.workspaces[0]) || '';
  const isDifferentWorkspace = sessionWorkspace && !currentWorkspaces.some((w) => sessionWorkspace.toLowerCase().startsWith(w.toLowerCase()));

  logDebug(`[Antigravity] Öffne Session: ${info.sessionId}`, {
    title: info.title || info.session?.title,
    project: info.project || info.session?.project,
    sessionWorkspace,
    currentWorkspaces,
    isDifferentWorkspace
  });

  if (isDifferentWorkspace) {
    logDebug(`[Antigravity] ℹ️ Hinweis: Session gehört zu einem anderen Projekt/Workspace als das aktuelle Fenster.`);
  }

  // 1. Fokussiere das Antigravity Sidebar-Panel
  try {
    logDebug(`[Antigravity] 1. Fokussiere Panel (antigravity.panel.focus)...`);
    await vscode.commands.executeCommand('antigravity.panel.focus');
  } catch (err) {
    logDebug(`[Antigravity] antigravity.panel.focus fehlgeschlagen oder nicht registriert: ${err.message}`);
  }

  // Antigravity's Webview verwendet Memory-History und prüft beim internen Navigate-RPC:
  // "window.location.pathname !== h && router.navigate({to: h})"
  // Wurde der Iframe beim Start mit genau dieser Session-URL (/c/<id>) geladen,
  // bleibt window.location.pathname statisch auf diesem Wert stehen. Jeder spätere
  // Aufruf von /c/<id> wird daher stumm verworfen, weil window.location.pathname === h ist.
  // Durch den Cache-Bust (?open=...) ist window.location.pathname !== h IMMER true,
  // und TanStack Router übernimmt die Navigation zuverlässig.
  const now = Date.now();
  const targetPathWithQuery = `/c/${info.sessionId}?open=${now}`;
  const canonicalPath = `/c/${info.sessionId}`;

  // 2. Führe Navigation via openConversation aus (mit Cache-Bust)
  try {
    logDebug(`[Antigravity] 2. Rufe antigravity.openConversation auf (cascadeId: ${info.sessionId}, path: ${targetPathWithQuery})...`);
    await vscode.commands.executeCommand('antigravity.openConversation', info.sessionId, targetPathWithQuery);
    logDebug(`[Antigravity] antigravity.openConversation erfolgreich abgesetzt.`);
  } catch (err) {
    logDebug(`[Antigravity] Fehler bei antigravity.openConversation: ${err.message}`, err);
    vscode.window.showErrorMessage(
      `Antigravity-Chat konnte nicht geöffnet werden: ${err.message || err}`,
      'Debug-Log anzeigen'
    ).then((action) => {
      if (action === 'Debug-Log anzeigen') {
        getDebugChannel().show(true);
      }
    });
  }

  // 3. Asynchroner Retry nach 250ms mit Canonical Path und zweiter Ping nach 450ms
  setTimeout(async () => {
    try {
      logDebug(`[Antigravity] 3. Retry-Navigation nach 250ms (canonical: ${canonicalPath})...`);
      await vscode.commands.executeCommand('antigravity.openConversation', info.sessionId, canonicalPath);
    } catch (err) {
      logDebug(`[Antigravity] Retry fehlgeschlagen: ${err.message}`);
    }
  }, 250);

  setTimeout(async () => {
    try {
      const secondRetry = `/c/${info.sessionId}?open=${Date.now()}`;
      logDebug(`[Antigravity] 3b. Zweiter Navigations-Ping nach 450ms (path: ${secondRetry})...`);
      await vscode.commands.executeCommand('antigravity.openConversation', info.sessionId, secondRetry);
    } catch (err) {
      logDebug(`[Antigravity] Zweiter Ping fehlgeschlagen: ${err.message}`);
    }
  }, 450);

  // 4. Falls die Session zu einem anderen Projekt gehört oder als Fallback nach 600ms: Deep-Link auslösen
  if (isDifferentWorkspace) {
    setTimeout(async () => {
      try {
        const uriScheme = vscode.env.uriScheme || 'vscode';
        const deepLink = vscode.Uri.parse(`${uriScheme}://google.google-antigravity/open-conversation?cascadeId=${encodeURIComponent(info.sessionId)}&path=${encodeURIComponent(canonicalPath)}`);
        logDebug(`[Antigravity] 4. Trigger Deep-Link für Projektwechsel: ${deepLink.toString()}`);
        await vscode.env.openExternal(deepLink);
      } catch (err) {
        logDebug(`[Antigravity] Deep-Link Trigger fehlgeschlagen: ${err.message}`);
      }
    }, 600);
  }
}

async function openCopilotSession(info) {
  const sessionId = info.sessionId;
  if (!sessionId) return;

  logDebug(`[Copilot] Öffne Session: ${sessionId}`, {
    title: info.title || info.session?.title,
    project: info.project || info.session?.project
  });

  const encoded = Buffer.from(sessionId, 'utf8').toString('base64url');
  const sessionResourceUri = vscode.Uri.from({
    scheme: 'vscode-chat-session',
    authority: 'local',
    path: '/' + encoded
  });

  // 1. Schließe eventuell vorhandene Chat-Session-Tabs im mittleren Editorbereich
  try {
    if (vscode.window.tabGroups && vscode.window.tabGroups.all) {
      const toClose = [];
      for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
          if (isChatSessionTab(tab)) toClose.push(tab);
        }
      }
      if (toClose.length > 0) {
        logDebug(`[Copilot] Schließe ${toClose.length} offene Chat-Tabs im mittleren Editorbereich.`);
        await vscode.window.tabGroups.close(toClose);
      }
    }
  } catch (err) {
    logDebug(`[Copilot] Fehler beim Schließen mittlerer Tabs: ${err.message}`);
  }

  // 2. Fokussiere die Copilot-Chat-Ansicht in der Secondary Sidebar
  try {
    logDebug(`[Copilot] Fokussiere Copilot-Ansicht in Secondary Sidebar (workbench.panel.chat.view.copilot.focus)`);
    await vscode.commands.executeCommand('workbench.panel.chat.view.copilot.focus');
  } catch {
    try {
      logDebug(`[Copilot] Fallback: workbench.action.chat.open`);
      await vscode.commands.executeCommand('workbench.action.chat.open');
    } catch (err) {
      logDebug(`[Copilot] Chat-Fokus fehlgeschlagen: ${err.message}`);
    }
  }

  // 3. Öffne Session und verschiebe sofort in die Sidebar
  // Hinweis: VS Code besitzt für Extensions keine API, um eine spezifische Session direkt
  // ohne Editor-Tab in der Sidebar zu öffnen (siehe microsoft/vscode Issue #319722).
  // Der schnellstmögliche Weg ist das sofortige Überführen via openInSidebar mit direktem Schließen des Editor-Tabs.
  try {
    logDebug(`[Copilot] Öffne Session via vscode.open`);
    await vscode.commands.executeCommand('vscode.open', sessionResourceUri);
    logDebug(`[Copilot] Verschiebe in Sidebar (workbench.action.chat.openInSidebar)`);
    await vscode.commands.executeCommand('workbench.action.chat.openInSidebar');
  } catch (err) {
    logDebug(`[Copilot] openInSidebar fehlgeschlagen: ${err.message}`);
  }

  // 4. Sofortige & nachgelagerte Bereinigung des kurz geöffneten Editor-Tabs
  const cleanupTabs = async () => {
    try {
      if (!vscode.window.tabGroups || !vscode.window.tabGroups.all) return;
      const lingering = [];
      for (const group of vscode.window.tabGroups.all) {
        for (const tab of group.tabs) {
          if (isChatSessionTab(tab)) lingering.push(tab);
        }
      }
      if (lingering.length > 0) {
        logDebug(`[Copilot] Bereinige ${lingering.length} Editor-Tabs im mittleren Bereich.`);
        await vscode.window.tabGroups.close(lingering);
      }
    } catch (err) {
      logDebug(`[Copilot] Bereinigung Fehler: ${err.message}`);
    }
  };

  await cleanupTabs();
  setTimeout(cleanupTabs, 60);
  setTimeout(cleanupTabs, 200);
}

async function openCodexSession(info) {
  const sessionId = info.sessionId;
  if (!sessionId) return;

  logDebug(`[Codex] Öffne Session: ${sessionId}`, {
    title: info.title || info.session?.title,
    project: info.project || info.session?.project
  });

  try {
    logDebug(`[Codex] 1. Fokussiere Codex Sidebar (chatgpt.openSidebar)...`);
    await vscode.commands.executeCommand('chatgpt.openSidebar');
  } catch (err) {
    logDebug(`[Codex] chatgpt.openSidebar fehlgeschlagen: ${err.message}`);
  }

  try {
    const uriScheme = vscode.env.uriScheme || 'vscode';
    const deepLink = vscode.Uri.parse(`${uriScheme}://openai.chatgpt/local/${sessionId}`);
    logDebug(`[Codex] 2. Öffne Thread via Deep-Link: ${deepLink.toString()}`);
    await vscode.env.openExternal(deepLink);
  } catch (err) {
    logDebug(`[Codex] Deep-Link fehlgeschlagen: ${err.message}`);
  }
}

async function openSession(info) {
  if (!info || !info.sessionId) return;
  if (info.provider === 'antigravity') {
    return openAntigravitySession(info);
  }
  if (info.provider === 'copilot') {
    return openCopilotSession(info);
  }
  if (info.provider === 'codex') {
    return openCodexSession(info);
  }
  return openClaudeSession(info);
}

function activate(context) {
  setCopilotTokenProvider(async () => {
    const auth = resolveGitHubAuth();
    if (auth.error) {
      logDebug(`GitHub-Auth: ${auth.error}`);
      return undefined;
    }
    try {
      const session = await vscode.authentication.getSession(auth.providerId, GITHUB_SCOPES, { silent: true });
      if (!session) logDebug(`GitHub-Session (${auth.providerId}): keine (Zugriff für die Extension noch nicht freigegeben)`);
      return session ? { token: session.accessToken, apiBaseUrl: auth.apiBaseUrl, account: session.account?.label || '' } : undefined;
    } catch (err) {
      logDebug(`GitHub-Session (${auth.providerId}): Fehler ${err.message || err}`);
      throw err;
    }
  });

  const model = new SessionModel(context);
  const soundNotifier = new SoundNotifier(context);
  model.soundNotifier = soundNotifier;
  const tree = new SessionTreeProvider(model);
  const board = new BoardPanel(model);
  const statusBar = new StatusBarWidget(model);
  const view = vscode.window.createTreeView('sessionDashboard.sessions', { treeDataProvider: tree });
  context.subscriptions.push(
    view,
    statusBar,
    soundNotifier,
    vscode.window.registerWebviewPanelSerializer('sessionDashboard.board', {
      async deserializeWebviewPanel(webviewPanel) {
        if (board.panel) {
          try { webviewPanel.dispose(); } catch {}
          return;
        }
        board.attach(webviewPanel);
        board.ensurePinned();
        board.closeDuplicateTabs();
      }
    })
  );
  statusBar.show();

  let running = false;
  let pending = false;
  let pendingForce = false;

  function syncViews(completedSessionIds = []) {
    tree.refresh();
    board.update(completedSessionIds);
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
    } else if (model.providerFilter === 'copilot') {
      filterParts.push('GitHub Copilot');
    } else if (model.providerFilter === 'codex') {
      filterParts.push('OpenAI Codex');
    }
    if (model.projectFilter && model.projectFilter !== 'all') filterParts.push(model.projectFilter);
    view.description = filterParts.join(' · ');
    view.message = visible.length === 0
      ? (model.sessions.length === 0 ? 'Keine laufenden KI-Sessions gefunden.' : `Keine Sessions für Filter (${filterParts.join(', ')}).`)
      : undefined;
  }

  async function update(force = false) {
    if (running) {
      pending = true;
      pendingForce = pendingForce || force === true;
      return;
    }
    running = true;
    try {
      const changed = await model.refresh();
      const soundEvents = soundNotifier.evaluate(model.sessions, model.quota);
      if (changed || force === true) {
        syncViews(soundEvents?.completedSessionIds);
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
      if (e.affectsConfiguration('sessionDashboard.sound')) {
        board.update();
      }
      if (e.affectsConfiguration('sessionDashboard.jenkins')) {
        board.onJenkinsConfigChanged();
      }
      if (e.affectsConfiguration('sessionDashboard.projectDetection')) {
        update(true);
      }
      if (e.affectsConfiguration('sessionDashboard.providers')) {
        update(true);
      }
    }),
    vscode.authentication.onDidChangeSessions(async (e) => {
      if (e.provider.id !== resolveGitHubAuth().providerId) return;
      await getQuotaSummary(true, model.getEnabledProviders()).catch(() => null);
      await update(true);
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('sessionDashboard.filter', async () => {
      const counts = model.counts();
      const current = model.providerFilter;
      const enabled = model.getEnabledProviders();
      const items = [
        {
          label: '$(list-unordered) Alle Sessions',
          description: `${counts.all}`,
          detail: current === 'all' ? '✓ Aktiver Filter' : '',
          filter: 'all'
        }
      ];
      if (enabled.claude !== false) {
        items.push({
          label: '$(dashboard-claude) Claude Code',
          description: `${counts.claude}`,
          detail: current === 'claude' ? '✓ Aktiver Filter' : '',
          filter: 'claude'
        });
      }
      if (enabled.antigravity !== false) {
        items.push({
          label: '$(dashboard-antigravity) Google Antigravity',
          description: `${counts.antigravity}`,
          detail: current === 'antigravity' ? '✓ Aktiver Filter' : '',
          filter: 'antigravity'
        });
      }
      if (enabled.copilot !== false) {
        items.push({
          label: '$(copilot) GitHub Copilot',
          description: `${counts.copilot}`,
          detail: current === 'copilot' ? '✓ Aktiver Filter' : '',
          filter: 'copilot'
        });
      }
      if (enabled.codex !== false) {
        items.push({
          label: '$(dashboard-codex) OpenAI Codex',
          description: `${counts.codex}`,
          detail: current === 'codex' ? '✓ Aktiver Filter' : '',
          filter: 'codex'
        });
      }

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Nach Provider filtern...'
      });
      if (picked && picked.filter) {
        await model.setFilter(picked.filter);
        syncViews();
      }
    }),
    vscode.commands.registerCommand('sessionDashboard.filterProject', async () => {
      const counts = model.counts();
      const current = model.projectFilter;
      const sortedProjects = Object.entries(counts.byProject)
        .sort((a, b) => a[0].localeCompare(b[0], undefined, { sensitivity: 'base', numeric: true }) || a[0].localeCompare(b[0]));
      const items = [
        {
          label: '$(list-unordered) Alle Projekte',
          description: `${counts.all}`,
          detail: current === 'all' ? '✓ Aktiver Filter' : '',
          filter: 'all'
        },
        ...sortedProjects.map(([proj, cnt]) => ({
          label: proj === 'Nicht zugewiesen' ? `$(inbox) ${proj}` : `$(folder) ${proj}`,
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
        syncViews();
      }
    }),
    vscode.commands.registerCommand('sessionDashboard.open', (arg) => {
      const info = sessionInfoOf(arg, model);
      if (info) return openSession(info);
    }),
    vscode.commands.registerCommand('sessionDashboard.copilotSignIn', async () => {
      try {
        await vscode.authentication.getSession(resolveGitHubAuth().providerId, GITHUB_SCOPES, { createIfNone: true });
      } catch (err) {
        vscode.window.showErrorMessage(`GitHub-Anmeldung fehlgeschlagen: ${err.message || err}`);
        return;
      }
      await getQuotaSummary(true, model.getEnabledProviders()).catch(() => null);
      await update(true);
    }),
    vscode.commands.registerCommand('sessionDashboard.viewTranscript', async (arg) => {
      let info = sessionInfoOf(arg, model);
      if (!info) {
        const visible = model.visibleSessions();
        if (visible.length === 0) {
          vscode.window.showInformationMessage('Keine aktiven Sessions vorhanden.');
          return;
        }
        const items = visible.map((s) => ({
          label: (s.isBookmarked ? '📌 ' : '') + (s.title || s.sessionId),
          description: (s.provider === 'codex' ? 'Codex' : (s.provider === 'copilot' ? 'Copilot' : (s.provider === 'antigravity' ? 'Antigravity' : 'Claude Code'))) + (s.project ? ` · [${s.project}]` : ''),
          session: s
        }));
        const picked = await vscode.window.showQuickPick(items, {
          placeHolder: 'Session für Read-Only Transkript-Ansicht wählen…'
        });
        if (!picked) return;
        info = picked.session;
      }
      TranscriptViewerPanel.show(context, info);
    }),
    vscode.commands.registerCommand('sessionDashboard.showDebugLog', () => {
      getDebugChannel().show(true);
    }),
    vscode.commands.registerCommand('sessionDashboard.markDone', async (arg) => {
      const id = sessionIdOf(arg);
      if (!id) return;
      await model.done.mark(id);
      await model.bookmarks.unmark(id);
      await update(true);
    }),
    vscode.commands.registerCommand('sessionDashboard.markAllDone', async (arg) => {
      let ids = [];
      if (Array.isArray(arg)) {
        ids = arg.map(sessionIdOf).filter(Boolean);
      } else if (arg && Array.isArray(arg.sessionIds)) {
        ids = arg.sessionIds.filter(Boolean);
      } else {
        ids = model.visibleSessions().filter((s) => s.displayState === 'idle').map((s) => s.sessionId);
      }
      if (ids.length === 0) return;

      const count = ids.length;
      const countLabel = count === 1 ? '1 fertige Session' : `${count} fertigen Sessions`;
      const confirmAction = count === 1 ? 'Als erledigt markieren' : 'Alle als erledigt markieren';
      const answer = await vscode.window.showWarningMessage(
        `Möchtest du wirklich ${count === 1 ? 'diese' : 'alle'} ${countLabel} als erledigt markieren?`,
        { modal: true, detail: 'Die Sessions werden in den Zustand „Erledigt“ verschoben.' },
        confirmAction
      );
      if (answer !== confirmAction) {
        return;
      }

      await model.done.markMany(ids);
      await model.bookmarks.unmarkMany(ids);
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
    vscode.commands.registerCommand('sessionDashboard.showBoard', (query) => board.show(typeof query === 'string' ? query : undefined, 'board')),
    vscode.commands.registerCommand('sessionDashboard.showAnalyse', () => board.show(undefined, 'analyse')),
    vscode.commands.registerCommand('sessionDashboard.showHistory', () => board.show(undefined, 'history')),
    vscode.commands.registerCommand('sessionDashboard.assignTicket', async (arg) => {
      const info = sessionInfoOf(arg, model);
      let sId = sessionIdOf(arg) || (info ? info.sessionId : null);
      if (!sId) {
        const visible = model.visibleSessions();
        if (visible.length === 0) {
          vscode.window.showInformationMessage('Keine aktiven Sessions vorhanden.');
          return;
        }
        const pick = await vscode.window.showQuickPick(
          visible.map((s) => ({
            label: (s.ticket ? `[${s.ticket}] ` : '') + (s.title || s.sessionId.slice(0, 8)),
            description: s.project || 'ROOT',
            detail: s.lastPrompt ? s.lastPrompt.slice(0, 80) : s.sessionId,
            sessionId: s.sessionId
          })),
          { placeHolder: 'Session für JIRA-Ticket-Zuweisung wählen...' }
        );
        if (!pick) return;
        sId = pick.sessionId;
      }
      const session = model.sessions.find((s) => s.sessionId === sId) || (info ? info.session : null);
      const currentTicket = model.tickets.getTicket(sId) || '';
      const candidate = !currentTicket && session
        ? (detectTicket(session.title) || detectTicket(session.lastPrompt) || '')
        : '';
      const titleLabel = session ? (session.title || sId.slice(0, 8)) : sId.slice(0, 8);
      const input = await vscode.window.showInputBox({
        prompt: `JIRA-Ticket für Session „${titleLabel}“ zuweisen:`,
        placeHolder: 'z. B. PROJ-123 (leer lassen zum Entfernen)',
        value: currentTicket || candidate
      });
      if (input === undefined) return;
      const trimmed = input.trim();
      if (!trimmed) {
        await model.tickets.removeTicket(sId);
        vscode.window.showInformationMessage(`JIRA-Ticket für Session „${titleLabel}“ entfernt.`);
      } else {
        const cleanKey = trimmed.toUpperCase();
        await model.tickets.setTicket(sId, cleanKey);
        const cfgUrl = vscode.workspace.getConfiguration('sessionDashboard').get('jiraBaseUrl', '');
        if (cfgUrl) {
          vscode.window.showInformationMessage(
            `Session „${titleLabel}“ wurde JIRA-Ticket ${cleanKey} zugewiesen.`,
            'Im Browser öffnen'
          ).then((choice) => {
            if (choice === 'Im Browser öffnen') {
              vscode.commands.executeCommand('sessionDashboard.openJira', sId);
            }
          });
        } else {
          vscode.window.showInformationMessage(`Session „${titleLabel}“ wurde JIRA-Ticket ${cleanKey} zugewiesen.`);
        }
      }
      await update(true);
      if (board.viewMode === 'history') {
        board.sendHistory();
      }
    }),
    vscode.commands.registerCommand('sessionDashboard.openJira', async (arg) => {
      const info = sessionInfoOf(arg, model);
      const sId = sessionIdOf(arg) || (info ? info.sessionId : null);
      if (!sId) return;
      const ticket = model.tickets.getTicket(sId);
      if (!ticket) {
        return vscode.commands.executeCommand('sessionDashboard.assignTicket', sId);
      }
      const baseUrl = vscode.workspace.getConfiguration('sessionDashboard').get('jiraBaseUrl', '');
      if (!baseUrl || !baseUrl.trim()) {
        const action = await vscode.window.showWarningMessage(
          `Keine JIRA-Basis-URL in den Einstellungen hinterlegt. Bitte 'sessionDashboard.jiraBaseUrl' pflegen (z. B. 'https://ihre-firma.atlassian.net/browse/').`,
          'Einstellungen öffnen'
        );
        if (action === 'Einstellungen öffnen') {
          vscode.commands.executeCommand('sessionDashboard.openSettings');
        }
        return;
      }
      const url = buildJiraUrl(baseUrl, ticket);
      if (url) {
        try {
          await vscode.env.openExternal(vscode.Uri.parse(url));
        } catch (err) {
          vscode.window.showErrorMessage(`Konnte JIRA-URL nicht öffnen: ${err.message}`);
        }
      }
    }),
    vscode.commands.registerCommand('sessionDashboard.removeTicket', async (arg) => {
      const id = sessionIdOf(arg);
      if (!id) return;
      await model.tickets.removeTicket(id);
      await update(true);
      if (board.viewMode === 'history') {
        board.sendHistory();
      }
    }),
    vscode.commands.registerCommand('sessionDashboard.assignProject', async (arg) => {
      const info = sessionInfoOf(arg, model);
      let sId = sessionIdOf(arg) || (info ? info.sessionId : null);
      if (!sId) {
        const visible = model.visibleSessions();
        if (visible.length === 0) {
          vscode.window.showInformationMessage('Keine aktiven Sessions vorhanden.');
          return;
        }
        const pick = await vscode.window.showQuickPick(
          visible.map((s) => ({
            label: `[${s.project}] ` + (s.title || s.sessionId.slice(0, 8)),
            description: s.provider === 'codex' ? 'Codex' : (s.provider === 'copilot' ? 'Copilot' : (s.provider === 'antigravity' ? 'Antigravity' : 'Claude Code')),
            detail: s.lastPrompt ? s.lastPrompt.slice(0, 80) : s.sessionId,
            sessionId: s.sessionId
          })),
          { placeHolder: 'Session für manuelle Projekt-Zuweisung wählen...' }
        );
        if (!pick) return;
        sId = pick.sessionId;
      }
      const session = model.sessions.find((s) => s.sessionId === sId) || (info ? info.session : null);
      const titleLabel = session ? (session.title || sId.slice(0, 8)) : sId.slice(0, 8);
      const currentOverride = model.projects.getOverride(sId);
      const detectionMode = model.getProjectDetectionMode();
      const fallbackDefault = detectionMode === 'auto' ? 'ROOT' : 'Nicht zugewiesen';
      const currentEffective = session ? session.project : (currentOverride || fallbackDefault);
      const autoProject = session?.autoProject || (currentOverride ? fallbackDefault : currentEffective);

      const knownSubfolders = getKnownSubfolders();
      const projectList = Array.from(new Set(['ROOT', ...knownSubfolders])).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));

      const items = [];
      if (currentOverride) {
        items.push({
          label: '$(discard) Automatische Erkennung wiederherstellen',
          description: `Zurücksetzen auf Heuristik (wäre: ${autoProject})`,
          action: 'reset'
        });
        items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
      }

      for (const p of projectList) {
        const isSelected = p.toLowerCase() === currentEffective.toLowerCase();
        items.push({
          label: isSelected ? `$(check) ${p}` : `$(folder) ${p}`,
          description: isSelected ? 'Aktuell ausgewählt' : '',
          project: p,
          action: 'set'
        });
      }

      items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
      items.push({
        label: '$(edit) Anderen Projektnamen eingeben...',
        description: 'Freitext-Eingabe eines Verzeichnisnamens',
        action: 'custom'
      });

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: `Projekt für Session „${titleLabel}“ auswählen (aktuell: ${currentEffective})`
      });
      if (!picked) return;

      if (picked.action === 'reset') {
        await model.projects.removeOverride(sId);
        vscode.window.showInformationMessage(`Projekt für Session „${titleLabel}“ auf automatische Erkennung (${autoProject}) zurückgesetzt.`);
      } else if (picked.action === 'set') {
        await model.projects.setOverride(sId, picked.project);
        vscode.window.showInformationMessage(`Session „${titleLabel}“ wurde manuell dem Projekt „${picked.project}“ zugewiesen.`);
      } else if (picked.action === 'custom') {
        const customName = await vscode.window.showInputBox({
          prompt: `Projektnamen für Session „${titleLabel}“ eingeben:`,
          placeHolder: 'z. B. mein-neues-projekt (leer lassen zum Zurücksetzen)',
          value: currentOverride || ''
        });
        if (customName === undefined) return;
        const clean = customName.trim();
        if (!clean) {
          await model.projects.removeOverride(sId);
          vscode.window.showInformationMessage(`Projekt für Session „${titleLabel}“ auf automatische Erkennung zurückgesetzt.`);
        } else {
          await model.projects.setOverride(sId, clean);
          vscode.window.showInformationMessage(`Session „${titleLabel}“ wurde manuell dem Projekt „${clean}“ zugewiesen.`);
        }
      }

      await update(true);
      if (board.viewMode === 'history') {
        board.sendHistory();
      }
    }),
    vscode.commands.registerCommand('sessionDashboard.removeProjectOverride', async (arg) => {
      const id = sessionIdOf(arg);
      if (!id) return;
      await model.projects.removeOverride(id);
      await update(true);
      if (board.viewMode === 'history') {
        board.sendHistory();
      }
    }),
    vscode.commands.registerCommand('sessionDashboard.search', async () => {
      const visible = model.visibleSessions();
      const now = Date.now();
      const items = visible.map((s) => {
        const providerLabel = s.provider === 'codex' ? 'Codex' : (s.provider === 'copilot' ? 'Copilot' : (s.provider === 'antigravity' ? 'Antigravity' : 'Claude'));
        const state = STATES[s.displayState] || { label: s.displayState, icon: 'circle-outline' };
        const isBookmarked = s.isBookmarked ? '📌 ' : '';
        const ticketPrefix = s.ticket ? `[🎫 ${s.ticket}] ` : '';
        const projectPrefix = s.project ? `[${s.project}] ` : '';
        const activityPrefix = s.displayState === 'busy' && s.activity ? `[${s.activity}] ` : '';
        const detail = describe(s, now);
        const tokenDetail = s.tokens ? ` · 🧠 ${formatTokens(s.tokens.context)} (${s.tokens.percent}%)${s.tokens.model ? ' ' + friendlyModel(s.tokens.model) : ''}` : '';
        return {
          label: `${isBookmarked}${ticketPrefix}${projectPrefix}${s.title}`,
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
    vscode.commands.registerCommand('sessionDashboard.claudeStatusClick', async () => {
      const next = model.providerFilter === 'claude' ? 'all' : 'claude';
      await model.setFilter(next);
      syncViews();
      const action = vscode.workspace.getConfiguration('sessionDashboard').get('statusBarClickAction', 'board');
      if (action === 'quickpick') {
        return vscode.commands.executeCommand('sessionDashboard.quickMenu');
      }
      return vscode.commands.executeCommand('sessionDashboard.showBoard');
    }),
    vscode.commands.registerCommand('sessionDashboard.antigravityStatusClick', async () => {
      const next = model.providerFilter === 'antigravity' ? 'all' : 'antigravity';
      await model.setFilter(next);
      syncViews();
      const action = vscode.workspace.getConfiguration('sessionDashboard').get('statusBarClickAction', 'board');
      if (action === 'quickpick') {
        return vscode.commands.executeCommand('sessionDashboard.quickMenu');
      }
      return vscode.commands.executeCommand('sessionDashboard.showBoard');
    }),
    vscode.commands.registerCommand('sessionDashboard.codexStatusClick', async () => {
      const next = model.providerFilter === 'codex' ? 'all' : 'codex';
      await model.setFilter(next);
      syncViews();
      const action = vscode.workspace.getConfiguration('sessionDashboard').get('statusBarClickAction', 'board');
      if (action === 'quickpick') {
        return vscode.commands.executeCommand('sessionDashboard.quickMenu');
      }
      return vscode.commands.executeCommand('sessionDashboard.showBoard');
    }),
    vscode.commands.registerCommand('sessionDashboard.copilotStatusClick', async () => {
      const next = model.providerFilter === 'copilot' ? 'all' : 'copilot';
      await model.setFilter(next);
      syncViews();
      const action = vscode.workspace.getConfiguration('sessionDashboard').get('statusBarClickAction', 'board');
      if (action === 'quickpick') {
        return vscode.commands.executeCommand('sessionDashboard.quickMenu');
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
      if (q && ((q.claude && q.claude.available) || (q.antigravity && q.antigravity.available) || (q.copilot && q.copilot.available) || (q.codex && q.codex.available))) {
        const qParts = [];
        if (q.claude && q.claude.available && q.claude.fiveHour && typeof q.claude.fiveHour.percent === 'number') {
          qParts.push(`$(dashboard-claude) ${q.claude.fiveHour.percent}% (5h)`);
        }
        if (q.antigravity && q.antigravity.available) {
          const bucket = q.antigravity.gemini || q.antigravity.thirdParty;
          if (bucket?.fiveHour && typeof bucket.fiveHour.percent === 'number') {
            qParts.push(`$(dashboard-antigravity) ${bucket.fiveHour.percent}% (5h)`);
          } else if (typeof q.antigravity.tokens5h === 'number') {
            qParts.push(`$(dashboard-antigravity) ~${formatTokens(q.antigravity.tokens5h)}`);
          }
        }
        if (q.copilot && q.copilot.available && q.copilot.premium && typeof q.copilot.premium.percent === 'number') {
          qParts.push(`$(copilot) ${q.copilot.premium.percent}% (Monat)${q.copilot.budget ? ` + Budget ${q.copilot.budget.percent}%` : ''}`);
        }
        if (q.codex && q.codex.available && q.codex.fiveHour && typeof q.codex.fiveHour.percent === 'number') {
          qParts.push(`$(dashboard-codex) ${q.codex.fiveHour.percent}% (5h)`);
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
          const providerLabel = s.provider === 'codex' ? 'Codex' : (s.provider === 'copilot' ? 'Copilot' : (s.provider === 'antigravity' ? 'Antigravity' : 'Claude'));
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
          const providerLabel = s.provider === 'codex' ? 'Codex' : (s.provider === 'copilot' ? 'Copilot' : (s.provider === 'antigravity' ? 'Antigravity' : 'Claude'));
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
          const providerLabel = s.provider === 'codex' ? 'Codex' : (s.provider === 'copilot' ? 'Copilot' : (s.provider === 'antigravity' ? 'Antigravity' : 'Claude'));
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
        label: '$(graph) Analyse & Verbrauch öffnen',
        action: 'analyse'
      });
      items.push({
        label: '$(table) Session-Historie öffnen (Tabelle)',
        description: 'Vollständige sortier- & filterbare Tabelle',
        action: 'history'
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
        } else if (picked.action === 'analyse') {
          await vscode.commands.executeCommand('sessionDashboard.showAnalyse');
        } else if (picked.action === 'history') {
          await vscode.commands.executeCommand('sessionDashboard.showHistory');
        } else if (picked.action === 'search') {
          await vscode.commands.executeCommand('sessionDashboard.search');
        } else if (picked.action === 'filterProject') {
          await vscode.commands.executeCommand('sessionDashboard.filterProject');
        } else if (picked.action === 'filter') {
          await vscode.commands.executeCommand('sessionDashboard.filter');
        }
      }
    }),
    vscode.commands.registerCommand('sessionDashboard.refresh', () => update(true)),
    vscode.commands.registerCommand('sessionDashboard.syncViews', () => syncViews()),
    vscode.commands.registerCommand('sessionDashboard.toggleSound', async () => {
      await soundNotifier.toggleSound();
      board.update();
    }),
    vscode.commands.registerCommand('sessionDashboard.previewSound', async (arg) => {
      const eventLabels = {
        taskCompleted: 'Aufgabe beendet (taskCompleted)',
        idleReminder: 'Leerlauf-Reminder (idleReminder)',
        needsInput: 'Rückfrage / Bestätigung (needsInput)',
        limitAvailable: 'Limit wieder verfügbar (limitAvailable)'
      };

      const openSoundPickerForEvent = async (eventKey) => {
        const cfg = vscode.workspace.getConfiguration('sessionDashboard.sound');
        const fallback = eventKey === 'idleReminder' ? 'ding' : (eventKey === 'taskCompleted' ? 'tada' : 'chimes');
        const current = cfg.get(`${eventKey}.sound`, fallback);
        const items = SOUND_OPTIONS.map((s) => ({
          label: s.id === current ? `✓ ${s.label}` : s.label,
          description: s.id === current ? 'Aktuell ausgewählt' : s.description,
          soundId: s.id
        }));
        const pick = await vscode.window.showQuickPick(items, {
          placeHolder: `Sound für „${eventLabels[eventKey]}“ wählen (aktuell: ${current}). Klick spielt Sound ab und speichert.`
        });
        if (pick) {
          if (pick.soundId !== 'none') {
            soundNotifier.previewSound(pick.soundId);
          }
          await cfg.update(`${eventKey}.sound`, pick.soundId, vscode.ConfigurationTarget.Global);
          vscode.window.showInformationMessage(`AI Sessions: Sound für „${eventLabels[eventKey]}“ auf „${pick.soundId}“ gesetzt.`);
        }
      };

      // 1. Direkter Aufruf aus VS Code Settings (Link mit Parameter: command:sessionDashboard.previewSound?"taskCompleted")
      if (typeof arg === 'string' && eventLabels[arg]) {
        const cfg = vscode.workspace.getConfiguration('sessionDashboard.sound');
        const fallback = arg === 'idleReminder' ? 'ding' : (arg === 'taskCompleted' ? 'tada' : 'chimes');
        const currentSound = cfg.get(`${arg}.sound`, fallback);
        if (currentSound === 'none') {
          vscode.window.showInformationMessage(`AI Sessions: Sound für „${eventLabels[arg]}“ ist stummgeschaltet (none).`);
          return;
        }
        soundNotifier.previewSound(arg);
        vscode.window.showInformationMessage(
          `AI Sessions: Sound für „${eventLabels[arg]}“ abgespielt: ${currentSound}`,
          'Sound ändern...'
        ).then((choice) => {
          if (choice === 'Sound ändern...') {
            openSoundPickerForEvent(arg);
          }
        });
        return;
      }

      // 2. Interaktives Menü
      const cfg = vscode.workspace.getConfiguration('sessionDashboard.sound');
      const taskSound = cfg.get('taskCompleted.sound', 'tada');
      const idleSound = cfg.get('idleReminder.sound', 'ding');
      const inputSound = cfg.get('needsInput.sound', 'chimes');
      const limitSound = cfg.get('limitAvailable.sound', 'chimes');

      const mainItems = [
        {
          label: '$(play) Alle Sounds probehören (Katalog)',
          description: 'Alle verfügbaren Töne durchhören',
          action: 'catalog'
        },
        { label: '', kind: vscode.QuickPickItemKind.Separator },
        {
          label: '$(check) Ton für „Aufgabe beendet“ wählen...',
          description: `Aktuell: ${taskSound}`,
          eventKey: 'taskCompleted',
          action: 'configure'
        },
        {
          label: '$(bell) Ton für „Leerlauf-Reminder“ wählen...',
          description: `Aktuell: ${idleSound}`,
          eventKey: 'idleReminder',
          action: 'configure'
        },
        {
          label: '$(question) Ton für „Rückfrage“ wählen...',
          description: `Aktuell: ${inputSound}`,
          eventKey: 'needsInput',
          action: 'configure'
        },
        {
          label: '$(zap) Ton für „Limit frei“ wählen...',
          description: `Aktuell: ${limitSound}`,
          eventKey: 'limitAvailable',
          action: 'configure'
        }
      ];

      const mainPick = await vscode.window.showQuickPick(mainItems, {
        placeHolder: 'AI Sessions: Sound vorhören oder konfigurieren...'
      });
      if (!mainPick) return;

      if (mainPick.action === 'configure') {
        return openSoundPickerForEvent(mainPick.eventKey);
      }

      if (mainPick.action === 'catalog') {
        let continueBrowsing = true;
        while (continueBrowsing) {
          const catalogItems = SOUND_OPTIONS.map((s) => ({
            label: s.id === 'none' ? `$(mute) ${s.label}` : `$(megaphone) ${s.label}`,
            description: s.description,
            soundId: s.id
          }));
          const selected = await vscode.window.showQuickPick(catalogItems, {
            placeHolder: 'Klicke auf einen Sound, um ihn anzuhören (Esc zum Beenden)...'
          });
          if (!selected) {
            continueBrowsing = false;
            break;
          }
          if (selected.soundId !== 'none') {
            soundNotifier.previewSound(selected.soundId);
            const nextAction = await vscode.window.showInformationMessage(
              `Sound „${selected.soundId}“ abgespielt.`,
              'Weiteren Sound testen',
              'Diesem Ereignis zuweisen...',
              'Fertig'
            );
            if (nextAction === 'Diesem Ereignis zuweisen...') {
              const evPick = await vscode.window.showQuickPick([
                { label: 'Aufgabe beendet (taskCompleted)', eventKey: 'taskCompleted' },
                { label: 'Leerlauf-Reminder (idleReminder)', eventKey: 'idleReminder' },
                { label: 'Rückfrage / Bestätigung (needsInput)', eventKey: 'needsInput' },
                { label: 'Limit wieder verfügbar (limitAvailable)', eventKey: 'limitAvailable' }
              ], { placeHolder: `Sound „${selected.soundId}“ zuweisen an:` });
              if (evPick) {
                await cfg.update(`${evPick.eventKey}.sound`, selected.soundId, vscode.ConfigurationTarget.Global);
                vscode.window.showInformationMessage(`AI Sessions: Sound für „${evPick.label}“ auf „${selected.soundId}“ gesetzt.`);
              }
              continueBrowsing = false;
            } else if (nextAction !== 'Weiteren Sound testen') {
              continueBrowsing = false;
            }
          } else {
            vscode.window.showInformationMessage('Kein Sound ausgewählt (stumm).');
            continueBrowsing = false;
          }
        }
      }
    }),
    vscode.commands.registerCommand('sessionDashboard.openSettings', () => {
      vscode.commands.executeCommand('workbench.action.openSettings', '@ext:schueri.ai-sessions');
    }),
    vscode.commands.registerCommand('sessionDashboard.jenkinsSetCredentials', () => setJenkinsCredentials(context.secrets)),
    vscode.commands.registerCommand('sessionDashboard.showJenkins', () => {
      vscode.window.showInformationMessage('Der Jenkins Deploy-Tab ist derzeit noch in Arbeit (Coming Soon).');
    })
  );

  update(true);

  // Close any duplicate tabs restored from earlier restarts
  board.closeDuplicateTabs();

  const config = vscode.workspace.getConfiguration('sessionDashboard');
  if (config.get('openOnStartup', false)) {
    setTimeout(async () => {
      if (!board.panel) {
        await board.show();
      } else {
        await board.closeDuplicateTabs();
      }
    }, 500);
  }
}

function deactivate() {}

module.exports = { activate, deactivate };
