'use strict';

// Aggregator for all session providers (Claude Code, Google Antigravity).

const claude = require('./providers/claude');
const antigravity = require('./providers/antigravity');

async function readSessions() {
  const [claudeSessions, antigravitySessions] = await Promise.all([
    claude.readSessions(),
    antigravity.readSessions()
  ]);
  return [...claudeSessions, ...antigravitySessions];
}

function watchTargets() {
  const targets = [];
  try {
    targets.push(claude.sessionsDir());
  } catch {}
  try {
    targets.push(antigravity.dbPath());
  } catch {}
  return targets;
}

module.exports = {
  readSessions,
  watchTargets,
  // Backward compatibility exports for Claude Code helpers (transcripts.js, history.js)
  claudeDir: claude.claudeDir,
  sessionsDir: claude.sessionsDir,
  antigravityDir: antigravity.antigravityDir,
  antigravityDbPath: antigravity.dbPath
};
