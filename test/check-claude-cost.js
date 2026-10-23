'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { emptyInfo, applyLine } = require('../lib/transcripts');
const { getSessionHistoryList } = require('../lib/analytics');

console.log('Testing Claude Code real cost (cost-state) integration...');

// 1. Test emptyInfo & applyLine
{
  const info = emptyInfo();
  assert.strictEqual(info.totalCostUSD, null, 'emptyInfo should initialize totalCostUSD to null');

  const line1 = JSON.stringify({
    type: 'cost-state',
    sessionId: 'test-sess-1',
    totalCostUSD: 4.8215
  });
  applyLine(info, line1);
  assert.strictEqual(info.totalCostUSD, 4.8215, 'applyLine should extract totalCostUSD');

  // Later cost-state line updates totalCostUSD
  const line2 = JSON.stringify({
    type: 'cost-state',
    sessionId: 'test-sess-1',
    totalCostUSD: 10.236
  });
  applyLine(info, line2);
  assert.strictEqual(info.totalCostUSD, 10.236, 'applyLine should update to later totalCostUSD');

  // Invalid cost-state does not crash or overwrite with NaN
  applyLine(info, JSON.stringify({ type: 'cost-state', totalCostUSD: 'not-a-number' }));
  assert.strictEqual(info.totalCostUSD, 10.236, 'applyLine should ignore non-number totalCostUSD');
  console.log('✓ transcripts.js: applyLine and emptyInfo cost-state parsing passed');
}

// 2. Test getSessionHistoryList cost priority
{
  const fakeSessions = [
    {
      sessionId: 'sess-with-real-cost',
      provider: 'claude',
      project: 'ROOT',
      totalCostUSD: 3.50,
      tokens: { context: 15000, maxContext: 200000, percent: 8, model: 'claude-opus-5-5' },
      startedAt: Date.now() - 60000,
      statusUpdatedAt: Date.now()
    },
    {
      sessionId: 'sess-without-real-cost',
      provider: 'claude',
      project: 'ROOT',
      totalCostUSD: null,
      tokens: { context: 10000, maxContext: 200000, percent: 5, model: 'claude-3-7-sonnet', inputTokens: 5000, outputTokens: 500, cacheReadTokens: 4000, cacheCreationTokens: 0 },
      startedAt: Date.now() - 60000,
      statusUpdatedAt: Date.now()
    }
  ];

  const history = getSessionHistoryList(fakeSessions);
  assert.strictEqual(history.length, 2);

  const realCostSess = history.find((h) => h.sessionId === 'sess-with-real-cost');
  assert.ok(realCostSess, 'sess-with-real-cost should be in history');
  assert.strictEqual(realCostSess.totalCost, 3.50, 'totalCost should equal real totalCostUSD');
  assert.strictEqual(realCostSess.isRealCost, true, 'isRealCost should be true');
  assert.strictEqual(realCostSess.totalCostUSD, 3.50, 'totalCostUSD should be preserved');

  const synthCostSess = history.find((h) => h.sessionId === 'sess-without-real-cost');
  assert.ok(synthCostSess, 'sess-without-real-cost should be in history');
  assert.strictEqual(synthCostSess.isRealCost, false, 'isRealCost should be false');
  assert.strictEqual(synthCostSess.totalCostUSD, null, 'totalCostUSD should be null');
  assert.ok(synthCostSess.totalCost > 0, 'synthetic cost should be calculated when tokens exist');
  console.log('✓ analytics.js: getSessionHistoryList real vs synthetic cost passed');
}

console.log('All Claude Code real cost tests passed successfully.');
