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
  let fakeNow = new Date(2026, 10, 16, 14, 0, 0).getTime();
  class FakeDate extends Date {
    constructor(...args) {
      if (args.length === 0) super(fakeNow);
      else super(...args);
    }
    static now() { return fakeNow; }
  }
  let nextRaf = null;
  let drawOps = [];
  const makeEl = () => ({
    style: {},
    classList: { contains: () => false, add: noop, remove: noop, toggle: noop },
    addEventListener: noop,
    querySelectorAll: () => [],
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 768, height: 276 }),
    getContext: () => ({
      fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left',
      fillRect: (x, y, w, h) => drawOps.push({ op: 'rect', x, y, w, h }),
      strokeRect: noop,
      fillText: (text, x, y) => drawOps.push({ op: 'text', text, x, y }),
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
  for (let i = 0; i < 55; i++) {
    fakeNow += 50;
    if (nextRaf) nextRaf();
  }
  drawOps = [];
  fakeNow += 50;
  if (nextRaf) nextRaf();
  const stats = office.getStats();
  assert.strictEqual(stats.coffeeQueueCount, 3, 'Maximal 3 Entwickler dürfen gleichzeitig zur Kaffeemaschine laufen/warten');
  const coffeeCount = Object.values(stats.phases).filter((p) => (p.phase === 'toDrink' || p.phase === 'atDrink') && p.drinkStation === 'coffee').length;
  assert.strictEqual(coffeeCount, 3, 'Genau 3 Akteure befinden sich vor 16 Uhr in der Kaffee-Warteschlange');
  assert.strictEqual(stats.phases.c4.phase, 'seated', 'Der 4. Entwickler bleibt am Platz');
  assert.strictEqual(stats.phases.c5.phase, 'seated', 'Der 5. Entwickler bleibt am Platz');
  // Verify row-0 walker (y ~ 42) is drawn before row-0 seated desk ('proj-3') so seated avatars occlude passing walkers
  const row0DeskIdx = drawOps.findIndex((o) => o.op === 'text' && o.text === 'proj-3');
  const walkerLegsIdx = drawOps.findIndex((o) => o.op === 'rect' && o.y >= 64 && o.y <= 68 && o.h >= 5 && o.w === 5);
  assert(row0DeskIdx > 0 && walkerLegsIdx > 0 && walkerLegsIdx < row0DeskIdx, 'Laufender Avatar im Gang muss vor den sitzenden Avataren derselben Reihe gezeichnet werden');

  // After 16:00, newly completed developers head to the Bar for a beer from the fridge
  fakeNow = new Date(2026, 10, 16, 16, 15, 0).getTime();
  office.update({
    columns: [
      { state: 'busy', label: 'Arbeitet', sessions: [{ sessionId: 'b1', provider: 'claude', project: 'bar-test', statusUpdatedAt: fakeNow }] },
      { state: 'idle', label: 'Fertig', sessions: busySessions.map((s) => ({ ...s, statusUpdatedAt: fakeNow })) }
    ]
  });
  fakeNow += 500;
  office.update({
    columns: [
      { state: 'idle', label: 'Fertig', sessions: [{ sessionId: 'b1', provider: 'claude', project: 'bar-test', statusUpdatedAt: fakeNow }, ...busySessions.map((s) => ({ ...s, statusUpdatedAt: fakeNow - 1000 }))] }
    ],
    justCompletedSessionIds: ['b1']
  });
  for (let i = 0; i < 55; i++) {
    fakeNow += 50;
    if (nextRaf) nextRaf();
  }
  const barStats = office.getStats();
  assert.strictEqual(barStats.barQueueCount, 1, 'Ab 16 Uhr muss der fertige Entwickler zur Bar gehen');
  assert.strictEqual(barStats.phases.b1.drinkStation, 'bar', 'Station muss ab 16 Uhr die Bar sein');
  assert.strictEqual(barStats.phases.b1.drinkType, 'beer', 'Getränk muss ab 16 Uhr ein Bier sein');
  office.setActive(false);
}
console.log('✓ Kaffee-Warteschlange (max. 3), Abschluss-Jubel & Zustandsvarianten OK');

// 6. Dynamic timezone solar times, 3 windows, night mode + ghost, boredom (PlayStation/discussion), JIRA badge, no blinking bar light
{
  const noop = () => {};
  let fakeNow = new Date(2026, 10, 17, 13, 0, 0).getTime();
  class FakeDate extends Date {
    constructor(...args) {
      if (args.length === 0) super(fakeNow);
      else super(...args);
    }
    static now() { return fakeNow; }
  }
  let nextRaf = null;
  let drawOps = [];
  const makeEl = () => {
    const ctxObj = {
      fillStyle: '', strokeStyle: '', lineWidth: 1, font: '', textAlign: 'left',
      fillRect: (x, y, w, h) => drawOps.push({ op: 'rect', x, y, w, h, color: ctxObj.fillStyle }),
      strokeRect: noop,
      fillText: (text, x, y) => drawOps.push({ op: 'text', text, x, y, color: ctxObj.fillStyle }),
      beginPath: noop, moveTo: noop, lineTo: noop, stroke: noop
    };
    return {
      style: {},
      classList: { contains: () => false, add: noop, remove: noop, toggle: noop },
      addEventListener: noop,
      querySelectorAll: () => [],
      getBoundingClientRect: () => ({ left: 0, top: 0, width: 796, height: 408 }),
      getContext: () => ctxObj,
      parentElement: { getBoundingClientRect: () => ({ left: 0, top: 0, width: 796, height: 408 }) },
      innerHTML: '', value: 'all', width: 796, height: 408
    };
  };
  let mockRand = 0.9;
  const mockMath = Object.create(Math);
  mockMath.random = () => mockRand;
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
    Intl,
    Math: mockMath, Map, Set, Array, Number, String, Boolean
  };
  vm.runInNewContext(getOfficeClientScript({ isPopout: false }), sandbox);
  const office = sandbox.window.__aiOffice;
  office.setActive(true);

  const initStats = office.getStats();
  assert.strictEqual(initStats.windowPositions.length, 3, 'Büro muss genau 3 Fenster besitzen (Variante A)');
  const [win1, win2, win3] = initStats.windowPositions;
  assert(win1 < win2 && win2 + 58 < 316 && win3 > 480, 'Fenster müssen links außen, links vom Schild und rechts vom Schild liegen');

  // Solar times for Europe/Berlin differ significantly between November and June
  const novBerlin = initStats.getSunTimesFor(new Date(2026, 10, 17, 12, 0, 0).getTime(), 'Europe/Berlin');
  const junBerlin = initStats.getSunTimesFor(new Date(2026, 5, 21, 12, 0, 0).getTime(), 'Europe/Berlin');
  assert(novBerlin.sunsetMin < 1050, 'November-Sonnenuntergang in Berlin muss vor 17:30 Uhr liegen');
  assert(junBerlin.sunsetMin > 1240, 'Juni-Sonnenuntergang in Berlin muss nach 20:40 Uhr liegen');
  assert.strictEqual(initStats.getTimeOfDayFor(new Date(2026, 10, 17, 13, 0, 0).getTime(), 'Europe/Berlin'), 'day', '13:00 muss Tag sein');
  assert.strictEqual(initStats.getTimeOfDayFor(new Date(2026, 10, 17, 22, 0, 0).getTime(), 'Europe/Berlin'), 'night', '22:00 muss Nacht sein');
  assert.strictEqual(initStats.ghostActive, false, 'Tagsüber darf kein Geist aktiv sein');

  // JIRA ticket at desk + Inspector, plus no blinking bar LED
  drawOps = [];
  office.update({
    jiraEnabled: true,
    columns: [
      {
        state: 'idle',
        label: 'Fertig',
        sessions: [
          { sessionId: 'j1', provider: 'claude', project: 'tvw-hub', ticket: 'TVW-4242', title: 'JIRA Desk Test', statusUpdatedAt: fakeNow - 60000 },
          { sessionId: 'j2', provider: 'copilot', project: 'ai-sessions', title: 'Idle Friend', statusUpdatedAt: fakeNow - 60000 }
        ]
      }
    ]
  });
  // Daytime check: exactly 1 sun across all 3 windows (not 3)
  const daySuns = drawOps.filter((o) => o.op === 'rect' && o.w === 8 && o.h === 8 && o.color === '#FDE047' && o.y < 25);
  assert.strictEqual(daySuns.length, 1, 'Tagsüber darf insgesamt nur eine Sonne über alle 3 Fenster erscheinen');

  assert(drawOps.some((o) => o.op === 'text' && o.text === 'TVW-4242'), 'JIRA-Nummer muss direkt am Schreibtisch gezeichnet werden');
  const inspInfoHtml = els.get('office-inspector-info').innerHTML;
  const inspActHtml = els.get('office-inspector-actions').innerHTML;
  assert(inspInfoHtml.includes('office-provider-icon claude'), 'Inspector-Info muss das Provider-Icon analog zum Board zeigen');
  assert(inspInfoHtml.includes('data-office-act="assignProject"'), 'Inspector-Info muss ein klickbares Projekt-Badge analog zum Board zeigen');
  assert(inspActHtml.includes('TVW-4242') && inspActHtml.includes('data-office-act="openJira"'), 'Inspector muss JIRA-Pill mit Öffnen-Aktion anbieten');
  assert(inspActHtml.includes('data-office-act="removeTicket"'), 'Inspector muss JIRA-Löschen-Button (🗑️) analog zum Board anbieten');
  assert(inspActHtml.includes('office-pin-btn') && inspActHtml.includes('data-office-act="toggleBookmark"'), 'Inspector muss Pin-Icon-Button analog zum Board anbieten');
  assert(inspActHtml.includes('✅ Erledigt'), 'Inspector muss Erledigt-Button analog zum Board darstellen');
  const barLabelOp = drawOps.find((o) => o.op === 'text' && (o.text === 'BAR' || o.text === 'BAR 16h'));
  assert(barLabelOp, 'BAR-Schriftzug muss gezeichnet werden');
  const blinkingLed = drawOps.find((o) => o.op === 'rect' && o.w === 4 && o.h === 4 && Math.abs(o.y - (barLabelOp.y - 6)) <= 2);
  assert(!blinkingLed, 'Blinkende 4x4-Leuchte bei der Bar darf nicht mehr gezeichnet werden');

  // With high random roll (> depart chance), lounge stays empty/calm even after 90s
  mockRand = 0.9;
  for (let i = 0; i < 180; i++) {
    fakeNow += 500;
    if (nextRaf) nextRaf();
  }
  const calmStats = office.getStats();
  assert.strictEqual(calmStats.playCount + calmStats.chatCount, 0, 'Ohne Zufallstreffer müssen PS5 und Tisch ruhig/leer bleiben');

  // With low random roll (< depart chance), developer heads to PlayStation or discussion after delay/retry and stays longer
  mockRand = 0.1;
  for (let i = 0; i < 320; i++) {
    fakeNow += 500;
    if (nextRaf) nextRaf();
  }
  const boredStats = office.getStats();
  assert(boredStats.playCount + boredStats.chatCount >= 1, 'Gelangweilte Fertig-Entwickler müssen per Zufall zur PlayStation oder zum Diskutieren gehen');

  // Verify staying at leisure longer than 25s
  for (let i = 0; i < 50; i++) {
    fakeNow += 500;
    if (nextRaf) nextRaf();
  }
  const stillBoredStats = office.getStats();
  assert(stillBoredStats.playCount + stillBoredStats.chatCount >= 1, 'Freizeit-Aufenthalt muss länger als 25s dauern');

  // Returning to busy must immediately pull them back from PlayStation/discussion
  office.update({
    jiraEnabled: true,
    columns: [
      { state: 'busy', label: 'Arbeitet', sessions: [{ sessionId: 'j1', provider: 'claude', project: 'tvw-hub', ticket: 'TVW-4242', title: 'Back to work', statusUpdatedAt: fakeNow }] },
      { state: 'idle', label: 'Fertig', sessions: [{ sessionId: 'j2', provider: 'copilot', project: 'ai-sessions', title: 'Idle Friend', statusUpdatedAt: fakeNow - 60000 }] }
    ]
  });
  const returnPhase = office.getStats().phases.j1.phase;
  assert(returnPhase === 'seated' || returnPhase === 'fromPlay' || returnPhase === 'fromChat', 'Bei neuer Arbeit muss j1 sofort zum Schreibtisch zurückkehren');

  // Switch to night (22:00) -> office darkens and ghost becomes active
  fakeNow = new Date(2026, 10, 17, 22, 0, 0).getTime();
  for (let i = 0; i < 9; i++) {
    fakeNow += 50;
    if (nextRaf) nextRaf();
  }
  drawOps = [];
  fakeNow += 50;
  if (nextRaf) nextRaf();
  const nightStats = office.getStats();
  assert.strictEqual(nightStats.tod, 'night', '22:00 muss Nacht-Modus aktivieren');
  assert.strictEqual(nightStats.ghostActive, true, 'Nachts ab Sonnenuntergang muss der Geist aktiv sein');
  assert(drawOps.some((o) => o.op === 'rect' && typeof o.color === 'string' && o.color.startsWith('rgba(6, 10, 26')), 'Nachts muss ein abgedunkeltes Raum-Overlay gezeichnet werden');
  const nightMoons = drawOps.filter((o) => o.op === 'rect' && o.w === 7 && o.h === 7 && o.color === '#FEF08A' && o.y < 25);
  assert.strictEqual(nightMoons.length, 1, 'Nachts darf insgesamt nur ein Mond über alle 3 Fenster erscheinen');

  // Time-of-day simulation cycle (dawn -> day -> evening -> night -> auto)
  fakeNow = new Date(2026, 10, 17, 13, 0, 0).getTime();
  assert.strictEqual(office.cycleTimeOfDay(), 'dawn', 'Erster Zyklus muss Sonnenaufgang simulieren');
  assert.strictEqual(office.cycleTimeOfDay(), 'day', 'Zweiter Zyklus muss Tag simulieren');
  assert.strictEqual(office.cycleTimeOfDay(), 'evening', 'Dritter Zyklus muss Sonnenuntergang simulieren');
  assert.strictEqual(office.cycleTimeOfDay(), 'night', 'Vierter Zyklus muss Nacht simulieren');
  assert.strictEqual(office.getStats().ghostActive, true, 'Simulierte Nacht am Mittag muss den Geist sofort aktivieren');
  assert.strictEqual(office.cycleTimeOfDay(), null, 'Fünfter Zyklus muss zurück auf Echtzeit (null) schalten');
  assert.strictEqual(office.getStats().ghostActive, false, 'Zurück in Echtzeit-Tag muss der Geist wieder verschwinden');

  office.setActive(false);
}
console.log('✓ Zeitzone, 3 Fenster, Nacht-Geist, Langeweile (PS5/Diskussion), JIRA-Ticket & Bar ohne Leuchte OK');

// 7. BoardPanel & OfficePanel HTML expose office view markers and place inspector above canvas
const bpHtml = new BoardPanel({}).html();
assert(bpHtml.includes('data-submode="office"'), 'BoardPanel benötigt Sub-Nav-Button für Büro');
assert(bpHtml.includes('id="btn-office-popout"'), 'BoardPanel benötigt Popout-Button');
assert(bpHtml.includes('id="board-search-row"'), 'BoardPanel benötigt ID am Freitext-Suchbereich zum Ausblenden im Büro');
assert(bpHtml.includes("boardSearchRow.style.display = currentViewMode === 'board' ? 'flex' : 'none'"), 'Freitext-Suche muss im Büro-Tab ausgeblendet bleiben');
assert(bpHtml.includes("allEntries.length === 0 || currentViewMode !== 'board'"), 'Projekt-Filter-Chips müssen im Büro-Tab ausgeblendet bleiben');
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
