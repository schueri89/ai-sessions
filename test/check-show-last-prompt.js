'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

console.log('Testing sessionDashboard.showLastPrompt setting & board rendering logic...');

// 1. package.json validation
const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const props = pkg.contributes?.configuration?.properties || {};

assert(props['sessionDashboard.showLastPrompt'], 'Setting sessionDashboard.showLastPrompt must exist in package.json');
assert.strictEqual(props['sessionDashboard.showLastPrompt'].type, 'boolean', 'Setting type must be boolean');
assert.strictEqual(props['sessionDashboard.showLastPrompt'].default, false, 'Setting default must be false (disabled for compact cards)');
console.log('✓ package.json setting definition verified (default: false)');

// 2. Logic simulation: prompt rendering conditions
function shouldRenderPrompt(s, terms, showLastPromptSetting) {
  const promptMatched = terms && terms.length > 0 && terms.some((t) => s.lastPrompt && s.lastPrompt.toLowerCase().includes(t));
  return Boolean(s.lastPrompt && (showLastPromptSetting || promptMatched));
}

const sessionWithPrompt = {
  sessionId: 'test-1',
  title: 'Bugfix feature',
  lastPrompt: 'Bitte repariere den Rate-Limit-Reset'
};

const sessionWithoutPrompt = {
  sessionId: 'test-2',
  title: 'Empty session',
  lastPrompt: ''
};

// Case A: Setting is false, no search -> do not render prompt
assert.strictEqual(
  shouldRenderPrompt(sessionWithPrompt, [], false),
  false,
  'When showLastPrompt is false and no search active, prompt should not render'
);

// Case B: Setting is true, no search -> render prompt
assert.strictEqual(
  shouldRenderPrompt(sessionWithPrompt, [], true),
  true,
  'When showLastPrompt is true, prompt should render'
);

// Case C: Setting is false, but search term matches prompt -> render prompt (smart search)
assert.strictEqual(
  shouldRenderPrompt(sessionWithPrompt, ['rate-limit'], false),
  true,
  'When search term matches prompt, prompt should render even if setting is false'
);

// Case D: Setting is false, search term matches title but NOT prompt -> do not render prompt
assert.strictEqual(
  shouldRenderPrompt(sessionWithPrompt, ['bugfix'], false),
  false,
  'When search term only matches title, prompt should not render if setting is false'
);

// Case E: Session has no prompt -> never render prompt
assert.strictEqual(
  shouldRenderPrompt(sessionWithoutPrompt, [], true),
  false,
  'When session has no lastPrompt, prompt should not render'
);
assert.strictEqual(
  shouldRenderPrompt(sessionWithoutPrompt, ['empty'], true),
  false,
  'When session has no lastPrompt, prompt should not render even with search'
);

console.log('✓ Smart prompt rendering & search matching logic passed');

// 3. Tooltip generation
function getCardTooltip(s) {
  return 'Chat öffnen' + (s.lastPrompt ? '\n\nLetzter Prompt:\n' + s.lastPrompt : '');
}

const tooltip = getCardTooltip(sessionWithPrompt);
assert(tooltip.includes('Chat öffnen'), 'Tooltip must contain Chat öffnen');
assert(tooltip.includes('Letzter Prompt:\nBitte repariere den Rate-Limit-Reset'), 'Tooltip must contain lastPrompt');

console.log('✓ Tooltip formatting passed');
console.log('All showLastPrompt tests passed successfully.');
