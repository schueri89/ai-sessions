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
      fillText: noop,
      beginPath: noop,
      moveTo: noop,
      lineTo: noop,
      stroke: noop
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

// 4. Shared column builder produces expected structure incl. statusUpdatedAt and waitingFor
const builtCols = buildSessionColumns({
  visibleSessions: () => [{ sessionId: 'x1', displayState: 'waiting', waitingFor: 'permission', provider: 'claude', project: 'tvw-hub', title: 'Test', statusUpdatedAt: 123456 }],
  getProjectDetectionMode: () => 'auto'
});
assert.strictEqual(builtCols.find((c) => c.state === 'waiting').sessions.length, 1, 'buildSessionColumns ordnet waiting korrekt zu');
assert.strictEqual(builtCols.find((c) => c.state === 'waiting').sessions[0].statusUpdatedAt, 123456, 'buildSessionColumns übernimmt statusUpdatedAt');
assert.strictEqual(builtCols.find((c) => c.state === 'waiting').sessions[0].waitingFor, 'permission', 'buildSessionColumns übernimmt waitingFor');

// 5. Coffee queue limit (max. 3), celebration confetti, and diverse state rendering in VM
{
  const noop = () => {};
  let fakeNow = 1000000;
  class FakeDate extends Date {
    constructor(...args) {
      super(args.length === 0 ? fakeNow : args[0]);
    }
    static now() { return fakeNow; }
  }
  let nextRaf = null;
  const makeEl = () => ({
    style: {},
    classList: { contains: () => false, add: noop, remove: noop, toggle: noop },
    addEventListener: noop,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 768, height: 276 }),
    getContext: () => ({
      fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left',
      fillRect: noop, strokeRect: noop, fillText: noop,
      beginPath: noop, moveTo: noop, lineTo: noop, stroke: noop
    }),
    parentElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 768, height: 276 }) },
    innerHTML: '', value: 'all', width: 768, height: 276
  });
  const els = new Map();
  const sandbox = {
    vscode: { postMessage: noop },
    window: {},
    document: {
      hidden: false,
      body: { classList: { contains: () => false } },
      getElementById: (id) => {
        if (!els.has(id)) els.set(id, makeEl());
        return els.get(id);
      },
      addEventListener: noop
    },
    getComputedStyle: () => ({ backgroundColor: 'rgb(30, 30, 30)', getPropertyValue: () => '' }),
    requestAnimationFrame: (cb) => { nextRaf = cb; return 1; },
    cancelAnimationFrame: () => { nextRaf = null; },
    Date: FakeDate,
    Math, Map, Set, Array, Number, String, Boolean
  };
  vm.runInNewContext(getOfficeClientScript({ isPopout: false }), sandbox);
  const office = sandbox.window.__aiOffice;
  office.setActive(true);

  // Initial busy + waiting + rate-limited sessions
  const busySessions = ['c1', 'c2', 'c3', 'c4', 'c5'].map((id, idx) => ({
    sessionId: id,
    provider: 'claude',
    project: 'proj-' + idx,
    title: 'Task ' + idx,
    activity: idx === 0 ? '🛠️ npm test' : (idx === 1 ? '📖 Liest file.js' : (idx === 2 ? '🧠 Denkt nach…' : 'Arbeitet…')),
    tokens: { percent: idx * 25 },
    statusUpdatedAt: fakeNow - idx * 1000
  }));
  office.update({
    columns: [
      { state: 'busy', label: 'Arbeitet', sessions: busySessions },
      { state: 'waiting', label: 'Wartet auf dich', sessions: [{ sessionId: 'w1', provider: 'copilot', project: 'p', waitingFor: 'permission', detail: 'Freigabe nötig', statusUpdatedAt: fakeNow }] }
    ]
  });

  // Transition all 5 busy sessions to idle simultaneously
  fakeNow += 500;
  office.update({
    columns: [
      { state: 'idle', label: 'Fertig', sessions: busySessions.map((s) => ({ ...s, statusUpdatedAt: fakeNow })) },
      { state: 'busy', label: 'Arbeitet', sessions: [{ sessionId: 'rl1', provider: 'antigravity', project: 'rl', rateLimit: { resetsAt: fakeNow + 60000 }, statusUpdatedAt: fakeNow }] }
    ],
    justCompletedSessionIds: ['c1', 'c2', 'c3', 'c4', 'c5']
  });
  assert(office.getStats().confettiCount > 0, 'Abschluss-Jubel muss Konfetti-Partikel erzeugen');

  // Advance simulation past 2.2s celebration phase so coffee walkers depart
  for (let i = 0; i < 60; i++) {
    fakeNow += 50;
    if (nextRaf) nextRaf();
  }
  const stats = office.getStats();
  assert.strictEqual(stats.coffeeQueueCount, 3, 'Maximal 3 Entwickler dürfen gleichzeitig zur Kaffeemaschine laufen/warten');
  const coffeeCount = Object.values(stats.phases).filter((p) => p.phase === 'toCoffee' || p.phase === 'atCoffee').length;
  assert.strictEqual(coffeeCount, 3, 'Genau 3 Akteure befinden sich in der Kaffee-Warteschlange');
  assert.strictEqual(stats.phases.c4.phase, 'seated', 'Der 4. Entwickler bleibt am Platz');
  assert.strictEqual(stats.phases.c5.phase, 'seated', 'Der 5. Entwickler bleibt am Platz');
  office.setActive(false);
}
console.log('✓ Kaffee-Warteschlange (max. 3), Abschluss-Jubel & Zustandsvarianten OK');

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
