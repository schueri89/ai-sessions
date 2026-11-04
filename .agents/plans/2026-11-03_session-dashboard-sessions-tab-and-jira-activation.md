# Implementierungsplan: Sessions Tab-Restrukturierung & JIRA-Aktivierung

**Datum:** 03.11.2026  
**Ziel:** 
1. Tab „Board“ im Session-Dashboard in „Sessions“ umbenennen (`💬 Sessions`). Die bisherigen Top-Level-Tabs „Analyse“ und „Historie“ werden als Sub-Navigation rechts in die Sessions-Toolbar integriert (`[📊 Board] [📈 Analyse] [📋 Historie]`), während die Freitextsuche linksbündig in eine neue Zeile direkt unter die Filter-Chips wandert. Die Sub-Navigation steht auch in Analyse und Historie zur Verfügung, und der Haupt-Tab „Sessions“ bleibt in allen drei Teilansichten aktiv.
2. JIRA-Buttons (`+ JIRA` bzw. Ticket-Pill) auf den Sessions-Karten nur noch anzeigen, wenn auch eine JIRA-Basis-URL in den Einstellungen hinterlegt (`sessionDashboard.jiraBaseUrl` gefüllt) und damit JIRA aktiviert wurde.

---

## 1. Ausgangslage & Motivation

- Im oberen Tab-Header (`.mode-tabs`) existierten bisher separate Reiter für „Board“, „Analyse“ und „Historie“, gefolgt von „Deploys“, „Tasks“, „Audits“ und „Logs“. Fachlich gehören Analyse und Historie jedoch direkt zu den AI-Sessions.
- In der operativen Board-Toolbar (`#board-controls-wrap`) teilten sich die Provider-Filter (`.filter-group`) und die Freitextsuche (`.search-group`) eine gemeinsame Zeile.
- Auf allen Session-Karten auf dem Board wurde bisher standardmäßig ein gestrichelter Button `+ JIRA` angezeigt, selbst wenn in den Einstellungen (`sessionDashboard.jiraBaseUrl`) überhaupt keine JIRA-URL konfiguriert war.

---

## 2. Änderungen im Detail

### 2.1 Tab-Hierarchie & Sub-Navigation (`lib/boardPanel.js`)
- **Top-Level-Tab umbenennen:**
  `btn-mode-board` wird von `📊 Board` in `💬 Sessions` umbenannt (`title="AI Sessions (Board, Analyse, Historie)"`).
- **Analyse & Historie aus Hauptreiter entfernen:**
  `btn-mode-analyse` und `btn-mode-history` entfallen aus der obersten Leiste `.mode-tabs`.
- **Sub-Navigation (`.session-subnav`):**
  Rechts in `.toolbar-main` (wo zuvor die Freitextsuche lag) werden drei Sub-Nav-Buttons platziert:
  - `[📊 Board]` (`data-submode="board"`)
  - `[📈 Analyse]` (`data-submode="analyse"`)
  - `[📋 Historie]` (`data-submode="history"`)
  Dieselbe Sub-Navigation wird auch in `analyse-toolbar` und `history-filters-row` eingebunden, sodass jederzeit nahtlos zwischen allen drei Session-Sichten gewechselt werden kann.
- **Aktiver Zustand:**
  In `setViewMode(mode)` wird der Top-Level-Button `btnModeBoard` aktiviert, wenn `currentViewMode` entweder `'board'`, `'analyse'` oder `'history'` ist. Alle Sub-Nav-Buttons erhalten die Klasse `.active`, wenn ihr `data-submode === currentViewMode`.
- **Freitextsuche verlagern:**
  Die Freitextsuche (`.search-group`) wandert in ein neues Container-Element `.search-row` linksbündig direkt unter die Filter-Buttons (`.filter-group`).

### 2.2 JIRA-Aktivierung auf Session-Karten (`lib/boardPanel.js`, `extension.js`)
- **Konfigurationsprüfung:**
  `jiraEnabled` wird ermittelt über `Boolean(vscode.workspace.getConfiguration('sessionDashboard').get('jiraBaseUrl', '').trim())`.
- **Backend & Webview-Sync:**
  - `jiraEnabled` wird in `html()` initial als `cachedJiraEnabled` bereitgestellt.
  - In `update()` wird `jiraEnabled` an die Webview übermittelt.
  - In `extension.js` reagiert `onDidChangeConfiguration` auf Änderungen an `sessionDashboard.jiraBaseUrl` und aktualisiert das Board reaktiv via `board.update()`.
- **Karten-Rendering:**
  Auf den Session-Karten wird der JIRA-Bereich (`card-jira-add-btn` bzw. `card-jira-pill`) nur noch gerendert, wenn `cachedJiraEnabled === true` ist. Ist keine Basis-URL konfiguriert, wird kein JIRA-Button angezeigt.

---

## 3. Betroffene Dateien

| Datei | Status | Beschreibung |
|---|---|---|
| `lib/boardPanel.js` | MODIFY | Top-Tab „💬 Sessions“, Sub-Navigation in Sessions/Analyse/Historie, Suchleiste links unter Filter, `jiraEnabled`-Prüfung für Kachelbuttons |
| `extension.js` | MODIFY | `onDidChangeConfiguration` für `sessionDashboard.jiraBaseUrl` triggert `board.update()` |
| `package.json` | MODIFY | Version auf `0.72.0` erhöhen, `check`-Script um neuen Test erweitern |
| `CHANGELOG.md` | MODIFY | Changelog-Eintrag für Version 0.72.0 |
| `TODO.md` | MODIFY | Aufgaben als erledigt abhaken |
| `test/check-sessions-tab-and-jira.js` | CREATE | Automatisierte Tests für Sub-Navigation, HTML-Struktur und JIRA-Kartenlogik |

---

## 4. Test- & Validierungsplan

1. `test/check-webviews.js`: Syntaxprüfung des Webview-Skripts.
2. `test/check-sessions-tab-and-jira.js`:
   - Prüfen, dass `.mode-tabs` den Tab `💬 Sessions` enthält und `btn-mode-analyse`/`btn-mode-history` dort entfernt wurden.
   - Prüfen, dass `.session-subnav` in Toolbar, Analyse und Historie existiert.
   - Prüfen, dass `.search-row` links unter den Filtern liegt.
   - Prüfen, dass ohne JIRA-Basis-URL keine `card-jira-add-btn` oder `card-jira-pill` gerendert werden.
   - Prüfen, dass mit JIRA-Basis-URL die Buttons gerendert werden.
3. Gesamte Testsuite via `npm run check`.
4. Paketierung via `npm run package` und Installation im lokalen Editor.
