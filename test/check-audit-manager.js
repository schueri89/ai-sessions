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
#### WARNUNG: Fehlender Scope
- **Konfidenz**: 85% (Hoch)
- **Critic-Begründung**: Variable x leckt in variables-Scope.
`;
const statusWarn = manager.parseReportStatus(sampleReportWarning);
assert.strictEqual(statusWarn.status, 'warning', 'Status should be warning');

// Test report with template lines containing KRITISCH & HOCH
const sampleReportWithTemplates = `
# Audit-Report: test-templates
Modus: \`security\` | Modell: \`gemma4:26b\`

## 🛡️ 3. Security Audit
Schweregrade: Kritisch / Hoch / Mittel
- Schweregrad: KRITISCH (CRITICAL) / HOCH (HIGH) / MITTEL (MEDIUM) / NIEDRIG (LOW) / HINWEIS (INFO)
- Konfidenz: [90-100% (Sehr hoch) / 75-89% (Hoch) / 50-74% (Mittel)]
Keine Sicherheitsrisiken im geprüften Diff festgestellt.
`;
const statusWithTemplates = manager.parseReportStatus(sampleReportWithTemplates);
assert.strictEqual(statusWithTemplates.status, 'passed', 'Template lines must not cause warning or error status');

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
assert.strictEqual(overview.defaultModel, 'gemma4:e4b', 'defaultModel should be gemma4:e4b');
assert(overview.availableModels.includes('gemma4:e4b'), 'availableModels should include gemma4:e4b');
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
const preDispatchState = manager.loadAuditState();
const originalCfSharedState = preDispatchState.projects['cf-shared'] ? JSON.parse(JSON.stringify(preDispatchState.projects['cf-shared'])) : null;

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

  // Restore original state of cf-shared so unit test does not overwrite persistent state
  const restoredState = manager.loadAuditState();
  if (originalCfSharedState) {
    restoredState.projects['cf-shared'] = originalCfSharedState;
  } else {
    delete restoredState.projects['cf-shared'];
  }
  manager.saveAuditState(restoredState);
  console.log('✓ markProjectReviewed persists state and updates reviewStatus in overview');

  // 6b. Separate CR and Security Review acknowledgment
  const testState = manager.loadAuditState();
  testState.projects['sep-test'] = {
    status: 'pending',
    cr_status: 'pending',
    sec_status: 'pending'
  };
  manager.saveAuditState(testState);
  manager.markProjectReviewed('sep-test', 'cr');
  const stAfterCr = manager.loadAuditState();
  assert.strictEqual(stAfterCr.projects['sep-test'].cr_status, 'reviewed', 'sep-test cr_status should be reviewed');
  assert.strictEqual(stAfterCr.projects['sep-test'].sec_status, 'pending', 'sep-test sec_status should still be pending');

  manager.markProjectReviewed('sep-test', 'sec');
  const stAfterSec = manager.loadAuditState();
  assert.strictEqual(stAfterSec.projects['sep-test'].cr_status, 'reviewed', 'sep-test cr_status should be reviewed');
  assert.strictEqual(stAfterSec.projects['sep-test'].sec_status, 'reviewed', 'sep-test sec_status should be reviewed');
  assert.strictEqual(stAfterSec.projects['sep-test'].status, 'reviewed', 'sep-test overall status should be reviewed');
  delete stAfterSec.projects['sep-test'];
  manager.saveAuditState(stAfterSec);
  console.log('✓ markProjectReviewed supports separate cr and sec acknowledgment');

  // 6c. Reconciliation of stale reviewed reports & commit changes
  assert.strictEqual(manager.parseGermanDateToMs('04.11.2026 23:36'), new Date(2026, 10, 4, 23, 36).getTime(), 'parseGermanDateToMs should correctly parse DD.MM.YYYY HH:mm');

  const recState = manager.loadAuditState();
  recState.projects['rec-test'] = {
    status: 'reviewed',
    cr_status: 'reviewed',
    cr_reviewed_at: '01.11.2026 10:00',
    cr_reviewed_time: 1730451600000,
    cr_reviewed_commit: 'aaaaaaa',
    last_review_commit: 'bbbbbbb',
    sec_status: 'reviewed',
    sec_reviewed_at: '01.11.2026 10:00',
    sec_reviewed_time: 1730451600000,
    sec_reviewed_commit: 'aaaaaaa',
    last_security_commit: 'aaaaaaa'
  };
  manager.saveAuditState(recState);

  // Set mock report in cachedReports
  const origGetProjects = manager.getProjects.bind(manager);
  manager.getProjects = () => ['rec-test', ...origGetProjects()];
  manager.cachedReports = new Map([
    ['rec-test', {
      project: 'rec-test',
      cr: { filePath: 'dummy_cr.md', mtimeMs: 1730451600000 + 10000, status: 'passed', summary: 'ok' },
      sec: { filePath: 'dummy_sec.md', mtimeMs: 1730451600000, status: 'passed', summary: 'ok' }
    }]
  ]);
  const recOverview = manager.getAuditOverview();
  const recItem = recOverview.projects.find((p) => p.project === 'rec-test');
  assert(recItem, 'rec-test must exist in overview');
  assert.strictEqual(recItem.crReviewStatus, 'pending', 'crReviewStatus must be pending due to newer report mtimeMs and commit change');
  assert.strictEqual(recItem.secReviewStatus, 'reviewed', 'secReviewStatus should remain reviewed as it is not stale');
  assert.strictEqual(recItem.reviewStatus, 'pending', 'overall reviewStatus must be pending when cr is pending');

  const recCleanState = manager.loadAuditState();
  delete recCleanState.projects['rec-test'];
  manager.saveAuditState(recCleanState);
  manager.getProjects = origGetProjects;
  manager.getReports(true);
  console.log('✓ reconciliation accurately flips stale reviewed status to pending on new reports or commit changes');

  // 7. Queue tracking in overview
  const initialUserQueue = manager.auditQueue.slice();
  manager.auditQueue = [{ projectName: 'ai-sessions', mode: 'review', diff: 'unstaged' }];
  const qOverview = manager.getAuditOverview();
  const aiItem = qOverview.projects.find((p) => p.project === 'ai-sessions');
  assert(aiItem && aiItem.isQueued, 'ai-sessions should be marked isQueued');
  assert(aiItem.isCrQueued, 'ai-sessions should be marked isCrQueued');
  assert.strictEqual(aiItem.crQueuePosition, 1, 'crQueuePosition should be 1');
  assert.strictEqual(aiItem.queuePosition, 1, 'queuePosition should be 1');
  manager.auditQueue = [];
  console.log('✓ auditQueue and queuePosition verified in getAuditOverview');

  // 7b. Multi-audit queueing (cross-project, cross-mode & guards)
  manager.runningProjects.set('proj-active', { mode: 'review', diff: 'unstaged', startTime: Date.now(), pid: 12345 });
  manager.runAudit('proj-active', 'security', 'unstaged');
  assert.strictEqual(manager.auditQueue.length, 1, 'security for active project should be queued');
  assert.strictEqual(manager.auditQueue[0].mode, 'security', 'queued mode should be security');

  manager.runAudit('proj-second', 'review', 'unstaged');
  assert.strictEqual(manager.auditQueue.length, 2, 'second project should be queued at position 2');

  manager.runWorkspaceGuards();
  assert.strictEqual(manager.auditQueue.length, 3, 'workspace guards should be queued at position 3');
  assert.strictEqual(manager.auditQueue[2].mode, 'guards', 'third item mode should be guards');

  const guardsState = manager.getWorkspaceGuards();
  assert.strictEqual(guardsState.isQueued, true, 'getWorkspaceGuards should report isQueued = true');
  assert.strictEqual(guardsState.queuePosition, 3, 'getWorkspaceGuards queuePosition should be 3');

  manager.cancelAudit('proj-active', 'security');
  assert.strictEqual(manager.auditQueue.length, 2, 'queue length should be 2 after cancelling security');
  assert.strictEqual(manager.auditQueue[0].projectName, 'proj-second', 'first queue item should now be proj-second');

  manager.runningProjects.delete('proj-active');
  manager.auditQueue = initialUserQueue;
  manager.saveQueueState();
  console.log('✓ multi-audit sequential queue (cross-project, cross-mode & guards) verified');

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
  assert.strictEqual(playedEvent, 'taskCompleted', 'playedEvent should be taskCompleted for clean audit');

  soundTriggered = false;
  playedEvent = '';
  notifierManager.notifyAuditCompletion('auto-hub', { isSuccess: true, status: 'error', findingsCount: 3, durationMs: 15000 });
  assert(soundTriggered, 'soundNotifier.playSound should have been triggered on findings');
  assert.strictEqual(playedEvent, 'taskFailed', 'playedEvent should be taskFailed for audit with findings/errors');
  console.log('✓ notifyAuditCompletion plays taskCompleted on success and taskFailed on errors/findings');

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

    // 13. Daily Audits toggle & state tracking
    const initialDaily = manager.toggleDailyAudit('daily-test-proj', true);
    assert.strictEqual(initialDaily, true, 'toggleDailyAudit should return true');
    const stateDailyOn = manager.loadAuditState();
    assert.strictEqual(stateDailyOn.projects['daily-test-proj'].daily_active, true, 'daily_active in state should be true');

    const toggledDaily = manager.toggleDailyAudit('daily-test-proj');
    assert.strictEqual(toggledDaily, false, 'toggleDailyAudit without second param should toggle to false');
    const stateDailyOff = manager.loadAuditState();
    assert.strictEqual(stateDailyOff.projects['daily-test-proj'].daily_active, false, 'daily_active in state should be false');

    // Clean up test entry
    delete stateDailyOff.projects['daily-test-proj'];
    manager.saveAuditState(stateDailyOff);

    // Verify dailyActive property & dailyActiveCount in getAuditOverview
    const dailyOverview = manager.getAuditOverview();
    assert(typeof dailyOverview.dailyActiveCount === 'number', 'overview should contain dailyActiveCount');
    for (const p of dailyOverview.projects) {
      assert(typeof p.dailyActive === 'boolean', `project ${p.project} should have dailyActive boolean`);
    }
    console.log(`✓ Daily Audit toggle & dailyActiveCount (${dailyOverview.dailyActiveCount}) verified`);

    // 14. Nightly Model & syncAuditConfig
    const nightlyModel = manager.getNightlyModel();
    assert.strictEqual(nightlyModel, 'gemma4:e4b', 'getNightlyModel should default to gemma4:e4b in tests');
    manager.syncAuditConfig();
    const syncedState = manager.loadAuditState();
    assert(syncedState.config, 'synced state should contain config object');
    assert.strictEqual(syncedState.config.nightly_model, 'gemma4:e4b', 'syncedState.config.nightly_model should match');
    const scheduledTask = manager.getScheduledTask();
    assert.strictEqual(scheduledTask.nightlyModel, 'gemma4:e4b', 'scheduledTask should include nightlyModel');
    console.log(`✓ Nightly Model (${nightlyModel}) and syncAuditConfig verified`);

    // 15. Progress Notification & Cancellation Hook
    let withProgressCalled = false;
    let progressOpts = null;
    let fakeToken = null;
    let fakeProgressMessages = [];

    const fakeVscode = {
      ProgressLocation: { Notification: 15 },
      workspace: {
        getConfiguration: () => ({
          get: (key, def) => def
        })
      },
      window: {
        withProgress: (opts, task) => {
          withProgressCalled = true;
          progressOpts = opts;
          const fakeProgress = {
            report: (msg) => fakeProgressMessages.push(msg)
          };
          fakeToken = {
            onCancellationRequested: (cb) => {
              fakeToken._onCancel = cb;
            }
          };
          return task(fakeProgress, fakeToken);
        },
        showInformationMessage: () => {}
      }
    };

    const progressManager = new AuditManager({}, { vscode: fakeVscode });
    progressManager.runningProjects.set('test-prog-proj', {
      mode: 'review',
      startTime: Date.now()
    });

    progressManager.startAuditProgressNotification('test-prog-proj', {
      mode: 'review',
      diff: 'unstaged',
      model: 'gemma4:26b',
      isGuards: false
    });

    assert.strictEqual(withProgressCalled, true, 'withProgress must be called when progress notification enabled');
    assert.strictEqual(progressOpts.cancellable, true, 'ProgressNotification must be cancellable');
    assert(progressOpts.title.includes('test-prog-proj'), 'Title must include project name');
    assert(fakeProgressMessages.length > 0, 'Initial message must be reported');
    assert.strictEqual(typeof fakeToken._onCancel, 'function', 'Cancellation listener must be registered');

    // Trigger cancellation
    let cancelCalled = false;
    const origCancelAudit = progressManager.cancelAudit.bind(progressManager);
    progressManager.cancelAudit = (proj, mode) => {
      cancelCalled = true;
      assert.strictEqual(proj, 'test-prog-proj');
      assert.strictEqual(mode, 'review');
      return origCancelAudit(proj, mode);
    };

    fakeToken._onCancel();
    assert.strictEqual(cancelCalled, true, 'token.onCancellationRequested must invoke cancelAudit()');
    console.log('✓ startAuditProgressNotification & cancellation hook verified');

    // Dismissal Memory & Suppression Tests
    const sampleFindingReport = `
# Audit-Report: test-dismissals
Modus: \`security\` | Modell: \`gemma4:e4b\`

## 🛡️ 3. Security Audit
#### KRITISCH: XSS in user-profile.ts
- **Fundstelle**: src/user-profile.ts:88
- **Risiko**: innerHTML verwendet.
`;
    const statusBefore = manager.parseReportStatus(sampleFindingReport, Date.now());
    assert.strictEqual(statusBefore.status, 'error', 'Status before dismissal must be error');

    const testDismissals = [
      { id: 'dsm_1', title: 'XSS in user-profile.ts', file: 'src/user-profile.ts', type: 'sec', reason: 'Sanitized via DOMPurify' }
    ];
    const statusAfter = manager.parseReportStatus(sampleFindingReport, Date.now(), testDismissals);
    assert.strictEqual(statusAfter.status, 'passed', 'Status after dismissal must be passed');
    assert.strictEqual(statusAfter.summary, 'Bestanden (Befunde ignoriert)', 'Summary must reflect ignored findings');
    console.log('✓ parseReportStatus with dismissals verified');

    // Test addDismissal, getDismissals, removeDismissal
    const dummyProj = 'test-dismissal-proj';
    const addedDsm = manager.addDismissal(dummyProj, {
      title: 'False Positive SQL-Injection',
      file: 'models/query.cfc',
      line: 55,
      reason: 'Parameter wird durch cfqueryparam geschützt',
      type: 'sec'
    });
    assert(addedDsm && addedDsm.id, 'addDismissal must return created entry with id');
    const projectDismissals = manager.getDismissals(dummyProj);
    assert.strictEqual(projectDismissals.length, 1, 'getDismissals must return 1 entry');
    assert.strictEqual(projectDismissals[0].title, 'False Positive SQL-Injection');

    // Test buildPrompt contains dismissal note
    const promptWithDsm = manager.buildPrompt(dummyProj, ['dummy_review.md']);
    assert(promptWithDsm.includes('Dismissal Memory'), 'buildPrompt must include Dismissal Memory note');
    assert(promptWithDsm.includes('False Positive SQL-Injection'), 'buildPrompt must list dismissed title');
    assert(promptWithDsm.includes('models/query.cfc:55'), 'buildPrompt must list file and line');

    // Remove dismissal
    const removedOk = manager.removeDismissal(dummyProj, addedDsm.id);
    assert.strictEqual(removedOk, true, 'removeDismissal must return true');
    assert.strictEqual(manager.getDismissals(dummyProj).length, 0, 'Dismissals must be empty after remove');
    console.log('✓ Dismissal Memory CRUD & buildPrompt injection verified');

    // Test Scheduled Task weekend full audit schedule string
    const schedTask = manager.getScheduledTask();
    assert(schedTask.schedule.includes('Täglich'), 'schedule string must include Täglich');
    assert(schedTask.schedule.includes('Mo–Fr: Diff'), 'schedule string must include Mo–Fr: Diff when weekendFullAudit=true');
    assert(schedTask.weekendFullAudit === true, 'weekendFullAudit must default to true');
    console.log(`✓ getScheduledTask schedule string verified: "${schedTask.schedule}"`);

    manager.dispose();
    progressManager.dispose();
    console.log('All AuditManager tests passed successfully!');
    process.exit(0);
  });
});

