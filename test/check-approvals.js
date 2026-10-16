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

// Test 10: approvalExport tests (CSV, Markdown, JSON)
const { buildApprovalExport, normalizeRows, FORMATS } = require('../lib/approvalExport');

assert.strictEqual(FORMATS.csv.ext, 'csv');
assert.strictEqual(FORMATS.md.ext, 'md');
assert.strictEqual(FORMATS.json.ext, 'json');

const sampleRows = [
  { cmd: 'git', sub: 'status', count: 5, safe: true },
  { cmd: 'node', sub: '', count: 2, safe: false },
  { cmd: '=x', sub: '', count: 1, safe: false }
];

const csvOut = buildApprovalExport('csv', sampleRows, '7d');
assert(csvOut.startsWith('\uFEFFBefehl;Programm;Unterbefehl;Anzahl;Lesend (Vorschlag);Regex-Pattern (autoApprove)\r\n'), 'CSV missing UTF-8 BOM or header');
assert(csvOut.includes('git status;git;status;5;Ja;/^git\\s+status\\b/i\r\n'), 'CSV missing git status row');
assert(csvOut.includes('node;node;;2;Nein;/^node\\b/i\r\n'), 'CSV missing node row');
assert(csvOut.includes("'=x;'=x;;1;Nein;/^=x\\b/i\r\n"), 'CSV missing sanitized formula injection row');

const mdOut = buildApprovalExport('md', sampleRows, 'today');
assert(mdOut.includes('# Manuell freigegebene Terminal-Befehle (GitHub Copilot)'), 'MD missing title');
assert(mdOut.includes('- Zeitraum: Heute'), 'MD missing scope label');
assert(mdOut.includes('| `git status` | 5 | Ja | `/^git\\s+status\\b/i` |'), 'MD missing table row');

const jsonOut = buildApprovalExport('json', sampleRows, '30d');
const parsed = JSON.parse(jsonOut);
assert.strictEqual(parsed.source, 'ai-sessions / GitHub Copilot');
assert.strictEqual(parsed.scope, 'Letzte 30 Tage');
assert.strictEqual(parsed.commands.length, 3);
assert.strictEqual(parsed.commands[0].command, 'git status');
assert.strictEqual(parsed.commands[0].readOnly, true);

// Test normalization robustness
const norm = normalizeRows([
  null,
  { cmd: 123 },
  { cmd: 'tool', count: '10', safe: 1 },
  { cmd: 'a'.repeat(200), sub: 'b'.repeat(200) }
]);
assert.strictEqual(norm.length, 2);
assert.strictEqual(norm[0].count, 10);
assert.strictEqual(norm[0].readOnly, true);
assert.strictEqual(norm[1].program.length, 100);
assert.strictEqual(norm[1].subcommand.length, 100);

console.log('✓ All terminalCommands & autoApprove regex & approvalExport tests passed successfully.');
