'use strict';

const assert = require('assert');
const Module = require('module');

const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'vscode') return {};
  return origRequire.apply(this, arguments);
};

const { compareVersions, parseVersion, pickVsixAsset, releasePageUrl, downloadAsset } = require('../lib/updateChecker');
const https = require('https');
const { EventEmitter } = require('events');

console.log('Testing lib/updateChecker.js (versions, assets)...');

assert.deepStrictEqual(parseVersion('v0.75.0'), [0, 75, 0]);
assert.deepStrictEqual(parseVersion('1.2.3'), [1, 2, 3]);
assert.throws(() => parseVersion('v1.2'), /Ungültige Versionsnummer/);
assert.throws(() => parseVersion('1.2.3-beta'), /Ungültige Versionsnummer/);
console.log('✓ parseVersion');

assert.strictEqual(compareVersions('0.75.0', '0.74.0'), 1);
assert.strictEqual(compareVersions('0.74.0', '0.74.0'), 0);
assert.strictEqual(compareVersions('v0.9.0', '0.10.0'), -1, 'numeric, not lexical');
assert.strictEqual(compareVersions('1.0.0', '0.99.99'), 1);
console.log('✓ compareVersions');

const release = {
  tag_name: 'v0.75.0',
  assets: [
    { name: 'notes.txt' },
    { name: '../evil.vsix' },
    { name: 'ai-sessions-0.75.0.vsix', size: 10 }
  ]
};
assert.strictEqual(pickVsixAsset(release).name, 'ai-sessions-0.75.0.vsix');
assert.throws(() => pickVsixAsset({ tag_name: 'v1.0.0', assets: [{ name: '../evil.vsix' }] }), /keine VSIX-Datei/);
assert.throws(() => pickVsixAsset({ tag_name: 'v1.0.0' }), /keine VSIX-Datei/);
console.log('✓ pickVsixAsset (only ai-sessions-x.y.z.vsix accepted)');

assert.strictEqual(releasePageUrl('v0.75.0'), 'https://github.com/schueri89/ai-sessions/releases/tag/v0.75.0');
console.log('✓ releasePageUrl');

// Test streaming downloadAsset with progress & cancellation
(async () => {
  const origHttpsGet = https.get;
  try {
    const progressReports = [];
    https.get = function (url, opts, cb) {
      const res = new EventEmitter();
      res.statusCode = 200;
      res.headers = { 'content-length': '200' };
      const req = new EventEmitter();
      req.destroy = function (err) {
        req.emit('error', err);
      };
      process.nextTick(() => {
        cb(res);
        res.emit('data', Buffer.alloc(100));
        res.emit('data', Buffer.alloc(100));
        res.emit('end');
      });
      return req;
    };

    const asset = {
      name: 'ai-sessions-test.vsix',
      browser_download_url: 'https://example.com/ai-sessions-test.vsix',
      size: 200
    };

    const file = await downloadAsset(asset, (p) => {
      progressReports.push(p);
    });

    assert(file.endsWith('ai-sessions-test.vsix'), 'Target file must match asset name');
    assert.strictEqual(progressReports.length, 2, 'Should receive 2 progress reports');
    assert.strictEqual(progressReports[0].increment, 50);
    assert.strictEqual(progressReports[1].increment, 50);
    console.log('✓ downloadAsset progress reporting');

    // Test cancellation
    const cancelToken = {
      isCancellationRequested: false,
      onCancellationRequested: (fn) => {
        process.nextTick(fn);
      }
    };
    https.get = function (url, opts, cb) {
      const req = new EventEmitter();
      req.destroy = function (err) {
        process.nextTick(() => req.emit('error', err));
      };
      return req;
    };

    await assert.rejects(
      async () => {
        await downloadAsset(asset, null, cancelToken);
      },
      /Download abgebrochen/
    );
    console.log('✓ downloadAsset cancellation handling');
  } finally {
    https.get = origHttpsGet;
  }

  console.log('All update checker checks passed.');
})();
