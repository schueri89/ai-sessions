# Implementierungsplan: Provider-Filter für Sidebar und Dashboard
Datum: 2026-10-03
Task-Ziel: Provider-Filter (Claude Code / Antigravity / Alle) in der Sidebar (TreeView) und im Dashboard (BoardPanel) integrieren.

Das Dokument beschreibt die Einführung einer einheitlichen Filtermöglichkeit nach KI-Providern
im `session-dashboard`.

## Hintergrund & Zielstellung

Nach der Integration von Google Antigravity werden bis zu mehrere hundert Sessions aus zwei unterschiedlichen
Quellen (Claude Code und Google Antigravity) gelistet. Um gezielt nur an Unterhaltungen eines bestimmten
Werkzeugs arbeiten zu können, wird sowohl in der Sidebar (VS Code View Title Action mit QuickPick) als auch
im Dashboard (Toolbar-Filterbuttons mit Zählern) eine synchrone Filtermöglichkeit geschaffen.

## Umzusetzende Änderungen

### [session-dashboard]

#### [MODIFY] [session-dashboard/package.json](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/package.json)
- Neuen Befehl `sessionDashboard.filter` registrieren (`Filter nach Provider...`, Icon `$(filter)`).
- `menus["view/title"]`: Filter-Befehl vor `showBoard` und `refresh` anordnen (`navigation@1`).
- `menus["commandPalette"]`: Befehl registrieren.
- Version auf `0.3.0` anheben.

#### [MODIFY] [session-dashboard/extension.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/extension.js)
- `SessionModel`:
  - `providerFilter`: aus `context.globalState` laden (`'all' | 'claude' | 'antigravity'`).
  - `setFilter(filter)`: Filter setzen und in `globalState` persistieren.
  - `visibleSessions()`: Liefert die gefilterte Liste für TreeView und Board.
  - `counts()`: Zählt Sessions nach Provider (`all`, `claude`, `antigravity`).
- Befehl `sessionDashboard.filter`:
  - QuickPick mit den Optionen Alle, Claude Code und Antigravity inklusive Live-Zählern und Häkchen beim aktiven Filter.
- `update()`:
  - `view.description` auf den aktiven Filter setzen (z. B. `Claude Code` oder `Antigravity`).
  - `view.badge` auf Basis von `visibleSessions()` berechnen.
  - `board.update()` mit `filter` und `counts` anreichern.

#### [MODIFY] [session-dashboard/lib/treeView.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/treeView.js)
- `getChildren()` verwendet `this.model.visibleSessions()`.

#### [MODIFY] [session-dashboard/lib/boardPanel.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/boardPanel.js)
- `update()` berechnet Spalten über `visibleSessions()` und sendet `filter` + `counts` an das Webview.
- Nachrichtenempfänger: Aktion `setFilter` empfangen und an `model.setFilter()` weiterleiten.
- Webview Toolbar:
  - Oben eine Filterleiste mit Buttons für *Alle*, *Claude Code* (mit Claude-Icon) und *Antigravity* (mit Logo).
  - Badge-Zähler je Provider.
  - Aktiver Filter visuell hervorgehoben in Markenfarben.

## Verifikation
1. `npm run check` (Syntaxprüfung).
2. `npm run package` (VSIX bauen).
3. `code --install-extension session-dashboard-0.3.0.vsix --force`.
4. Manuelle Prüfung:
   - Filter-Button in der Sidebar öffnet QuickPick; Auswahl filtert Gruppen und Sessions.
   - Toolbar-Buttons im Board filtern das Board und synchronisieren die Sidebar.
   - Zustand bleibt nach Reload erhalten.
