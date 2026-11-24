'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseJsonlChatSession, applyCliEvent, newCliParseState, parseCliEvents, readJsonlSession } = require('../lib/providers/copilot');

console.log('Testing Copilot JSONL chat session parser (splice & retry handling)...');

// Test 1: Retry replaces index 0 instead of appending
const lines1 = [
  { kind: 0, v: { requests: [] } },
  { kind: 2, k: ['requests'], v: [{ requestId: 'a', message: { text: 'hi' }, response: [] }] },
  { kind: 1, k: ['requests', 0, 'modelState'], v: { value: 3, completedAt: 1 } },
  // Retry replaces index 0
  { kind: 2, k: ['requests'], i: 0, v: [{ requestId: 'b', message: { text: 'hi' }, modelState: { value: 0 }, response: [] }] },
  { kind: 2, k: ['requests', 0, 'response'], v: [{ value: 'p1' }, { value: 'p2' }, { value: 'p3' }] },
  // Response splice replaces from index 1
  { kind: 2, k: ['requests', 0, 'response'], i: 1, v: [{ value: 'p2b' }] },
  { kind: 1, k: ['requests', 0, 'modelState'], v: { value: 1, completedAt: 2 } }
].map((o) => JSON.stringify(o));

const res1 = parseJsonlChatSession(lines1);
assert(res1.sessionObj, 'sessionObj must exist');
assert.strictEqual(res1.sessionObj.requests.length, 1, 'retry must replace, not append');
assert.strictEqual(res1.sessionObj.requests[0].requestId, 'b');
assert.deepStrictEqual(res1.sessionObj.requests[0].modelState, { value: 1, completedAt: 2 });
assert.deepStrictEqual(res1.sessionObj.requests[0].response.map((r) => r.value), ['p1', 'p2b']);

// Test 2: Standard append without i
const lines2 = [
  { kind: 0, v: { requests: [] } },
  { kind: 2, k: ['requests'], v: [{ requestId: 'r1', message: { text: 'first' } }] },
  { kind: 2, k: ['requests'], v: [{ requestId: 'r2', message: { text: 'second' } }] }
].map((o) => JSON.stringify(o));

const res2 = parseJsonlChatSession(lines2);
assert.strictEqual(res2.sessionObj.requests.length, 2);
assert.strictEqual(res2.sessionObj.requests[0].requestId, 'r1');
assert.strictEqual(res2.sessionObj.requests[1].requestId, 'r2');

// Test 3: Multiple turns with retry on turn 2
const lines3 = [
  { kind: 0, v: { requests: [] } },
  { kind: 2, k: ['requests'], v: [{ requestId: 'r1', message: { text: 'first' }, modelState: { value: 1, completedAt: 10 } }] },
  { kind: 2, k: ['requests'], v: [{ requestId: 'r2_old', message: { text: 'second' }, modelState: { value: 3, completedAt: 20 } }] },
  // Retry replaces index 1
  { kind: 2, k: ['requests'], i: 1, v: [{ requestId: 'r2_new', message: { text: 'second retry' }, modelState: { value: 0 } }] },
  { kind: 1, k: ['requests', 1, 'modelState'], v: { value: 1, completedAt: 30 } }
].map((o) => JSON.stringify(o));

const res3 = parseJsonlChatSession(lines3);
assert.strictEqual(res3.sessionObj.requests.length, 2);
assert.strictEqual(res3.sessionObj.requests[0].requestId, 'r1');
assert.strictEqual(res3.sessionObj.requests[1].requestId, 'r2_new');
assert.strictEqual(res3.sessionObj.requests[1].modelState.value, 1);
assert.strictEqual(res3.sessionObj.requests[1].modelState.completedAt, 30);

console.log('✓ All Copilot JSONL splice parser tests passed successfully.');

// Test 4: Copilot CLI (agent host) events.jsonl state machine
console.log('Testing Copilot CLI events parser...');
const cli = newCliParseState();
const feed = (type, data = {}) => applyCliEvent(cli, { type, data, timestamp: '2026-11-16T10:00:00.000Z' });
feed('session.start', { startTime: '2026-11-16T09:00:00.000Z', selectedModel: 'claude-opus-5.5', context: { cwd: '\\\\?\\UNC\\SRV\\share\\app' } });
assert.strictEqual(cli.contextCwd, '\\\\SRV\\share\\app', 'UNC long path prefix must be stripped');
feed('user.message', { content: 'Fix\r\nthe bug' });
assert.strictEqual(cli.lastPrompt, 'Fix the bug');
assert.strictEqual(cli.running, true);
feed('assistant.turn_start');
feed('assistant.message', { toolRequests: [{ name: 'powershell' }] });
feed('permission.requested', { requestId: 'p1', permissionRequest: { kind: 'shell' } });
assert.strictEqual(cli.pending.size, 1, 'open permission request must be pending');
feed('permission.completed', { requestId: 'p1' });
assert.strictEqual(cli.pending.size, 0);
feed('assistant.turn_end');
assert.strictEqual(cli.running, true, 'turn with tool calls must keep the session running');
feed('assistant.turn_start');
feed('assistant.message', { content: 'Done', toolRequests: [] });
feed('assistant.turn_end');
assert.strictEqual(cli.running, false, 'final answer without tool calls must end the request');
feed('user.message', { content: 'next' });
feed('session.usage_record', { usage: { model: 'claude-opus-5.5', inputTokens: 900, outputTokens: 100, maxPromptTokens: 10000 } });
assert.deepStrictEqual(cli.tokens, { context: 1000, maxContext: 10000, percent: 10, model: 'claude-opus-5.5' });
feed('abort', { reason: 'user_initiated' });
assert.strictEqual(cli.running, false, 'abort must end the request');
console.log('✓ Copilot CLI events parser tests passed successfully.');

// Test 5: Cold start seeds at the last prompt and matches a full parse
console.log('Testing Copilot CLI cold-start seeding...');
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aisx-copilot-'));
const evFile = path.join(tmpDir, 'events.jsonl');
const ev = (type, data) => JSON.stringify({ type, data, timestamp: '2026-11-24T10:00:00.000Z' }) + '\n';
const padding = ev('tool.execution_complete', { output: 'x'.repeat(300 * 1024) });
fs.writeFileSync(evFile, [
  ev('session.start', { startTime: '2026-11-24T09:00:00.000Z', selectedModel: 'claude-opus-5.5', context: { cwd: 'C:\\repo' } }),
  ev('user.message', { content: 'first' }),
  ev('session.usage_record', { usage: { model: 'claude-opus-5.5', inputTokens: 10, outputTokens: 1, maxPromptTokens: 100 } }),
  padding,
  ev('assistant.message', { content: 'ok', toolRequests: [] }),
  ev('assistant.turn_end'),
  ev('session.model_change', { newModel: 'claude-sonnet-5.5' }),
  ev('user.message', { content: 'second' }),
  ev('permission.requested', { requestId: 'r1' }),
  padding
].join(''));
const seeded = parseCliEvents(evFile, fs.statSync(evFile).size);
assert(seeded.offset > 300 * 1024, 'cold start must skip everything before the last prompt');
assert.strictEqual(seeded.startedAt, Date.parse('2026-11-24T09:00:00.000Z'), 'start time comes from session.start');
assert.strictEqual(seeded.contextCwd, 'C:\\repo');
assert.strictEqual(seeded.model, 'claude-sonnet-5.5', 'model switch before the last prompt must be applied');
assert.strictEqual(seeded.lastPrompt, 'second');
assert.strictEqual(seeded.running, true);
assert.strictEqual(seeded.pending.size, 1, 'open permission after the last prompt must be pending');
fs.appendFileSync(evFile, ev('permission.completed', { requestId: 'r1' }) + ev('assistant.message', { content: 'done', toolRequests: [] }) + ev('assistant.turn_end'));
const appended = parseCliEvents(evFile, fs.statSync(evFile).size);
assert.strictEqual(appended.pending.size, 0, 'appended events are parsed incrementally');
assert.strictEqual(appended.running, false);
console.log('✓ Copilot CLI cold-start seeding tests passed successfully.');

// Test 6: Empty chat files are cached and not re-read while unchanged
console.log('Testing Copilot empty-chat cache...');
const emptyChat = path.join(tmpDir, 'empty.jsonl');
fs.writeFileSync(emptyChat, JSON.stringify({ kind: 0, v: { requests: [] } }) + '\n');
const realRead = fs.readFileSync;
let reads = 0;
fs.readFileSync = (...args) => { if (args[0] === emptyChat) reads++; return realRead(...args); };
try {
  assert.strictEqual(readJsonlSession(emptyChat, 'empty', ''), null);
  assert.strictEqual(readJsonlSession(emptyChat, 'empty', ''), null);
  assert.strictEqual(reads, 1, 'unchanged empty chat must not be read again');
  fs.appendFileSync(emptyChat, JSON.stringify({ kind: 2, k: ['requests'], v: [{ requestId: 'q', message: { text: 'hello' } }] }) + '\n');
  const grown = readJsonlSession(emptyChat, 'empty', '');
  assert.strictEqual(reads, 2, 'changed chat must be read again');
  assert(grown && grown.lastPrompt === 'hello', 'chat with a prompt must appear after it changed');
} finally {
  fs.readFileSync = realRead;
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
console.log('✓ Copilot empty-chat cache tests passed successfully.');

