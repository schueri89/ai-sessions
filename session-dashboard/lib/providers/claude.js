'use strict';

// Provider for Claude Code sessions (~/.claude/sessions/<pid>.json and ~/.claude/projects/*/*.jsonl).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { readTranscriptInfo, prune: pruneTranscripts } = require('../transcripts');
const { scanHistory } = require('../history');
const { resolveProject } = require('../project');

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
    return null;
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

function readLiveSessions() {
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

  const live = [...bySession.values()];
  pruneTranscripts(new Set(live.map((s) => s.sessionId)));

  return live.map((s) => {
    const info = readTranscriptInfo(s.sessionId);
    const title = info.title || s.registryName || s.sessionId.slice(0, 8);
    const project = resolveProject({
      cwd: s.cwd,
      title,
      lastPrompt: info.lastPrompt,
      hintProject: info.project
    });
    return {
      provider: 'claude',
      sessionId: s.sessionId,
      pid: s.pid,
      cwd: s.cwd,
      project,
      registryName: s.registryName,
      rawStatus: s.rawStatus,
      waitingFor: s.waitingFor,
      state: s.state,
      startedAt: info.startedAt || s.startedAt,
      statusUpdatedAt: s.state === 'busy' || s.state === 'waiting'
        ? s.statusUpdatedAt
        : (info.lastActivity || s.statusUpdatedAt),
      title,
      lastPrompt: info.lastPrompt,
      rateLimit: info.rateLimit || null,
      tokens: info.tokens || null,
      activity: s.state === 'busy' ? (info.activity || 'Arbeitet…') : ''
    };
  });
}

// Returns both live running sessions and historical/closed sessions.
async function readSessions() {
  const live = readLiveSessions();
  const liveIds = new Set(live.map((s) => s.sessionId));

  let historyEntries = [];
  try {
    const hist = await scanHistory();
    if (hist && hist.ok) historyEntries = hist.entries;
  } catch {}

  const closed = historyEntries
    .filter((h) => !liveIds.has(h.sessionId))
    .map((h) => ({
      provider: 'claude',
      sessionId: h.sessionId,
      pid: 0,
      cwd: h.cwd || h.entrypoint || '',
      project: h.project || resolveProject({ cwd: h.cwd || h.entrypoint || '', title: h.title, lastPrompt: h.lastPrompt }),
      registryName: h.title,
      rawStatus: 'closed',
      waitingFor: '',
      state: 'idle',
      startedAt: h.startedAt || 0,
      statusUpdatedAt: h.lastActivity,
      title: h.title,
      lastPrompt: h.lastPrompt,
      rateLimit: h.rateLimit || null,
      tokens: h.tokens || null
    }));

  return [...live, ...closed];
}

module.exports = {
  claudeDir,
  sessionsDir,
  readLiveSessions,
  readSessions
};
