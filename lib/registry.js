'use strict';

// Aggregator for all session providers (Claude Code, Google Antigravity).

const fs = require('fs');
const path = require('path');
const claude = require('./providers/claude');
const antigravity = require('./providers/antigravity');
const copilot = require('./providers/copilot');
const codex = require('./providers/codex');
const { getQuotaSummary } = require('./quota');

async function readSessions(enabledProviders = {}, options = {}) {
  const claudeEnabled = enabledProviders.claude !== false;
  const agEnabled = enabledProviders.antigravity !== false;
  const cpEnabled = enabledProviders.copilot !== false;
  const cxEnabled = enabledProviders.codex !== false;

  const tasks = [];
  if (claudeEnabled) {
    tasks.push(claude.readSessions(options).catch((err) => { console.error('[session-dashboard] Claude readSessions failed:', err); return []; }));
  }
  if (agEnabled) {
    tasks.push(antigravity.readSessions(options).catch((err) => { console.error('[session-dashboard] Antigravity readSessions failed:', err); return []; }));
  }
  if (cpEnabled) {
    tasks.push(copilot.readSessions(options).catch((err) => { console.error('[session-dashboard] Copilot readSessions failed:', err); return []; }));
  }
  if (cxEnabled) {
    tasks.push(codex.readSessions(options).catch((err) => { console.error('[session-dashboard] Codex readSessions failed:', err); return []; }));
  }

  const results = await Promise.all(tasks);
  return results.flat();
}

function watchTargets(enabledProviders = {}) {
  const claudeEnabled = enabledProviders.claude !== false;
  const agEnabled = enabledProviders.antigravity !== false;
  const cpEnabled = enabledProviders.copilot !== false;
  const cxEnabled = enabledProviders.codex !== false;

  const targets = [];
  if (claudeEnabled) {
    try {
      targets.push(claude.sessionsDir());
    } catch {}
  }
  if (agEnabled) {
    try {
      targets.push(antigravity.dbPath());
      const agWal = path.join(antigravity.antigravityDir(), 'conversation_summaries.db-wal');
      if (fs.existsSync(agWal)) targets.push(agWal);
    } catch {}
  }
  if (cpEnabled) {
    try {
      targets.push(copilot.dbPath());
      const cpWal = path.join(copilot.copilotDir(), 'session-store.db-wal');
      if (fs.existsSync(cpWal)) targets.push(cpWal);
    } catch {}
  }
  if (cxEnabled) {
    try {
      const cPath = codex.dbPath();
      targets.push(cPath);
      const cxWal = cPath + '-wal';
      if (fs.existsSync(cxWal)) targets.push(cxWal);
      const sDir = codex.sessionsDir();
      if (fs.existsSync(sDir)) targets.push(sDir);
    } catch {}
  }
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
  copilotDbPath: copilot.dbPath,
  codexDir: codex.codexDir,
  codexDbPath: codex.dbPath
};
