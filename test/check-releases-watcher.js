'use strict';

const assert = require('assert');
const Module = require('module');

const shown = [];
const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'vscode') {
    return {
      workspace: { getConfiguration: () => ({ get: (key, def) => def }) },
      window: { showInformationMessage: (msg) => { shown.push(msg); return Promise.resolve(undefined); } },
      env: { openExternal: () => {} },
      Uri: { parse: (u) => u }
    };
  }
  return origRequire.apply(this, arguments);
};

const { ReleasesWatcher, findTurnedGreen, isGreen } = require('../lib/releasesWatcher');

console.log('Testing lib/releasesWatcher.js (green detection & notifications)...');

const rel = (id, toDo, inProgress, done, status = 'running') => ({
  id: String(id), name: `R${id}`, projectKey: 'EHFE', status, releaseDate: '2026-11-20',
  url: `https://jira/versions/${id}`, issues: { toDo, inProgress, done }
});

assert.strictEqual(isGreen(rel(1, 0, 0, 5)), true);
assert.strictEqual(isGreen(rel(1, 0, 1, 5)), false);
assert.strictEqual(isGreen(rel(1, 1, 0, 5)), false);
assert.strictEqual(isGreen(rel(1, 0, 0, 0)), false, 'empty release is not green');
assert.strictEqual(isGreen(rel(1, 0, 0, 5, 'released')), false, 'released versions are ignored');
console.log('✓ isGreen');

const prev = new Map([['1', false], ['2', true], ['3', false]]);
const now = [rel(1, 0, 0, 4), rel(2, 0, 0, 3), rel(3, 0, 1, 2), rel(4, 0, 0, 1)];
assert.deepStrictEqual(findTurnedGreen(prev, now).map((v) => v.id), ['1'],
  'only known not-green -> green; already green, still open and unknown releases are skipped');
console.log('✓ findTurnedGreen');

let played = null;
const watcher = new ReleasesWatcher({ soundNotifier: { playSound: (evt, prov, sound) => { played = sound; } } });
const id = `t${Date.now()}${Math.floor(Math.random() * 100000)}`;
watcher.evaluate({ state: 'ok', upcoming: [rel(id, 1, 0, 2)] });
assert.strictEqual(shown.length, 0, 'first evaluation only seeds');
watcher.evaluate({ state: 'error' });
watcher.evaluate({ state: 'ok', upcoming: [rel(id, 0, 0, 3)] });
assert.strictEqual(shown.length, 1, 'turning green notifies once');
assert(shown[0].includes('EHFE') && shown[0].includes(`R${id}`) && shown[0].includes('3/3'), shown[0]);
assert.strictEqual(played, 'tada', 'default release sound');
watcher.evaluate({ state: 'ok', upcoming: [rel(id, 0, 0, 3)] });
assert.strictEqual(shown.length, 1, 'staying green does not notify again');
console.log('✓ ReleasesWatcher.evaluate/notify');

Module.prototype.require = origRequire;
console.log('All releasesWatcher checks passed.');
