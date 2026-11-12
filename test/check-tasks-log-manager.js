'use strict';

const assert = require('assert');
const { TasksLogManager } = require('../lib/tasksLogManager');

console.log('Testing TasksLogManager...');

const manager = new TasksLogManager({});

// 1. CSV parser & time formatting test
const csvLine = '"DEVBOX","\\DevBox-Nightly-BackupSync","02.11.2026 03:00:00","Bereit","Nur interaktiv","30.11.1999 00:00:00","267011","Nicht zutreffend","powershell.exe -NoProfile -ExecutionPolicy Bypass -File ""C:\\test.ps1""","Nicht zutreffend","Kommentar","Aktiviert"';
const parsed = manager.parseCsvLine(csvLine);
assert.strictEqual(parsed[0], 'DEVBOX', 'Hostname should be DEVBOX');
assert.strictEqual(parsed[1], '\\DevBox-Nightly-BackupSync', 'Task name should match');
assert.strictEqual(parsed[2], '02.11.2026 03:00:00', 'Next run should match');
assert.strictEqual(parsed[3], 'Bereit', 'State should be Bereit');
assert.strictEqual(parsed[6], '267011', 'Last result raw should match');

// Time format test (HH:mm only, no seconds)
assert.strictEqual(manager.formatTimeHM('02.11.2026 03:00:00'), '02.11.2026 03:00', 'Seconds should be removed from datetime');
assert.strictEqual(manager.formatTimeHM('04:30:00'), '04:30', 'Seconds should be removed from time');
assert.strictEqual(manager.formatTimeHM('12:45'), '12:45', 'Time without seconds should remain intact');
console.log('✓ parseCsvLine & formatTimeHM (HH:mm without seconds) verified');

// Umlauts & buffer decoder test
assert.strictEqual(manager.fixUmlauts('T\uFFFDglich 03:00'), 'Täglich 03:00', 'Replacement character in Täglich should be fixed');
assert.strictEqual(manager.fixUmlauts('Tglich 03:00'), 'Täglich 03:00', 'Dropped ä in Täglich should be fixed');
assert.strictEqual(manager.fixUmlauts('Nchtlich'), 'Nächtlich', 'Nächtlich should be fixed');
assert.strictEqual(manager.fixUmlauts('Nchtlicher Audit'), 'Nächtlicher Audit', 'Nächtlicher Audit should be fixed');
assert.strictEqual(manager.fixUmlauts('verfgbar'), 'verfügbar', 'verfügbar should be fixed');
assert.strictEqual(manager.fixUmlauts('ausgefhrt'), 'ausgeführt', 'ausgeführt should be fixed');
assert.strictEqual(manager.fixUmlauts('Start des nÃ¤chtlichen Laufs'), 'Start des nächtlichen Laufs', 'Mojibake ä should be converted');
assert.strictEqual(manager.fixUmlauts('schlieÃŸen'), 'schließen', 'Mojibake ß should be converted');
assert.strictEqual(manager.fixUmlauts('Ã¶ffnen'), 'öffnen', 'Mojibake ö should be converted');
assert.strictEqual(manager.fixUmlauts('FÃ¼hre'), 'Führe', 'Mojibake ü should be converted');

// CP850 buffer decoding test: 'T' + 0x84 (ä) + 'glich'
const cp850Buf = Buffer.from([0x54, 0x84, 0x67, 0x6C, 0x69, 0x63, 0x68]);
assert.strictEqual(manager.decodeCliBuffer(cp850Buf), 'Täglich', 'CP850 buffer should decode to Täglich');
console.log('✓ Umlauts and CP850/CP1252/Mojibake decoders verified');

// 2. getOverview test
const overview = manager.getOverview(true);
assert(overview && typeof overview === 'object', 'Overview should be an object');
assert(Array.isArray(overview.tasks), 'overview.tasks should be an array');
assert(Array.isArray(overview.logs), 'overview.logs should be an array');
assert(typeof overview.failedTasksCount === 'number', 'failedTasksCount should be a number');

console.log(`✓ getOverview found ${overview.tasks.length} tasks and ${overview.logs.length} logs (failed: ${overview.failedTasksCount})`);
for (const t of overview.tasks) {
  console.log(`  - Task: ${t.taskName} | State: ${t.state} | Next: ${t.nextRun} | Status: ${t.statusLabel} (${t.status})`);
  assert(typeof t.isRegistered === 'boolean', 'isRegistered should be boolean');
  if (t.nextRun && t.nextRun !== '-') {
    assert(!/:\d{2}:\d{2}/.test(t.nextRun), `nextRun should not contain seconds: ${t.nextRun}`);
  }
  if (t.lastRun && t.lastRun !== '-' && t.lastRun !== 'Noch nicht gelaufen') {
    assert(!/:\d{2}:\d{2}/.test(t.lastRun), `lastRun should not contain seconds: ${t.lastRun}`);
  }
  if (t.schedule && t.schedule !== '-') {
    assert(!/:\d{2}:\d{2}/.test(t.schedule), `schedule should not contain seconds: ${t.schedule}`);
  }
}

// 3. getLogContent test
const logContent = manager.getLogContent('backup-sync.log');
assert(logContent && typeof logContent === 'object', 'logContent should be an object');
assert.strictEqual(logContent.name, 'backup-sync.log', 'Log name should match');
assert(typeof logContent.content === 'string', 'Content should be a string');
console.log(`✓ getLogContent returns valid content object for backup-sync.log (exists: ${logContent.exists})`);

assert.strictEqual(typeof manager.getFailedCount(), 'number', 'getFailedCount should return a number');
assert.strictEqual(manager.getFailedCount(), overview.failedTasksCount, 'getFailedCount should match overview.failedTasksCount');
console.log(`✓ getFailedCount returns ${manager.getFailedCount()} matching overview`);

console.log('All TasksLogManager tests passed successfully!');
