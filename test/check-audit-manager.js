'use strict';

const assert = require('assert');
const { AuditManager } = require('../lib/auditManager');

console.log('Testing AuditManager...');

const manager = new AuditManager({});

// 1. Projects discovery
const projects = manager.getProjects();
assert(Array.isArray(projects), 'getProjects should return an array');
assert(projects.includes('cf-shared'), 'projects should include cf-shared');
assert(projects.includes('ai-sessions'), 'projects should include ai-sessions');
console.log(`✓ getProjects found ${projects.length} projects`);

// 2. parseReportStatus test
const sampleReportClean = `
# Audit-Report: test
Modus: \`review\` | Modell: \`gemma4:26b\`

## 🔍 2. Code Review
APPROVED
Keine Sicherheitsrisiken festgestellt.
`;
const statusClean = manager.parseReportStatus(sampleReportClean);
assert.strictEqual(statusClean.status, 'passed', 'Status should be passed');
assert.strictEqual(statusClean.mode, 'review', 'Mode should be review');
assert.strictEqual(statusClean.model, 'gemma4:26b', 'Model should be gemma4:26b');

const sampleReportFull = `
# Audit-Report: test-full
Modus: \`review (Komplett)\` | Modell: \`gemma4:26b\`

## 🔍 2. Code Review
APPROVED
Keine Auffälligkeiten im gesamten Projektcode festgestellt.
`;
const statusCleanFull = manager.parseReportStatus(sampleReportFull);
assert.strictEqual(statusCleanFull.status, 'passed', 'Status should be passed');
assert.strictEqual(statusCleanFull.mode, 'review (Komplett)', 'Mode should be review (Komplett)');
assert.strictEqual(statusCleanFull.model, 'gemma4:26b', 'Model should be gemma4:26b');

const sampleReportWarning = `
# Audit-Report: test
Modus: \`all\` | Modell: \`gemma4:26b\`

## 🔍 2. Code Review
WARNUNG: Fehlender Scope
`;
const statusWarn = manager.parseReportStatus(sampleReportWarning);
assert.strictEqual(statusWarn.status, 'warning', 'Status should be warning');

const sampleReportError = `
# Audit-Report: test
Modus: \`security\` | Modell: \`gemma4:26b\`

## 🛡️ 3. Security Audit
CRITICAL: SQL-Injection without cfqueryparam
`;
const statusErr = manager.parseReportStatus(sampleReportError);
assert.strictEqual(statusErr.status, 'error', 'Status should be error');
console.log('✓ parseReportStatus accurately classifies passed, warning, and error states');

// 3. getAuditOverview & time formatting
const formattedDate = manager.formatGermanDate(Date.now());
assert(!/:\d{2}:\d{2}/.test(formattedDate), `formatGermanDate should not contain seconds: ${formattedDate}`);
assert(/\b\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}\b/.test(formattedDate), `formatGermanDate should match DD.MM.YYYY HH:mm: ${formattedDate}`);

const overview = manager.getAuditOverview();
assert(overview && typeof overview === 'object', 'overview should be an object');
assert(Array.isArray(overview.projects), 'overview.projects should be an array');
assert(overview.scheduledTask && typeof overview.scheduledTask === 'object', 'scheduledTask should be present');
assert(typeof overview.scheduledTask.isRegistered === 'boolean', 'isRegistered should be a boolean');
assert.strictEqual(overview.scheduledTask.taskName, 'DevBox-Nightly-Audit', 'taskName should match');
if (overview.scheduledTask.nextRun) {
  assert(!/:\d{2}:\d{2}/.test(overview.scheduledTask.nextRun), `nextRun should not contain seconds: ${overview.scheduledTask.nextRun}`);
}
const cfShared = overview.projects.find((p) => p.project === 'cf-shared');
assert(cfShared, 'cf-shared should be present in overview');
assert(typeof cfShared.status === 'string', 'status should be a string');

// Test runningMode with diff: 'full'
manager.runningProjects.set('cf-shared', { mode: 'security', diff: 'full', startTime: Date.now(), process: null });
const runningOverview = manager.getAuditOverview();
const runningCfShared = runningOverview.projects.find((p) => p.project === 'cf-shared');
assert(runningCfShared && runningCfShared.isRunning, 'cf-shared should be marked running');
assert.strictEqual(runningCfShared.runningMode, 'security (Komplett)', 'runningMode should reflect full scan');
manager.runningProjects.delete('cf-shared');

console.log(`✓ getAuditOverview returned ${overview.projects.length} project status entries (task registered: ${overview.scheduledTask.isRegistered})`);

// 4. buildPrompt test
const promptProj = manager.buildPrompt('cf-shared', 'C:/reports/2026-11-01_cf-shared_audit.md');
assert(promptProj.includes('das Projekt cf-shared'), 'prompt should reference project');
assert(promptProj.includes('cf-shared/.agents/project-context.md'), 'prompt should reference project-context.md');
assert(promptProj.includes('.agents/global-core.md'), 'prompt should reference global-core.md');
assert(promptProj.includes('C:/reports/2026-11-01_cf-shared_audit.md'), 'prompt should include report path');
assert(promptProj.includes('Erstelle bei Bedarf einen Implementierungsplan'), 'prompt should include step 3');
assert(promptProj.includes('Halte dich dabei strikt an das globale Regelwerk'), 'prompt should include step 4');

const promptWs = manager.buildPrompt('workspace', 'C:/reports/workspace_guards.md');
assert(promptWs.includes('Workspace Guards'), 'prompt should reference Workspace Guards');
assert(!promptWs.includes('project-context.md'), 'workspace prompt should not reference specific project-context.md');
console.log('✓ buildPrompt generates correct prompts adhering to user guidelines');

// 5. dispatchAuditPrompt test (pure mode without vscode) & auto-quittieren
manager.dispatchAuditPrompt('antigravity', 'cf-shared', __filename).then((res) => {
  assert(res && res.provider === 'antigravity', 'dispatch should return provider in test mode');
  assert(res.prompt && res.prompt.includes('cf-shared'), 'dispatch should return populated prompt');
  console.log('✓ dispatchAuditPrompt returns correct dispatch payload');

  // 6. State persistence & review tracking
  const st = manager.loadAuditState();
  assert(st && st.projects && st.projects['cf-shared'], 'state should include cf-shared');
  assert.strictEqual(st.projects['cf-shared'].status, 'reviewed', 'cf-shared status should be reviewed');
  assert(st.projects['cf-shared'].last_reviewed_commit, 'last_reviewed_commit should be set');

  const overviewAfter = manager.getAuditOverview();
  const cfSharedAfter = overviewAfter.projects.find((p) => p.project === 'cf-shared');
  assert(cfSharedAfter, 'cf-shared should be present');
  assert.strictEqual(cfSharedAfter.reviewStatus, 'reviewed', 'overview reviewStatus should reflect reviewed state');
  console.log('✓ markProjectReviewed persists state and updates reviewStatus in overview');

  console.log('All AuditManager tests passed successfully!');
});

