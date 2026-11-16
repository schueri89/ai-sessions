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
      waitingFor: session.waitingLabel || 'Rückfrage',
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

// Session type "Copilot" in the VS Code chat picker runs the Copilot CLI agent host; it stores sessions here, not in workspaceStorage.
const CLI_SESSION_TYPE = 'agent-host-copilotcli';

function cliDir() {
  return path.join(os.homedir(), '.copilot');
}

function cliSessionStateDir() {
  return path.join(cliDir(), 'session-state');
}

function cliDbPath() {
  return path.join(cliDir(), 'session-store.db');
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

const cliParseCache = new Map();

function newCliParseState() {
  return {
    offset: 0,
    startedAt: 0,
    lastEventAt: 0,
    contextCwd: '',
    lastPrompt: '',
    model: '',
    tokens: null,
    running: false,
    finalAnswer: false,
    pending: new Map()
  };
}

function normalizeCliCwd(cwd) {
  if (!cwd) return '';
  return cwd.replace(/^\\\\\?\\UNC\\/i, '\\\\').replace(/^\\\\\?\\/, '');
}

function applyCliEvent(state, e) {
  const data = e.data || {};
  const ts = e.timestamp ? Date.parse(e.timestamp) : 0;
  if (ts) state.lastEventAt = ts;

  switch (e.type) {
    case 'session.start':
      state.startedAt = Date.parse(data.startTime) || ts;
      state.model = data.selectedModel || state.model;
      state.contextCwd = normalizeCliCwd(data.context?.cwd);
      return;
    case 'session.resume':
      state.model = data.selectedModel || state.model;
      return;
    case 'session.model_change':
      state.model = data.newModel || state.model;
      return;
    case 'user.message': {
      const prompt = cleanPrompt(data.content);
      if (prompt) state.lastPrompt = prompt;
      state.running = true;
      state.finalAnswer = false;
      state.pending.clear();
      return;
    }
    case 'assistant.turn_start':
      state.running = true;
      state.finalAnswer = false;
      return;
    case 'assistant.message':
      state.finalAnswer = !(Array.isArray(data.toolRequests) && data.toolRequests.length > 0);
      return;
    case 'assistant.turn_end':
      if (state.finalAnswer) state.running = false;
      return;
    case 'session.task_complete':
    case 'abort':
    case 'session.shutdown':
      state.running = false;
      state.pending.clear();
      return;
    case 'session.usage_record': {
      const u = data.usage || {};
      const total = (Number(u.inputTokens) || 0) + (Number(u.outputTokens) || 0);
      const model = u.model || state.model;
      const maxCtx = Number(u.maxPromptTokens) || resolveMaxContext(model);
      state.tokens = { context: total, maxContext: maxCtx, percent: maxCtx > 0 ? Math.round((total / maxCtx) * 100) : 0, model };
      return;
    }
    default:
      // permission.requested, user_input.requested, … stay open until the matching *.completed arrives.
      if (data.requestId && e.type.endsWith('.requested')) state.pending.set(data.requestId, e.type);
      else if (data.requestId && e.type.endsWith('.completed')) state.pending.delete(data.requestId);
  }
}

// events.jsonl grows to tens of MB and is append-only, so only the bytes since the last read are parsed.
function parseCliEvents(filePath, size) {
  let state = cliParseCache.get(filePath);
  if (!state || size < state.offset) state = newCliParseState();
  if (size > state.offset) {
    const fd = fs.openSync(filePath, 'r');
    let buf;
    try {
      buf = Buffer.alloc(size - state.offset);
      fs.readSync(fd, buf, 0, buf.length, state.offset);
    } finally {
      fs.closeSync(fd);
    }
    const end = buf.lastIndexOf(0x0a);
    if (end >= 0) {
      for (const line of buf.toString('utf8', 0, end).split('\n')) {
        if (!line.trim()) continue;
        let e;
        try { e = JSON.parse(line); } catch { continue; }
        applyCliEvent(state, e);
      }
      state.offset += end + 1;
    }
  }
  cliParseCache.set(filePath, state);
  return state;
}

function readCliWorkspaceCwd(sessionDir) {
  const file = path.join(sessionDir, 'workspace.yaml');
  if (!fs.existsSync(file)) return '';
  const m = fs.readFileSync(file, 'utf8').match(/^cwd:\s*(.+?)\s*$/m);
  return m ? m[1].replace(/^(['"])(.*)\1$/, '$2') : '';
}

function readCliSession(sessionDir, sessionId, options = {}) {
  const filePath = path.join(sessionDir, 'events.jsonl');
  if (!fs.existsSync(filePath)) return null;
  const st = fs.statSync(filePath);
  const cached = sessionFileCache.get(filePath);
  if (cached && cached.mtimeMs === st.mtimeMs && cached.size === st.size) {
    return applyFreshness(cached.session);
  }

  const state = parseCliEvents(filePath, st.size);
  if (!state.lastPrompt) return null;

  const cwd = readCliWorkspaceCwd(sessionDir) || state.contextCwd;
  const title = state.lastPrompt.slice(0, 50);
  const project = resolveProject({ cwd, title, lastPrompt: state.lastPrompt, detectionMode: options.detectionMode || 'auto' });

  const pendingTypes = Array.from(state.pending.values());
  let liveState = '';
  let waitingLabel = '';
  if (state.running && pendingTypes.length > 0) {
    liveState = 'needsInput';
    waitingLabel = pendingTypes.every((t) => t === 'permission.requested') ? 'Freigabe' : 'Rückfrage';
  } else if (state.running) {
    liveState = 'busy';
  }

  const session = {
    provider: 'copilot',
    sessionType: CLI_SESSION_TYPE,
    sessionId,
    pid: 0,
    cwd,
    project,
    registryName: 'GitHub Copilot CLI',
    rawStatus: 'idle',
    waitingFor: '',
    state: 'idle',
    startedAt: state.startedAt || st.birthtimeMs,
    statusUpdatedAt: state.lastEventAt || st.mtimeMs,
    title,
    lastPrompt: state.lastPrompt,
    activity: '',
    workspaces: cwd ? [cwd] : [],
    rateLimit: null,
    tokens: state.tokens,
    model: state.model,
    filePath,
    liveState,
    waitingLabel,
    lastActivityAt: st.mtimeMs,
    hasPendingEdits: false
  };

  sessionFileCache.set(filePath, { mtimeMs: st.mtimeMs, size: st.size, session });
  return applyFreshness(session);
}

function readCliSessions(options = {}) {
  const root = cliSessionStateDir();
  if (!fs.existsSync(root)) return [];
  const sessions = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
    const session = readCliSession(path.join(root, entry.name), entry.name, options);
    if (session) sessions.push(session);
  }
  return sessions;
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

  for (const s of readCliSessions(options)) sessionMap.set(s.sessionId, s);

  return Array.from(sessionMap.values());
}

module.exports = {
  copilotDir,
  dbPath,
  cliDbPath,
  cliSessionStateDir,
  CLI_SESSION_TYPE,
  applyCliEvent,
  newCliParseState,
  workspaceStorageDir,
  parseJsonlChatSession,
  readSessions,
  readJsonlSession,
  applyFreshness,
  BUSY_MAX_AGE_MS,
  WAITING_MAX_AGE_MS
};
