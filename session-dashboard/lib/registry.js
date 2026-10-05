'use strict';

// Aggregator for all session providers (Claude Code, Google Antigravity).

const claude = require('./providers/claude');
const antigravity = require('./providers/antigravity');
const copilot = require('./providers/copilot');
const { getQuotaSummary } = require('./quota');

async function readSessions() {
  const [claudeSessions, antigravitySessions, copilotSessions] = await Promise.all([
    claude.readSessions().catch((err) => { console.error('[session-dashboard] Claude readSessions failed:', err); return []; }),
    antigravity.readSessions().catch((err) => { console.error('[session-dashboard] Antigravity readSessions failed:', err); return []; }),
    copilot.readSessions().catch((err) => { console.error('[session-dashboard] Copilot readSessions failed:', err); return []; })
  ]);
  return [...claudeSessions, ...antigravitySessions, ...copilotSessions];
}

function watchTargets() {
  const targets = [];
  try {
    targets.push(claude.sessionsDir());
  } catch {}
  try {
    targets.push(antigravity.dbPath());
  } catch {}
  try {
    targets.push(copilot.dbPath());
  } catch {}
  return targets;
}

module.exports = {
  readSessions,
  watchTargets,
  getQuotaSummary,
  // Backward compatibility exports for Claude Code helpers (transcripts.js, history.js)
  claudeDir: claude.claudeDir,
  sessionsDir: claude.sessionsDir,
  antigravityDir: antigravity.antigravityDir,
  antigravityDbPath: antigravity.dbPath,
  copilotDir: copilot.copilotDir,
  copilotDbPath: copilot.dbPath
};
