'use strict';

// Extracts title and last prompt from a session transcript
// (~/.claude/projects/<slug>/<sessionId>.jsonl). Transcripts grow while a
// session works and reach several MB, so each file is read incrementally:
// only the bytes appended since the previous call are parsed.

const fs = require('fs');
const path = require('path');
const os = require('os');
const { resolveMaxContext } = require('./format');

function claudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

const INTERESTING = ['"custom-title"', '"ai-title"', '"agent-name"', '"last-prompt"', '"rate_limit"', '"quotaLimits"', '"type":"assistant"', '"timestamp"', '"usage"', '"cost-state"'];
const NEWLINE = 0x0a;

const cache = new Map(); // sessionId -> { file, offset, rest, customTitle, aiTitle, agentName, lastPrompt, rateLimit, startedAt, lastActivity }

function findTranscript(sessionId) {
  const root = path.join(claudeDir(), 'projects');
  let dirs;
  try {
    dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory());
  } catch {
    return null;
  }
  for (const d of dirs) {
    const file = path.join(root, d.name, `${sessionId}.jsonl`);
    if (fs.existsSync(file)) return file;
  }
  return null;
}

function emptyInfo() {
  return { customTitle: '', aiTitle: '', agentName: '', lastPrompt: '', rateLimit: null, startedAt: 0, lastActivity: 0, activity: '', project: '', tokens: null, model: '', totalCostUSD: null, totalLinesAdded: null, totalLinesRemoved: null };
}

function formatClaudeTool(c) {
  if (!c) return '';
  if (c.type === 'tool_use') {
    const name = c.name || '';
    const input = c.input || {};
    switch (name) {
      case 'Bash': {
        const cmd = (input.description || input.command || '').trim().replace(/\s+/g, ' ');
        return '🛠️ ' + (cmd.length > 55 ? cmd.slice(0, 53) + '…' : cmd);
      }
      case 'Read':
      case 'View': {
        const file = path.basename(input.file_path || input.path || '');
        return '📖 Liest ' + (file || 'Datei');
      }
      case 'Edit':
      case 'MultiEdit': {
        const file = path.basename(input.file_path || input.path || '');
        return '✏️ Bearbeitet ' + (file || 'Datei');
      }
      case 'Write': {
        const file = path.basename(input.file_path || input.path || '');
        return '📝 Erstellt ' + (file || 'Datei');
      }
      case 'Grep':
      case 'Glob': {
        const p = (input.pattern || '').trim();
        return '🔍 Sucht ' + (p.length > 35 ? p.slice(0, 33) + '…' : p);
      }
      case 'Skill': {
        return '⚡ Skill: ' + (input.skill || '');
      }
      default:
        return '🔧 ' + name;
    }
  }
  if (c.type === 'thinking') {
    return '🧠 Denkt nach…';
  }
  return '';
}

function titleOf(info) {
  return info.customTitle || info.aiTitle || info.agentName;
}

// Picks title, last prompt, rate-limit info and timestamps out of transcript lines; later lines win for last-*.
function applyLine(info, line) {
  if (!info.project) {
    const m = line.match(/[\\\/]webapps[\\\/]ROOT[\\\/]([a-zA-Z0-9_\-\.]+)/i);
    if (m) {
      const sub = m[1];
      if (!['WEB-INF', 'META-INF', 'lucee.code-workspace'].includes(sub)) {
        info.project = sub;
      }
    }
  }
  if (!INTERESTING.some((marker) => line.includes(marker))) return;
  let rec;
  try {
    rec = JSON.parse(line);
  } catch {
    return;
  }
  if (rec.timestamp) {
    const ts = Date.parse(rec.timestamp);
    if (!Number.isNaN(ts)) {
      if (!info.startedAt) info.startedAt = ts;
      if (rec.type === 'user' || rec.type === 'assistant' || rec.type === 'last-prompt') {
        info.lastActivity = ts;
      }
    }
  }
  switch (rec.type) {
    case 'custom-title':
      if (typeof rec.customTitle === 'string') info.customTitle = rec.customTitle;
      break;
    case 'ai-title':
      if (typeof rec.aiTitle === 'string') info.aiTitle = rec.aiTitle;
      break;
    case 'agent-name':
      if (typeof rec.agentName === 'string') info.agentName = rec.agentName;
      break;
    case 'last-prompt':
      if (typeof rec.lastPrompt === 'string') info.lastPrompt = rec.lastPrompt;
      info.activity = '⏳ Startet…';
      break;
    case 'cost-state':
      if (typeof rec.totalCostUSD === 'number' && !Number.isNaN(rec.totalCostUSD)) {
        info.totalCostUSD = rec.totalCostUSD;
      }
      if (typeof rec.totalLinesAdded === 'number' && !Number.isNaN(rec.totalLinesAdded)) {
        info.totalLinesAdded = rec.totalLinesAdded;
      }
      if (typeof rec.totalLinesRemoved === 'number' && !Number.isNaN(rec.totalLinesRemoved)) {
        info.totalLinesRemoved = rec.totalLinesRemoved;
      }
      break;
    case 'assistant':
      if (rec.error === 'rate_limit' || (rec.quotaLimits && rec.quotaLimits.status === 'rejected') || rec.apiErrorStatus === 429) {
        const resetsAt = (rec.quotaLimits && typeof rec.quotaLimits.resetsAt === 'number')
          ? rec.quotaLimits.resetsAt * 1000
          : null;
        const humanText = (rec.message && Array.isArray(rec.message.content) && rec.message.content[0] && rec.message.content[0].text)
          || "You've hit your session limit";
        info.rateLimit = { resetsAt, humanText };
        info.activity = '⏳ Limit erreicht';
      } else if (!rec.error && !rec.isApiErrorMessage) {
        info.rateLimit = null;
        if (rec.message && Array.isArray(rec.message.content)) {
          const lastTool = [...rec.message.content].reverse().find((c) => c.type === 'tool_use');
          if (lastTool) {
            info.activity = formatClaudeTool(lastTool);
          } else if (rec.message.content.some((c) => c.type === 'thinking')) {
            info.activity = '🧠 Denkt nach…';
          } else if (rec.message.content.some((c) => c.type === 'text')) {
            info.activity = '💬 Antwortet…';
          }
        }
        if (rec.message && typeof rec.message.model === 'string') {
          info.model = rec.message.model;
        }
        if (rec.message && rec.message.usage) {
          const u = rec.message.usage;
          const input = Number(u.input_tokens) || 0;
          const cacheCreation = Number(u.cache_creation_input_tokens) || 0;
          const cacheRead = Number(u.cache_read_input_tokens) || 0;
          const output = Number(u.output_tokens) || 0;
          const context = input + cacheCreation + cacheRead;
          const totalInput = input + cacheCreation + cacheRead;
          const cacheHitRate = totalInput > 0 ? Math.round((cacheRead / totalInput) * 100) : 0;
          const model = (rec.message && typeof rec.message.model === 'string' ? rec.message.model : '') || info.model || '';
          const maxContext = resolveMaxContext(model);
          info.tokens = {
            context,
            maxContext,
            percent: Math.min(100, Math.round((context / maxContext) * 100)),
            inputTokens: input,
            cacheCreationTokens: cacheCreation,
            cacheReadTokens: cacheRead,
            outputTokens: output,
            cacheHitRate,
            model
          };
        }
      }
      break;
  }
}

function readAppended(info) {
  let size;
  try {
    size = fs.statSync(info.file).size;
  } catch {
    return;
  }
  if (size < info.offset) {
    // File was rewritten: start over.
    Object.assign(info, { offset: 0, rest: Buffer.alloc(0) }, emptyInfo());
  }
  if (size === info.offset) return;

  const fd = fs.openSync(info.file, 'r');
  try {
    const chunk = Buffer.alloc(size - info.offset);
    fs.readSync(fd, chunk, 0, chunk.length, info.offset);
    info.offset = size;
    const buf = info.rest.length ? Buffer.concat([info.rest, chunk]) : chunk;
    // Only decode complete lines so multi-byte characters are never split.
    const lastNewline = buf.lastIndexOf(NEWLINE);
    if (lastNewline < 0) {
      info.rest = buf;
      return;
    }
    info.rest = buf.subarray(lastNewline + 1);
    for (const line of buf.subarray(0, lastNewline).toString('utf8').split('\n')) {
      if (line) applyLine(info, line);
    }
  } finally {
    fs.closeSync(fd);
  }
}

// Returns { title, lastPrompt, rateLimit, startedAt, lastActivity, activity, project }; empty strings/0 if the transcript does not exist (yet).
function readTranscriptInfo(sessionId) {
  let info = cache.get(sessionId);
  if (!info) {
    const file = findTranscript(sessionId);
    if (!file) return { title: '', lastPrompt: '', rateLimit: null, startedAt: 0, lastActivity: 0, activity: '', project: '' };
    info = { file, offset: 0, rest: Buffer.alloc(0), ...emptyInfo() };
    cache.set(sessionId, info);
  }
  readAppended(info);
  return {
    title: titleOf(info),
    lastPrompt: info.lastPrompt,
    rateLimit: info.rateLimit || null,
    startedAt: info.startedAt || 0,
    lastActivity: info.lastActivity || info.startedAt || 0,
    activity: info.activity || '',
    project: info.project || '',
    tokens: info.tokens || null,
    totalCostUSD: typeof info.totalCostUSD === 'number' ? info.totalCostUSD : null
  };
}

// Drops cache entries of sessions that are no longer running.
function prune(liveSessionIds) {
  for (const id of cache.keys()) {
    if (!liveSessionIds.has(id)) cache.delete(id);
  }
}

module.exports = { readTranscriptInfo, prune, emptyInfo, titleOf, applyLine };
