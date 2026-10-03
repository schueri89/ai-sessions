'use strict';

// Extracts title and last prompt from a session transcript
// (~/.claude/projects/<slug>/<sessionId>.jsonl). Transcripts grow while a
// session works and reach several MB, so each file is read incrementally:
// only the bytes appended since the previous call are parsed.

const fs = require('fs');
const path = require('path');
const os = require('os');

function claudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

const INTERESTING = ['"custom-title"', '"ai-title"', '"agent-name"', '"last-prompt"'];
const NEWLINE = 0x0a;

const cache = new Map(); // sessionId -> { file, offset, rest, customTitle, aiTitle, agentName, lastPrompt }

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
  return { customTitle: '', aiTitle: '', agentName: '', lastPrompt: '' };
}

function titleOf(info) {
  return info.customTitle || info.aiTitle || info.agentName;
}

// Picks title and last prompt out of one transcript line; later lines win.
function applyLine(info, line) {
  if (!INTERESTING.some((marker) => line.includes(marker))) return;
  let rec;
  try {
    rec = JSON.parse(line);
  } catch {
    return;
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

// Returns { title, lastPrompt }; empty strings if the transcript does not exist (yet).
function readTranscriptInfo(sessionId) {
  let info = cache.get(sessionId);
  if (!info) {
    const file = findTranscript(sessionId);
    if (!file) return { title: '', lastPrompt: '' };
    info = { file, offset: 0, rest: Buffer.alloc(0), ...emptyInfo() };
    cache.set(sessionId, info);
  }
  readAppended(info);
  return { title: titleOf(info), lastPrompt: info.lastPrompt };
}

// Drops cache entries of sessions that are no longer running.
function prune(liveSessionIds) {
  for (const id of cache.keys()) {
    if (!liveSessionIds.has(id)) cache.delete(id);
  }
}

module.exports = { readTranscriptInfo, prune, emptyInfo, titleOf, applyLine };
