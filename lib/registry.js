'use strict';

// Aggregator for all session providers (Claude Code, Google Antigravity).

const fs = require('fs');
const path = require('path');
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
    const agWal = path.join(antigravity.antigravityDir(), 'conversation_summaries.db-wal');
    if (fs.existsSync(agWal)) targets.push(agWal);
  } catch {}
  try {
    targets.push(copilot.dbPath());
    const cpWal = path.join(copilot.copilotDir(), 'session-store.db-wal');
    if (fs.existsSync(cpWal)) targets.push(cpWal);
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
