'use strict';

const assert = require('assert');
const path = require('path');
const cline = require('../lib/providers/cline');
const { friendlyModel, resolveMaxContext } = require('../lib/format');
const { findTranscriptFile, parseClineTranscript } = require('../lib/transcriptParser');
const { readSessions } = require('../lib/registry');

console.log('Testing Cline Provider Integration...');

// 1. Test friendlyModel and resolveMaxContext
assert.strictEqual(friendlyModel('gemma4:26b'), 'Gemma 4 26B');
assert.strictEqual(friendlyModel('gemma-4-26b'), 'Gemma 4 26B');
assert.strictEqual(friendlyModel('gemma4'), 'Gemma 4');
assert.strictEqual(resolveMaxContext('gemma4:26b'), 128000);
console.log('✓ friendlyModel and resolveMaxContext passed');

// 2. Test cleanClineTitle
assert.strictEqual(
  cline.cleanClineTitle(
    'Alle Projekte liegen unter C:\\\nKannst du das irgendwie abspeichern?',
    'Alle Projekte liegen unter C:\\\nKannst du das irgendwie abspeichern, dass bei neuen Sessions mit "Cline" diese Info bekannt ist?'
  ),
  'Kannst du das irgendwie abspeichern, dass bei neuen Sessions mit…'
);
assert.strictEqual(
  cline.cleanClineTitle('Welche Infos zum steuer-fritze Projekt kannst du mir nennen?'),
  'Welche Infos zum steuer-fritze Projekt kannst du mir nennen?'
);
assert.strictEqual(
  cline.cleanClineTitle('Custom Manual Title', 'Some long prompt text here'),
  'Custom Manual Title'
);
console.log('✓ cleanClineTitle unit tests passed');

// 3. Test reading live sessions
(async () => {
  const sessions = await cline.readSessions();
  assert(Array.isArray(sessions), 'readSessions must return an array');
  console.log(`✓ cline.readSessions returned ${sessions.length} sessions`);

  for (const s of sessions) {
    assert.strictEqual(s.rawStatus, s.state, 'rawStatus must match state to prevent stale failure markers');
    assert(s.title.length <= 66, `title length must be <= 66 chars, got ${s.title.length}`);
    assert(s.statusUpdatedAt > 0, 'statusUpdatedAt must be positive');
  }

  if (sessions.length > 0) {
    const s = sessions[0];
    assert.strictEqual(s.provider, 'cline');
    assert(s.sessionId, 'Session must have sessionId');
    assert(s.project, 'Session must have project');
    assert(s.tokens, 'Session must have tokens');
    assert.strictEqual(typeof s.totalCostUSD, 'number');
    console.log(`✓ Sample session verified: [${s.sessionId}] Project=${s.project}, Model=${s.tokens.model}`);

    // Test transcript parsing
    const transcriptInfo = findTranscriptFile(s.sessionId, 'cline');
    if (transcriptInfo && transcriptInfo.file) {
      const parsed = parseClineTranscript(transcriptInfo.file, s.sessionId);
      assert(parsed, 'parseClineTranscript must return an object');
      assert.strictEqual(parsed.provider, 'cline');
      assert(Array.isArray(parsed.turns), 'turns must be an array');
      console.log(`✓ Transcript parsing verified: ${parsed.turns.length} turns parsed`);
    }
  }

  // 3. Test registry integration
  const allSessions = await readSessions({ cline: true });
  const clineFound = allSessions.filter((s) => s.provider === 'cline');
  assert.strictEqual(clineFound.length, sessions.length, 'Registry must include Cline sessions');
  console.log(`✓ Registry readSessions includes ${clineFound.length} Cline sessions`);

  const disabledSessions = await readSessions({ cline: false });
  assert.strictEqual(disabledSessions.some((s) => s.provider === 'cline'), false, 'Registry must respect cline: false');
  console.log('✓ Registry respects cline: false');

  console.log('All Cline integration tests passed successfully.');
})().catch((err) => {
  console.error('Cline test failed:', err);
  process.exit(1);
});

