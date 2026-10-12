'use strict';

const assert = require('assert');
const { terminalCommands, splitCommandChain, subcommandOf, escapeRegex } = require('../lib/analytics');

console.log('Testing terminalCommands & subcommands parsing...');

// Test 1: Chained commands with options and subcommands
const t1 = terminalCommands({
  kind: 'terminal',
  commandLine: { original: 'cd I:\\x; git -C foo status; git add . && git commit -m "a; b" || npm run build' }
});
assert.deepStrictEqual(t1, [
  { cmd: 'git', sub: 'status' },
  { cmd: 'git', sub: 'add' },
  { cmd: 'git', sub: 'commit' },
  { cmd: 'npm', sub: 'run' }
], 'Failed t1');

// Test 2: Pipe commands (pipe commands are not split into separate root commands)
const t2 = terminalCommands({
  kind: 'terminal',
  commandLine: { original: 'Get-ChildItem C:\\x | Select-String foo' }
});
assert.deepStrictEqual(t2, [
  { cmd: 'get-childitem', sub: '' }
], 'Failed t2');

// Test 3: Variable assignment
const t3 = terminalCommands({
  kind: 'terminal',
  commandLine: { original: '$x = git log --oneline -5' }
});
assert.deepStrictEqual(t3, [
  { cmd: 'git', sub: 'log' }
], 'Failed t3');

// Test 4: Subshell / parenthesis
const t4 = terminalCommands({
  kind: 'terminal',
  commandLine: { original: '(git diff)' }
});
assert.deepStrictEqual(t4, [
  { cmd: 'git', sub: 'diff' }
], 'Failed t4');

// Test 5: Full path with call operator
const t5 = terminalCommands({
  kind: 'terminal',
  commandLine: { original: '& "C:\\Program Files\\Git\\bin\\git.exe" --no-pager show HEAD' }
});
assert.deepStrictEqual(t5, [
  { cmd: 'git', sub: 'show' }
], 'Failed t5');

// Test 6: Multiline / newline separation
const t6 = terminalCommands({
  kind: 'terminal',
  commandLine: { original: 'npx playwright test\nnpm --version' }
});
assert.deepStrictEqual(t6, [
  { cmd: 'npx', sub: 'playwright' },
  { cmd: 'npm', sub: '' }
], 'Failed t6');

// Test 7: Filtered out shell keywords, pop-location, variables, and string literals
const t7 = terminalCommands({
  kind: 'terminal',
  commandLine: { original: 'pop-location; git status; foreach ($i in 1..2) { $i++ }; "---"' }
});
assert.deepStrictEqual(t7, [
  { cmd: 'git', sub: 'status' }
], 'Failed t7');

// Test 8: escapeRegex
assert.strictEqual(escapeRegex('get-childitem'), 'get-childitem');
assert.strictEqual(escapeRegex('c++'), 'c\\+\\+');
assert.strictEqual(escapeRegex('[test]'), '\\[test\\]');

// Test 9: autoApprove regex matching test
const bs = String.fromCharCode(92);
const gitRegexStr = '^git' + bs + 's+(status|diff|ls-files)' + bs + 'b';
const gitRegex = new RegExp(gitRegexStr, 'i');
assert.strictEqual(gitRegex.test('git status -s'), true);
assert.strictEqual(gitRegex.test('Git   diff HEAD'), true);
assert.strictEqual(gitRegex.test('git ls-files'), true);
assert.strictEqual(gitRegex.test('git push origin'), false);
assert.strictEqual(gitRegex.test('git stash'), false);
assert.strictEqual(gitRegex.test('git statusx'), false);

const simpleRegexStr = '^get-childitem' + bs + 'b';
const simpleRegex = new RegExp(simpleRegexStr, 'i');
assert.strictEqual(simpleRegex.test('Get-ChildItem -Path .'), true);
assert.strictEqual(simpleRegex.test('get-childitemx'), false);

console.log('✓ All terminalCommands & autoApprove regex tests passed successfully.');
