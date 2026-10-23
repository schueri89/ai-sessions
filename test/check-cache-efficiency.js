'use strict';

const assert = require('assert');
const { emptyInfo, applyLine } = require('../lib/transcripts');
const { getSessionHistoryList } = require('../lib/analytics');

console.log('Testing Cache-Efficiency & Hit-Rate calculations...');

// 1. Test transcripts.js applyLine for Claude Code usage & cacheHitRate
{
  const info = emptyInfo('test-claude-session');
  const line = JSON.stringify({
    type: 'assistant',
    message: {
      model: 'claude-3-7-sonnet',
      content: [{ type: 'text', text: 'Hello' }],
      usage: {
        input_tokens: 2000,
        cache_creation_input_tokens: 3000,
        cache_read_input_tokens: 5000,
        output_tokens: 400
      }
    }
  });

  applyLine(info, line);
  assert(info.tokens, 'info.tokens should be defined');
  assert.strictEqual(info.tokens.inputTokens, 2000);
  assert.strictEqual(info.tokens.cacheCreationTokens, 3000);
  assert.strictEqual(info.tokens.cacheReadTokens, 5000);
  assert.strictEqual(info.tokens.outputTokens, 400);
  // totalInput = 2000 + 3000 + 5000 = 10000; cacheRead = 5000 => 50%
  assert.strictEqual(info.tokens.cacheHitRate, 50, 'cacheHitRate should be 50% (5000 / 10000)');
  console.log('✓ transcripts.js: Claude usage and cacheHitRate calculation passed');
}

// 2. Test analytics.js getSessionHistoryList cacheRatio calculation per provider
{
  const sessions = [
    {
      sessionId: 'claude-sess',
      provider: 'claude',
      project: 'ROOT',
      tokens: {
        context: 10000,
        maxContext: 200000,
        percent: 5,
        model: 'claude-3-7-sonnet',
        inputTokens: 1000,
        cacheCreationTokens: 1000,
        cacheReadTokens: 8000,
        outputTokens: 500
      },
      startedAt: Date.now() - 60000,
      statusUpdatedAt: Date.now()
    },
    {
      sessionId: 'antigravity-sess',
      provider: 'antigravity',
      project: 'ROOT',
      tokens: {
        context: 10000,
        maxContext: 1000000,
        percent: 1,
        model: 'gemini-2.5-flash',
        inputTokens: 1000,
        cacheCreationTokens: 0,
        cacheReadTokens: 9000,
        outputTokens: 300
      },
      startedAt: Date.now() - 60000,
      statusUpdatedAt: Date.now()
    },
    {
      sessionId: 'codex-sess',
      provider: 'codex',
      project: 'ROOT',
      tokens: {
        context: 10000,
        maxContext: 200000,
        percent: 5,
        model: 'gpt-6.1-sol',
        inputTokens: 2500,
        cacheCreationTokens: 0,
        cacheReadTokens: 7500,
        outputTokens: 600
      },
      startedAt: Date.now() - 60000,
      statusUpdatedAt: Date.now()
    },
    {
      sessionId: 'copilot-sess',
      provider: 'copilot',
      project: 'ROOT',
      tokens: {
        context: 5000,
        maxContext: 128000,
        percent: 4
      },
      startedAt: Date.now() - 60000,
      statusUpdatedAt: Date.now()
    }
  ];

  const history = getSessionHistoryList(sessions);
  const claudeHist = history.find((h) => h.sessionId === 'claude-sess');
  const agHist = history.find((h) => h.sessionId === 'antigravity-sess');
  const codexHist = history.find((h) => h.sessionId === 'codex-sess');
  const cpHist = history.find((h) => h.sessionId === 'copilot-sess');

  // Claude: 8000 / (1000 + 8000 + 1000) = 8000 / 10000 = 80%
  assert.strictEqual(claudeHist.cacheRatio, 80, 'Claude cacheRatio should include cacheCreationTokens');

  // Antigravity: 9000 / (1000 + 9000 + 0) = 90%
  assert.strictEqual(agHist.cacheRatio, 90, 'Antigravity cacheRatio should be 90%');

  // Codex: 7500 / (2500 + 7500 + 0) = 75%
  assert.strictEqual(codexHist.cacheRatio, 75, 'Codex cacheRatio should be 75%');

  // Copilot: cache not supported => null
  assert.strictEqual(cpHist.cacheRatio, null, 'Copilot cacheRatio should be null (not supported)');
  console.log('✓ analytics.js: getSessionHistoryList cacheRatio per provider passed');
}

// 3. Test edge case: totalInput is 0
{
  const sessions = [
    {
      sessionId: 'zero-token-sess',
      provider: 'claude',
      project: 'ROOT',
      tokens: {
        context: 0,
        maxContext: 200000,
        percent: 0,
        inputTokens: 0,
        cacheCreationTokens: 0,
        cacheReadTokens: 0,
        outputTokens: 0
      },
      startedAt: Date.now() - 60000,
      statusUpdatedAt: Date.now()
    }
  ];

  const history = getSessionHistoryList(sessions);
  const zeroHist = history.find((h) => h.sessionId === 'zero-token-sess');
  assert.strictEqual(zeroHist.cacheRatio, 0, 'Zero tokens should yield 0% cacheRatio');
  console.log('✓ analytics.js: Zero tokens edge-case passed');
}

console.log('All Cache-Efficiency tests passed successfully.');

