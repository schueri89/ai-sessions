'use strict';

const assert = require('assert');
const { cleanToolArgText, countUnifiedDiffLines, getSessionHistoryList } = require('../lib/analytics');
const { applyLine, emptyInfo } = require('../lib/transcripts');

console.log('Testing History Pagination and Diff-Statistics...');

// 1. cleanToolArgText
assert.strictEqual(cleanToolArgText(null), '');
assert.strictEqual(cleanToolArgText(undefined), '');
assert.strictEqual(cleanToolArgText('hello'), 'hello');
assert.strictEqual(cleanToolArgText('"hello world"'), 'hello world');
assert.strictEqual(cleanToolArgText('"line1\\nline2"'), 'line1\nline2');
console.log('✓ cleanToolArgText tests passed');

// 2. countUnifiedDiffLines
const sampleDiff = `--- a/lib/test.js
+++ b/lib/test.js
@@ -10,6 +10,8 @@
 context line
-removed line 1
-removed line 2
+added line 1
+added line 2
+added line 3
 context line 2`;

const diffResult = countUnifiedDiffLines(sampleDiff);
assert.strictEqual(diffResult.added, 3, 'Should count 3 added lines');
assert.strictEqual(diffResult.removed, 2, 'Should count 2 removed lines');

const emptyDiff = countUnifiedDiffLines('');
assert.strictEqual(emptyDiff.added, 0);
assert.strictEqual(emptyDiff.removed, 0);
console.log('✓ countUnifiedDiffLines tests passed');

// 3. transcripts.js applyLine
const info = emptyInfo();
assert.strictEqual(info.totalLinesAdded, null);
assert.strictEqual(info.totalLinesRemoved, null);

const costStateLine = JSON.stringify({
  type: 'cost-state',
  sessionId: 'test-claude-session',
  totalCostUSD: 4.5,
  totalLinesAdded: 167,
  totalLinesRemoved: 28
});
applyLine(info, costStateLine);
assert.strictEqual(info.totalCostUSD, 4.5);
assert.strictEqual(info.totalLinesAdded, 167);
assert.strictEqual(info.totalLinesRemoved, 28);
console.log('✓ transcripts.js: applyLine cost-state diff parsing passed');

// 4. getSessionHistoryList with various providers
const mockSessions = [
  {
    sessionId: 'session-claude-1',
    provider: 'claude',
    title: 'Claude Work',
    totalCostUSD: 10.5,
    totalLinesAdded: 807,
    totalLinesRemoved: 122
  },
  {
    sessionId: 'session-copilot-1',
    provider: 'copilot',
    title: 'Copilot Chat'
  }
];

const history = getSessionHistoryList(mockSessions);
const claudeEntry = history.find((h) => h.sessionId === 'session-claude-1');
assert(claudeEntry, 'Claude entry must exist in history');
assert.strictEqual(claudeEntry.linesAdded, 807, 'Claude linesAdded should match');
assert.strictEqual(claudeEntry.linesRemoved, 122, 'Claude linesRemoved should match');
assert.strictEqual(claudeEntry.diffSource, 'claude');

const copilotEntry = history.find((h) => h.sessionId === 'session-copilot-1');
assert(copilotEntry, 'Copilot entry must exist in history');
assert.strictEqual(copilotEntry.linesAdded, null, 'Copilot linesAdded should be null');
assert.strictEqual(copilotEntry.linesRemoved, null, 'Copilot linesRemoved should be null');
assert.strictEqual(copilotEntry.diffSource, null);
console.log('✓ analytics.js: getSessionHistoryList multi-provider diff handling passed');

// 5. Pagination boundary & slicing logic
function paginate(items, page, pageSize) {
  const totalCount = items.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const validPage = Math.min(Math.max(1, page), totalPages);
  const startIdx = (validPage - 1) * pageSize;
  const endIdx = Math.min(totalCount, startIdx + pageSize);
  return {
    totalPages,
    page: validPage,
    paged: items.slice(startIdx, endIdx),
    startIdx,
    endIdx
  };
}

const testList = Array.from({ length: 65 }, (_, i) => ({ id: i + 1 }));

// Page 1 of 65 with size 25
const p1 = paginate(testList, 1, 25);
assert.strictEqual(p1.totalPages, 3);
assert.strictEqual(p1.page, 1);
assert.strictEqual(p1.paged.length, 25);
assert.strictEqual(p1.paged[0].id, 1);
assert.strictEqual(p1.paged[24].id, 25);

// Page 3 of 65 with size 25 (last page has 15 items)
const p3 = paginate(testList, 3, 25);
assert.strictEqual(p3.page, 3);
assert.strictEqual(p3.paged.length, 15);
assert.strictEqual(p3.paged[0].id, 51);
assert.strictEqual(p3.paged[14].id, 65);

// Page 999 should clamp to last page (3)
const pClamped = paginate(testList, 999, 25);
assert.strictEqual(pClamped.page, 3);

// Empty list
const pEmpty = paginate([], 1, 25);
assert.strictEqual(pEmpty.totalPages, 1);
assert.strictEqual(pEmpty.paged.length, 0);

console.log('✓ Pagination slicing and clamping logic passed');

console.log('All History Pagination & Diff-Statistics tests passed successfully.');
