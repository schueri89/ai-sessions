'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

// Mock vscode module before requiring toastNotifier
const Module = require('module');
const origRequire = Module.prototype.require;

let mockConfig = {
  'sessionDashboard.notifications': {
    enabled: true,
    taskCompleted: true,
    needsInput: true,
    'providers.claude': true,
    'providers.antigravity': true,
    'providers.copilot': true,
    'providers.codex': true
  }
};

let shownMessages = [];
let mockWorkspaceFolders = [
  { uri: { fsPath: path.resolve('/mock/workspace/project-a') } }
];

Module.prototype.require = function (id) {
  if (id === 'vscode') {
    return {
      workspace: {
        get workspaceFolders() {
          return mockWorkspaceFolders;
        },
        getConfiguration: (section) => ({
          get: (key, defaultValue) => {
            const full = section ? `${section}.${key}` : key;
            if (mockConfig[section] && mockConfig[section][key] !== undefined) {
              return mockConfig[section][key];
            }
            if (mockConfig[full] !== undefined) {
              return mockConfig[full];
            }
            return defaultValue;
          },
          update: async (key, val) => {
            const full = section ? `${section}.${key}` : key;
            mockConfig[full] = val;
          }
        })
      },
      window: {
        showInformationMessage: async (msg, ...actions) => {
          shownMessages.push({ msg, actions });
          return 'Chat öffnen';
        }
      },
      ConfigurationTarget: { Global: 1 }
    };
  }
  return origRequire.apply(this, arguments);
};

const {
  ToastNotifier,
  acquireSharedToastLock,
  isSessionInCurrentWindow
} = require('../lib/toastNotifier');

console.log('Testing ToastNotifier and acquireSharedToastLock...');

// --- 1. Lock tests ---
const testLockFile = path.join(os.tmpdir(), `test-ai-sessions-toast-${Date.now()}-${Math.random().toString(36).slice(2)}.lock`);

try {
  const ok1 = acquireSharedToastLock('taskCompleted:s1', 2000, testLockFile);
  assert.strictEqual(ok1, true, 'First toast lock should succeed');
  assert.strictEqual(fs.existsSync(testLockFile), true, 'Lock file must exist on disk');

  const ok2 = acquireSharedToastLock('taskCompleted:s1', 2000, testLockFile);
  assert.strictEqual(ok2, false, 'Immediate second call for same key should be blocked');

  const ok3 = acquireSharedToastLock('taskCompleted:s2', 2000, testLockFile);
  assert.strictEqual(ok3, true, 'Different session key should succeed');

  fs.writeFileSync(testLockFile, '{not-valid-json}', 'utf8');
  const ok4 = acquireSharedToastLock('taskCompleted:s1', 0, testLockFile);
  assert.strictEqual(ok4, true, 'Corrupted JSON should be handled gracefully');
  console.log('✓ acquireSharedToastLock tests passed');
} finally {
  try {
    if (fs.existsSync(testLockFile)) fs.unlinkSync(testLockFile);
  } catch {}
}

// --- 2. Workspace matching tests ---
const inWin1 = isSessionInCurrentWindow({ cwd: path.resolve('/mock/workspace/project-a/subdir') });
assert.strictEqual(inWin1, true, 'Subdir of workspace folder should be in current window');

const inWin2 = isSessionInCurrentWindow({ cwd: path.resolve('/mock/workspace/other-project') });
assert.strictEqual(inWin2, false, 'Different folder should not be in current window');

const inWin3 = isSessionInCurrentWindow({});
assert.strictEqual(inWin3, false, 'Empty session should return false');
console.log('✓ isSessionInCurrentWindow tests passed');

// --- 3. ToastNotifier evaluate tests ---
let openedSession = null;
const notifier = new ToastNotifier({}, (s) => {
  openedSession = s;
});

// Initial run: should NOT trigger any notifications
shownMessages = [];
const sInit = [
  { sessionId: 's1', provider: 'claude', displayState: 'busy', project: 'test', title: 'Task 1' }
];
notifier.evaluate(sInit);
assert.strictEqual(shownMessages.length, 0, 'Initial run must suppress notifications');

// Subsequent run: s1 changes from busy -> idle
notifier.evaluate([
  { sessionId: 's1', provider: 'claude', displayState: 'idle', project: 'test', title: 'Task 1', cwd: path.resolve('/mock/workspace/project-a') }
]);
assert.strictEqual(shownMessages.length, 1, 'Finished task should trigger notification');
assert.ok(shownMessages[0].msg.includes('[test] Task 1'), 'Toast message should include project and title');
assert.ok(shownMessages[0].msg.includes('Aufgabe abgeschlossen'), 'Toast message should indicate completion');

// Subsequent run: s2 is waiting for input
notifier.evaluate([
  { sessionId: 's1', provider: 'claude', displayState: 'idle', project: 'test', title: 'Task 1', cwd: path.resolve('/mock/workspace/project-a') },
  { sessionId: 's2', provider: 'antigravity', displayState: 'waiting', waitingFor: 'Rückfrage', project: 'ag-proj', title: 'Task 2', cwd: path.resolve('/mock/workspace/project-a') }
]);
assert.strictEqual(shownMessages.length, 2, 'New waiting session should trigger needsInput notification');
assert.ok(shownMessages[1].msg.includes('Rückfrage wartet auf deine Antwort'), 'Toast message should indicate question');

notifier.dispose();
console.log('✓ ToastNotifier evaluate tests passed successfully.');
