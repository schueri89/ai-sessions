# Implementierungsplan: Freitextsuche für das Session-Dashboard

Datum: 2026-10-03
Task-Ziel: Schnelle, echtzeitfähige Freitextsuche für das Dashboard nach einzelnen Sessions nach Titel, Prompt, Session-ID, Status und Projektordner.

## Hintergrund & Zielstellung

Mit dem Anwachsen der Session-Historie (über 190 Claude-Code- und Antigravity-Sessions) wird das Auffinden bestimmter früherer Sitzungen mühsam.
Bislang konnte nur grob nach Provider (Alle / Claude Code / Antigravity) gefiltert werden.
Benutzer benötigen eine Freitextsuche, um Sessions anhand von:
- Begriffen aus dem Titel (z. B. „Zeitstempel", „Rate Limit", „TVW", „PR")
- Begriffen aus dem letzten Prompt
- Session-UUIDs (oder Präfixen wie `7e7b131b`)
- Projektverzeichnissen (z. B. `tools`, `status-portal`, `tvw-hub`)
- Statusdetails (z. B. Wartezeit, Bereit, Erledigt)
sofort zu finden.

## Technische Grundlage (verifiziert)

1. **Dashboard-Architektur**:
   - `BoardPanel` (`lib/boardPanel.js`) rendert ein Webview mit Spalten (`waiting`, `busy`, `bookmarked`, `idle`, `done`).
   - Ein client-seitiger Filter im Webview ermöglicht verzögerungsfreies Filtern bei jedem Tastendruck (60 fps) ohne IPC-Latenz.
   - CSP im Webview verlangt strikt `nonce` für Skripte und Styles; keine Inline-Event-Handler (`onclick`).
2. **Provider-Metadaten**:
   - Claude-Sessions liefern `title`, `lastPrompt`, `sessionId`, `state`, `cwd` (bei Historie via `entrypoint`).
   - Antigravity-Sessions liefern `title`, `lastPrompt`, `sessionId`, `state`, `cwd` (primäres Workspace-Verzeichnis).
3. **VS Code Integration**:
   - Ergänzend zum Dashboard-Suchfeld kann ein Befehl `sessionDashboard.search` registriert werden, der über `vscode.window.showQuickPick` ein schnelles Aufrufen aus der Befehlspalette (`Ctrl+Shift+P`) oder Sidebar ermöglicht.

## Vorgeschlagene Änderungen

### [Dashboard Webview & Suche]

#### [MODIFY] [boardPanel.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/boardPanel.js)
- Such-Icon zu `ICONS` hinzufügen (`ICONS.search`).
- In `update()`: `cwd: s.cwd || ''` an jede Session übergeben.
- Im Toolbar-Header: Suchfeld mit Lupe, Eingabefeld, Leeren-Button (`✕`) und Trefferanzahl-Badge einbauen.
- Tastatur-Shortcuts:
  - `/` oder `Ctrl+F` / `Cmd+F` fokussiert das Suchfeld.
  - `Escape` leert das Suchfeld oder entfernt den Fokus.
- Multi-Term-Matching (AND-Logik für mehrere durch Leerzeichen getrennte Suchbegriffe).
- Durchsuchte Felder: `title`, `lastPrompt`, `sessionId`, `detail`, `cwd`, `provider`.
- Visuelles Highlighting: Treffer in `title` und `lastPrompt` per `<mark class="search-highlight">` hervorheben (HTML-sicher escaped).
- Dynamische Zähler in Spaltenüberschriften: z. B. `Wartet auf dich (1/3)` bei aktiver Suche.
- Erhalt des Suchbegriffs bei automatischen Hintergrund-Aktualisierungen (Polling).
- Leerer Zustand bei 0 Treffern mit „Suche zurücksetzen"-Schaltfläche.

### [Erweiterung & QuickPick-Befehl]

#### [MODIFY] [claude.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/providers/claude.js)
- Bei geschlossenen Sessions `cwd: h.entrypoint || ''` übergeben, damit Projektordner auch bei archivierten Sessions durchsuchbar sind.

#### [MODIFY] [extension.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/extension.js)
- Befehl `sessionDashboard.search` implementieren:
  - Öffnet `vscode.window.showQuickPick` mit allen sichtbaren Sessions.
  - Durchsucht Titel, Provider, Status, Detail und Prompt.
  - Direkter Sprung zur gewählten Session.
- `board.show(query)` unterstützt optionales Vorbelegen des Suchfeldes.

#### [MODIFY] [package.json](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/package.json)
- Versions-Bump auf `0.8.0`.
- Befehl `sessionDashboard.search` deklarieren mit Icon `$(search)`.
- Icon in `view/title` der Session-Sidebar einbinden.

### [Dokumentation]

#### [MODIFY] [TODO.md](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/TODO.md)
- Freitextsuche-Aufgabe abhaken und Plan referenzieren.

## Verifikationsplan

### Automatisierte Prüfung
```powershell
npm run check
```

### Manuelle Prüfung
1. **Dashboard-Suche im Webview**:
   - Dashboard öffnen (`sessionDashboard.showBoard`).
   - Tastendruck `/` oder `Ctrl+F` fokussiert das Suchfeld.
   - Suchbegriff eingeben (z. B. `zeitstempel`, `claude`, `pr`, oder Session-ID-Teil).
   - Prüfen: Treffer werden sofort gefiltert, Spaltenzahlen zeigen z. B. `(1/189)`, Trefferbegriffe sind gelb hervorgehoben.
   - Klick auf `✕` oder `Escape` leert das Suchfeld und stellt alle Karten wieder her.
2. **QuickPick-Suche**:
   - `F1` -> `Session Dashboard: Session suchen...` aufrufen.
   - Text eintippen -> Treffer filtern sich live -> Enter öffnet den Chat.
