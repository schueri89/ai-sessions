'use strict';

const assert = require('assert');
const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

console.log('Testing performance caches (Claude history, Antigravity, Codex, Cline, Quota)...');

function makeTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function rmDirSafe(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

async function testClaudeHistoryCache() {
  const tmpDir = makeTempDir('ais-claude-hist-');
  const prevEnv = process.env.CLAUDE_CONFIG_DIR;
  process.env.CLAUDE_CONFIG_DIR = tmpDir;
  try {
    const { scanHistory } = require('../lib/history');
    const sessionId = '11111111-2222-3333-4444-555555555555';
    const projDir = path.join(tmpDir, 'projects', 'demo-proj');
    fs.mkdirSync(projDir, { recursive: true });
    const file = path.join(projDir, `${sessionId}.jsonl`);
    const ts1 = new Date().toISOString();
    fs.writeFileSync(file, JSON.stringify({
      type: 'user',
      timestamp: ts1,
      cwd: 'C:\\work\\demo',
      message: { content: 'Erster Prompt' }
    }) + '\n', 'utf8');

    const first = await scanHistory({ detectionMode: 'auto' });
    assert.strictEqual(first.ok, true);
    assert.strictEqual(first.entries.length, 1);
    assert.strictEqual(first.entries[0].lastPrompt, 'Erster Prompt');

    let opens = 0;
    const origOpen = fsp.open;
    fsp.open = async (target, ...args) => {
      if (String(target) === file) opens++;
      return origOpen.call(fsp, target, ...args);
    };
    let second;
    try {
      second = await scanHistory({ detectionMode: 'auto' });
    } finally {
      fsp.open = origOpen;
    }
    assert.strictEqual(opens, 0, 'Unchanged Claude transcript must not be reopened on 2nd scanHistory');
    assert.strictEqual(second.entries.length, 1);

    // Append a new last-prompt record -> must invalidate cache and update lastPrompt
    const ts2 = new Date(Date.now() + 1000).toISOString();
    fs.appendFileSync(file, JSON.stringify({
      type: 'last-prompt',
      timestamp: ts2,
      lastPrompt: 'Zweiter Prompt'
    }) + '\n', 'utf8');
    const third = await scanHistory({ detectionMode: 'auto' });
    assert.strictEqual(third.entries[0].lastPrompt, 'Zweiter Prompt');
    console.log('✓ Claude history cache hit & invalidation verified');
  } finally {
    if (prevEnv === undefined) delete process.env.CLAUDE_CONFIG_DIR;
    else process.env.CLAUDE_CONFIG_DIR = prevEnv;
    rmDirSafe(tmpDir);
  }
}

async function testAntigravityCaches() {
  const tmpDir = makeTempDir('ais-ag-cache-');
  const prevEnv = process.env.ANTIGRAVITY_APP_DATA_DIR;
  process.env.ANTIGRAVITY_APP_DATA_DIR = tmpDir;
  try {
    const ag = require('../lib/providers/antigravity');
    const { fetchAntigravityQuota } = require('../lib/quota');

    const sessionId = 'ag-cache-test-1';
    const nowIso = new Date().toISOString();
    const db = new DatabaseSync(path.join(tmpDir, 'conversation_summaries.db'));
    db.exec(`
      CREATE TABLE conversation_summaries (
        conversation_id TEXT PRIMARY KEY,
        title TEXT,
        preview TEXT,
        status TEXT,
        not_fully_idle INTEGER,
        killed INTEGER,
        last_modified_time TEXT,
        last_user_input_time TEXT,
        workspace_uris TEXT,
        raw_summary TEXT
      );
    `);
    db.prepare(`
      INSERT INTO conversation_summaries VALUES (?, ?, ?, ?, 0, 0, ?, ?, '[]', '')
    `).run(sessionId, 'Test AG', 'Preview', 'CASCADE_RUN_STATUS_IDLE', nowIso, nowIso);
    db.close();

    const logsDir = path.join(tmpDir, 'brain', sessionId, '.system_generated', 'logs');
    fs.mkdirSync(logsDir, { recursive: true });
    const transFile = path.join(logsDir, 'transcript.jsonl');
    fs.writeFileSync(transFile, [
      JSON.stringify({ type: 'USER_INPUT', content: 'Erste AG Frage', created_at: nowIso }),
      JSON.stringify({ type: 'PLANNER_RESPONSE', input_tokens: 100, cache_read_tokens: 50, output_tokens: 25, model: 'gemini-3-flash', created_at: nowIso })
    ].join('\n') + '\n', 'utf8');

    const s1 = await ag.readSessions();
    assert.strictEqual(s1.length, 1);
    assert.strictEqual(s1[0].lastPrompt, 'Erste AG Frage');
    const q1 = await fetchAntigravityQuota();
    assert.strictEqual(q1.tokens7d, 175);

    let openSyncCount = 0;
    let readFileSyncCount = 0;
    const origOpenSync = fs.openSync;
    const origReadFileSync = fs.readFileSync;
    fs.openSync = (target, ...args) => {
      if (String(target) === transFile) openSyncCount++;
      return origOpenSync.call(fs, target, ...args);
    };
    fs.readFileSync = (target, ...args) => {
      if (String(target) === transFile) readFileSyncCount++;
      return origReadFileSync.call(fs, target, ...args);
    };
    try {
      await ag.readSessions();
      await fetchAntigravityQuota();
    } finally {
      fs.openSync = origOpenSync;
      fs.readFileSync = origReadFileSync;
    }
    assert.strictEqual(openSyncCount, 0, 'Unchanged Antigravity transcript tail must hit cache');
    assert.strictEqual(readFileSyncCount, 0, 'Unchanged Antigravity quota transcript must hit cache');

    const laterIso = new Date(Date.now() + 2000).toISOString();
    fs.appendFileSync(transFile, [
      JSON.stringify({ type: 'USER_INPUT', content: 'Zweite AG Frage', created_at: laterIso }),
      JSON.stringify({ type: 'PLANNER_RESPONSE', input_tokens: 200, cache_read_tokens: 0, output_tokens: 50, model: 'gemini-3-flash', created_at: laterIso })
    ].join('\n') + '\n', 'utf8');

    const s2 = await ag.readSessions();
    assert.strictEqual(s2[0].lastPrompt, 'Zweite AG Frage');
    const q2 = await fetchAntigravityQuota();
    assert.strictEqual(q2.tokens7d, 425);
    console.log('✓ Antigravity tail & quota caches verified');
  } finally {
    if (prevEnv === undefined) delete process.env.ANTIGRAVITY_APP_DATA_DIR;
    else process.env.ANTIGRAVITY_APP_DATA_DIR = prevEnv;
    rmDirSafe(tmpDir);
  }
}

async function testCodexCaches() {
  const tmpDir = makeTempDir('ais-codex-cache-');
  const prevEnv = process.env.CODEX_CONFIG_DIR;
  process.env.CODEX_CONFIG_DIR = tmpDir;
  try {
    const codex = require('../lib/providers/codex');
    const sessionId = 'codex-cache-1';
    const now = Date.now();
    const db = new DatabaseSync(path.join(tmpDir, 'state_5.sqlite'));
    db.exec(`
      CREATE TABLE threads (
        id TEXT PRIMARY KEY,
        rollout_path TEXT,
        cwd TEXT,
        title TEXT,
        tokens_used INTEGER,
        model TEXT,
        created_at_ms INTEGER,
        updated_at_ms INTEGER,
        first_user_message TEXT,
        archived INTEGER
      );
    `);
    db.prepare(`
      INSERT INTO threads VALUES (?, '', 'C:\\work\\demo', 'Codex Test', 0, 'gpt-5.3-codex', ?, ?, 'Initial', 0)
    `).run(sessionId, now, now);
    db.close();

    const dayDir = path.join(tmpDir, 'sessions', '2026', '11', '24');
    fs.mkdirSync(dayDir, { recursive: true });
    const rolloutFile = path.join(dayDir, `rollout-2026-11-24-${sessionId}.jsonl`);
    fs.writeFileSync(rolloutFile, JSON.stringify({
      type: 'event_msg',
      timestamp: new Date(now).toISOString(),
      payload: { type: 'user_message', message: 'Codex Prompt 1' }
    }) + '\n', 'utf8');

    const r1 = await codex.readSessions();
    assert.strictEqual(r1.length, 1);
    assert.strictEqual(r1[0].rolloutPath, rolloutFile);
    assert.strictEqual(r1[0].lastPrompt, 'Codex Prompt 1');

    let treeWalks = 0;
    let tailOpens = 0;
    const origReaddirSync = fs.readdirSync;
    const origOpenSync = fs.openSync;
    const sessionsRoot = path.join(tmpDir, 'sessions');
    fs.readdirSync = (target, ...args) => {
      if (String(target) === sessionsRoot) treeWalks++;
      return origReaddirSync.call(fs, target, ...args);
    };
    fs.openSync = (target, ...args) => {
      if (String(target) === rolloutFile) tailOpens++;
      return origOpenSync.call(fs, target, ...args);
    };
    try {
      const r2 = await codex.readSessions();
      assert.strictEqual(r2[0].rolloutPath, rolloutFile);
    } finally {
      fs.readdirSync = origReaddirSync;
      fs.openSync = origOpenSync;
    }
    assert.strictEqual(treeWalks, 0, 'Cached rollout path must skip sessions tree walk');
    assert.strictEqual(tailOpens, 0, 'Unchanged Codex rollout file must hit tail cache');

    fs.appendFileSync(rolloutFile, JSON.stringify({
      type: 'event_msg',
      timestamp: new Date(now + 2000).toISOString(),
      payload: { type: 'user_message', message: 'Codex Prompt 2' }
    }) + '\n', 'utf8');
    const r3 = await codex.readSessions();
    assert.strictEqual(r3[0].lastPrompt, 'Codex Prompt 2');
    console.log('✓ Codex rollout path & tail caches verified');
  } finally {
    if (prevEnv === undefined) delete process.env.CODEX_CONFIG_DIR;
    else process.env.CODEX_CONFIG_DIR = prevEnv;
    rmDirSafe(tmpDir);
  }
}

async function testClineCache() {
  const tmpDir = makeTempDir('ais-cline-cache-');
  const prevEnv = process.env.CLINE_DATA_DIR;
  process.env.CLINE_DATA_DIR = tmpDir;
  try {
    const cline = require('../lib/providers/cline');
    const sessionId = 'cline-cache-1';
    const nowIso = new Date().toISOString();
    fs.mkdirSync(path.join(tmpDir, 'db'), { recursive: true });
    const msgDir = path.join(tmpDir, 'sessions', sessionId);
    fs.mkdirSync(msgDir, { recursive: true });
    const msgFile = path.join(msgDir, `${sessionId}.messages.json`);
    fs.writeFileSync(msgFile, JSON.stringify({
      messages: [
        { role: 'user', ts: Date.now(), content: [{ type: 'text', text: 'Cline Prompt 1' }] }
      ]
    }), 'utf8');

    const db = new DatabaseSync(path.join(tmpDir, 'db', 'sessions.db'));
    db.exec(`
      CREATE TABLE sessions (
        session_id TEXT PRIMARY KEY,
        source TEXT,
        pid INTEGER,
        started_at TEXT,
        ended_at TEXT,
        exit_code INTEGER,
        status TEXT,
        provider TEXT,
        model TEXT,
        cwd TEXT,
        workspace_root TEXT,
        prompt TEXT,
        metadata_json TEXT,
        messages_path TEXT,
        updated_at TEXT
      );
    `);
    db.prepare(`
      INSERT INTO sessions VALUES (?, 'cli', 0, ?, ?, 0, 'idle', 'ollama', 'gemma4:26b', 'C:\\work\\demo', 'C:\\work\\demo', 'Cline Prompt 1', '{}', ?, ?)
    `).run(sessionId, nowIso, nowIso, msgFile, nowIso);
    db.close();

    const c1 = await cline.readSessions();
    assert.strictEqual(c1.length, 1);
    assert.strictEqual(c1[0].lastPrompt, 'Cline Prompt 1');

    let reads = 0;
    const origReadFileSync = fs.readFileSync;
    fs.readFileSync = (target, ...args) => {
      if (String(target) === msgFile) reads++;
      return origReadFileSync.call(fs, target, ...args);
    };
    try {
      await cline.readSessions();
    } finally {
      fs.readFileSync = origReadFileSync;
    }
    assert.strictEqual(reads, 0, 'Unchanged Cline messages.json must hit cache');

    fs.writeFileSync(msgFile, JSON.stringify({
      messages: [
        { role: 'user', ts: Date.now(), content: [{ type: 'text', text: 'Cline Prompt 1' }] },
        { role: 'user', ts: Date.now() + 1000, content: [{ type: 'text', text: 'Cline Prompt 2' }] }
      ]
    }), 'utf8');
    const c2 = await cline.readSessions();
    assert.strictEqual(c2[0].lastPrompt, 'Cline Prompt 2');
    console.log('✓ Cline messages.json cache verified');
  } finally {
    if (prevEnv === undefined) delete process.env.CLINE_DATA_DIR;
    else process.env.CLINE_DATA_DIR = prevEnv;
    rmDirSafe(tmpDir);
  }
}

function testAuditManagerSyncReconcile() {
  const { AuditManager } = require('../lib/auditManager');
  const start = performance.now();
  const mgr = new AuditManager({});
  const ctorMs = performance.now() - start;
  assert(ctorMs < 500, `AuditManager constructor should not block synchronously (took ${ctorMs.toFixed(1)} ms)`);

  const recStart = performance.now();
  mgr.reconcileRunningProcesses();
  const recMs = performance.now() - recStart;
  assert(recMs < 200, `reconcileRunningProcesses should be fast without PowerShell (took ${recMs.toFixed(1)} ms)`);

  const parsed = mgr.parseActiveAuditProcessesOutput(JSON.stringify({
    pid: process.pid,
    commandLine: 'python project-audit.py --project demo-app --mode security --diff HEAD~1 --model gemma4:e4b',
    creationDate: '2026-11-24T18:00:00.0000000+01:00'
  }));
  assert.strictEqual(parsed.length, 1);
  assert.strictEqual(parsed[0].project, 'demo-app');
  assert.strictEqual(parsed[0].mode, 'security');
  assert.strictEqual(parsed[0].diff, 'HEAD~1');
  mgr.dispose();
  console.log(`✓ AuditManager non-blocking reconcile & parser verified (ctor ${ctorMs.toFixed(1)} ms, reconcile ${recMs.toFixed(1)} ms)`);
}

(async () => {
  await testClaudeHistoryCache();
  await testAntigravityCaches();
  await testCodexCaches();
  await testClineCache();
  testAuditManagerSyncReconcile();
  console.log('All performance cache tests passed successfully!');
  process.exit(0);
})().catch((err) => {
  console.error('Performance cache tests failed:', err);
  process.exit(1);
});
