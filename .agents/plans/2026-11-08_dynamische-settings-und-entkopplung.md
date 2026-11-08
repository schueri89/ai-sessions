# Implementierungsplan: Dynamische Settings & Entkopplung hartcodierter Stellen

**Datum:** 08.11.2026  
**Version:** v0.79.0  
**Ziel:** 
Entkopplung hartcodierter Werte im Plugin `ai-sessions` und Bereitstellung dynamischer VS-Code-Einstellungen (`contributes.configuration`) in 5 zentralen Bereichen:
1. **Quota-Schwellenwerte:** Vereinheitlichung der Warn- und Fehler-Schwellenwerte zwischen Statusleiste und Dashboard-Karten (`quotaWarningThreshold` & `quotaErrorThreshold`).
2. **Board & Navigation:** Einstellbares Kanban-Spaltenlimit (`columnCardLimit`), persistierbare Standard-Seitengröße für die Historie (`pageSize`) und konfigurierbarer Start-Tab (`defaultTab`).
3. **Sound-Auswahl für Tasks & Audits:** Eigene Sound-Dropdowns für Projekt-Tasks (`sound.tasks.sound`) und KI-Audits (`sound.audits.sound`).
4. **Root-Verzeichnis & Portabilität:** Konfigurierbares Haupt-Projektverzeichnis (`rootDirectory`) mit intelligenter Erkennung über VS Code Workspace Folders (oder `process.cwd()`), ohne hartcodierten Fallback auf einen spezifischen ROOT-Pfad.
5. **Scheduled Tasks & Logs:** Konfigurierbarer Task-Name für Audits (`audits.scheduledTaskName`), anpassbare Log-Puffergröße (`logs.maxCharacters`) und konfigurierbare Windows-Task-Liste (`logs.tasks`).

---

## 1. Ausgangslage & Motivation

- **Quota-Diskrepanz:** In den VS-Code-Einstellungen gibt es `sessionDashboard.quotaWarningThreshold` (75%) und `sessionDashboard.quotaErrorThreshold` (95%). Im Webview des Dashboards (`boardPanel.js`) sind die Schwellenwerte für Farbwechsel (`level-medium`, `level-high`) und Status-Badges (`Erhöht`, `Fast voll`) jedoch fest auf **65% und 85%** im Code verdrahtet.
- **Board-Beschränkungen:**
  - Jede Kanban-Spalte schneidet nach fest 20 Karten ab (`const limit = isExpanded ? Infinity : 20`).
  - Die Historie-Tabelle startet fest mit 25 Zeilen; eine Änderung im UI-Dropdown wird beim Reload vergessen.
  - Das Dashboard öffnet sich immer im Tab `sessions`.
- **Sound-Events:** Während Sessions flexible Klänge (`tada`, `ding`, `chimes`, `notify` etc.) unterstützen, spielten Tasks und Audits fest `taskCompleted` (`tada`) ab, ohne Einstellmöglichkeit für den Klang.
- **Root-Pfad:** Der Pfad `c:\lucee\tomcat\webapps\ROOT` ist in vier Modulen fest eincodiert. Wird das Plugin in anderen Umgebungen oder separaten Workspace-Ordnern betrieben, schlagen Scans und Task-Erkennungen ohne Fallback fehl.
- **Windows Tasks & Logs:** Task-Namen wie `DevBox-Nightly-Audit` und die Begrenzung des Log-Viewers auf 200.000 Zeichen sind statische Konstanten.

---

## 2. Geplante Änderungen im Detail

### 2.1 Quota-Schwellenwerte harmonisieren (P1)
1. **Datenfluss (`lib/boardPanel.js`):**
   - Beim Erzeugen der Dashboard-HTML-Initialdaten und per `postMessage` (`syncSettings` / `initialLoad`) die Werte `quotaWarningThreshold` (Standard: 75) und `quotaErrorThreshold` (Standard: 95) an das Webview übergeben.
2. **Webview-Rendering (`lib/boardPanel.js`):**
   - Helper-Funktion `getQuotaThresholds()` im Webview bereitstellen:
     ```javascript
     const warnThresh = typeof config.quotaWarningThreshold === 'number' ? config.quotaWarningThreshold : 75;
     const errThresh = typeof config.quotaErrorThreshold === 'number' ? config.quotaErrorThreshold : 95;
     ```
   - Alle hartcodierten Prüfungen auf `>= 65` durch `>= warnThresh` und `>= 85` durch `>= errThresh` ersetzen:
     - Quota-Pills: `status-danger` ab `errThresh`, `status-warn` ab `warnThresh`.
     - Quota-Labels & Progress-Balken: `level-high` ab `errThresh`, `level-medium` ab `warnThresh`.
     - Claude, Antigravity, Copilot, Codex Quota-Karten sowie Context-Token-Balken auf den Karten.

### 2.2 Board- & Tabellen-Steuerung (P1)
1. **`package.json` (`Tab: Sessions`):**
   - Neues Setting `sessionDashboard.board.columnCardLimit`:
     - Typ: `integer`, Min: `5`, Max: `200`, Default: `20`.
     - Beschreibung: Maximale Anzahl sichtbarer Karten pro Kanban-Spalte vor dem „Mehr anzeigen“-Button.
   - Neues Setting `sessionDashboard.history.pageSize`:
     - Typ: `integer`, Enum: `[10, 25, 50, 100]`, Default: `25`.
     - Beschreibung: Standard-Seitengröße der Session-Historie.
2. **`package.json` (`Allgemein`):**
   - Neues Setting `sessionDashboard.defaultTab`:
     - Typ: `string`, Enum: `["sessions", "tasks", "audits", "logs", "history", "analyse"]`, Default: `"sessions"`.
     - Beschreibung: Standard-Tab beim Öffnen des Dashboards.
3. **Webview-Logik (`lib/boardPanel.js`):**
   - Kanban-Spaltenlimit: `const limit = isExpanded ? Infinity : (boardConfig.columnCardLimit || 20);`.
   - Historie-PageSize: Initialwert aus `boardConfig.historyPageSize` laden; bei Umschalten im Dropdown Nachricht `updateSetting` an die Extension senden, um die Wahl im VS Code Setting zu persistieren.
   - Default-Tab: Beim ersten Laden `showTab(boardConfig.defaultTab || 'sessions')` ausführen.

### 2.3 Sound-Auswahl für Tasks & Audits (P1)
1. **`package.json`:**
   - In Kategorie `Tab: Tasks`:
     - `sessionDashboard.sound.tasks.sound`: Enum aller Systemklänge (`tada`, `ding`, `chimes`, `notify`, `chord`, `ringin`, `none`), Default: `"tada"`.
   - In Kategorie `Tab: Audits`:
     - `sessionDashboard.sound.audits.sound`: Enum aller Systemklänge, Default: `"tada"`.
2. **Skripte & Notifier:**
   - `lib/projectTasks.js`: Sound dynamisch auslesen:
     ```javascript
     const sound = soundCfg.get('tasks.sound', 'tada');
     this.soundNotifier.playSound(sound);
     ```
   - `lib/auditManager.js`: Sound dynamisch auslesen:
     ```javascript
     const sound = soundCfg.get('audits.sound', 'tada');
     this.soundNotifier.playSound(sound);
     ```
   - `extension.js`: Vorhören (`sessionDashboard.previewSound`) um Tasks- und Audits-Sound erweitern.

### 2.4 Root-Verzeichnis & Portabilität (P2)
1. **`package.json` (`Allgemein`):**
   - Neues Setting `sessionDashboard.rootDirectory`:
     - Typ: `string`, Default: `""`.
     - Beschreibung: Haupt-Projektverzeichnis für Projekt-Scans, Audits und Tasks. Bleibt das Feld leer, wird automatisch das aktive Workspace-Verzeichnis (oder das aktuelle Arbeitsverzeichnis) verwendet.
2. **Zentrale Root-Auflösung (`lib/project.js`):**
   - Funktion `getDefaultRoot()` erweitern:
     ```javascript
     function getDefaultRoot() {
       if (vscode && vscode.workspace) {
         try {
           const custom = vscode.workspace.getConfiguration('sessionDashboard').get('rootDirectory');
           if (custom && typeof custom === 'string' && custom.trim() && fs.existsSync(custom.trim())) {
             return path.normalize(custom.trim());
           }
           const folders = vscode.workspace.workspaceFolders;
           if (Array.isArray(folders) && folders.length > 0 && folders[0].uri && folders[0].uri.fsPath) {
             const wsPath = folders[0].uri.fsPath;
             if (fs.existsSync(wsPath)) {
               return path.normalize(wsPath);
             }
           }
         } catch {}
       }
       return process.cwd();
     }
     ```
   - Durchgängige Nutzung in `lib/auditManager.js`, `lib/tasksLogManager.js` und `lib/projectTasks.js`. Der feste String `'c:\\lucee\\tomcat\\webapps\\ROOT'` wird an allen Stellen vollständig entfernt.

### 2.5 Scheduled Tasks & Logs (P2)
1. **`package.json`:**
   - In Kategorie `Tab: Audits`:
     - `sessionDashboard.audits.scheduledTaskName`: Typ `string`, Default: `"DevBox-Nightly-Audit"`.
   - In Kategorie `Tab: Logs`:
     - `sessionDashboard.logs.maxCharacters`: Typ `integer`, Min: `10000`, Max: `1000000`, Default: `200000`.
     - `sessionDashboard.logs.tasks`: Typ `array`, Items vom Typ `object` (`taskName`, `displayName`, `associatedLog`, `defaultSchedule`), Default: die beiden Standard-Tasks.
2. **Logik-Anpassungen:**
   - `lib/auditManager.js`: `getScheduledTask()` liest `cfg.get('scheduledTaskName', 'DevBox-Nightly-Audit')`.
   - `lib/tasksLogManager.js`:
     - `getKnownTasks()` liest konfigurierte Tasks aus `sessionDashboard.logs.tasks`.
     - `getLogContent()` liest `sessionDashboard.logs.maxCharacters` (Default: 200000).

### 2.6 Bereinigung / Reconciliation Bugfix in `AuditManager`
- In `lib/auditManager.js:507-518` (`markProjectReviewed`):
  Wenn ein Audit quittiert wird, soll `cr_reviewed_commit` auf `p.last_review_commit || headSha` gesetzt werden (den Commit des tatsächlich quittierten Berichts), damit nachfolgende Commits im Repo vor dem nächsten Audit-Lauf nicht fälschlich den Quittierungsstatus als ungültig überschreiben.

---

## 3. Betroffene Dateien & Änderungen

| Datei | Art der Änderung |
|---|---|
| `package.json` | 8 neue Settings in den bestehenden Kategorien (`Tab: Sessions`, `Tab: Tasks`, `Tab: Audits`, `Tab: Logs`, `Allgemein`), Version `0.78.0`. |
| `lib/boardPanel.js` | Übergabe der Settings an Webview; Schwellenwert-Logik dynamisieren; `columnCardLimit`, `pageSize`, `defaultTab` anbinden. |
| `lib/project.js` | `getDefaultRoot()` dynamisch aus Setting / Workspace mit Fallback auflösen. |
| `lib/projectTasks.js` | Sound dynamisch aus `sessionDashboard.sound.tasks.sound` laden. |
| `lib/auditManager.js` | Sound aus `sessionDashboard.sound.audits.sound`, Task-Name aus `audits.scheduledTaskName`, Quittierungs-Commit Fix. |
| `lib/tasksLogManager.js` | Bekannte Tasks und `maxCharacters` aus Settings lesen. |
| `extension.js` | Sound-Preview & Kontext-Menüs für neue Settings erweitern. |
| `test/check-settings-categories-and-context.js` | Prüfung auf die neuen Settings und Kategorien erweitern. |
| `test/check-audit-manager.js` | Reconciliation-Test validieren. |
| `CHANGELOG.md` | Eintrag für Version `0.78.0`. |

---

## 4. Test- & Verifikationsplan

1. **Unit- & Syntax-Tests (`npm run check`):**
   - Prüfung aller Module mit `node --check`.
   - Ausführung der bestehenden Test-Suite inklusive `check-settings-categories-and-context.js`.
   - Neuer Test in `test/check-settings-categories-and-context.js` für alle neuen Settings.
2. **Funktionsprüfung Dashboard & Quota:**
   - Verifikation, dass Quota-Kacheln bei `quotaWarningThreshold = 80` erst ab 80% gelb werden.
   - Verifikation, dass Spaltenlimit und Historie-Seitengröße korrekt greifen.
3. **Sound-Test:**
   - Vorhören der neuen Sound-Events via Command Palette (`sessionDashboard.previewSound`).
4. **Root-Verzeichnis-Test:**
   - Test mit gesetztem `sessionDashboard.rootDirectory` und Fallback-Verhalten bei leerem String.
5. **VSIX-Packaging & Installation:**
   - `npm run package` → `vsix/ai-sessions-0.78.0.vsix`
   - `code --install-extension vsix/ai-sessions-0.78.0.vsix`
