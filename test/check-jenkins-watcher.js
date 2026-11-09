'use strict';

const assert = require('assert');
const Module = require('module');

const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'vscode') {
    return {
      workspace: { getConfiguration: () => ({ get: (key, def) => def }) },
      window: {
        showInformationMessage: () => {},
        showErrorMessage: () => {},
        showWarningMessage: () => {}
      }
    };
  }
  return origRequire.apply(this, arguments);
};

const { flattenJobs } = require('../lib/jenkins');
const { JenkinsWatcher, findFinishedBuilds, isOwnBuild } = require('../lib/jenkinsWatcher');

console.log('Testing lib/jenkinsWatcher.js (build causes & finish detection)...');

const jobs = flattenJobs([
  {
    name: 'build', url: 'https://j/job/build/', color: 'blue',
    lastBuild: { number: 7, result: 'SUCCESS', building: false, actions: [{}, { causes: [{ userId: 'Raphael.Schuerholz' }] }] }
  },
  {
    name: 'deploy', url: 'https://j/job/deploy/', color: 'red',
    lastBuild: {
      number: 3, result: 'FAILURE', building: false,
      actions: [{ causes: [{ upstreamProject: 'build', upstreamBuild: 7, upstreamCauses: [{ userId: 'raphael.schuerholz' }] }] }]
    }
  },
  {
    name: 'nightly', url: 'https://j/job/nightly/', color: 'blue',
    lastBuild: { number: 12, result: 'SUCCESS', building: false, actions: [{ causes: [{ shortDescription: 'Started by timer' }] }] }
  }
], '', []);

assert.deepStrictEqual(jobs[0].lastBuild.userIds, ['Raphael.Schuerholz']);
assert.deepStrictEqual(jobs[1].lastBuild.userIds, ['raphael.schuerholz'], 'user from nested upstreamCauses');
assert.deepStrictEqual(jobs[2].lastBuild.userIds, []);
assert.strictEqual(isOwnBuild(jobs[0].lastBuild, 'raphael.schuerholz'), true, 'case-insensitive user match');
assert.strictEqual(isOwnBuild(jobs[2].lastBuild, 'raphael.schuerholz'), false);
console.log('✓ userIds collected from direct and upstream causes');

const prev = new Map([
  ['https://j/job/build/', { number: 7, building: true }],
  ['https://j/job/deploy/', { number: 2, building: false }],
  ['https://j/job/nightly/', { number: 11, building: true }]
]);
const finished = findFinishedBuilds(prev, jobs, 'raphael.schuerholz').map((j) => j.name);
assert.deepStrictEqual(finished, ['build', 'deploy'], 'own running build finished + own build completed between polls; foreign build ignored');

const unchanged = new Map(jobs.map((j) => [j.url, { number: j.lastBuild.number, building: false }]));
assert.deepStrictEqual(findFinishedBuilds(unchanged, jobs, 'raphael.schuerholz'), [], 'no transition, no notification');

const running = flattenJobs([{ name: 'build', url: 'https://j/job/build/', color: 'blue_anime',
  lastBuild: { number: 8, building: true, actions: [{ causes: [{ userId: 'raphael.schuerholz' }] }] } }], '', []);
assert.deepStrictEqual(findFinishedBuilds(prev, running, 'raphael.schuerholz'), [], 'running build is not finished');

const brandNew = new Map();
assert.deepStrictEqual(findFinishedBuilds(brandNew, jobs, 'raphael.schuerholz'), [], 'unknown jobs are only seeded');
console.log('✓ finish detection (running -> done, skipped poll, foreign, unchanged, new job)');

let playedSound = null;
const mockSoundNotifier = {
  playSound: (evt) => { playedSound = evt; }
};
const watcher = new JenkinsWatcher({}, { soundNotifier: mockSoundNotifier });

// 1. Success build -> taskCompleted
const testJobSuccess = {
  fullName: 'build',
  url: 'https://j/job/build-test/',
  lastBuild: { number: 9991 + Math.floor(Math.random() * 100000), result: 'SUCCESS', duration: 15000 }
};
watcher.notify(testJobSuccess);
assert.strictEqual(playedSound, 'taskCompleted', 'SUCCESS build should trigger taskCompleted sound');

// 2. Failure build -> taskFailed
playedSound = null;
const testJobFailure = {
  fullName: 'deploy',
  url: 'https://j/job/deploy-test/',
  lastBuild: { number: 9991 + Math.floor(Math.random() * 100000), result: 'FAILURE', duration: 25000 }
};
watcher.notify(testJobFailure);
assert.strictEqual(playedSound, 'taskFailed', 'FAILURE build should trigger taskFailed sound');
console.log('✓ JenkinsWatcher.notify triggers taskCompleted on SUCCESS and taskFailed on FAILURE');

Module.prototype.require = origRequire;
console.log('All jenkinsWatcher checks passed.');
