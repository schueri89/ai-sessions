# Implementierungsplan: Sessions-Karten Interaktion, Bereinigung „Status: closed“ & Details-Seite JIRA/Projekt

**Datum:** 12.11.2026  
**Ziel:**
1. **Projekt-Badge auf Sessions-Karten:** Klick auf den Projekt-Badge öffnet direkt die Projektauswahl (`assignProject` per QuickPick), statt das Board zu filtern. Das separate Stift-Icon (`✏️`) entfällt.
2. **JIRA-Ticket auf Sessions-Karten:** Stift-Icon (`✏️`) entfällt; nur das Mülleimer-Icon (`🗑️`) bleibt neben dem Ticket. Nach dem Löschen erscheint wie gewohnt der Button `+ JIRA`, worüber per 1-Klick ein neuer Vorgang zugewiesen werden kann.
3. **Bereinigung „Status: closed“:** Das technische Relikt `Status: closed` in `describe()` (aus historischen Claude-Sessions) wird entfernt, sodass dort sauber die relative Zeitangabe steht.
4. **Projekt & JIRA auf Details-Seite:** In der Details-Ansicht (`TranscriptViewerPanel`, geöffnet über `👁️ Details`) werden interaktive Projekt- und JIRA-Zuweisungen ergänzt (analog zur Historie & Board-Karten), inklusive Live-Aktualisierung.

---

## 1. Ausgangslage & Analyse

### 1.1 Projekt-Badge & Stift-Icon
- Auf den Session-Karten im Kanban-Board filterte ein Klick auf den Badge bisher das Board (`setProjectFilter`), während zum Ändern ein Shift-Klick oder das separate Stift-Icon `pEditBtn` (`✏️` / `➕`) nötig war.
- In der Historie-Tabelle öffnet der Klick auf den Projekt-Badge hingegen bereits heute direkt die Projektauswahl (`assignProject`).
- Durch die Vereinheitlichung entfällt das überflüssige Stift-Icon auf der Kachel, spart Platz und verhindert Fehlklicks.

### 1.2 JIRA-Ticket-Aktionen auf Karten
- Bei zugewiesenem JIRA-Ticket wurden bisher drei Elemente nebeneinander gerendert:
  1. Ticket-Pill (Klick öffnet im Browser, Shift-Klick ändert)
  2. Stift-Icon `jEditBtn` (`✏️`) zum Ändern
  3. Mülleimer-Icon `jRemoveBtn` (`🗑️`) zum Löschen
- Der gewünschte schlanke Workflow: Das Stift-Icon entfällt. Ein Klick auf `🗑️` entfernt das Ticket; die Karte schaltet sofort auf `[JIRA] + JIRA` um, und ein Klick darauf öffnet die Ticket-Eingabe für den neuen Vorgang.

### 1.3 Herkunft & Sinn von „Status: closed“
- In `lib/providers/claude.js` markiert der History-Scanner beendete Sessions aus `~/.claude/history.jsonl` mit `rawStatus: 'closed'` und `state: 'idle'`.
- In `lib/format.js` (`describe(session)`) existiert die Regel:
  `if (session.rawStatus && !STATES[session.rawStatus] ...) parts.push('Status: ' + session.rawStatus);`
- Seit Version 0.6.0 gibt es die Spalte `closed` nicht mehr. Da `STATES['closed']` daher undefiniert ist, wird `Status: closed` wörtlich auf der Kachel ausgegeben.
- **Fachlicher Nutzen:** Null. Die Session liegt bereits in „Fertig“ (`idle`) oder „Gemerkt“. Dass der CLI-Prozess beendet ist, ist der Normalzustand und stiftet bei Entwicklern nur Verwirrung.
- **Lösung:** `session.rawStatus !== 'closed'` in `describe()` abfangen.

### 1.4 Fehlende Aktionen auf der Details-Seite (`TranscriptViewerPanel`)
- Die dedizierte Details-Seite (`TranscriptViewerPanel`, `lib/transcriptViewerPanel.js`) zeigt das Projekt bisher nur als statischen Badge (`<span>📁 ...</span>`) und unterstützt keine Klicks oder Overrides.
- JIRA-Tickets werden auf der Details-Seite überhaupt nicht angezeigt.
- Im Gegensatz dazu bietet die Inline-Detailzeile in der Historie (`hist-detail-card`) bereits entsprechende Buttons. Auf der eigentlichen Details-Seite fehlen sie noch.

---

## 2. Geplante Änderungen im Detail

### 2.1 Kanban-Karten (`lib/boardPanel.js`)
1. **Projekt-Badge:**
   - Klick ruft direkt `vscode.postMessage({ action: 'assignProject', sessionId: s.sessionId })` auf.
   - Tooltip: `'Projekt manuell zuweisen oder ändern (aktuell: ' + s.project + ')'` (bzw. bei Unassigned: `'Session noch keinem Projekt zugewiesen (Klicken zum Zuweisen)'`).
   - Entfernen des Elements `pEditBtn` (`✏️` / `➕`).
2. **JIRA-Aktionen:**
   - Entfernen des Elements `jEditBtn` (`✏️`).
   - `jBadge` behält Klick zum Öffnen im Browser (`openJira`). Tooltip verschlanken auf `'JIRA: ' + s.ticket + ' im Browser öffnen'`.
   - `jRemoveBtn` (`🗑️`) bleibt unverändert erhalten. Nach dem Löschen triggert `removeTicket` den Re-Render, wodurch `jAddBtn` (`+ JIRA`) sichtbar wird.

### 2.2 Formatierung & Status-Bereinigung (`lib/format.js`)
- In `describe(session, now)`:
  ```javascript
  if (session.rawStatus && session.rawStatus !== 'closed' && !STATES[session.rawStatus] && !session.rawStatus.startsWith('CASCADE_RUN_STATUS')) {
    parts.push(`Status: ${session.rawStatus}`);
  }
  ```
- Damit entfällt `Status: closed` vollständig, und die Kachel zeigt sauber die Zeitangabe (`zuletzt aktiv vor X Std.` bzw. `vor X Std.`).

### 2.3 Details-Seite (`lib/transcriptViewerPanel.js` & `extension.js`)
1. **Projekt-Steuerung:**
   - Im Header (`.meta-sub-row`) wird der `project-badge` klickbar gestaltet (`cursor: pointer`, Hover-Stil analog zum Board).
   - Klick sendet `{ action: 'assignProject', sessionId: t.sessionId }`.
   - Der Badge zeigt das effektive Projekt (unter Berücksichtigung von `projectStore.getOverride(sessionId)`).
2. **JIRA-Steuerung:**
   - Wenn JIRA konfiguriert ist (`jiraBaseUrl` gefüllt):
     - Mit Ticket: Badge `[Jira-Icon] <Ticket>` (Klick sendet `openJira`) und Mülleimer-Icon `🗑️` (Klick sendet `removeTicket`).
     - Ohne Ticket: Button `[Jira-Icon] + JIRA` (Klick sendet `assignTicket`).
3. **Message-Handling in `TranscriptViewerPanel`:**
   - In `onDidReceiveMessage`:
     - `assignProject` -> `vscode.commands.executeCommand('sessionDashboard.assignProject', this.transcript.sessionId)`
     - `assignTicket` -> `vscode.commands.executeCommand('sessionDashboard.assignTicket', this.transcript.sessionId)`
     - `removeTicket` -> `vscode.commands.executeCommand('sessionDashboard.removeTicket', this.transcript.sessionId)`
     - `openJira` -> `vscode.commands.executeCommand('sessionDashboard.openJira', this.transcript.sessionId)`
4. **Live-Reaktivität:**
   - Bei Änderungen an Tickets (`sessionDashboard.assignTicket`, `removeTicket`) oder Projekten (`sessionDashboard.assignProject`) in `extension.js`:
   - Falls ein `TranscriptViewerPanel` für die betroffene Session aktiv ist, wird dieses direkt über die Änderung informiert und aktualisiert seinen Header (ohne Scrollposition oder Suchfilter zu verlieren).

---

## 3. Betroffene Dateien

| Datei | Status | Beschreibung |
|---|---|---|
| `lib/boardPanel.js` | MODIFY | Klick auf Projekt-Badge öffnet `assignProject`, `pEditBtn` entfernt, `jEditBtn` entfernt, `jRemoveBtn` bleibt |
| `lib/format.js` | MODIFY | `rawStatus !== 'closed'` Filter in `describe()`, kein `Status: closed` mehr |
| `lib/transcriptViewerPanel.js` | MODIFY | Interaktiver Projekt-Badge und JIRA-Bereich (+ JIRA bzw. Ticket & 🗑️) im Header, Message-Handler & Live-Update |
| `extension.js` | MODIFY | `sessionInfoOf`/Model-Integration für Viewer-Metadaten, Listener/Trigger zur Live-Aktualisierung offener Viewer |
| `package.json` | MODIFY | Version auf `0.93.0` |
| `CHANGELOG.md` | MODIFY | Changelog-Eintrag für Version 0.93.0 |
| `TODO.md` | MODIFY | Aufgaben abhaken |
| `test/check-sessions-tab-and-jira.js` | MODIFY | Unit-Tests für Karten-Buttons, format.js Bereinigung und Details-Seiten-Funktionen |

---

## 4. Verifikation & Qualitätskontrolle

1. **Automatisierte Syntax- & Unit-Tests:**
   - `npm run check` führt alle bestehenden Tests sowie die erweiterten Tests in `test/check-sessions-tab-and-jira.js` aus.
   - Validierung der Webview-Skripte in `boardPanel.js` und `transcriptViewerPanel.js`.
2. **Manuelle Prüfungen:**
   - Kanban-Board:
     - Klick auf Projekt-Badge öffnet den QuickPick; Stift-Icon ist weg.
     - Klick auf JIRA-Mülleimer löscht Ticket; Karte zeigt direkt `+ JIRA`; Klick öffnet Eingabedialog; Stift-Icon ist weg.
     - Claude-Historien-Sessions zeigen kein `Status: closed` mehr.
   - Details-Seite (`👁️ Details`):
     - Klick auf Projekt-Badge öffnet Projektauswahl; gewähltes Projekt wird sofort aktualisiert.
     - JIRA-Ticket zuweisen, öffnen und löschen funktioniert direkt aus der Details-Seite.
3. **Packaging:**
   - `npm run package` baut die VSIX `vsix/ai-sessions-0.93.0.vsix`.
   - Lokale Installation via `code --install-extension vsix/ai-sessions-0.93.0.vsix`.
