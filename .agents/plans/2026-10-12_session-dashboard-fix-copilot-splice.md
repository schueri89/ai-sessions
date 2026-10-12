# Fix: Copilot-Session wird nicht als „Fertig“ erkannt (JSONL-Splice-Index `i` ignoriert)

## Betroffene Stelle

- Datei: `lib/providers/copilot.js`
- Funktion: `parseJsonlChatSession(lines)`
- Version, in der der Fehler gefunden wurde: `0.45.1`
- Folgefehler auch in diesen Dateien, weil sie dieselbe Funktion nutzen:
  - `lib/analytics.js`
  - `lib/transcriptParser.js`

## Symptom

Eine Copilot-Chat-Session bleibt im Board auf **„Arbeitet…“** (`state: 'busy'`), obwohl die letzte Antwort längst fertig ist.
Erst wenn `BUSY_MAX_AGE_MS` (30 Minuten seit der letzten Dateiänderung) überschritten ist, springt sie auf „Fertig“ (`idle`).

Betroffen sind Sessions, in denen eine Anfrage **erneut gesendet** wurde, z. B. nach einem Fehler (`modelState.value === 3`) mit „Retry“, oder nach dem Bearbeiten und erneuten Absenden einer Anfrage.

## Ursache

VS Code speichert Chat-Sessions als JSONL-Mutationslog (`workspaceStorage/<hash>/chatSessions/<id>.jsonl`):

| `kind` | Bedeutung |
|--------|-----------|
| `0` | Initialer Snapshot (`v` = Session-Objekt) |
| `1` | Set: Wert unter Pfad `k` auf `v` setzen |
| `2` | Push/Splice: Array unter Pfad `k` um `v` erweitern. **Ist `i` gesetzt, werden vorher alle Elemente ab Index `i` entfernt.** |

Der Parser behandelt `kind: 2` immer als reines Anhängen (`concat`) und ignoriert `i`.

### Beispiel aus einer echten Session (gekürzt)

```text
9   kind=2 k=["requests"]                      -> request_e032... (1. Versuch)
15  kind=1 k=["requests",0,"modelState"]       -> {"value":3, completedAt:...}   (Fehler)
18  kind=2 k=["requests"]  i=0                 -> request_176c... (Retry ersetzt Index 0)
...
65  kind=1 k=["requests",0,"modelState"]       -> {"value":1, completedAt:...}   (fertig)
```

Bisheriges Ergebnis: `requests = [request_e032, request_176c]`.

- Alle späteren Updates auf `requests[0]` landen beim **alten** Request.
- Der letzte Request (`request_176c`) bleibt auf `modelState = {"value":0}` stehen, also ohne `completedAt`.
- Deshalb gilt `isRunning === true`, `liveState` wird `'busy'` und die Session wird als beschäftigt angezeigt.

Richtiges Ergebnis: `requests = [request_176c]` mit `modelState.value === 1` und gesetztem `completedAt`. Daraus folgt `idle`.

Derselbe Fehler betrifft auch `k = ["requests", n, "response"]` mit `i` (z. B. `i=3`, `i=11`, `i=27`). Dort werden Antwortteile doppelt angehängt statt ersetzt. Das betrifft Transcript-Ansicht und Analytics.

## Fix

In `parseJsonlChatSession` den `kind === 2`-Zweig ersetzen.

### Vorher

```js
} else if (p.kind === 2 && p.k) {
  if (p.k.length === 1 && p.k[0] === 'requests' && sessionObj) {
    if (!sessionObj.requests) sessionObj.requests = [];
    sessionObj.requests = sessionObj.requests.concat(p.v);
  } else if (p.k[0] === 'requests' && typeof p.k[1] === 'number' && p.k[2] === 'response' && sessionObj?.requests?.[p.k[1]]) {
    const req = sessionObj.requests[p.k[1]];
    if (!req.response) req.response = [];
    req.response = req.response.concat(p.v);
  }
}
```

### Nachher

```js
} else if (p.kind === 2 && p.k) {
  // Splice semantics: if p.i is set, items from index i on are replaced (e.g. resent request or streamed response chunk).
  const splice = (arr) => {
    const base = (typeof p.i === 'number' && p.i >= 0) ? arr.slice(0, p.i) : arr;
    return p.v !== undefined ? base.concat(p.v) : base;
  };
  if (p.k.length === 1 && p.k[0] === 'requests' && sessionObj) {
    sessionObj.requests = splice(sessionObj.requests || []);
  } else if (p.k[0] === 'requests' && typeof p.k[1] === 'number' && p.k[2] === 'response' && sessionObj?.requests?.[p.k[1]]) {
    const req = sessionObj.requests[p.k[1]];
    req.response = splice(req.response || []);
  }
}
```

## Optionale Nacharbeiten

- **Analytics-Cache:** `COPILOT_TURN_CACHE_VERSION` in `lib/analytics.js` auf `3` erhöht, damit veraltete gecachte Turns mit duplizierten Antwortteilen invalidiert und neu eingelesen werden.
- **Allgemeinere Lösung (optional):** `kind: 1` wird aktuell nur für Pfade der Länge 1 (`customTitle`) und 3 (`requests[n].<feld>`) ausgewertet. Robuster wäre ein generischer Pfad-Resolver für `k` mit beliebiger Tiefe, sowohl für Set (`kind 1`) als auch für Push/Splice (`kind 2`).

## Testvorschlag / Unit-Test

Neues Testskript `test/check-copilot-parser.js` (auch in `npm run check` eingebunden):

```js
'use strict';
const assert = require('assert');
const { parseJsonlChatSession } = require('../lib/providers/copilot');

const lines = [
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

const { sessionObj } = parseJsonlChatSession(lines);
assert.strictEqual(sessionObj.requests.length, 1, 'retry must replace, not append');
assert.strictEqual(sessionObj.requests[0].requestId, 'b');
assert.deepStrictEqual(sessionObj.requests[0].modelState, { value: 1, completedAt: 2 });
assert.deepStrictEqual(sessionObj.requests[0].response.map((r) => r.value), ['p1', 'p2b']);
console.log('✓ Copilot JSONL splice parsing OK');
```

## Verifikation am echten Fall

```powershell
node -e "const c=require('./lib/providers/copilot.js');const r=c.readJsonlSession(process.argv[1],'x','',{});console.log(r.state, r.liveState||'-')" "<pfad>\chatSessions\<id>.jsonl"
```

Erwartet: `idle -` (vorher: `busy busy`).

