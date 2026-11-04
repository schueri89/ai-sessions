'use strict';

const assert = require('assert');
const Module = require('module');

const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'vscode') {
    return { workspace: { getConfiguration: () => ({ get: (key, def) => def }) } };
  }
  return origRequire.apply(this, arguments);
};

const { fetchReleases, isJiraReleaseUrl, normalizeVersion, splitReleases, versionStatus } = require('../lib/jiraReleases');

console.log('Testing lib/jiraReleases.js (status, progress, ordering)...');

const today = '2026-11-04';
assert.strictEqual(versionStatus({ released: true, releaseDate: '2026-01-01' }, today), 'released');
assert.strictEqual(versionStatus({ released: false, overdue: true }, today), 'overdue');
assert.strictEqual(versionStatus({ released: false, releaseDate: '2026-11-03' }, today), 'overdue', 'past release date');
assert.strictEqual(versionStatus({ released: false, startDate: '2026-11-04', releaseDate: '2026-11-04' }, today), 'running');
assert.strictEqual(versionStatus({ released: false, startDate: '2026-11-05' }, today), 'planned');
assert.strictEqual(versionStatus({ released: false }, today), 'planned');
console.log('✓ status (released / overdue / running / planned)');

const project = { key: 'EHFE', name: 'e-hoi Frontend' };
const v = normalizeVersion({
  id: 27059, name: 'EHFE-2026-KW45-1', startDate: '2026-10-15', releaseDate: '2026-11-04', released: false,
  issuesStatusForFixVersion: { unmapped: 1, toDo: 2, inProgress: 15, done: 1 }
}, project, 'https://ehoi.atlassian.net', today);
assert.deepStrictEqual(v.issues, { toDo: 3, inProgress: 15, done: 1 }, 'unmapped counts as open');
assert.strictEqual(v.url, 'https://ehoi.atlassian.net/projects/EHFE/versions/27059');
assert.strictEqual(v.status, 'running');
const empty = normalizeVersion({ id: 1, name: 'x', released: true }, project, 'https://j', today);
assert.deepStrictEqual(empty.issues, { toDo: 0, inProgress: 0, done: 0 });
assert.strictEqual(empty.releaseDate, '');
console.log('✓ normalizeVersion (progress, url, missing fields)');

const mk = (name, status, releaseDate, projectKey = 'A') => ({ name, status, releaseDate, projectKey });
const { upcoming, released } = splitReleases([
  mk('r-old', 'released', '2025-01-01'),
  mk('u-nodate', 'planned', ''),
  mk('u-late', 'planned', '2026-12-01'),
  mk('r-nodate', 'released', ''),
  mk('u-overdue', 'overdue', '2026-10-01'),
  mk('r-new', 'released', '2026-11-01'),
  mk('u-soon-b', 'running', '2026-11-04', 'B'),
  mk('u-soon-a', 'running', '2026-11-04', 'A')
]);
assert.deepStrictEqual(upcoming.map((x) => x.name), ['u-overdue', 'u-soon-a', 'u-soon-b', 'u-late', 'u-nodate']);
assert.deepStrictEqual(released.map((x) => x.name), ['r-new', 'r-old', 'r-nodate']);
console.log('✓ splitReleases (upcoming ascending, released newest first, undated last)');

assert.strictEqual(isJiraReleaseUrl('https://ehoi.atlassian.net/projects/X/versions/1'), false, 'no URL accepted before a successful fetch');

fetchReleases().then((data) => {
  assert.strictEqual(data.state, 'unconfigured', 'missing credentials file setting');
  console.log('✓ fetchReleases without credentials file -> unconfigured');
  Module.prototype.require = origRequire;
  console.log('All jiraReleases checks passed.');
});
