'use strict';

// Toast notification engine for AI Session Dashboard.
// Shows rich VS Code notifications (with 1-click 'Chat öffnen' action) when:
// 1. A session finishes a task (taskCompleted)
// 2. A session needs user input or permission approval (needsInput)

const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SHARED_TOAST_LOCK_FILE = path.join(os.tmpdir(), 'ai-sessions-toast.lock');

function acquireSharedToastLock(eventKey, debounceMs = 4000, lockFile = SHARED_TOAST_LOCK_FILE) {
  const now = Date.now();
  try {
    let data = {};
    if (fs.existsSync(lockFile)) {
      try {
        data = JSON.parse(fs.readFileSync(lockFile, 'utf8'));
      } catch {}
      const last = Number(data[eventKey]) || 0;
      if (now - last < debounceMs) {
        return false;
      }
    }
    data[eventKey] = now;
    // Housekeeping: drop keys older than 1 hour
    for (const k of Object.keys(data)) {
      if (now - Number(data[k]) > 3600000) {
        delete data[k];
      }
    }
    fs.writeFileSync(lockFile, JSON.stringify(data), 'utf8');
    return true;
  } catch {
    // If temp file access fails (e.g. permission issues), fallback to allowing in-memory debounce
    return true;
  }
}

function isSessionInCurrentWindow(session) {
  const folders = vscode.workspace.workspaceFolders || [];
  if (folders.length === 0) return false;
  const sessionPath = (session.cwd || (session.workspaces && session.workspaces[0]) || '');
  if (!sessionPath) return false;

  const normSession = path.normalize(sessionPath).toLowerCase();
  for (const f of folders) {
    const normF = path.normalize(f.uri.fsPath).toLowerCase();
    if (normSession === normF || normSession.startsWith(normF + path.sep)) {
      return true;
    }
  }
  return false;
}

function getNotificationConfig() {
  const cfg = vscode.workspace.getConfiguration('sessionDashboard.notifications');
  return {
    enabled: cfg.get('enabled', true),
    taskCompleted: cfg.get('taskCompleted', true),
    needsInput: cfg.get('needsInput', true),
    providers: {
      claude: cfg.get('providers.claude', true),
      antigravity: cfg.get('providers.antigravity', true),
      copilot: cfg.get('providers.copilot', true),
      codex: cfg.get('providers.codex', true)
    }
  };
}

class ToastNotifier {
  constructor(context, onOpenSession) {
    this.context = context;
    this.onOpenSession = onOpenSession;
    this.isInitialRun = true;
    this.knownSessions = new Map();
    this.lastLocalToastTime = new Map();
    this.pendingTimeouts = new Set();
  }

  isNotificationEnabled() {
    return vscode.workspace.getConfiguration('sessionDashboard.notifications').get('enabled', true);
  }

  async toggleNotifications() {
    const current = this.isNotificationEnabled();
    const next = !current;
    await vscode.workspace.getConfiguration('sessionDashboard.notifications').update('enabled', next, vscode.ConfigurationTarget.Global);
    vscode.window.showInformationMessage(
      next
        ? 'AI Session Dashboard: Benachrichtigungen aktiviert 🔔'
        : 'AI Session Dashboard: Benachrichtigungen stummgeschaltet 🔕'
    );
    return next;
  }

  notify(eventType, session) {
    const config = getNotificationConfig();
    if (!config.enabled) return;

    if (eventType === 'taskCompleted' && !config.taskCompleted) return;
    if (eventType === 'needsInput' && !config.needsInput) return;

    if (session.provider && config.providers && config.providers[session.provider] === false) {
      return;
    }

    const eventKey = `${eventType}:${session.sessionId}`;
    const now = Date.now();
    const lastLocal = this.lastLocalToastTime.get(eventKey) || 0;
    if (now - lastLocal < 4000) {
      return;
    }

    const isLocal = isSessionInCurrentWindow(session);

    if (isLocal) {
      // Priority 1: Current window directly owns the workspace.
      if (!acquireSharedToastLock(eventKey, 4000)) {
        return;
      }
      this.lastLocalToastTime.set(eventKey, now);
      this.showToast(eventType, session);
    } else {
      // Priority 2: Non-owning window waits 600-800ms.
      // If an owning window exists, it acquires the lock at 0ms and this fallback will bail out.
      const jitter = 600 + Math.floor(Math.random() * 200);
      const timer = setTimeout(() => {
        this.pendingTimeouts.delete(timer);
        const cfg = getNotificationConfig();
        if (!cfg.enabled) return;
        if (session.provider && cfg.providers && cfg.providers[session.provider] === false) return;
        if (!acquireSharedToastLock(eventKey, 4000)) {
          return;
        }
        this.lastLocalToastTime.set(eventKey, Date.now());
        this.showToast(eventType, session);
      }, jitter);
      this.pendingTimeouts.add(timer);
    }
  }

  showToast(eventType, session) {
    const proj = session.project ? `[${session.project}]` : `[${session.provider}]`;
    let title = (session.title || 'Session').trim();
    if (title.length > 70) {
      title = title.slice(0, 67) + '…';
    }

    let detail = '';
    if (eventType === 'taskCompleted') {
      detail = '✅ Aufgabe abgeschlossen';
    } else if (eventType === 'needsInput') {
      if (session.waitingFor === 'permission') {
        detail = '⚠️ Freigabe erforderlich';
      } else if (session.waitingFor === 'Rückfrage') {
        detail = '❓ Rückfrage wartet auf deine Antwort';
      } else {
        const hint = session.waitingFor ? `${session.waitingFor}: ` : '';
        detail = `❓ ${hint}Wartet auf Eingabe`;
      }
    }

    const message = `${proj} ${title}\n${detail}`;
    vscode.window.showInformationMessage(message, 'Chat öffnen').then((action) => {
      if (action === 'Chat öffnen' && typeof this.onOpenSession === 'function') {
        this.onOpenSession(session);
      }
    });
  }

  evaluate(sessions) {
    if (!sessions || !Array.isArray(sessions)) return;

    if (this.isInitialRun) {
      for (const s of sessions) {
        this.knownSessions.set(s.sessionId, {
          displayState: s.displayState,
          waitingFor: s.waitingFor || '',
          provider: s.provider,
          statusUpdatedAt: s.statusUpdatedAt || 0
        });
      }
      this.isInitialRun = false;
      return;
    }

    for (const s of sessions) {
      const prev = this.knownSessions.get(s.sessionId);

      // 1. Task Completed
      if (prev && prev.displayState === 'busy') {
        const isNowFinished = (s.displayState === 'idle' || s.displayState === 'done' || s.displayState === 'bookmarked') && !s.waitingFor;
        if (isNowFinished) {
          this.notify('taskCompleted', s);
        }
      }

      // 2. Needs Input
      const isWaitingForInput = s.displayState === 'waiting' && (
        s.waitingFor === 'Rückfrage' ||
        s.waitingFor === 'permission' ||
        s.waitingFor === 'prompt' ||
        s.rawStatus === 'waiting' ||
        (Boolean(s.waitingFor) && s.waitingFor !== 'Limit abgelaufen')
      );

      if (isWaitingForInput) {
        const wasWaitingBefore = prev && prev.displayState === 'waiting' && prev.waitingFor === s.waitingFor;
        if (!wasWaitingBefore) {
          this.notify('needsInput', s);
        }
      }

      this.knownSessions.set(s.sessionId, {
        displayState: s.displayState,
        waitingFor: s.waitingFor || '',
        provider: s.provider,
        statusUpdatedAt: s.statusUpdatedAt || 0
      });
    }
  }

  dispose() {
    for (const t of this.pendingTimeouts) {
      clearTimeout(t);
    }
    this.pendingTimeouts.clear();
    this.knownSessions.clear();
    this.lastLocalToastTime.clear();
  }
}

module.exports = {
  ToastNotifier,
  acquireSharedToastLock,
  isSessionInCurrentWindow,
  getNotificationConfig
};
