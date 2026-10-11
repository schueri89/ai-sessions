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

const ROLLOUT_TAIL_BYTES = 64 * 1024;
const BUSY_MAX_AGE_MS = 30 * 60 * 1000;
const WAITING_MAX_AGE_MS = 12 * 60 * 60 * 1000;

let cachedDb = null;
let lastDbMtime = 0;

function codexDir() {
  return process.env.CODEX_CONFIG_DIR || path.join(os.homedir(), '.codex');
}

function sessionsDir() {
  return path.join(codexDir(), 'sessions');
}

function dbPath() {
  const dir = codexDir();
  try {
    if (fs.existsSync(dir)) {
      const files = fs.readdirSync(dir).filter((f) => /^state_\d+\.sqlite$/.test(f));
      if (files.length > 0) {
        files.sort((a, b) => {
          const vA = parseInt(a.replace(/\D/g, ''), 10) || 0;
          const vB = parseInt(b.replace(/\D/g, ''), 10) || 0;
          return vB - vA;
        });
        return path.join(dir, files[0]);
      }
    }
  } catch {}
  return path.join(dir, 'state_5.sqlite');
}

function fileMtime(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

function getDb() {
  if (!DatabaseSync) return null;
  const file = dbPath();
  if (!fs.existsSync(file)) return null;
  try {
    const mtime = Math.max(fileMtime(file), fileMtime(file + '-wal'), fileMtime(file + '-shm'));
    if (!cachedDb || mtime !== lastDbMtime) {
      if (cachedDb) {
        try { cachedDb.close(); } catch {}
      }
      cachedDb = new DatabaseSync(file, { readOnly: true });
      lastDbMtime = mtime;
    }
    return cachedDb;
  } catch {
    return null;
  }
}

function normalizePath(p) {
  if (!p || typeof p !== 'string') return '';
  return path.normalize(p.replace(/^\\\\\?\\/, ''));
}

function cleanPrompt(text) {
  if (!text || typeof text !== 'string') return '';
  let str = text;
  const reqIdx = str.indexOf('## My request:');
  if (reqIdx !== -1) {
    str = str.slice(reqIdx + '## My request:'.length);
  }
  return str.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatTool(name, payload) {
  if (!name) return '';
  const n = String(name).toLowerCase();
  if (n.includes('command') || n.includes('exec') || n.includes('bash')) {
    const cmd = payload?.cmd || payload?.command || payload?.CommandLine || '';
    const cleanCmd = String(cmd).trim().replace(/\s+/g, ' ');
    return '🛠️ ' + (cleanCmd ? (cleanCmd.length > 45 ? cleanCmd.slice(0, 43) + '…' : cleanCmd) : 'Befehl ausführen');
  }
  if (n.includes('read') || n.includes('view')) {
    const file = path.basename(payload?.path || payload?.file || payload?.AbsolutePath || '');
    return '📖 Liest ' + (file || 'Datei');
  }
  if (n.includes('patch') || n.includes('edit') || n.includes('write')) {
    const file = path.basename(payload?.path || payload?.file || payload?.TargetFile || '');
    return '✏️ Bearbeitet ' + (file || 'Datei');
  }
  return '🔧 ' + name;
}

function readRolloutTail(filePath) {
  if (!filePath || !fs.existsSync(filePath)) {
    return {
      lastPrompt: '',
      isComplete: true,
      isWaiting: false,
      waitingReason: '',
      activity: '',
      tokens: null,
      lastEventTime: 0
    };
  }

  let fd = null;
  try {
    const stat = fs.statSync(filePath);
    const readLen = Math.min(stat.size, ROLLOUT_TAIL_BYTES);
    const buf = Buffer.alloc(readLen);
    fd = fs.openSync(filePath, 'r');
    fs.readSync(fd, buf, 0, readLen, stat.size - readLen);

    const lines = buf.toString('utf8').split('\n').filter(Boolean);
    let lastPrompt = '';
    let isComplete = true;
    let isWaiting = false;
    let waitingReason = '';
    let activity = '';
    let lastTokens = null;
    let lastEventTime = 0;
    let pendingTool = '';

    for (const l of lines) {
      let obj;
      try { obj = JSON.parse(l); } catch { continue; }

      // Skip passive UI events like thread_settings_applied that occur when simply viewing/opening the thread
      if (obj.type === 'event_msg' && obj.payload?.type === 'thread_settings_applied') {
        continue;
      }

      const ts = obj.timestamp ? Date.parse(obj.timestamp) : 0;
      if (ts > 0 && ts > lastEventTime) {
        lastEventTime = ts;
      }

      if (obj.type === 'event_msg') {
        const payload = obj.payload || {};
        if (payload.type === 'user_message' && payload.message) {
          lastPrompt = payload.message;
          isComplete = false;
          isWaiting = false;
          waitingReason = '';
        } else if (payload.type === 'task_started') {
          isComplete = false;
          isWaiting = false;
          waitingReason = '';
        } else if (payload.type === 'task_complete') {
          isComplete = true;
          isWaiting = false;
          waitingReason = '';
          activity = '';
          pendingTool = '';
        } else if (payload.type === 'exec_approval_request' || payload.type === 'apply_patch_approval_request') {
          isWaiting = true;
          waitingReason = 'Freigabe nötig';
        }
      } else if (obj.type === 'response_item') {
        const payload = obj.payload || {};
        if (payload.type === 'message' && payload.role === 'user' && Array.isArray(payload.content)) {
          for (const c of payload.content) {
            if ((c.type === 'input_text' || c.type === 'text') && c.text) {
              if (!c.text.startsWith('# AGENTS.md instructions') && !c.text.startsWith('<external_codex_apps_') && !c.text.startsWith('<environment_context>')) {
                lastPrompt = c.text;
                isComplete = false;
                isWaiting = false;
                waitingReason = '';
              }
            }
          }
        } else if (payload.type === 'custom_tool_call' || payload.type === 'function_call') {
          const tName = payload.name || payload.call?.name || 'tool';
          pendingTool = tName;
          activity = formatTool(tName, payload.arguments || payload.args || {});
          if (tName === 'request_user_input') {
            isWaiting = true;
            waitingReason = 'Rückfrage';
          }
        } else if (payload.type === 'custom_tool_call_output' || payload.type === 'function_call_output') {
          pendingTool = '';
        }
      } else if (obj.type === 'token_usage_record') {
        const u = obj.payload?.usage;
        if (u) {
          lastTokens = {
            inputTokens: u.input_tokens || 0,
            cachedInputTokens: u.cached_input_tokens || 0,
            outputTokens: u.output_tokens || 0,
            reasoningTokens: u.reasoning_output_tokens || 0,
            totalTokens: u.total_tokens || 0
          };
        }
      }
    }

    return {
      lastPrompt,
      isComplete,
      isWaiting,
      waitingReason,
      activity: pendingTool ? activity : '',
      tokens: lastTokens,
      lastEventTime
    };
  } catch {
    return {
      lastPrompt: '',
      isComplete: true,
      isWaiting: false,
      waitingReason: '',
      activity: '',
      tokens: null,
      lastEventTime: 0
    };
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch {}
    }
  }
}

// Find rollout file on disk if stored path doesn't match
function resolveRolloutPath(storedPath, sessionId) {
  if (storedPath && fs.existsSync(storedPath)) {
    return storedPath;
  }
  const root = sessionsDir();
  if (!fs.existsSync(root)) return '';
  try {
    const years = fs.readdirSync(root);
    for (const y of years) {
      const yPath = path.join(root, y);
      if (!fs.statSync(yPath).isDirectory()) continue;
      const months = fs.readdirSync(yPath);
      for (const m of months) {
        const mPath = path.join(yPath, m);
        if (!fs.statSync(mPath).isDirectory()) continue;
        const days = fs.readdirSync(mPath);
        for (const d of days) {
          const dPath = path.join(mPath, d);
          if (!fs.statSync(dPath).isDirectory()) continue;
          const files = fs.readdirSync(dPath);
          for (const f of files) {
            if (f.endsWith(`${sessionId}.jsonl`)) {
              return path.join(dPath, f);
            }
          }
        }
      }
    }
  } catch {}
  return '';
}

async function readSessions(options = {}) {
  const db = getDb();
  if (!db) return [];

  let rows = [];
  try {
    rows = db.prepare(`
      SELECT id, rollout_path, cwd, title, tokens_used, model, created_at_ms, updated_at_ms, first_user_message, archived
      FROM threads
      WHERE archived = 0
      ORDER BY updated_at_ms DESC
    `).all();
  } catch {
    return [];
  }

  const now = Date.now();
  const sessions = [];

  for (const r of rows) {
    const sessionId = r.id;
    if (!sessionId) continue;

    const cwd = normalizePath(r.cwd);
    const rolloutFile = resolveRolloutPath(r.rollout_path, sessionId);
    const rolloutTail = readRolloutTail(rolloutFile);

    const startedAt = Number(r.created_at_ms) || now;
    const updatedAt = rolloutTail.lastEventTime || startedAt;
    const age = now - updatedAt;

    let state = 'idle';
    let waitingFor = '';
    let activity = '';

    if (rolloutTail.isWaiting && age <= WAITING_MAX_AGE_MS) {
      state = 'waiting';
      waitingFor = rolloutTail.waitingReason || 'Freigabe nötig';
    } else if (!rolloutTail.isComplete && age <= BUSY_MAX_AGE_MS) {
      state = 'busy';
      activity = rolloutTail.activity || 'Arbeitet…';
    } else {
      state = 'idle';
    }

    const rawPrompt = rolloutTail.lastPrompt || r.first_user_message || '';
    const lastPrompt = cleanPrompt(rawPrompt);
    const title = r.title || cleanPrompt(r.first_user_message) || sessionId.slice(0, 8);

    const project = resolveProject({
      cwd,
      title,
      lastPrompt,
      workspaces: cwd ? [cwd] : [],
      detectionMode: options.detectionMode || 'auto'
    });

    const modelName = r.model || 'gpt-6.1-sol';
    const maxContext = resolveMaxContext(modelName);
    let tokens = null;

    if (rolloutTail.tokens) {
      const inp = rolloutTail.tokens.inputTokens || 0;
      const cached = rolloutTail.tokens.cachedInputTokens || 0;
      const out = rolloutTail.tokens.outputTokens || 0;
      const context = inp + cached;
      tokens = {
        context,
        maxContext,
        percent: Math.min(100, Math.round((context / maxContext) * 100)),
        inputTokens: inp,
        cacheCreationTokens: 0,
        cacheReadTokens: cached,
        outputTokens: out,
        model: modelName
      };
    } else if (r.tokens_used) {
      const used = Number(r.tokens_used) || 0;
      tokens = {
        context: used,
        maxContext,
        percent: Math.min(100, Math.round((used / maxContext) * 100)),
        inputTokens: used,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        outputTokens: 0,
        model: modelName
      };
    }

    sessions.push({
      provider: 'codex',
      sessionId,
      pid: 0,
      cwd,
      project,
      registryName: 'OpenAI Codex',
      rawStatus: state,
      waitingFor,
      state,
      startedAt,
      statusUpdatedAt: updatedAt,
      title,
      lastPrompt,
      activity,
      workspaces: cwd ? [cwd] : [],
      rateLimit: null,
      tokens,
      rolloutPath: rolloutFile
    });
  }

  return sessions;
}

module.exports = {
  codexDir,
  sessionsDir,
  dbPath,
  readRolloutTail,
  readSessions
};
