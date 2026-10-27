# Plan: Projekt-Tasks Tab & 1-Klick-Ausführung (v0.58.0)

## Kontext & Ziel
In vielen Projekten unter `c:\lucee\tomcat\webapps\ROOT\` (z. B. `auto-hub`, `haushalt-hub`, `ai-hub`, `birthday-hub`, `httv-hub`, `smartwatch-app`) definieren versionierte `.vscode/tasks.json`-Dateien mehrstufige Build-, Sync- und Deployment-Abläufe (insbesondere `APK bauen (WLAN)`, `APK bauen (PROD)`, `App-Icons neu zeichnen` und `APK via ADB installieren`).

Aktuell erfordert das Starten dieser Tasks umständliche Einzelschritte über das VS-Code-Befehlsmenü (`Tasks: Run Task` -> Ordner auswählen -> Task wählen) oder manuelle Shell-Befehle.
Ziel ist es, diese Tasks in der Extension „AI Sessions" zentral zu bündeln und mit einem einzigen Klick ausführbar zu machen:
1. **Ein neuer 5. Dashboard-Tab `⚡ Tasks`** mit Projekt-Filtern, Suche und 1-Klick-Start.
2. **Direkter Menüpunkt im QuickPick der Statusleiste** (`⚡ Projekt-Task ausführen...`).
3. **Live-Ausführungsstatus** (Läuft, Erfolgreich, Fehler) über native VS-Code-Task-Events.

---

## Architektur & Komponenten

### 1. Modul `lib/projectTasks.js`
- **Discovery (Projekt- & Task-Erkennung):**
  - Scannt `c:\lucee\tomcat\webapps\ROOT\*\.vscode\tasks.json` (bzw. konfigurierbare Projekt-Roots).
  - Robuster JSONC-Parser (entfernt Zeilen- und Blockkommentare `// ...` und `/* ... */`, ohne String-Literale zu beschädigen).
  - Extrahiert Metadaten je Task:
    - `id`: `${projectName}:${label}`
    - `project`: Projektordner-Name (z. B. `auto-hub`)
    - `label`: Name des Tasks (z. B. `APK bauen (WLAN)`)
    - `detail`: Erläuterung / Zielpfad (z. B. `APK gegen den Entwicklungsrechner im WLAN. Ergebnis: client/dist-apk/auto-hub-wlan.apk`)
    - `isTopLevel`: `true`, wenn `group` (`kind: "build"`), `isDefault` gesetzt ist oder `dependsOn` Sequenzen definiert sind (Abgrenzung von reinen Teilschritten wie `APK 1/5`).
    - `dependsOn`: Liste abhängiger Tasks.
    - `command` / `type`: Ausführungsdefinition (`shell`, `process`).
- **Cache & Refresh:**
  - Dateisystem-Watcher auf `**/.vscode/tasks.json` für sofortige Aktualisierung bei Änderungen.

### 2. Task-Ausführung & Bridge in `extension.js`
- **Native VS Code Task-Ausführung:**
  - Prüft `vscode.tasks.fetchTasks()`.
  - Wenn das Zielprojekt Teil des aktiven Workspaces ist (in `lucee.code-workspace` sind alle Standardprojekte als Workspace-Folder registriert), wird die native `vscode.Task`-Instanz per `vscode.tasks.executeTask(task)` gestartet.
  - Dadurch greifen alle VS-Code-Mechanismen automatisch:
    - Ausführung in sequenzieller Reihenfolge (`dependsOrder: "sequence"`)
    - Dedizierte Terminals (`presentation.panel: "dedicated"`)
    - Variablenersetzung (`${workspaceFolder}`)
    - Problem-Matcher
- **Fallback für nicht im Workspace geöffnete Projekte:**
  - Start über ein integriertes Terminal (`vscode.window.createTerminal({ name: 'Task: ...', cwd: projectDir })`).
- **Status-Tracking:**
  - Listener auf `vscode.tasks.onDidStartTask` und `vscode.tasks.onDidEndTaskProcess`.
  - Überträgt den aktuellen Zustand (idle, running, success, error) sowie Start-/Endzeit per Webview-Message an das Dashboard.

### 3. Dashboard-Integration in `lib/boardPanel.js`
- **Navigationsleiste (Tab-Header):**
  - Neuer Tab-Button: `<button class="mode-tab-btn" id="btn-mode-tasks" title="Projekt-Tasks & Build-Aktionen">⚡ Tasks</button>`.
  - Umschaltung und Steuerung via `viewMode: 'tasks'`.
- **Ansicht `tasks-view`:**
  - **Toolbar:**
    - Projekt-Filterchips (Alle, auto-hub, haushalt-hub, ai-hub, etc.).
    - Filter-Toggle: „Nur Haupt-Tasks“ (Standard) vs. „Alle Teilschritte“.
    - Suchfeld zur Schnellfilterung nach Task-Namen oder Beschreibung.
  - **Task-Karten / Grid:**
    - Projekt-Badge mit Projektfarbe.
    - Task-Titel und Detail-Text.
    - Abhängigkeiten-Pills (z. B. `5 Schritte` als Tooltip).
    - Status-Badge (z. B. `Zuletzt: vor 12 Min. (Erfolg)`).
    - Prominenter Start-Button: `▶ Ausführen` (während der Ausführung: animiertes `⏳ Läuft...`).

### 4. Statusleisten-QuickPick in `extension.js`
- Neuer Menüpunkt unter „Aktionen“:
  - `label: '$(play) Projekt-Task ausführen...'`
  - Öffnet einen 2-stufigen oder durchsuchbaren QuickPick: Projekt auswählen -> Task wählen -> Starten.

### 5. Konfiguration in `package.json`
- `sessionDashboard.tasks.enabled`: Boolean (Standard: `true`) zum Aktivieren/Deaktivieren des Tabs.
- `sessionDashboard.tasks.onlyTopLevelDefault`: Boolean (Standard: `true`).

---

## Phasen der Umsetzung

1. **Phase 1: Backend-Modul `lib/projectTasks.js` & Tests**
   - Implementierung des JSONC-Scanners und der Task-Erkennung.
   - Unit-Tests in `test/check-project-tasks.js`.
   - Eintrag in `package.json` (`npm run check`).

2. **Phase 2: Execution-Engine & Extension-Verknüpfung**
   - Anbindung an `vscode.tasks.fetchTasks()` und `vscode.tasks.executeTask()`.
   - Event-Listener für Start/Ende und Webview-Messaging.
   - QuickPick-Aktion in der Statusleiste.

3. **Phase 3: Dashboard-UI im `lib/boardPanel.js`**
   - HTML-Markup, CSS-Styling (Grid, Karten, Start-Buttons).
   - Clientseitige Filterung, Suche und Statusanzeige.

4. **Phase 4: Test & Freigabe**
   - Ausführung von `APK bauen (WLAN)` in `auto-hub` oder `smartwatch-app` testen.
   - `npm run check`, Paketierung & Dokumentation.
