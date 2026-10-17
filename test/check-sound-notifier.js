'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');

// Mock vscode module before requiring soundNotifier
const Module = require('module');
const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'vscode') {
    return {
      workspace: {
        getConfiguration: () => ({ get: (k, d) => d })
      },
      window: {
        state: { focused: true },
        showInformationMessage: () => {}
      },
      ConfigurationTarget: { Global: 1 }
    };
  }
  return origRequire.apply(this, arguments);
};

const { acquireSharedSoundLock } = require('../lib/soundNotifier');

console.log('Testing acquireSharedSoundLock cross-window sound deduplication...');

const testLockFile = path.join(os.tmpdir(), `test-ai-sessions-sound-${Date.now()}-${Math.random().toString(36).slice(2)}.lock`);

try {
  // 1. First event acquisition must succeed
  const ok1 = acquireSharedSoundLock('taskCompleted', 2000, testLockFile);
  assert.strictEqual(ok1, true, 'First event should acquire lock');

  // Verify file was created and contains valid JSON
  assert.strictEqual(fs.existsSync(testLockFile), true, 'Lock file must exist on disk');
  const content = JSON.parse(fs.readFileSync(testLockFile, 'utf8'));
  assert.ok(content.taskCompleted > 0, 'taskCompleted timestamp must be recorded');
  assert.ok(content.lastAny > 0, 'lastAny timestamp must be recorded');

  // 2. Immediate second call for the same event type must be blocked (multi-window deduplication)
  const ok2 = acquireSharedSoundLock('taskCompleted', 2000, testLockFile);
  assert.strictEqual(ok2, false, 'Immediate second call for same event should be blocked');

  // 3. Immediate call for different event within 2500ms global cooldown must also be blocked
  const ok3 = acquireSharedSoundLock('needsInput', 2000, testLockFile);
  assert.strictEqual(ok3, false, 'Different event within 2500ms global cooldown should be blocked');

  // 4. Corrupted file content should be handled gracefully without throwing
  fs.writeFileSync(testLockFile, 'not-valid-json', 'utf8');
  const ok4 = acquireSharedSoundLock('taskCompleted', 0, testLockFile);
  assert.strictEqual(ok4, true, 'Should recover gracefully from invalid JSON in lock file');

  console.log('✓ All acquireSharedSoundLock tests passed successfully.');
} finally {
  try {
    if (fs.existsSync(testLockFile)) {
      fs.unlinkSync(testLockFile);
    }
  } catch {}
}
