'use strict';

const assert = require('assert');
const Module = require('module');

const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'vscode') {
    return { workspace: { getConfiguration: () => ({ get: (key, def) => def }) }, window: {} };
  }
  return origRequire.apply(this, arguments);
};

const { layoutPipeline, matchPipelineRuns } = require('../lib/jenkins');

console.log('Testing lib/jenkins.js (pipeline layout & runs)...');

const U = (n) => 'https://j/job/' + n + '/';
const job = (name, downstream) => ({ name, fullName: name, url: U(name), downstream: downstream.map(U), upstream: [] });
const jobs = [
  job('rating_build', ['rating_test']),
  job('rating_test', ['rating_stage']),
  job('rating_stage', ['rating_live', 'killapps_stage']),
  job('rating_live', ['killapps_live']),
  job('killapps_live', []),
  job('killapps_stage', [])
];
const byUrl = new Map(jobs.map((j) => [j.url, j]));
const order = ['rating_build', 'rating_test', 'rating_stage', 'rating_live', 'killapps_stage', 'killapps_live'].map(U);

const { nodes, rows } = layoutPipeline(order, byUrl);
const pos = Object.fromEntries(nodes.map((n) => [byUrl.get(n.url).name, [n.col, n.row]]));
assert.strictEqual(rows, 2);
assert.deepStrictEqual(pos, {
  rating_build: [0, 0],
  rating_test: [1, 0],
  rating_stage: [2, 0],
  rating_live: [3, 0],
  killapps_live: [4, 0],
  killapps_stage: [3, 1]
});
assert.ok(nodes.every((n) => n.parent < n.id), 'parents come before children');
console.log('✓ layout: chain on row 0, branch opens row 1 (like Build Pipeline view)');

const cyc = [job('a', ['b']), job('b', ['a'])];
const cycLayout = layoutPipeline(cyc.map((j) => j.url), new Map(cyc.map((j) => [j.url, j])));
assert.strictEqual(cycLayout.nodes.length, 2, 'cycle is laid out once');
console.log('✓ layout: cycle without entry point');

const cause = (up, nr) => ({ causes: [{ upstreamProject: up, upstreamBuild: nr }] });
const b = (number, result, extra = {}) => ({ number, result, building: false, timestamp: number * 1000, duration: 60000, url: 'u' + number + '/', actions: [], ...extra });
const infos = new Map([
  [U('rating_build'), { inQueue: false, truncated: false, builds: [
    b(821, 'SUCCESS', { actions: [{ causes: [{ userId: 'raphael.schuerholz', userName: 'Raphael' }] }, { parameters: [{ name: 'gitbranch', value: 'dev' }] }] }),
    b(820, 'SUCCESS'),
    b(819, 'FAILURE')
  ] }],
  [U('rating_test'), { inQueue: false, truncated: false, builds: [b(857, 'SUCCESS', { actions: [cause('rating_build', 821)] }), b(856, 'SUCCESS', { actions: [cause('rating_build', 820)] })] }],
  [U('rating_stage'), { inQueue: false, truncated: false, builds: [
    b(783, null, { building: true, actions: [cause('rating_test', 857)] }),
    b(782, 'SUCCESS', { actions: [cause('rating_test', 856)] })
  ] }],
  [U('rating_live'), { inQueue: false, truncated: false, builds: [] }],
  [U('killapps_live'), { inQueue: false, truncated: false, builds: [] }],
  [U('killapps_stage'), { inQueue: false, truncated: false, builds: [b(6890, 'SUCCESS', { actions: [{}, cause('rating_stage', 782)] })] }]
]);

const runs = matchPipelineRuns(nodes, byUrl, infos, 5);
const states = (run) => Object.fromEntries(nodes.map((n) => [byUrl.get(n.url).name, run.cells[n.id].state]));
assert.deepStrictEqual(runs.map((r) => r.number), [821, 820, 819]);
assert.deepStrictEqual(states(runs[0]), {
  rating_build: 'success', rating_test: 'success', rating_stage: 'running',
  rating_live: 'pending', killapps_live: 'pending', killapps_stage: 'pending'
});
assert.deepStrictEqual(states(runs[1]), {
  rating_build: 'success', rating_test: 'success', rating_stage: 'success',
  rating_live: 'manual', killapps_live: 'pending', killapps_stage: 'success'
});
assert.deepStrictEqual(states(runs[2]), {
  rating_build: 'failed', rating_test: 'skipped', rating_stage: 'skipped',
  rating_live: 'skipped', killapps_live: 'skipped', killapps_stage: 'skipped'
});
assert.strictEqual(runs[0].cells[0].build.user, 'Raphael');
assert.deepStrictEqual(runs[0].params, [{ name: 'gitbranch', value: 'dev' }]);
assert.strictEqual(runs[1].cells[5].build.number, 6890);
console.log('✓ runs: downstream builds matched via UpstreamCause (running / manual / skipped)');

infos.get(U('rating_build')).inQueue = true;
infos.get(U('killapps_stage')).truncated = true;
infos.get(U('killapps_stage')).builds = [b(9000, 'SUCCESS')];
const queued = matchPipelineRuns(nodes, byUrl, infos, 5);
assert.strictEqual(queued[0].queued, true);
assert.strictEqual(queued[0].cells[0].state, 'queued');
assert.strictEqual(states(queued[2]).killapps_stage, 'unknown', 'build history too short');
console.log('✓ runs: queued start build, truncated history -> unknown');

Module.prototype.require = origRequire;
console.log('All jenkins pipeline checks passed.');
