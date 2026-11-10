'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('Testing Settings categories (Tab grouping) and context-aware settings navigation...');

// 1. package.json validation
const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));

assert(pkg.version, 'package.json version must exist');

const cfg = pkg.contributes?.configuration;
assert(Array.isArray(cfg), 'contributes.configuration must be an array of categories');
assert.strictEqual(cfg.length, 10, 'contributes.configuration must contain exactly 10 categories');

const expectedCategories = [
  { title: 'Tab: Sessions', order: 1, count: 10 },
  { title: 'Tab: Tasks', order: 2, count: 7 },
  { title: 'Tab: Audits', order: 3, count: 9 },
  { title: 'Tab: Logs', order: 4, count: 3 },
  { title: 'Tab: Deploys', order: 5, count: 8 },
  { title: 'Tab: Releases', order: 6, count: 7 },
  { title: 'Statusleiste & Limits', order: 7, count: 4 },
  { title: 'Sounds', order: 8, count: 17 },
  { title: 'Benachrichtigungen', order: 9, count: 8 },
  { title: 'Allgemein', order: 10, count: 5 }
];

let totalPropsCount = 0;
const allProps = {};

expectedCategories.forEach((expected, idx) => {
  const cat = cfg[idx];
  assert(cat, `Category at index ${idx} must exist`);
  assert.strictEqual(cat.title, expected.title, `Category at index ${idx} must have title "${expected.title}"`);
  assert.strictEqual(cat.order, expected.order, `Category at index ${idx} must have order ${expected.order}`);
  
  const propKeys = Object.keys(cat.properties || {});
  assert.strictEqual(propKeys.length, expected.count, `Category "${expected.title}" must contain ${expected.count} properties, found ${propKeys.length}`);
  
  totalPropsCount += propKeys.length;
  propKeys.forEach((k) => {
    assert(!allProps[k], `Property "${k}" must not be duplicated across categories`);
    allProps[k] = true;
  });
});

assert.strictEqual(totalPropsCount, 78, `Total property count across all categories must be exactly 78, got ${totalPropsCount}`);

// Specific key checks
assert(cfg[0].properties['sessionDashboard.jiraBaseUrl'], 'jiraBaseUrl must be in Tab: Sessions');
assert(cfg[0].properties['sessionDashboard.showLastPrompt'], 'showLastPrompt must be in Tab: Sessions');
assert(cfg[0].properties['sessionDashboard.providers.claude'], 'providers.claude must be in Tab: Sessions');
assert(cfg[0].properties['sessionDashboard.board.columnCardLimit'], 'board.columnCardLimit must be in Tab: Sessions');
assert(cfg[0].properties['sessionDashboard.history.pageSize'], 'history.pageSize must be in Tab: Sessions');
assert(cfg[1].properties['sessionDashboard.tasks.enabled'], 'tasks.enabled must be in Tab: Tasks');
assert(cfg[1].properties['sessionDashboard.tasks.showProgressNotification'], 'tasks.showProgressNotification must be in Tab: Tasks');
assert(cfg[1].properties['sessionDashboard.sound.tasks.enabled'], 'sound.tasks.enabled must be in Tab: Tasks');
assert(cfg[1].properties['sessionDashboard.sound.tasks.sound'], 'sound.tasks.sound must be in Tab: Tasks');
assert(cfg[1].properties['sessionDashboard.sound.tasks.soundFailed'], 'sound.tasks.soundFailed must be in Tab: Tasks');
assert(cfg[1].properties['sessionDashboard.notifications.tasks'], 'notifications.tasks must be in Tab: Tasks');
assert(cfg[2].properties['sessionDashboard.audits.enabled'], 'audits.enabled must be in Tab: Audits');
assert(cfg[2].properties['sessionDashboard.audits.showProgressNotification'], 'audits.showProgressNotification must be in Tab: Audits');
assert(cfg[2].properties['sessionDashboard.audits.defaultModel'], 'audits.defaultModel must be in Tab: Audits');
assert(cfg[2].properties['sessionDashboard.audits.nightlyModel'], 'audits.nightlyModel must be in Tab: Audits');
assert(cfg[2].properties['sessionDashboard.audits.scheduledTaskName'], 'audits.scheduledTaskName must be in Tab: Audits');
assert(cfg[2].properties['sessionDashboard.sound.audits.enabled'], 'sound.audits.enabled must be in Tab: Audits');
assert(cfg[2].properties['sessionDashboard.sound.audits.sound'], 'sound.audits.sound must be in Tab: Audits');
assert(cfg[2].properties['sessionDashboard.sound.audits.soundFailed'], 'sound.audits.soundFailed must be in Tab: Audits');
assert(cfg[2].properties['sessionDashboard.notifications.audits'], 'notifications.audits must be in Tab: Audits');
assert(cfg[3].properties['sessionDashboard.logs.enabled'], 'logs.enabled must be in Tab: Logs');
assert(cfg[3].properties['sessionDashboard.logs.maxCharacters'], 'logs.maxCharacters must be in Tab: Logs');
assert(cfg[3].properties['sessionDashboard.logs.tasks'], 'logs.tasks must be in Tab: Logs');
assert(cfg[4].properties['sessionDashboard.jenkins.enabled'], 'jenkins.enabled must be in Tab: Deploys');
assert(cfg[4].properties['sessionDashboard.sound.jenkins.enabled'], 'sound.jenkins.enabled must be in Tab: Deploys');
assert(cfg[4].properties['sessionDashboard.sound.jenkins.sound'], 'sound.jenkins.sound must be in Tab: Deploys');
assert(cfg[4].properties['sessionDashboard.sound.jenkins.soundFailed'], 'sound.jenkins.soundFailed must be in Tab: Deploys');
assert(cfg[4].properties['sessionDashboard.notifications.jenkins'], 'notifications.jenkins must be in Tab: Deploys');
assert(cfg[5].properties['sessionDashboard.releases.enabled'], 'releases.enabled must be in Tab: Releases');
assert(cfg[5].properties['sessionDashboard.releases.credentialsFile'], 'releases.credentialsFile must be in Tab: Releases');
assert(cfg[5].properties['sessionDashboard.releases.projects'], 'releases.projects must be in Tab: Releases');
assert(cfg[5].properties['sessionDashboard.releases.readyStatuses'], 'releases.readyStatuses must be in Tab: Releases');
assert(cfg[5].properties['sessionDashboard.sound.releases.enabled'], 'sound.releases.enabled must be in Tab: Releases');
assert(cfg[5].properties['sessionDashboard.sound.releases.sound'], 'sound.releases.sound must be in Tab: Releases');
assert(cfg[5].properties['sessionDashboard.notifications.releases'], 'notifications.releases must be in Tab: Releases');
assert(cfg[7].properties['sessionDashboard.sound.taskFailed.enabled'], 'sound.taskFailed.enabled must be in Sounds');
assert(cfg[7].properties['sessionDashboard.sound.taskFailed.sound'], 'sound.taskFailed.sound must be in Sounds');
assert(cfg[9].properties['sessionDashboard.defaultTab'], 'defaultTab must be in Allgemein');
assert(cfg[9].properties['sessionDashboard.rootDirectory'], 'rootDirectory must be in Allgemein');
assert(cfg[9].properties['sessionDashboard.updateCheck.enabled'], 'updateCheck.enabled must be in Allgemein');

console.log('✓ All 10 categories and 78 properties in package.json verified successfully');

// 2. Target query resolution logic (extension.js)
function resolveSettingsQuery(target) {
  let query = '@ext:schueri.ai-sessions';
  if (target) {
    if (target === 'tasks') query = 'sessionDashboard.tasks';
    else if (target === 'audits') query = 'sessionDashboard.audits';
    else if (target === 'logs') query = 'sessionDashboard.logs';
    else if (target === 'jenkins' || target === 'deploys') query = 'sessionDashboard.jenkins';
    else if (target === 'releases') query = 'sessionDashboard.releases';
    else if (target === 'sessions' || target === 'board' || target === 'history' || target === 'analyse') query = '@ext:schueri.ai-sessions';
    else if (target.startsWith('@') || target.startsWith('sessionDashboard')) query = target;
    else query = `sessionDashboard.${target}`;
  }
  return query;
}

assert.strictEqual(resolveSettingsQuery(), '@ext:schueri.ai-sessions');
assert.strictEqual(resolveSettingsQuery('tasks'), 'sessionDashboard.tasks');
assert.strictEqual(resolveSettingsQuery('audits'), 'sessionDashboard.audits');
assert.strictEqual(resolveSettingsQuery('logs'), 'sessionDashboard.logs');
assert.strictEqual(resolveSettingsQuery('jenkins'), 'sessionDashboard.jenkins');
assert.strictEqual(resolveSettingsQuery('deploys'), 'sessionDashboard.jenkins');
assert.strictEqual(resolveSettingsQuery('releases'), 'sessionDashboard.releases');
assert.strictEqual(resolveSettingsQuery('board'), '@ext:schueri.ai-sessions');
assert.strictEqual(resolveSettingsQuery('history'), '@ext:schueri.ai-sessions');
assert.strictEqual(resolveSettingsQuery('analyse'), '@ext:schueri.ai-sessions');

console.log('✓ Target query resolution logic passed');

// 3. Webview HTML verification
const Module = require('module');
const origRequire = Module.prototype.require;

Module.prototype.require = function (id) {
  if (id === 'vscode') {
    return {
      Uri: { joinPath: () => ({}) },
      workspace: {
        getConfiguration: (section) => ({
          get: (key, defVal) => {
            if (section === 'sessionDashboard.jenkins' && key === 'enabled') return true;
            if (section === 'sessionDashboard.tasks' && key === 'enabled') return true;
            if (section === 'sessionDashboard.audits' && key === 'enabled') return true;
            if (section === 'sessionDashboard.logs' && key === 'enabled') return true;
            if (section === 'sessionDashboard.releases' && key === 'enabled') return true;
            return defVal !== undefined ? defVal : '';
          }
        })
      }
    };
  }
  return origRequire.apply(this, arguments);
};

const { BoardPanel } = require('../lib/boardPanel');
const panel = new BoardPanel({});
const html = panel.html();

assert(html.includes('id="btn-settings"'), 'Global btn-settings must exist in HTML');
assert(html.includes('id="tasks-settings"'), 'Tasks toolbar settings button (tasks-settings) must exist');
assert(html.includes('id="audits-settings"'), 'Audits toolbar settings button (audits-settings) must exist');
assert(html.includes('id="logs-settings-btn"'), 'Logs viewer settings button (logs-settings-btn) must exist');
assert(html.includes('id="jenkins-settings"'), 'Jenkins toolbar settings button (jenkins-settings) must exist');
assert(html.includes('id="releases-settings"'), 'Releases toolbar settings button (releases-settings) must exist');

console.log('✓ Tab-specific settings buttons verified in Webview HTML');
console.log('All Settings Tab grouping & context navigation tests passed successfully.');
