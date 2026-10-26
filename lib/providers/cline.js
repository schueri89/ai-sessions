'use strict';

// Provider for Cline sessions (~/.cline/data/db/sessions.db and ~/.cline/data/sessions/).

const fs = require('fs');
const path = require('path');
const os = require('os');
const { DatabaseSync } = require('node:sqlite');
const { resolveProject } = require('../project');
const { resolveMaxContext } = require('../format');

const BUSY_MAX_AGE_MS = 30 * 60 * 1000;
const WAITING_MAX_AGE_MS = 12 * 60 * 60 * 1000;

let cachedDb = null;
let lastDbMtime = 0;

function clineDir() {
  return process.env.CLINE_DIR || path.join(os.homedir(), '.cline');
}

function dataDir() {
  return process.env.CLINE_DATA_DIR || path.join(clineDir(), 'data');
}

function dbPath() {
  return path.join(dataDir(), 'db', 'sessions.db');
}

function sessionsDir() {
  return path.join(dataDir(), 'sessions');
}

function fileMtime(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

function getDb() {
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
  // Strip XML-style wrappers Cline uses (e.g. <user_input mode="act">...</user_input> or <task>...</task>)
  str = str.replace(/<user_input[^>]*>([\s\S]*?)<\/user_input>/gi, '$1');
  str = str.replace(/<task>([\s\S]*?)<\/task>/gi, '$1');
  return str.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

const INTENT_REGEX = /^(kannst|könntest|wie|warum|was|wer|wo|wann|welche|welcher|welches|bitte|erstelle|erzeuge|baue|schreibe|prüfe|zeige|mache|mach|hilf|erkläre|finde|suche|optimiere|korrigiere|repariere|behebe|aktualisiere|ändere|implementiere|can|could|how|why|what|who|where|when|which|please|create|build|write|check|show|make|help|explain|find|search|optimize|fix|update|change|implement)\b/i;

function cleanClineTitle(rawTitle, rawPrompt) {
  const normTitle = (rawTitle || '').trim();
  const normPrompt = (rawPrompt || '').trim();

  // If rawTitle was manually customized or differs from the prompt prefix, use rawTitle
  let source = normPrompt || normTitle;
  if (normTitle && !normTitle.includes('\n') && normPrompt && !normPrompt.startsWith(normTitle.slice(0, 20))) {
    source = normTitle;
  }

  if (!source) return '';

  source = source.replace(/<[^>]+>/g, ' ');
  source = source.replace(/^[#*>\-\s]+/, '');

  const lines = source.split(/\r?\n/).map((l) => l.trim().replace(/^[#*>\-\s]+/, '')).filter(Boolean);
  if (lines.length === 0) return '';

  let pickedLine = lines[0];
  if (!INTENT_REGEX.test(pickedLine) && lines.length > 1) {
    for (let i = 1; i < lines.length; i++) {
      if (INTENT_REGEX.test(lines[i])) {
        pickedLine = lines[i];
        break;
      }
    }
  }

  let clean = pickedLine.replace(/\s+/g, ' ').trim();
  const MAX_LEN = 65;
  if (clean.length > MAX_LEN) {
    const cut = clean.slice(0, MAX_LEN);
    const lastSpace = cut.lastIndexOf(' ');
    if (lastSpace > 35) {
      clean = cut.slice(0, lastSpace) + '…';
    } else {
      clean = cut + '…';
    }
  }
  return clean;
}

function formatTool(name, payload) {
  if (!name) return '';
  const n = String(name).toLowerCase();
  if (n.includes('command') || n.includes('exec') || n.includes('bash') || n.includes('terminal')) {
    const cmd = payload?.command || payload?.cmd || payload?.CommandLine || '';
    const cleanCmd = String(cmd).trim().replace(/\s+/g, ' ');
    return '🛠️ ' + (cleanCmd ? (cleanCmd.length > 45 ? cleanCmd.slice(0, 43) + '…' : cleanCmd) : 'Befehl ausführen');
  }
  if (n.includes('read') || n.includes('view')) {
    const file = path.basename(payload?.path || payload?.file || payload?.filePath || '');
    return '📖 Liest ' + (file || 'Datei');
  }
  if (n.includes('write') || n.includes('edit') || n.includes('replace') || n.includes('patch')) {
    const file = path.basename(payload?.path || payload?.file || payload?.filePath || '');
    return '✏️ Bearbeitet ' + (file || 'Datei');
  }
  if (n.includes('search') || n.includes('find') || n.includes('grep')) {
    return '🔍 Sucht im Code…';
  }
  if (n.includes('browser')) {
    return '🌐 Browser…';
  }
  return '🔧 ' + name;
}

function inspectSessionMessages(messagesPath) {
  if (!messagesPath || !fs.existsSync(messagesPath)) {
    return { firstPrompt: '', lastPrompt: '', activity: '', isWaiting: false, waitingReason: '', lastEventTime: 0 };
  }

  try {
    const content = fs.readFileSync(messagesPath, 'utf8');
    const data = JSON.parse(content);
    const msgs = Array.isArray(data.messages) ? data.messages : [];
    if (msgs.length === 0) {
      return { firstPrompt: '', lastPrompt: '', activity: '', isWaiting: false, waitingReason: '', lastEventTime: 0 };
    }

    let firstPrompt = '';
    let lastPrompt = '';
    let activity = '';
    let isWaiting = false;
    let waitingReason = '';
    let lastEventTime = 0;

    for (let i = 0; i < msgs.length; i++) {
      const m = msgs[i];
      if (m.ts && m.ts > lastEventTime) {
        lastEventTime = m.ts;
      }
      if (m.role === 'user' && Array.isArray(m.content)) {
        for (const c of m.content) {
          if (c.type === 'text' && c.text) {
            if (!firstPrompt) firstPrompt = c.text;
            lastPrompt = cleanPrompt(c.text);
            break;
          }
        }
      }
    }

    const lastMsg = msgs[msgs.length - 1];
    if (lastMsg) {
      if (lastMsg.role === 'assistant' && Array.isArray(lastMsg.content) && lastMsg.content.length > 0) {
        const lastBlock = lastMsg.content[lastMsg.content.length - 1];
        if (lastBlock.type === 'tool_use') {
          // Check if followed by tool_result (here lastMsg is the last item, so no tool_result yet)
          activity = formatTool(lastBlock.name, lastBlock.input);
          isWaiting = true;
          waitingReason = 'Freigabe nötig';
        } else if (lastBlock.type === 'thinking') {
          activity = '💭 Denkt nach…';
        } else if (lastBlock.type === 'text') {
          activity = '✍️ Antwortet…';
        }
      } else if (lastMsg.type === 'ask' || lastMsg.ask === 'followup') {
        isWaiting = true;
        waitingReason = 'Rückfrage';
      }
    }

    return { firstPrompt, lastPrompt, activity, isWaiting, waitingReason, lastEventTime };
  } catch {
    return { firstPrompt: '', lastPrompt: '', activity: '', isWaiting: false, waitingReason: '', lastEventTime: 0 };
  }
}

async function readSessions(options = {}) {
  const db = getDb();
  if (!db) return [];

  let rows = [];
  try {
    rows = db.prepare(`
      SELECT session_id, source, pid, started_at, ended_at, exit_code, status,
             provider, model, cwd, workspace_root, prompt, metadata_json,
             messages_path, updated_at
      FROM sessions
      ORDER BY updated_at DESC
    `).all();
  } catch {
    return [];
  }

  const now = Date.now();
  const sessions = [];

  for (const r of rows) {
    const sessionId = r.session_id;
    if (!sessionId) continue;

    let meta = {};
    try {
      meta = JSON.parse(r.metadata_json || '{}');
    } catch {}

    const cwd = normalizePath(r.cwd || r.workspace_root || '');
    const modelName = r.model || meta.modelId || 'gemma4:26b';
    const startedAt = r.started_at ? Date.parse(r.started_at) : now;

    let messagesFile = r.messages_path;
    if (!messagesFile || !fs.existsSync(messagesFile)) {
      const fallbackFile = path.join(sessionsDir(), sessionId, `${sessionId}.messages.json`);
      if (fs.existsSync(fallbackFile)) {
        messagesFile = fallbackFile;
      }
    }

    const inspection = inspectSessionMessages(messagesFile);
    // Prioritize the actual message event time (user input / assistant turn).
    // Cline's DB updated_at gets overwritten by background reconcilers (e.g. stale_session_reconciler
    // marking PID exit on VS Code restarts), which produces false "active 2 min ago" timestamps.
    const updatedAt = inspection.lastEventTime || (r.ended_at ? Date.parse(r.ended_at) : (r.updated_at ? Date.parse(r.updated_at) : startedAt));

    const age = now - updatedAt;
    const dbStatus = (r.status || 'idle').toLowerCase();

    let state = 'idle';
    let waitingFor = '';
    let activity = '';

    if (dbStatus === 'running') {
      if (inspection.isWaiting && age <= WAITING_MAX_AGE_MS) {
        state = 'waiting';
        waitingFor = inspection.waitingReason || 'Freigabe nötig';
      } else if (age <= BUSY_MAX_AGE_MS) {
        state = 'busy';
        activity = inspection.activity || 'Arbeitet…';
      } else {
        state = 'idle';
      }
    } else if (dbStatus === 'pending') {
      if (age <= BUSY_MAX_AGE_MS) {
        state = 'busy';
        activity = 'Startet…';
      } else {
        state = 'idle';
      }
    } else {
      // idle, completed, stopped, failed, cancelled
      state = 'idle';
    }

    const title = cleanClineTitle(meta.title, inspection.firstPrompt || r.prompt) || sessionId.slice(0, 8);
    const lastPrompt = inspection.lastPrompt || cleanPrompt(r.prompt || meta.title || '');

    const project = resolveProject({
      cwd,
      title,
      lastPrompt,
      workspaces: cwd ? [cwd] : [],
      detectionMode: options.detectionMode || 'auto'
    });

    const maxContext = resolveMaxContext(modelName);
    const usage = meta.usage || meta.aggregateUsage || {};
    const input = Number(usage.inputTokens) || Number(meta.tokensIn) || 0;
    const output = Number(usage.outputTokens) || Number(meta.tokensOut) || 0;
    const cacheRead = Number(usage.cacheReadTokens) || Number(meta.cacheReads) || 0;
    const cacheWrite = Number(usage.cacheWriteTokens) || Number(meta.cacheWrites) || 0;
    const context = input + cacheRead;
    const totalInput = input + cacheRead;
    const cacheHitRate = totalInput > 0 ? Math.round((cacheRead / totalInput) * 100) : 0;
    const percent = maxContext > 0 ? Math.min(100, Math.round((context / maxContext) * 100)) : 0;

    const tokens = {
      context,
      maxContext,
      percent,
      inputTokens: input,
      cacheCreationTokens: cacheWrite,
      cacheReadTokens: cacheRead,
      outputTokens: output,
      cacheHitRate,
      model: modelName
    };

    const totalCost = typeof meta.totalCost === 'number' ? meta.totalCost : 0;

    sessions.push({
      provider: 'cline',
      sessionId,
      pid: Number(r.pid) || 0,
      cwd,
      project,
      registryName: 'Cline',
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
      totalCostUSD: totalCost,
      messagesPath: messagesFile || ''
    });
  }

  return sessions;
}

module.exports = {
  clineDir,
  dataDir,
  dbPath,
  sessionsDir,
  cleanClineTitle,
  readSessions
};

