# Implementierungsplan: Dashboard-Tab dauerhaft angepinnt laden (Webview-Persistenz & Auto-Pin)
Datum: 04.10.2026
Task-Ziel: Den Dashboard-Tab ("AI Sessions") dauerhaft angepinnt halten und laden können (Persistenz über VS-Code-Neustarts hinweg sowie automatisches Anpinnen).

Dieses Dokument beschreibt die Konzeption und Umsetzung für die Persistenz und das automatische Anpinnen des Board-Webviews in der Extension `session-dashboard`.

## Technische Grundlage (verifiziert)

1. **Webview-Persistenz über Neustarts (`registerWebviewPanelSerializer`)**:
   - In VS Code werden reguläre Dateitabs beim Neustart oder Reload (`Developer: Reload Window`) automatisch in ihrem Zustand (einschließlich angepinnt / `isPinned`) wiederhergestellt.
   - Webviews (`createWebviewPanel`) werden von VS Code nur dann wiederhergestellt, wenn die zuständige Extension einen `WebviewPanelSerializer` registriert und das Activation-Event `onWebviewPanel:<viewType>` deklariert.
   - Fehlte dieser Serializer bisher in `session-dashboard`, weshalb ein angepinnter Dashboard-Tab nach einem Neustart des Fensters verloren ging.

2. **Automatisches Anpinnen (`workbench.action.pinEditor`)**:
   - Die Webview-API von VS Code bietet kein direktes Konstruktor-Attribut wie `{ pinned: true }`.
   - Das Anpinnen kann jedoch programmatisch über den VS-Code-Befehl `workbench.action.pinEditor` ausgeführt werden, sobald das Webview aktiv ist.
   - Über `vscode.window.tabGroups` kann geprüft werden, ob der Tab bereits angepinnt ist, um unnötige Befehlsausführungen zu vermeiden.

3. **Automatisches Öffnen beim Start (`openOnStartup`)**:
   - Ist der Tab bereits einmal geöffnet und angepinnt, stellt VS Code ihn über den Serializer automatisch wieder her.
   - Für den Fall, dass ein neuer Workspace geöffnet wird oder der Tab noch nicht existiert, ermöglicht eine Einstellung `sessionDashboard.openOnStartup`, das Board beim Start automatisch zu initialisieren.

## Geplante Änderungen

### 1. [package.json](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/package.json)
- `activationEvents`: Ergänzen um `"onWebviewPanel:sessionDashboard.board"`.
- `contributes.configuration.properties`:
  - `sessionDashboard.autoPinTab`: boolean (Default: `true`) – Pinnt den Dashboard-Tab beim Öffnen automatisch an.
  - `sessionDashboard.openOnStartup`: boolean (Default: `false`) – Öffnet das Dashboard beim Starten von VS Code automatisch im Editor.

### 2. [lib/boardPanel.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/boardPanel.js)
- `attach(panel)`: Herauslösen der Webview-Initialisierung (Icon, HTML, Event-Listener `onDidReceiveMessage`, `onDidDispose`), sodass sowohl neu erzeugte Panels (`createWebviewPanel`) als auch von VS Code deserialisierte Panels (`deserializeWebviewPanel`) dieselbe Logik nutzen.
- `ensurePinned()`: Prüft via `vscode.window.tabGroups`, ob der Board-Tab bereits `isPinned` ist. Falls nicht und `sessionDashboard.autoPinTab` aktiv ist, wird `workbench.action.pinEditor` ausgeführt.
- `show(query)`: Nutzt `attach()` und ruft `ensurePinned()` auf.

### 3. [extension.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/extension.js)
- `vscode.window.registerWebviewPanelSerializer('sessionDashboard.board', ...)` registrieren und in `context.subscriptions` einhängen.
- Startup-Check für `sessionDashboard.openOnStartup`: Falls aktiv und `!board.panel`, wird das Board nach kurzer Verzögerung geöffnet.

## Verifikation
- Syntax-Prüfung aller Dateien via `npm run check`.
- Paketierbarkeit via `npm run package`.
