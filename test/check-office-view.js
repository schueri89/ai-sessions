'use strict';

const assert = require('assert');
const vm = require('vm');
const Module = require('module');

// Mock 'vscode'
const origRequire = Module.prototype.require;
Module.prototype.require = function (id) {
  if (id === 'vscode') {
    return {
      ViewColumn: { Beside: 2 },
      Uri: { joinPath: () => ({}) },
      workspace: { getConfiguration: () => ({ get: () => '' }) }
    };
  }
  return origRequire.apply(this, arguments);
};

const { buildOfficeLayout, getOfficeHtml, getOfficeClientScript } = require('../lib/officeView');
const { buildSessionColumns } = require('../lib/format');
const { BoardPanel } = require('../lib/boardPanel');
const { OfficePanel } = require('../lib/officePanel');

// 1. Client script syntax and runtime execution in sandboxed VM (catches missing globals like OFFICE_ACTIVE_STATES)
for (const isPopout of [false, true]) {
  const script = getOfficeClientScript({ isPopout });
  new vm.Script(script);

  const noop = () => {};
  const makeStubEl = () => ({
    style: {},
    classList: { contains: () => false, add: noop, remove: noop, toggle: noop },
    addEventListener: noop,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 752, height: 276 }),
    getContext: () => ({
      fillStyle: '',
      strokeStyle: '',
      lineWidth: 1,
      font: '',
      textAlign: 'left',
      fillRect: noop,
      strokeRect: noop,
      fillText: noop
    }),
    parentElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 752, height: 276 }) },
    innerHTML: '',
    value: 'all',
    width: 752,
    height: 276
  });
  const elements = new Map();
  const sandbox = {
    vscode: { postMessage: noop },
    window: {},
    document: {
      hidden: false,
      body: { classList: { contains: () => false } },
      getElementById: (id) => {
        if (!elements.has(id)) elements.set(id, makeStubEl());
        return elements.get(id);
      },
      addEventListener: noop
    },
    getComputedStyle: () => ({ backgroundColor: 'rgb(30, 30, 30)', getPropertyValue: () => '' }),
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: noop,
    Date,
    Math,
    Map,
    Set,
    Array,
    Number,
    String,
    Boolean
  };
  vm.runInNewContext(script, sandbox);
  assert(sandbox.window.__aiOffice && typeof sandbox.window.__aiOffice.update === 'function', 'window.__aiOffice muss initialisiert sein');
  sandbox.window.__aiOffice.update({
    columns: [
      { state: 'busy', label: 'Arbeitet', sessions: [{ sessionId: 'vm-1', provider: 'claude', project: 'tvw-hub', title: 'VM Test' }] }
    ],
    justCompletedSessionIds: ['vm-1'],
    filter: 'all',
    projectFilter: 'all',
    counts: { all: 1, byProject: { 'tvw-hub': 1 } }
  });
  sandbox.window.__aiOffice.setActive(true);
  sandbox.window.__aiOffice.setActive(false);
}
console.log('✓ OfficeView Client-Skript Syntax & Sandbox-Ausführung OK (Sub-Tab & Popout)');

// 2. Done sessions are filtered out while active states remain
const sampleColumns = [
  { state: 'waiting', label: 'Wartet auf dich', sessions: [{ sessionId: 's-wait', provider: 'copilot', project: 'cf-shared', title: 'Wait' }] },
  { state: 'busy', label: 'Arbeitet', sessions: [{ sessionId: 's-busy', provider: 'claude', project: 'tvw-hub', title: 'Busy' }] },
  { state: 'bookmarked', label: 'Gemerkt', sessions: [{ sessionId: 's-pin', provider: 'codex', project: 'ai-hub', title: 'Pin' }] },
  { state: 'idle', label: 'Fertig', sessions: [{ sessionId: 's-idle', provider: 'antigravity', project: 'ai-sessions', title: 'Idle' }] },
  { state: 'done', label: 'Erledigt', sessions: [{ sessionId: 's-done', provider: 'claude', project: 'old', title: 'Done' }] }
];

const layout1 = buildOfficeLayout(sampleColumns);
assert.strictEqual(layout1.items.length, 4, 'done-Session muss im Büro ausgeblendet bleiben');
assert(!layout1.items.some((i) => i.sessionId === 's-done'), 'done-Session darf nicht im Layout landen');

// 3. Desk slots stay stable when a session changes state (e.g. busy -> idle)
const slotBusyBefore = layout1.items.find((i) => i.sessionId === 's-busy').slot;
const movedColumns = [
  { state: 'waiting', label: 'Wartet auf dich', sessions: [{ sessionId: 's-wait', provider: 'copilot', project: 'cf-shared', title: 'Wait' }] },
  { state: 'busy', label: 'Arbeitet', sessions: [{ sessionId: 's-new', provider: 'cline', project: 'e-finder', title: 'New' }] },
  { state: 'bookmarked', label: 'Gemerkt', sessions: [{ sessionId: 's-pin', provider: 'codex', project: 'ai-hub', title: 'Pin' }] },
  { state: 'idle', label: 'Fertig', sessions: [
    { sessionId: 's-idle', provider: 'antigravity', project: 'ai-sessions', title: 'Idle' },
    { sessionId: 's-busy', provider: 'claude', project: 'tvw-hub', title: 'Now Idle' }
  ] }
];
const layout2 = buildOfficeLayout(movedColumns, layout1.slots);
const slotBusyAfter = layout2.items.find((i) => i.sessionId === 's-busy').slot;
assert.strictEqual(slotBusyAfter, slotBusyBefore, 'Schreibtischplatz muss bei Statuswechsel stabil bleiben');
assert.strictEqual(layout2.items.length, 5, 'Neue Session muss hinzugefügt werden');

// 4. Shared column builder produces expected structure
const builtCols = buildSessionColumns({
  visibleSessions: () => [{ sessionId: 'x1', displayState: 'busy', provider: 'claude', project: 'tvw-hub', title: 'Test', statusUpdatedAt: Date.now() }],
  getProjectDetectionMode: () => 'auto'
});
assert.strictEqual(builtCols.find((c) => c.state === 'busy').sessions.length, 1, 'buildSessionColumns ordnet busy korrekt zu');

// 5. BoardPanel & OfficePanel HTML expose office view markers
const bpHtml = new BoardPanel({}).html();
assert(bpHtml.includes('data-submode="office"'), 'BoardPanel benötigt Sub-Nav-Button für Büro');
assert(bpHtml.includes('id="btn-office-popout"'), 'BoardPanel benötigt Popout-Button');
assert(bpHtml.includes("currentViewMode !== 'board'"), 'Quota-Leiste muss außerhalb von Board (z. B. im Büro-Tab) ausgeblendet bleiben');

const opHtml = new OfficePanel({}).html();
assert(opHtml.includes('id="office-provider-select"'), 'OfficePanel benötigt Provider-Filter');
assert(opHtml.includes('id="office-project-select"'), 'OfficePanel benötigt Projekt-Filter');
assert(!getOfficeHtml({ isPopout: true }).includes('id="btn-office-popout"'), 'Popout selbst darf keinen Popout-Button rendern');

console.log('Alle Office-View Unit-Tests bestanden.');
