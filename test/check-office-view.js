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

// 2. Done sessions are filtered out while all active states remain without 24-desk cap
const manyIdle = Array.from({ length: 22 }, (_, i) => ({
  sessionId: `s-idle-${i}`,
  provider: 'antigravity',
  project: 'ai-sessions',
  title: `Idle ${i}`,
  statusUpdatedAt: 1000 + i
}));
const sampleColumns = [
  { state: 'waiting', label: 'Wartet auf dich', sessions: Array.from({ length: 3 }, (_, i) => ({ sessionId: `s-wait-${i}`, provider: 'copilot', project: 'cf-shared', title: `Wait ${i}`, statusUpdatedAt: 2000 + i })) },
  { state: 'busy', label: 'Arbeitet', sessions: Array.from({ length: 3 }, (_, i) => ({ sessionId: `s-busy-${i}`, provider: 'claude', project: 'tvw-hub', title: `Busy ${i}`, statusUpdatedAt: 3000 + i })) },
  { state: 'bookmarked', label: 'Gemerkt', sessions: Array.from({ length: 2 }, (_, i) => ({ sessionId: `s-pin-${i}`, provider: 'codex', project: 'ai-hub', title: `Pin ${i}`, statusUpdatedAt: 2500 + i })) },
  { state: 'idle', label: 'Fertig', sessions: manyIdle },
  { state: 'done', label: 'Erledigt', sessions: [{ sessionId: 's-done', provider: 'claude', project: 'old', title: 'Done', statusUpdatedAt: 9999 }] }
];

const layout1 = buildOfficeLayout(sampleColumns);
assert.strictEqual(layout1.items.length, 30, 'Alle 30 aktiven Sessions (inkl. aller 22 Fertig-Sessions) müssen ohne 24er-Limit angezeigt werden');
assert.strictEqual(layout1.items.filter((i) => i.state === 'idle').length, 22, 'Alle 22 Fertig-Sessions müssen erhalten bleiben');
assert.strictEqual(layout1.truncated, false, 'Standardmäßig darf nicht abgeschnitten werden');
assert(!layout1.items.some((i) => i.sessionId === 's-done'), 'done-Session darf nicht im Layout landen');

// 3. Desks are sorted by statusUpdatedAt descending (newest first)
for (let i = 1; i < layout1.items.length; i++) {
  assert(
    (layout1.items[i - 1].statusUpdatedAt || 0) >= (layout1.items[i].statusUpdatedAt || 0),
    'Desks müssen nach Datum absteigend (neueste zuerst) sortiert sein'
  );
}
assert.strictEqual(layout1.items[0].sessionId, 's-busy-2', 'Neueste Session muss auf Desk 0 (oben links) liegen');

const updatedColumns = [
  { state: 'waiting', label: 'Wartet auf dich', sessions: [{ sessionId: 's-wait-0', provider: 'copilot', project: 'cf-shared', title: 'Wait 0', statusUpdatedAt: 2000 }] },
  { state: 'busy', label: 'Arbeitet', sessions: [{ sessionId: 's-busy-2', provider: 'claude', project: 'tvw-hub', title: 'Busy 2', statusUpdatedAt: 3002 }] },
  { state: 'bookmarked', label: 'Gemerkt', sessions: [] },
  { state: 'idle', label: 'Fertig', sessions: [{ sessionId: 's-idle-0', provider: 'antigravity', project: 'ai-sessions', title: 'Idle Updated', statusUpdatedAt: 5000 }] }
];
const layout2 = buildOfficeLayout(updatedColumns, layout1.slots);
assert.strictEqual(layout2.items[0].sessionId, 's-idle-0', 'Aktualisierte Session mit neuestem Datum muss nach vorne auf Desk 0 rücken');

// 4. Shared column builder produces expected structure incl. statusUpdatedAt
const builtCols = buildSessionColumns({
  visibleSessions: () => [{ sessionId: 'x1', displayState: 'busy', provider: 'claude', project: 'tvw-hub', title: 'Test', statusUpdatedAt: 123456 }],
  getProjectDetectionMode: () => 'auto'
});
assert.strictEqual(builtCols.find((c) => c.state === 'busy').sessions.length, 1, 'buildSessionColumns ordnet busy korrekt zu');
assert.strictEqual(builtCols.find((c) => c.state === 'busy').sessions[0].statusUpdatedAt, 123456, 'buildSessionColumns übernimmt statusUpdatedAt');

// 5. BoardPanel & OfficePanel HTML expose office view markers and place inspector above canvas
const bpHtml = new BoardPanel({}).html();
assert(bpHtml.includes('data-submode="office"'), 'BoardPanel benötigt Sub-Nav-Button für Büro');
assert(bpHtml.includes('id="btn-office-popout"'), 'BoardPanel benötigt Popout-Button');
assert(bpHtml.includes("currentViewMode !== 'board'"), 'Quota-Leiste muss außerhalb von Board (z. B. im Büro-Tab) ausgeblendet bleiben');

const opHtml = new OfficePanel({}).html();
assert(opHtml.includes('id="office-provider-select"'), 'OfficePanel benötigt Provider-Filter');
assert(opHtml.includes('id="office-project-select"'), 'OfficePanel benötigt Projekt-Filter');
assert(!getOfficeHtml({ isPopout: true }).includes('id="btn-office-popout"'), 'Popout selbst darf keinen Popout-Button rendern');
const officeMarkup = getOfficeHtml({ isPopout: false });
assert(
  officeMarkup.indexOf('id="office-inspector"') < officeMarkup.indexOf('id="office-canvas"'),
  'Infos des ausgewählten Chats müssen oberhalb des Büro-Canvas stehen'
);

console.log('Alle Office-View Unit-Tests bestanden.');
