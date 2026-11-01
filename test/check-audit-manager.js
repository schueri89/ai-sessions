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

// 3. getAuditOverview
const overview = manager.getAuditOverview();
assert(overview && typeof overview === 'object', 'overview should be an object');
assert(Array.isArray(overview.projects), 'overview.projects should be an array');
assert(overview.scheduledTask && typeof overview.scheduledTask === 'object', 'scheduledTask should be present');
assert(typeof overview.scheduledTask.isRegistered === 'boolean', 'isRegistered should be a boolean');
assert.strictEqual(overview.scheduledTask.taskName, 'DevBox-Nightly-Audit', 'taskName should match');
const cfShared = overview.projects.find((p) => p.project === 'cf-shared');
assert(cfShared, 'cf-shared should be present in overview');
assert(typeof cfShared.status === 'string', 'status should be a string');
console.log(`✓ getAuditOverview returned ${overview.projects.length} project status entries (task registered: ${overview.scheduledTask.isRegistered})`);

console.log('All AuditManager tests passed successfully!');

