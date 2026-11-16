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

const { fetchMyIssues, isMyIssuesUrl, buildJql, groupByStatus, normalizeMyIssue } = require('../lib/jiraMyIssues');

console.log('Testing lib/jiraMyIssues.js (JQL, normalizing, status columns)...');

const me = '557058:f58131cb-b67d-43c7-b30d-6b58d40bd077';
assert.strictEqual(
  buildJql('(assignee = {user} OR {developerField} = {user}) ORDER BY updated DESC', me, 'customfield_10055'),
  `(assignee = "${me}" OR cf[10055] = "${me}") ORDER BY updated DESC`
);
assert.strictEqual(buildJql('assignee = {user}', me, 'kaputt'), `assignee = "${me}"`, 'developer field only needed when used');
assert.throws(() => buildJql('{developerField} = {user}', me, 'summary'), /customfield_12345/);
assert.throws(() => buildJql('assignee = {user}', 'x" OR project = Y', 'customfield_1'), /Account-ID/, 'no JQL injection via account id');
console.log('✓ buildJql (placeholders, cf[] syntax, account id check)');

const ready = new Set(['ready for live']);
const raw = (key, status, category, extra = {}) => ({
  key,
  fields: {
    summary: 'Titel ' + key,
    status: { name: status, statusCategory: { key: category } },
    issuetype: { name: 'Bug' },
    project: { key: key.split('-')[0], name: 'Projekt' },
    updated: '2026-11-13T10:00:00.000+0100',
    ...extra
  }
});
const issue = normalizeMyIssue(raw('EHFE-1', 'Ready for Live', 'indeterminate', {
  assignee: { accountId: 'other', displayName: 'Tina Test' },
  customfield_10055: { accountId: me, displayName: 'Raphael' },
  fixVersions: [{ name: 'EHFE-2026-KW46-1' }]
}), 'https://ehoi.atlassian.net', ready, 'customfield_10055', me);
assert.strictEqual(issue.bucket, 'done', 'ready status counts green');
assert.deepStrictEqual(issue.roles, ['Entwickler']);
assert.strictEqual(issue.assignee, 'Tina Test');
assert.deepStrictEqual(issue.fixVersions, ['EHFE-2026-KW46-1']);
assert.strictEqual(issue.url, 'https://ehoi.atlassian.net/browse/EHFE-1');
assert.ok(issue.updated > 0);
console.log('✓ normalizeMyIssue (bucket, roles, fix versions, url)');

const norm = (key, status, category) => normalizeMyIssue(raw(key, status, category), 'https://j', ready, 'customfield_10055', me);
const issues = [
  norm('A-1', 'Live', 'done'),
  norm('A-2', 'Codereview', 'indeterminate'),
  norm('A-3', 'Offen', 'new'),
  norm('A-4', 'In Arbeit', 'indeterminate'),
  norm('A-5', 'codereview', 'indeterminate')
];
assert.deepStrictEqual(groupByStatus(issues, []).map((c) => c.status), ['Offen', 'Codereview', 'In Arbeit', 'Live']);
const ordered = groupByStatus(issues, ['In Arbeit', 'Codereview']);
assert.deepStrictEqual(ordered.map((c) => c.status), ['In Arbeit', 'Codereview', 'Offen', 'Live'], 'configured order first');
assert.deepStrictEqual(ordered[1].issues.map((i) => i.key), ['A-2', 'A-5'], 'status match case-insensitive, JQL order kept');
console.log('✓ groupByStatus (category order, configured order, case-insensitive)');

assert.strictEqual(isMyIssuesUrl('https://ehoi.atlassian.net/browse/X-1'), false, 'no URL accepted before a successful fetch');

fetchMyIssues().then((data) => {
  assert.strictEqual(data.state, 'unconfigured', 'missing credentials file / user');
  console.log('✓ fetchMyIssues without configuration -> unconfigured');
  Module.prototype.require = origRequire;
  console.log('All jiraMyIssues checks passed.');
});
