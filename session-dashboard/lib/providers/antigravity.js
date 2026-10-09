'use strict';

// Provider for Google Antigravity sessions (~/.gemini/antigravity/conversation_summaries.db).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { resolveProject } = require('../project');
const { resolveMaxContext } = require('../format');

const TRANSCRIPT_TAIL_BYTES = 64 * 1024;
// Step type of system error steps in conversations/<id>.db (transcript type "ERROR_MESSAGE").
const ERROR_STEP_TYPE = 17;
// How many trailing steps to inspect: a quota abort may end with retry attempts plus a final
// "Agent execution terminated due to error" step that no longer names the cause.
const ERROR_TAIL_STEPS = 12;
// Only sessions touched within this span are checked for a quota abort: opening every
// conversation database costs about a second at startup. Older aborts stay "idle" - their reset
// lies far behind, the longest quota window is 7 days.
const LIMIT_LOOKBACK_MS = 14 * 24 * 3600 * 1000;

let cachedDb = null;
let lastDbMtime = 0;
const limitCache = new Map(); // sessionId -> { mtime, result }

function antigravityDir() {
  return process.env.ANTIGRAVITY_APP_DATA_DIR || path.join(os.homedir(), '.gemini', 'antigravity');
}

function dbPath() {
  return path.join(antigravityDir(), 'conversation_summaries.db');
}

function presenceDir() {
  return path.join(antigravityDir(), 'presence');
}

function getDb() {
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

function parseIso(str) {
  if (!str) return 0;
  // Convert "2026-10-03 14:42:27.0162722+00:00" to ISO string parseable by Date
  const iso = str.replace(' ', 'T');
  return new Date(iso).getTime() || 0;
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
  const match = text.match(/<USER_REQUEST>([\s\S]*?)<\/USER_REQUEST>/i);
  if (match) {
    text = match[1];
  }
  return text.replace(/<[^>]+>/g, '').trim();
}

function unquote(val) {
  if (!val) return '';
  if (typeof val === 'string') {
    val = val.trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      try {
        return JSON.parse(val);
      } catch {
        return val.slice(1, -1);
      }
    }
  }
  return String(val);
}

function formatAntigravityTool(tc) {
  if (!tc) return '';
  const name = tc.name || '';
  const args = tc.args || {};
  const action = unquote(args.toolAction);
  const summary = unquote(args.toolSummary);
  if (action) return '⚡ ' + (action.length > 55 ? action.slice(0, 53) + '…' : action);
  if (summary) return '⚡ ' + (summary.length > 55 ? summary.slice(0, 53) + '…' : summary);
  switch (name) {
    case 'run_command': {
      const cmd = unquote(args.CommandLine).trim().replace(/\s+/g, ' ');
      return '🛠️ ' + (cmd.length > 55 ? cmd.slice(0, 53) + '…' : cmd);
    }
    case 'view_file': {
      const file = path.basename(unquote(args.AbsolutePath) || '');
      return '📖 Liest ' + (file || 'Datei');
    }
    case 'replace_file_content': {
      const file = path.basename(unquote(args.TargetFile) || '');
      return '✏️ Bearbeitet ' + (file || 'Datei');
    }
    case 'write_to_file': {
      const file = path.basename(unquote(args.TargetFile) || '');
      return '📝 Erstellt ' + (file || 'Datei');
    }
    case 'search_web': {
      const q = unquote(args.query);
      return '🔍 Websuche: ' + (q.length > 35 ? q.slice(0, 33) + '…' : q);
    }
    default:
      return '🔧 ' + name;
  }
}

function readTranscriptTail(sessionId) {
  const file = path.join(antigravityDir(), 'brain', sessionId, '.system_generated', 'logs', 'transcript.jsonl');
  if (!fs.existsSync(file)) return { lastPrompt: '', isWaiting: false, activity: '' };

  let fd = null;
  try {
    const stat = fs.statSync(file);
    const readLen = Math.min(stat.size, TRANSCRIPT_TAIL_BYTES);
    const buf = Buffer.alloc(readLen);
    fd = fs.openSync(file, 'r');
    fs.readSync(fd, buf, 0, readLen, stat.size - readLen);

    const lines = buf.toString('utf8').split('\n').filter(Boolean);
    let lastPrompt = '';
    let lastStep = null;
    let tokens = null;

    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const step = JSON.parse(lines[i]);
        if (!lastStep) lastStep = step;
        if (!lastPrompt && step.type === 'USER_INPUT' && step.content) {
          lastPrompt = cleanPrompt(step.content);
        }
        if (!tokens && step.type === 'PLANNER_RESPONSE' && (step.input_tokens !== undefined || step.cache_read_tokens !== undefined)) {
          const input = Number(step.input_tokens) || 0;
          const cacheRead = Number(step.cache_read_tokens) || 0;
          const output = Number(step.output_tokens) || 0;
          const context = input + cacheRead;
          const model = step.model || 'Gemini';
          const maxContext = resolveMaxContext(model);
          tokens = {
            context,
            maxContext,
            percent: Math.min(100, Math.round((context / maxContext) * 100)),
            inputTokens: input,
            cacheCreationTokens: 0,
            cacheReadTokens: cacheRead,
            outputTokens: output,
            model
          };
        }
        if (lastPrompt && lastStep && tokens) break;
      } catch {}
    }

    let isWaiting = false;
    let activity = '';
    if (lastStep && lastStep.type === 'PLANNER_RESPONSE') {
      if (Array.isArray(lastStep.tool_calls) && lastStep.tool_calls.length > 0) {
        if (lastStep.tool_calls.some((tc) => tc && tc.name === 'ask_question')) {
          isWaiting = true;
          activity = '❓ Wartet auf Auswahl…';
        } else {
          const lastTc = lastStep.tool_calls[lastStep.tool_calls.length - 1];
          activity = formatAntigravityTool(lastTc);
        }
      } else if (lastStep.thinking) {
        activity = '🧠 Denkt nach…';
      } else {
        activity = '💬 Antwortet…';
      }
    }

    return { lastPrompt, isWaiting, activity, rawLines: lines, tokens };
  } catch {
    return { lastPrompt: '', isWaiting: false, activity: '', rawLines: [], tokens: null };
  } finally {
    if (fd !== null) {
      try { fs.closeSync(fd); } catch {}
    }
  }
}

function fileMtime(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

// Detects a turn aborted by an exhausted quota (HTTP 429 RESOURCE_EXHAUSTED). Antigravity then
// reports the conversation as idle; the error step is reliably found only in
// conversations/<id>.db, transcript.jsonl may miss it. Returns { humanText } or null.
function readLimitError(sessionId) {
  const file = path.join(antigravityDir(), 'conversations', sessionId + '.db');
  const mtime = Math.max(fileMtime(file), fileMtime(file + '-wal'));
  if (!mtime) return null;
  const cached = limitCache.get(sessionId);
  if (cached && cached.mtime === mtime) return cached.result;

  let result = null;
  let db = null;
  try {
    db = new DatabaseSync(file, { readOnly: true });
    const steps = db.prepare('SELECT step_type, step_payload FROM steps ORDER BY idx DESC LIMIT ?').all(ERROR_TAIL_STEPS);
    for (const step of steps) {
      if (Number(step.step_type) !== ERROR_STEP_TYPE) break;
      const payload = step.step_payload ? Buffer.from(step.step_payload).toString('latin1') : '';
      if (payload.includes('RESOURCE_EXHAUSTED')) {
        result = {
          humanText: payload.includes('INSUFFICIENT_G1_CREDITS_BALANCE')
            ? 'Antigravity-Kontingent und AI-Credits aufgebraucht (429)'
            : 'Antigravity-Kontingent erschöpft (429)'
        };
        break;
      }
    }
  } catch {
    // Unreadable or locked: report no limit and retry on the next change.
    return null;
  } finally {
    if (db) {
      try { db.close(); } catch {}
    }
  }
  limitCache.set(sessionId, { mtime, result });
  return result;
}

// Returns active and historical Antigravity sessions.
async function readSessions() {
  const db = getDb();
  if (!db) return [];

  let rows;
  try {
    const stmt = db.prepare(`
      SELECT conversation_id, title, preview, status, not_fully_idle, killed, last_modified_time, last_user_input_time, workspace_uris
      FROM conversation_summaries
      WHERE killed = 0
      ORDER BY last_modified_time DESC
    `);
    rows = stmt.all();
  } catch {
    return [];
  }

  const now = Date.now();
  const sessions = [];

  for (const r of rows) {
    const sessionId = r.conversation_id;
    if (!sessionId) continue;

    const notFullyIdle = Number(r.not_fully_idle) === 1;
    const isRunning = r.status === 'CASCADE_RUN_STATUS_RUNNING';
    const statusUpdatedAt = parseIso(r.last_modified_time);
    const startedAt = parseIso(r.last_user_input_time);

    let state = 'idle';
    let waitingFor = '';
    let lastPrompt = '';
    let activity = '';
    let rawLines = [];
    let tokens = null;
    let rateLimit = null;

    if (notFullyIdle || isRunning) {
      const info = readTranscriptTail(sessionId);
      if (info.isWaiting) {
        state = 'waiting';
        waitingFor = 'Rückfrage';
      } else {
        state = 'busy';
      }
      lastPrompt = info.lastPrompt;
      activity = state === 'busy' ? (info.activity || 'Arbeitet…') : '';
      rawLines = info.rawLines || [];
      tokens = info.tokens || null;
    } else {
      state = 'idle';
      const info = readTranscriptTail(sessionId);
      lastPrompt = info.lastPrompt;
      rawLines = info.rawLines || [];
      tokens = info.tokens || null;
      const limitError = now - statusUpdatedAt < LIMIT_LOOKBACK_MS ? readLimitError(sessionId) : null;
      if (limitError) {
        // resetsAt is resolved later from the live quota (quota.resolveAntigravityReset).
        rateLimit = { resetsAt: 0, humanText: limitError.humanText, blockedAt: statusUpdatedAt };
      }
    }

    if (!lastPrompt && r.preview) {
      lastPrompt = cleanPrompt(r.preview);
    }

    let workspaces = [];
    try {
      workspaces = JSON.parse(r.workspace_uris || '[]');
    } catch {}

    const primaryCwd = workspaces.length > 0 ? decodeWorkspaceUri(workspaces[0]) : '';
    const title = r.title || cleanPrompt(r.preview) || sessionId.slice(0, 8);
    const project = resolveProject({
      cwd: primaryCwd,
      workspaces,
      title,
      lastPrompt,
      rawLines
    });

    sessions.push({
      provider: 'antigravity',
      sessionId,
      pid: 0,
      cwd: primaryCwd,
      project,
      registryName: r.title || '',
      rawStatus: r.status || '',
      waitingFor,
      state,
      startedAt,
      statusUpdatedAt,
      title,
      lastPrompt: lastPrompt || '',
      activity,
      workspaces,
      rateLimit,
      tokens: tokens || null
    });
  }

  return sessions;
}

module.exports = {
  antigravityDir,
  dbPath,
  presenceDir,
  readSessions
};
