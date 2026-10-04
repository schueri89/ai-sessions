'use strict';

// Provider for Google Antigravity sessions (~/.gemini/antigravity/conversation_summaries.db).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const { resolveProject } = require('../project');
const { resolveMaxContext } = require('../format');

const RECENT_IDLE_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours for idle vs closed
const TRANSCRIPT_TAIL_BYTES = 64 * 1024;

let cachedDb = null;
let lastDbMtime = 0;

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
      LIMIT 250
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
      if ((now - statusUpdatedAt) > RECENT_IDLE_WINDOW_MS) {
        state = 'closed';
      }
      // For recent idle sessions, check transcript for prompt; for older ones preview is enough
      if (state === 'idle') {
        const info = readTranscriptTail(sessionId);
        lastPrompt = info.lastPrompt;
        rawLines = info.rawLines || [];
        tokens = info.tokens || null;
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
      rateLimit: null,
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
