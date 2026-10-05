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

function readJsonlSession(filePath, sessionId, wsPath) {
  try {
    const st = fs.statSync(filePath);
    const cached = sessionFileCache.get(filePath);
    if (cached && cached.mtimeMs === st.mtimeMs) {
      return cached.session;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n').filter(Boolean);
    if (lines.length === 0) return null;

    let sessionObj = null;
    let customTitle = '';

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        if (parsed.kind === 0 && parsed.v) {
          sessionObj = parsed.v;
        } else if (parsed.kind === 1 && parsed.k && parsed.k[0] === 'customTitle') {
          customTitle = parsed.v;
        } else if (parsed.kind === 2 && parsed.k && parsed.k[0] === 'requests' && sessionObj) {
          if (!sessionObj.requests) sessionObj.requests = [];
          sessionObj.requests = sessionObj.requests.concat(parsed.v);
        }
      } catch {}
    }

    if (!sessionObj) return null;

    const requests = sessionObj.requests || [];
    const lastReq = requests.length > 0 ? requests[requests.length - 1] : null;
    const lastPrompt = lastReq?.message?.text ? cleanPrompt(lastReq.message.text) : '';
    const title = customTitle || sessionObj.customTitle || (lastPrompt ? lastPrompt.slice(0, 50) : 'Copilot Chat');
    const cwd = wsPath || '';
    const project = resolveProject({ cwd, title, lastPrompt });

    const isPending = (sessionObj.pendingRequests && sessionObj.pendingRequests.length > 0) ||
                      (lastReq && lastReq.modelState && lastReq.modelState.completedAt === undefined);
    const hasPendingEdits = sessionObj.hasPendingEdits === true;

    let state = 'idle';
    let waitingFor = '';
    let activity = '';

    if (isPending) {
      state = 'busy';
      activity = 'Arbeitet…';
    } else if (hasPendingEdits) {
      state = 'waiting';
      waitingFor = 'Review/Freigabe';
    }

    const startedAt = sessionObj.creationDate || st.birthtimeMs || st.mtimeMs;
    const statusUpdatedAt = lastReq?.modelState?.completedAt || st.mtimeMs;

    // Tokens & Model if available from last request metadata
    let tokens = null;
    let model = 'copilot';
    if (lastReq) {
      const meta = lastReq.result?.metadata;
      if (meta?.resolvedModel) model = meta.resolvedModel;
      else if (lastReq.modelId) model = lastReq.modelId;

      if (meta?.promptTokens !== undefined || meta?.outputTokens !== undefined) {
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
    }

    const session = {
      provider: 'copilot',
      sessionId,
      pid: 0,
      cwd,
      project,
      registryName: sessionObj.responderUsername || 'GitHub Copilot',
      rawStatus: state,
      waitingFor,
      state,
      startedAt,
      statusUpdatedAt,
      title,
      lastPrompt,
      activity,
      workspaces: cwd ? [cwd] : [],
      rateLimit: null,
      tokens,
      filePath
    };

    sessionFileCache.set(filePath, { mtimeMs: st.mtimeMs, session });
    return session;
  } catch {
    return null;
  }
}

async function readSessions() {
  const sessionMap = new Map();

  // 1. Scan SQLite session-store.db if available
  const db = getDb();
  if (db) {
    try {
      const rows = db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC').all();
      for (const r of rows) {
        if (!r.id) continue;
        const sessionId = r.id;
        const cwd = r.cwd || '';
        const title = r.summary ? cleanPrompt(r.summary).slice(0, 60) : 'Copilot Chat';
        const lastPrompt = r.summary ? cleanPrompt(r.summary) : '';
        const project = resolveProject({ cwd, title, lastPrompt });
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

          const parsedSession = readJsonlSession(filePath, sessionId, wsPath);
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
  readSessions
};
