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

const sampleReportGermanChangesRequested = `
# Audit-Report: test-de
Modus: \`all\` | Modell: \`gemma4:26b\`

## 🔍 2. Code Review
### Gesamtbewertung
ÄNDERUNGEN ERFORDERLICH
`;
const statusGermanChangesRequested = manager.parseReportStatus(sampleReportGermanChangesRequested);
assert.strictEqual(statusGermanChangesRequested.status, 'warning', 'Status should be warning for ÄNDERUNGEN ERFORDERLICH');

const sampleReportError = `
# Audit-Report: test
Modus: \`security\` | Modell: \`gemma4:26b\`

## 🛡️ 3. Security Audit
CRITICAL: SQL-Injection without cfqueryparam
`;
const statusErr = manager.parseReportStatus(sampleReportError);
assert.strictEqual(statusErr.status, 'error', 'Status should be error');

// Test report with Handover Footer containing the word 'Kritisch'
const sampleReportWithFooter = `
# Audit-Report: test-clean-with-footer
Modus: \`review (Komplett)\` | Modell: \`gemma4:26b\`

## 🔍 2. Code Review
Keine Beanstandungen oder Auffälligkeiten im geprüften Code festgestellt.

---
## 🚀 Übergabe an KI-Assistenten (Claude Code / Antigravity / Copilot / Codex)
> **Prompt für Behebung:**
> 1. Lies den Bericht und prüfe alle gemeldeten Befunde (Schweregrade: Kritisch / Hoch / Mittel).
`;
const statusWithFooter = manager.parseReportStatus(sampleReportWithFooter);
assert.strictEqual(statusWithFooter.status, 'passed', 'Clean report with footer must be passed, not error!');
assert.strictEqual(statusWithFooter.summary, 'Bestanden (Keine Risiken)', 'Summary must be Bestanden (Keine Risiken)');

// Test report with Ollama Timeout error
const sampleReportTimeout = `
# Audit-Report: test-timeout
Modus: \`review\` | Modell: \`gemma4:26b\`

## 🔍 2. Code Review
ERROR: Request to Ollama failed: timed out

---
## 🚀 Übergabe an KI-Assistenten
`;
const statusTimeout = manager.parseReportStatus(sampleReportTimeout);
assert.strictEqual(statusTimeout.status, 'error', 'Timeout report must be error');
assert.strictEqual(statusTimeout.summary, 'Ollama Timeout (Zeitüberschreitung)', 'Timeout summary must indicate Ollama Timeout');
console.log('✓ parseReportStatus accurately classifies passed, warning, error, footer-exclusion, and timeout states');

// 3. getAuditOverview & time formatting
const formattedDate = manager.formatGermanDate(Date.now());
assert(!/:\d{2}:\d{2}/.test(formattedDate), `formatGermanDate should not contain seconds: ${formattedDate}`);
assert(/\b\d{2}\.\d{2}\.\d{4}\s+\d{2}:\d{2}\b/.test(formattedDate), `formatGermanDate should match DD.MM.YYYY HH:mm: ${formattedDate}`);

const overview = manager.getAuditOverview();
assert(overview && typeof overview === 'object', 'overview should be an object');
assert(Array.isArray(overview.projects), 'overview.projects should be an array');
assert(Array.isArray(overview.availableModels), 'overview should include availableModels');
assert.strictEqual(overview.defaultModel, 'gemma4:26b', 'defaultModel should be gemma4:26b');
assert(overview.availableModels.includes('gemma4:26b'), 'availableModels should include gemma4:26b');
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
const promptProj = manager.buildPrompt('cf-shared', 'C:/reports/2026-11-01_cf-shared_review.md');
assert(promptProj.includes('das Projekt cf-shared'), 'prompt should reference project');
assert(promptProj.includes('cf-shared/.agents/project-context.md'), 'prompt should reference project-context.md');
assert(promptProj.includes('.agents/global-core.md'), 'prompt should reference global-core.md');
assert(promptProj.includes('C:/reports/2026-11-01_cf-shared_review.md'), 'prompt should include report path');
assert(promptProj.includes('Erstelle bei Bedarf einen Implementierungsplan'), 'prompt should include step 3');
assert(promptProj.includes('Halte dich dabei strikt an das globale Regelwerk'), 'prompt should include step 4');

// Combined prompt with multiple report paths
const promptBoth = manager.buildPrompt('cf-shared', ['C:/reports/2026-11-01_cf-shared_security.md', 'C:/reports/2026-11-01_cf-shared_review.md']);
assert(promptBoth.includes('Berichtsdateien:'), 'prompt should list multiple report files');
assert(promptBoth.includes('2026-11-01_cf-shared_security.md'), 'prompt should include sec report');
assert(promptBoth.includes('2026-11-01_cf-shared_review.md'), 'prompt should include cr report');

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

  // 7. Queue tracking in overview
  manager.auditQueue.push({ projectName: 'ai-sessions', mode: 'review', diff: 'unstaged' });
  const qOverview = manager.getAuditOverview();
  const aiItem = qOverview.projects.find((p) => p.project === 'ai-sessions');
  assert(aiItem && aiItem.isQueued, 'ai-sessions should be marked isQueued');
  assert.strictEqual(aiItem.queuePosition, 1, 'queuePosition should be 1');
  manager.auditQueue = [];
  console.log('✓ auditQueue and queuePosition verified in getAuditOverview');

  // 8. notifyAuditCompletion and soundNotifier trigger
  let soundTriggered = false;
  let playedEvent = '';
  const notifierManager = new AuditManager({}, {
    soundNotifier: {
      playSound: (evt) => {
        soundTriggered = true;
        playedEvent = evt;
      }
    }
  });
  notifierManager.notifyAuditCompletion('ai-sessions', { isSuccess: true, status: 'passed', durationMs: 12000 });
  assert(soundTriggered, 'soundNotifier.playSound should have been triggered');
  assert.strictEqual(playedEvent, 'taskCompleted', 'playedEvent should be taskCompleted');
  console.log('✓ notifyAuditCompletion plays taskCompleted sound');

  // 9. deleteReport functionality
  const fs = require('fs');
  const path = require('path');
  const dummyReport = path.join(manager.getReportsDir(), '2099-01-01_dummy-test_review.md');
  fs.writeFileSync(dummyReport, '# Dummy Report', 'utf8');
  assert(fs.existsSync(dummyReport), 'dummy report should exist');
  manager.deleteReport('dummy-test', dummyReport).then((deleted) => {
    assert(deleted, 'deleteReport should return true');
    assert(!fs.existsSync(dummyReport), 'dummy report should be deleted from disk');
    console.log('✓ deleteReport successfully removes report file and updates state');

    // 10. Process Persistence & isPidAlive
    assert.strictEqual(manager.isPidAlive(process.pid), true, 'Current process PID should be alive');
    assert.strictEqual(manager.isPidAlive(9999999), false, 'Non-existent PID should not be alive');
    console.log('✓ isPidAlive correctly verifies OS process state');

    // 11. addRunningState & removeRunningState
    manager.addRunningState({ pid: process.pid, project: 'test-persist', mode: 'review', diff: 'full', model: 'gemma4:26b', startTime: Date.now() });
    const runState = manager.loadRunningState();
    const foundEntry = runState.processes.find((p) => p.project === 'test-persist');
    assert(foundEntry, 'test-persist entry should be persisted in audit-running.json');
    assert.strictEqual(foundEntry.pid, process.pid, 'Persisted PID should match');

    manager.removeRunningState('test-persist');
    const runStateAfter = manager.loadRunningState();
    assert(!runStateAfter.processes.some((p) => p.project === 'test-persist'), 'test-persist should be removed from audit-running.json');
    console.log('✓ addRunningState & removeRunningState persist and clean up audit-running.json');

    // 12. cancelAudit (queued & running)
    manager.auditQueue.push({ projectName: 'cancel-queue-test', mode: 'review', diff: 'unstaged' });
    assert(manager.auditQueue.some((q) => q.projectName === 'cancel-queue-test'), 'item should be queued');
    const cancelledQueue = manager.cancelAudit('cancel-queue-test');
    assert.strictEqual(cancelledQueue, true, 'cancelAudit should return true for queued item');
    assert(!manager.auditQueue.some((q) => q.projectName === 'cancel-queue-test'), 'item should be removed from queue');

    manager.runningProjects.set('cancel-run-test', { pid: 9999999, mode: 'review', diff: 'unstaged', startTime: Date.now() });
    const cancelledRun = manager.cancelAudit('cancel-run-test');
    assert.strictEqual(cancelledRun, true, 'cancelAudit should return true for running item');
    assert(!manager.runningProjects.has('cancel-run-test'), 'item should be removed from runningProjects');
    console.log('✓ cancelAudit removes queued tasks and cleans up running audits');

    manager.dispose();
    console.log('All AuditManager tests passed successfully!');
    process.exit(0);
  });
});

