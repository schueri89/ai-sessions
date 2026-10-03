'use strict';

// Reads Claude Code's session registry (~/.claude/sessions/<pid>.json).
// The format is internal to Claude Code, so every field is treated as optional.

const fs = require('fs');
const os = require('os');
const path = require('path');

function claudeDir() {
  return process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
}

function sessionsDir() {
  return path.join(claudeDir(), 'sessions');
}

function isAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: the process exists but belongs to someone else.
    return err.code === 'EPERM';
  }
}

function toState(raw) {
  if (raw.waitingFor || raw.status === 'waiting') return 'waiting';
  if (raw.status === 'busy') return 'busy';
  return 'idle';
}

function readEntry(file) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null; // half-written or foreign file
  }
  if (!raw || typeof raw.sessionId !== 'string') return null;
  if (raw.spare === true || raw.parkedJobId !== undefined) return null;
  if (raw.kind !== undefined && raw.kind !== 'interactive') return null;
  if (!isAlive(raw.pid)) return null;
  return {
    sessionId: raw.sessionId,
    pid: raw.pid,
    cwd: typeof raw.cwd === 'string' ? raw.cwd : '',
    registryName: typeof raw.name === 'string' ? raw.name : '',
    rawStatus: typeof raw.status === 'string' ? raw.status : '',
    waitingFor: typeof raw.waitingFor === 'string' ? raw.waitingFor : '',
    state: toState(raw),
    startedAt: Number(raw.startedAt) || 0,
    statusUpdatedAt: Number(raw.statusUpdatedAt) || Number(raw.updatedAt) || 0
  };
}

// Returns the live interactive sessions; one entry per sessionId (newest wins).
function readSessions() {
  const dir = sessionsDir();
  let files;
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  const bySession = new Map();
  for (const f of files) {
    const entry = readEntry(path.join(dir, f));
    if (!entry) continue;
    const known = bySession.get(entry.sessionId);
    if (!known || entry.statusUpdatedAt > known.statusUpdatedAt) bySession.set(entry.sessionId, entry);
  }
  return [...bySession.values()];
}

module.exports = { claudeDir, sessionsDir, readSessions };
