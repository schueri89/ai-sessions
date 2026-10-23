'use strict';

// Lists all session transcripts (~/.claude/projects/*/<sessionId>.jsonl),
// including those of sessions that are no longer running. Transcripts reach
// tens of MB, so only their head (entrypoint, first prompt) and tail (latest
// title and last prompt; Claude Code re-appends the title regularly) are read.
// Results are cached per file and reused while size and mtime are unchanged.

const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { emptyInfo, titleOf, applyLine } = require('./transcripts');
const { resolveProject } = require('./project');

function claudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

const SESSION_FILE = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i;
const HEAD_BYTES = 64 * 1024;
const TAIL_BYTES = 256 * 1024;

const cache = new Map(); // file -> { size, mtimeMs, entry }

async function readRange(handle, start, length) {
  const buf = Buffer.alloc(length);
  const { bytesRead } = await handle.read(buf, 0, length, start);
  return buf.subarray(0, bytesRead).toString('utf8');
}

// Complete lines of a chunk; a chunk not starting at offset 0 or not ending
// at EOF has a cut line at that edge, which is dropped.
function wholeLines(text, startsAtZero, endsAtEof) {
  const lines = text.split('\n');
  if (!startsAtZero) lines.shift();
  if (!endsAtEof) lines.pop();
  return lines.filter(Boolean);
}

function userText(rec) {
  if (rec.type !== 'user' || rec.isMeta || rec.isSidechain) return '';
  const content = rec.message && rec.message.content;
  let text = '';
  if (typeof content === 'string') text = content;
  else if (Array.isArray(content)) {
    const part = content.find((c) => c && c.type === 'text' && typeof c.text === 'string');
    text = part ? part.text : '';
  }
  text = text.trim();
  return text.startsWith('<') ? '' : text; // skip injected system/command blocks
}

async function readEntry(file, sessionId, size, mtimeMs, options = {}) {
  const handle = await fsp.open(file, 'r');
  try {
    // Small files are read whole; larger ones as separate head and tail.
    const whole = size <= HEAD_BYTES + TAIL_BYTES;
    const headLen = whole ? size : HEAD_BYTES;
    const head = wholeLines(await readRange(handle, 0, headLen), true, whole);
    const tail = whole
      ? []
      : wholeLines(await readRange(handle, size - TAIL_BYTES, TAIL_BYTES), false, true);

    const info = emptyInfo();
    let entrypoint = '';
    let cwd = '';
    let firstPrompt = '';
    for (const line of head) {
      applyLine(info, line);
      if (entrypoint && cwd && firstPrompt) continue;
      try {
        const rec = JSON.parse(line);
        if (!entrypoint && typeof rec.entrypoint === 'string') entrypoint = rec.entrypoint;
        if (!cwd && typeof rec.cwd === 'string') cwd = rec.cwd;
        if (!firstPrompt) firstPrompt = userText(rec);
      } catch {
        // ignore malformed line
      }
    }
    for (const line of tail) applyLine(info, line);

    const title = titleOf(info) || info.lastPrompt || firstPrompt;
    if (!title) return null; // session without a single prompt

    const project = resolveProject({
      cwd: cwd || entrypoint,
      title,
      lastPrompt: info.lastPrompt || firstPrompt,
      rawLines: [...head, ...tail],
      hintProject: info.project,
      detectionMode: options.detectionMode || 'auto'
    });

    return {
      sessionId,
      entrypoint: cwd || entrypoint,
      cwd: cwd || entrypoint,
      project,
      title: title.split('\n')[0].slice(0, 120),
      lastPrompt: info.lastPrompt || firstPrompt,
      lastActivity: info.lastActivity || info.startedAt || mtimeMs,
      startedAt: info.startedAt || mtimeMs,
      rateLimit: info.rateLimit || null,
      tokens: info.tokens || null,
      totalCostUSD: typeof info.totalCostUSD === 'number' ? info.totalCostUSD : null,
      totalLinesAdded: typeof info.totalLinesAdded === 'number' ? info.totalLinesAdded : null,
      totalLinesRemoved: typeof info.totalLinesRemoved === 'number' ? info.totalLinesRemoved : null
    };
  } finally {
    await handle.close();
  }
}

// Returns { ok, entries }. ok is false if the projects folder could not be
// read at all, so callers do not mistake a read error for "no sessions".
async function scanHistory(options = {}) {
  const root = path.join(claudeDir(), 'projects');
  let dirs;
  try {
    dirs = (await fsp.readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory());
  } catch {
    return { ok: false, entries: [] };
  }
  const seen = new Set();
  const entries = [];
  const modeKey = options.detectionMode || 'auto';
  for (const d of dirs) {
    let names;
    try {
      names = await fsp.readdir(path.join(root, d.name));
    } catch {
      continue;
    }
    for (const name of names) {
      const match = SESSION_FILE.exec(name);
      if (!match) continue;
      const file = path.join(root, d.name, name);
      seen.add(file);
      try {
        const st = await fsp.stat(file);
        const cacheKey = file + ':' + modeKey;
        let cached = cache.get(cacheKey);
        if (!cached || cached.size !== st.size || cached.mtimeMs !== st.mtimeMs) {
          cached = { size: st.size, mtimeMs: st.mtimeMs, entry: await readEntry(file, match[1], st.size, st.mtimeMs, options) };
          cache.set(cacheKey, cached);
        }
        if (cached.entry) entries.push(cached.entry);
      } catch {
        // file vanished or is locked: skip this round
      }
    }
  }
  for (const file of cache.keys()) {
    if (!seen.has(file)) cache.delete(file);
  }
  return { ok: true, entries };
}

module.exports = { scanHistory };
