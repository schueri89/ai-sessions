'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { resolveProject } = require('../project');
const { resolveMaxContext } = require('../format');

let DatabaseSync = null;
try {
  DatabaseSync = require('node:sqlite').DatabaseSync;
} catch {
  DatabaseSync = null;
}

const sessionFileCache = new Map();
const workspacePathCache = new Map();
let cachedDb = null;
let lastDbMtime = 0;

const BUSY_MAX_AGE_MS = 30 * 60 * 1000;
const WAITING_MAX_AGE_MS = 12 * 60 * 60 * 1000;

function applyFreshness(session) {
  if (!session) return session;
  const age = Date.now() - (session.lastActivityAt || 0);

  if (session.liveState === 'needsInput' && age <= WAITING_MAX_AGE_MS) {
    return {
      ...session,
      state: 'waiting',
      rawStatus: 'waiting',
      waitingFor: 'Rückfrage',
      activity: ''
    };
  }

  if (session.liveState === 'busy' && age <= BUSY_MAX_AGE_MS) {
    return {
      ...session,
      state: 'busy',
      rawStatus: 'busy',
      waitingFor: '',
      activity: 'Arbeitet…'
    };
  }

  if (session.hasPendingEdits) {
    return {
      ...session,
      state: 'waiting',
      rawStatus: 'waiting',
      waitingFor: 'Review/Freigabe',
      activity: ''
    };
  }

  return {
    ...session,
    state: 'idle',
    rawStatus: 'idle',
    waitingFor: '',
    activity: ''
  };
}

function codeUserDataDir() {
  if (process.platform === 'win32') {
    return process.env.APPDATA ? path.join(process.env.APPDATA, 'Code', 'User') : path.join(os.homedir(), 'AppData', 'Roaming', 'Code', 'User');
  } else if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'Code', 'User');
  } else {
    return path.join(os.homedir(), '.config', 'Code', 'User');
  }
}

function copilotDir() {
  return path.join(codeUserDataDir(), 'globalStorage', 'github.copilot-chat');
}

function dbPath() {
  return path.join(copilotDir(), 'session-store.db');
}

function workspaceStorageDir() {
  return path.join(codeUserDataDir(), 'workspaceStorage');
}

function decodeWorkspaceUri(uri) {
  if (!uri) return '';
  try {
    let p = uri.replace(/^file:\/\/\/?/, '');
    p = decodeURIComponent(p);
    return path.normalize(p);
  } catch {
    return uri;
  }
}

function cleanPrompt(text) {
  if (!text) return '';
  return text.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function getDb() {
  if (!DatabaseSync) return null;
  const file = dbPath();
  if (!fs.existsSync(file)) return null;
  try {
    const stat = fs.statSync(file);
    if (!cachedDb || stat.mtimeMs !== lastDbMtime) {
      if (cachedDb) {
        try { cachedDb.close(); } catch {}
      }
      cachedDb = new DatabaseSync(file, { readOnly: true });
      lastDbMtime = stat.mtimeMs;
    }
    return cachedDb;
  } catch {
    return null;
  }
}

function getWorkspacePath(hash, wsFolder) {
  if (workspacePathCache.has(hash)) {
    return workspacePathCache.get(hash);
  }
  const wsFile = path.join(wsFolder, 'workspace.json');
  let wsPath = '';
  if (fs.existsSync(wsFile)) {
    try {
      const json = JSON.parse(fs.readFileSync(wsFile, 'utf8'));
      wsPath = decodeWorkspaceUri(json.folder || json.workspace || '');
    } catch {}
  }
  workspacePathCache.set(hash, wsPath);
  return wsPath;
}
function parseJsonlChatSession(lines) {
  let sessionObj = null;
  let customTitle = '';
  for (const line of lines) {
    try {
      const p = JSON.parse(line);
      if (p.kind === 0 && p.v) {
        sessionObj = p.v;
      } else if (p.kind === 1 && p.k) {
        if (p.k.length === 1 && p.k[0] === 'customTitle') {
          customTitle = p.v;
        } else if (p.k[0] === 'requests' && typeof p.k[1] === 'number' && sessionObj?.requests?.[p.k[1]]) {
          const req = sessionObj.requests[p.k[1]];
          if (p.k.length === 3) {
            req[p.k[2]] = p.v;
          }
        }
      } else if (p.kind === 2 && p.k) {
        // Splice semantics: if p.i is set, items from index i on are replaced (e.g. resent request or streamed response chunk).
        const splice = (arr) => {
          const base = (typeof p.i === 'number' && p.i >= 0) ? arr.slice(0, p.i) : arr;
          return p.v !== undefined ? base.concat(p.v) : base;
        };
        if (p.k.length === 1 && p.k[0] === 'requests' && sessionObj) {
          sessionObj.requests = splice(sessionObj.requests || []);
        } else if (p.k[0] === 'requests' && typeof p.k[1] === 'number' && p.k[2] === 'response' && sessionObj?.requests?.[p.k[1]]) {
          const req = sessionObj.requests[p.k[1]];
          req.response = splice(req.response || []);
        }
      }
    } catch {}
  }
  return { sessionObj, customTitle };
}

function readJsonlSession(filePath, sessionId, wsPath, options = {}) {
  try {
    const st = fs.statSync(filePath);
    const cached = sessionFileCache.get(filePath);
    if (cached && cached.mtimeMs === st.mtimeMs) {
      return applyFreshness(cached.session);
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    if (lines.length === 0) return null;

    const { sessionObj, customTitle } = parseJsonlChatSession(lines);
    if (!sessionObj) return null;

    const requests = sessionObj.requests || [];
    const isPending = (sessionObj.pendingRequests && sessionObj.pendingRequests.length > 0);

    // Filter empty sessions (e.g. simply switched to Copilot chat pane without interaction)
    if (requests.length === 0 && !isPending) {
      return null;
    }

    let lastPrompt = '';
    for (let i = requests.length - 1; i >= 0; i--) {
      const t = requests[i]?.message?.text;
      if (t && cleanPrompt(t)) {
        lastPrompt = cleanPrompt(t);
        break;
      }
    }

    // If there is no prompt, no custom title, and no pending work, skip empty session
    if (!lastPrompt && !customTitle && !sessionObj.customTitle && !isPending) {
      return null;
    }

    const lastReq = requests.length > 0 ? requests[requests.length - 1] : null;
    const title = customTitle || sessionObj.customTitle || (lastPrompt ? lastPrompt.slice(0, 50) : 'Copilot Chat');
    const cwd = wsPath || '';
    const project = resolveProject({ cwd, title, lastPrompt, detectionMode: options.detectionMode || 'auto' });

    // Determine potential live state:
    // modelState.value: 0=pending, 1=completed, 2=cancelled, 3=failed, 4=needsInput
    const isNeedsInput = Boolean(
      lastReq &&
      lastReq.modelState &&
      lastReq.modelState.value === 4 &&
      lastReq.modelState.completedAt === undefined
    );

    const isRunning = !isNeedsInput && Boolean(
      isPending || (lastReq && lastReq.modelState && lastReq.modelState.completedAt === undefined)
    );

    let liveState = '';
    if (isNeedsInput) {
      liveState = 'needsInput';
    } else if (isRunning) {
      liveState = 'busy';
    }

    const hasPendingEdits = sessionObj.hasPendingEdits === true;

    const startedAt = sessionObj.creationDate || st.birthtimeMs || st.mtimeMs;
    const statusUpdatedAt = lastReq?.modelState?.completedAt || st.mtimeMs;

    // Tokens & Model if available from last request metadata
    let tokens = null;
    let model = 'copilot';
    for (let i = requests.length - 1; i >= 0; i--) {
      const req = requests[i];
      const meta = req.result?.metadata;
      if (!model || model === 'copilot') {
        if (meta?.resolvedModel) model = meta.resolvedModel;
        else if (req.modelId) model = req.modelId;
      }
      if (!tokens && (meta?.promptTokens !== undefined || meta?.outputTokens !== undefined)) {
        const promptTok = Number(meta.promptTokens) || 0;
        const outTok = Number(meta.outputTokens) || 0;
        const total = promptTok + outTok;
        const maxCtx = resolveMaxContext(model);
        tokens = {
          context: total,
          maxContext: maxCtx,
          percent: maxCtx > 0 ? Math.round((total / maxCtx) * 100) : 0
        };
      }
      if (tokens && model !== 'copilot') break;
    }

    const session = {
      provider: 'copilot',
      sessionId,
      pid: 0,
      cwd,
      project,
      registryName: sessionObj.responderUsername || 'GitHub Copilot',
      rawStatus: 'idle',
      waitingFor: '',
      state: 'idle',
      startedAt,
      statusUpdatedAt,
      title,
      lastPrompt,
      activity: '',
      workspaces: cwd ? [cwd] : [],
      rateLimit: null,
      tokens,
      filePath,
      liveState,
      lastActivityAt: st.mtimeMs,
      hasPendingEdits
    };

    sessionFileCache.set(filePath, { mtimeMs: st.mtimeMs, session });
    return applyFreshness(session);
  } catch {
    return null;
  }
}

async function readSessions(options = {}) {
  const sessionMap = new Map();

  // 1. Scan SQLite session-store.db if available
  const db = getDb();
  if (db) {
    try {
      const rows = db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC').all();
      for (const r of rows) {
        if (!r.id) continue;
        const summary = r.summary ? cleanPrompt(r.summary) : '';
        if (!summary) continue; // Skip empty sessions in SQLite
        const sessionId = r.id;
        const cwd = r.cwd || '';
        const title = summary.slice(0, 60);
        const lastPrompt = summary;
        const project = resolveProject({ cwd, title, lastPrompt, detectionMode: options.detectionMode || 'auto' });
        const updatedAt = r.updated_at ? new Date(r.updated_at).getTime() : 0;
        const createdAt = r.created_at ? new Date(r.created_at).getTime() : updatedAt;

        sessionMap.set(sessionId, {
          provider: 'copilot',
          sessionId,
          pid: 0,
          cwd,
          project,
          registryName: r.agent_name || 'GitHub Copilot',
          rawStatus: 'idle',
          waitingFor: '',
          state: 'idle',
          startedAt: createdAt,
          statusUpdatedAt: updatedAt,
          title,
          lastPrompt,
          activity: '',
          workspaces: cwd ? [cwd] : [],
          rateLimit: null,
          tokens: null
        });
      }
    } catch {}
  }

  // 2. Scan workspaceStorage for real-time and rich chat sessions
  const wsDir = workspaceStorageDir();
  if (fs.existsSync(wsDir)) {
    try {
      const hashes = fs.readdirSync(wsDir);
      for (const h of hashes) {
        const wsFolder = path.join(wsDir, h);
        const csDir = path.join(wsFolder, 'chatSessions');
        if (!fs.existsSync(csDir)) continue;

        const wsPath = getWorkspacePath(h, wsFolder);

        let files = [];
        try { files = fs.readdirSync(csDir); } catch { continue; }

        for (const f of files) {
          if (!f.endsWith('.jsonl')) continue;
          const sessionId = path.basename(f, '.jsonl');
          const filePath = path.join(csDir, f);

          const parsedSession = readJsonlSession(filePath, sessionId, wsPath, options);
          if (parsedSession) {
            // Overwrite or merge with SQLite entry
            const existing = sessionMap.get(sessionId);
            if (existing) {
              sessionMap.set(sessionId, {
                ...existing,
                ...parsedSession,
                cwd: parsedSession.cwd || existing.cwd,
                project: parsedSession.project || existing.project,
                lastPrompt: parsedSession.lastPrompt || existing.lastPrompt,
                title: parsedSession.title || existing.title
              });
            } else {
              sessionMap.set(sessionId, parsedSession);
            }
          }
        }
      }
    } catch {}
  }

  return Array.from(sessionMap.values());
}

module.exports = {
  copilotDir,
  dbPath,
  workspaceStorageDir,
  parseJsonlChatSession,
  readSessions,
  readJsonlSession,
  applyFreshness,
  BUSY_MAX_AGE_MS,
  WAITING_MAX_AGE_MS
};
