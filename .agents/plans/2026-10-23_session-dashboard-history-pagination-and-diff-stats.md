# Plan: Historie-Blätterfunktion (Pagination) & Multi-Provider Diff-Statistik

## 1. Motivation & Zielsetzung

Bislang bietet der Tab **Historie** (Tab 3) lediglich ein unvollständiges „Mehr laden (+50)“-Nachladen ([`historyLimit += 50`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/boardPanel.js#L4489)). Bei vielen Sessions bläht dies das DOM der Webview massiv auf (hunderte Zeilen inklusive SVG-Icons und Accordion-Strukturen), was zu Lags beim Rendern, Filtern und Sortieren führt.

Gleichzeitig soll für die Historie eine **Diff-Statistik (`+added / -removed Zeilen`)** eingeführt werden. Während ein vollständiges Parsen aller Transkripte für das 2-Sekunden-Polling des Kanban-Boards zu ressourcenintensiv wäre, ist der Historie-Tab die perfekte Umgebung dafür:
1. Er wird erst auf Klick (Lazy Loading) geöffnet.
2. Das Backend [`lib/analytics.js`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/analytics.js) besitzt bereits einen speicherresidenten Cache (`fileTurnCache`), der Transkripte anhand von `mtimeMs` und Dateigröße puffert. Ein Transkript wird also nur **ein einziges Mal** geparst und bleibt danach im RAM.

Durch die Kombination einer echten **Blätterfunktion (Pagination)** und der **Diff-Statistik** wird die Historie performanter, übersichtlicher und fachlich deutlich wertvoller.

---

## 2. Architektur & Detailkonzept

### A. Blätterfunktion (Pagination) in der Historie ([`lib/boardPanel.js`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/boardPanel.js))

1. **State-Management**:
   - `historyPage`: Aktuelle Seitennummer (1-basiert, Standard: `1`).
   - `historyPageSize`: Einträge pro Seite (Standard: `25`, wählbar: `25`, `50`, `100`).
   - Bei Filteränderungen (Provider, Status, Projekt, Zeitraum, Freitextsuche) wird `historyPage` automatisch auf `1` zurückgesetzt.
   - Beim Sortieren bleibt die Seite nach Möglichkeit erhalten bzw. wird auf `maxPage` gedeckelt.
2. **DOM-Slicing**:
   - `const totalPages = Math.ceil(filtered.length / historyPageSize) || 1;`
   - `const paged = filtered.slice((historyPage - 1) * historyPageSize, historyPage * historyPageSize);`
   - Es werden **ausschließlich** die Zeilen der aktuellen Seite im DOM gerendert.
3. **Pagination-Steuerelemente im Footer**:
   - `[ << ]`: Erste Seite
   - `[ < ]`: Vorherige Seite
   - `Seite X von Y` (inkl. `Zeige A–B von N Sessions`)
   - `[ > ]`: Nächste Seite
   - `[ >> ]`: Letzte Seite
   - Dropdown für `historyPageSize` (`25`, `50`, `100 pro Seite`)
   - Deaktivierung der Buttons (`disabled` / Deckkraft) an den Rändern (`historyPage === 1` bzw. `historyPage === totalPages`).

---

### B. Multi-Provider Diff-Statistik in [`lib/analytics.js`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/analytics.js)

Jede Session erhält in `getSessionHistoryList()` die Felder:
```ts
{
  linesAdded: number | null,
  linesRemoved: number | null,
  diffSource: 'claude' | 'codex' | 'antigravity' | null
}
```

#### Anbieter-Strategien im Turn-Parser:
1. **Claude Code (`claude`)**:
   - In `collectRawTurns()` wird im `cost-state`-Event neben `totalCostUSD` direkt `cObj.totalLinesAdded` und `cObj.totalLinesRemoved` ausgelesen.
   - Da `cost-state` ein Session-Aggregat ist, wird der letzte gefundene Wert für die Session übernommen.
   - Genauigkeit: **100% nativ**.
2. **OpenAI Codex (`codex`)**:
   - In den Rollout-JSONL-Dateien werden Tool-Calls (`custom_tool_call` bzw. `function_call`) mit Name `apply_patch` analysiert.
   - Aus dem Patch-Argument werden Zeilen mit `+` (exklusive `+++`) als hinzugefügt und `-` (exklusive `---`) als gelöscht gezählt.
   - Summation über alle Turns der Session im `fileTurnCache`.
   - Genauigkeit: **~95% (exakte Unified-Diff-Zählung)**.
3. **Google Antigravity (`antigravity`)**:
   - In `transcript.jsonl` werden die `tool_calls` ausgewertet:
     - `edit_file`: Zeilenanzahl von `Replacement` (`+`) und `Target` (`-`).
     - `write_file`: Zeilenanzahl von `Content` (`+`).
   - Summation über alle Turns der Session im `fileTurnCache`.
   - Genauigkeit: **~80% (solide Heuristik für alle Standard-Dateioperationen)**.
4. **GitHub Copilot (`copilot`)**:
   - Liefert keine standardisierten Patch-Tools im Transkript.
   - Setzt `linesAdded: null`, `linesRemoved: null` (Darstellung als dezent `-`).

---

### C. Darstellung in der Webview ([`lib/boardPanel.js`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/boardPanel.js))

1. **Neue Spalte in der Historie-Tabelle**:
   - Header: `Diff` (sortierbar nach Gesamt-Zeilenänderung `(linesAdded || 0) + (linesRemoved || 0)`).
   - Zelle:
     - Wenn vorhanden: `<span class="diff-tag added">+167</span> <span class="diff-tag removed">-28</span>`
     - Wenn `0/0`: `<span class="diff-tag zero">±0</span>`
     - Wenn `null` (z. B. Copilot): `<span class="diff-tag na">–</span>`
   - Tooltip: Z. B. `Diff: +167 / -28 Zeilen (Nativ aus Claude-Transkript)`.
2. **Detail-Accordion**:
   - Eigener Chip im Metadaten-Bereich: `Diff: +167 / -28 Zeilen (Netto: +139 Zeilen)`.
3. **(Bonus) Kanban-Karten (Claude Code)**:
   - Da Claude Code die `cost-state`-Daten bereits im Kanban-Provider [`lib/transcripts.js`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/transcripts.js) liest, kann das Badge optional auch dort ohne Zusatz-Overhead auf den Claude-Karten angezeigt werden.

---

## 3. Umsetzungsschritte

- [ ] **1. `lib/analytics.js`**:
  - `collectRawTurns`:
    - Claude: `linesAdded` / `linesRemoved` aus `cost-state` extrahieren.
    - Codex: `apply_patch` Patch-String parsen und `+`/`-` Zeilen zählen.
    - Antigravity: `edit_file` / `write_file` parsen und Zeilen zählen.
  - `getSessionMetricsMap`: Aggregation von `linesAdded`, `linesRemoved` und `diffSource`.
  - `getSessionHistoryList`: Durchreichen der Diff-Metriken an jedes Session-Objekt.
- [ ] **2. `lib/transcripts.js` & `lib/providers/claude.js`**:
  - `totalLinesAdded` und `totalLinesRemoved` in `applyLine()` und `emptyInfo()` für Claude bereitstellen (für Karten-Badge).
- [ ] **3. `lib/boardPanel.js` (Pagination & UI)**:
  - State-Variablen `historyPage = 1` und `historyPageSize = 25` einbauen.
  - Pagination-Footer umgestalten: Erste/Vorherige/Nächste/Letzte-Buttons, Seitenanzeige, Page-Size-Dropdown.
  - Events für Button-Klicks und Page-Size-Wechsel verdrahten; bei Filtern/Suchen Reset auf Seite 1.
  - Neue Spalte `Diff` in Header und Body der Historie-Tabelle einfügen (inkl. Styling `.diff-tag.added`, `.diff-tag.removed`, `.diff-tag.zero`).
  - Sortierschlüssel `diff` in `historySortKey` unterstützen.
  - Detail-Accordion um Diff-Chip erweitern.
- [ ] **4. Unit-Tests**:
  - Neue Testdatei `test/check-history-pagination-and-diff.js`:
    - Test für Diff-Parsing (Claude cost-state, Codex Unified Diff, Antigravity Target/Replacement).
    - Test für Pagination-Slicing, Randwert-Behandlung und Sortierung.
  - Einbindung in `npm run check`.
- [ ] **5. Paketierung & Verifikation**:
  - `package.json`: Versionserhöhung auf `0.54.0`.
  - `CHANGELOG.md` & `TODO.md`: Dokumentation und Erledigt-Eintrag pflegen.
  - Syntax-Prüfung via `npm run check`.
  - VSIX erstellen (`npm run package`) und installieren (`code --install-extension`).
