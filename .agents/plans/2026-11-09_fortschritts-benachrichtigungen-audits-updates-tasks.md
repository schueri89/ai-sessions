# Plan: Fortschritts-Benachrichtigungen mit Abbruch-Funktion (v0.84.0)

## Kontext & Zielsetzung
Bisher arbeiten Hintergrundprozesse im Session-Dashboard für den Nutzer weitgehend „stumm“, bis sie fertig sind:
- **🛡️ Audits (`lib/auditManager.js`):** Ein Code-Review oder Security-Scan über lokales Ollama (`gemma4:26b` / `gemma4:e4b`) dauert 15–90 Sekunden. Wird das Audit über die Command Palette, das Statusleisten-Schnellmenü oder bei minimiertem Dashboard gestartet, sieht der Nutzer während der gesamten Laufzeit keinerlei visuelles Feedback im Editor. Ein Abbruch ist nur möglich, wenn man das Dashboard öffnet und dort auf `⏹ Abbrechen` klickt.
- **📦 Update-Checker (`lib/updateChecker.js`):** Beim Herunterladen eines neuen VSIX-Releases von GitHub wird zwar bereits `vscode.window.withProgress` genutzt, jedoch nur als unbestimmter Balken ohne Größen-/Prozentanzeige und ohne Abbruchmöglichkeit bei hängenden Downloads.
- **⚡ Tasks (`lib/projectTasks.js`):** Langlaufende Build-Tasks (wie Android APK-Builds oder Web-Bundles) laufen im Hintergrund. Zwar existiert ein Terminal, aber ein dezenter Progress-Toast mit direktem Abbruch-Button (`✕`) bietet schnellen Überblick und Abbruch ohne Terminal-Fokus.

Mit VS Codes nativer API `vscode.window.withProgress({ location: ProgressLocation.Notification, cancellable: true })` erhalten alle drei Bereiche während der Ausführung eine dezente Benachrichtigung mit animiertem Fortschrittsbalken, Live-Statustext und nativer Abbruch-Schaltfläche.

---

## Geplante Maßnahmen im Detail

### 1. KI-Audits & Workspace-Guards (`lib/auditManager.js`)
- **Einbindung in `runAudit()` und `runWorkspaceGuards()`:**
  - Sobald ein Audit gestartet oder in die serielle Warteschlange eingereiht wird, startet eine Benachrichtigung:
    ```javascript
    vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: isGuards ? '[🛡️ Workspace Guards] Prüfung läuft…' : `[🛡️ ${projectName}] Audit (${mode}) läuft…`,
      cancellable: true
    }, async (progress, token) => { ... });
    ```
- **Phasenanzeige über `progress.report({ message })`:**
  - Warteschlange: `"In Warteschlange eingereiht (Position X)…"`
  - Start: `"Ermittle geänderte Dateien (Diff)…"`
  - Modell-Inferenz: `"Ollama (${model}) analysiert Code…"`
  - Abschluss: `"Bericht wird generiert…"`
- **Nativer Abbruch (`cancellable: true`):**
  - Klick auf das `✕` in der Benachrichtigung triggert `token.onCancellationRequested(...)`.
  - Ruft direkt `this.cancelAudit(projectName, mode)` auf, wodurch der Python-Prozess via `taskkill` sauber terminiert und die Sperre aufgehoben wird.
- **Nahtloser Übergang zum Ergebnis:**
  - Sobald der Prozess beendet ist (oder abgebrochen wurde), schließt sich die Progress-Notification automatisch.
  - Direkt im Anschluss wird der etablierte Ergebnis-Toast (`✅ Bestanden` / `🚨 Befunde` / `❌ Fehler`) mit Aktions-Button `[Bericht öffnen]` und differenziertem Sound angezeigt.
- **Einstellungsoption:**
  - `sessionDashboard.audits.showProgressNotification` (Standard: `true`) in `package.json` unter Kategorie „Tab: Audits“.

---

### 2. Update-Checker & VSIX-Download (`lib/updateChecker.js`)
- **Streaming-Download mit Live-Fortschritt:**
  - Umstellung von `downloadAsset()` auf Streaming via HTTP-Response (`res.on('data')`).
  - Auswertung des `content-length`-Headers (oder Fallback auf `asset.size`).
  - Berechnung der empfangenen Bytes und prozentualer Zuwachs (`increment`):
    ```javascript
    progress.report({
      increment: pctDelta,
      message: `${(received / (1024 * 1024)).toFixed(1)} / ${(total / (1024 * 1024)).toFixed(1)} MB (${pct} %)`
    });
    ```
- **Abbruch-Möglichkeit (`cancellable: true`):**
  - Verknüpfung von `token.onCancellationRequested` mit `req.destroy()`.
  - Bei Abbruch wird die unvollständige temporäre VSIX-Datei sofort gelöscht und kein fehlerhaftes Install-Kommando ausgeführt.
  - Benutzerhinweis bei Abbruch: `"Download abgebrochen."`

---

### 3. Projekt-Tasks & Builds (`lib/projectTasks.js`)
- **Begleitender Progress-Toast bei Task-Ausführung:**
  - In `executeTask()` wird bei aktiviertem Setting ein Progress-Lauf gestartet:
    ```javascript
    vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: `[⚡ ${taskDef.project}] ${taskDef.label}`,
      cancellable: true
    }, async (progress, token) => { ... });
    ```
- **Statustext & Live-Dauer:**
  - Regelmäßige Aktualisierung der Laufzeit via Intervall: `progress.report({ message: `Läuft seit ${formatDuration(elapsed)}…` })`.
- **Abbruch-Funktion (`cancellable: true`):**
  - Klick auf `✕` beendet die native VS-Code-Task-Ausführung via `execution.terminate()`.
  - Bei Fallback-Terminal-Tasks wird ein SIGINT (`\x03`) an das zugehörige Terminal gesendet.
- **Einstellungsoption:**
  - `sessionDashboard.tasks.showProgressNotification` (Standard: `true`) in `package.json` unter Kategorie „Tab: Tasks“.

---

## Konfiguration & Settings (`package.json`)

1. **Tab: Audits:**
   - `sessionDashboard.audits.showProgressNotification`:
     - Typ: `boolean`
     - Standard: `true`
     - Beschreibung: `Fortschritts-Benachrichtigung mit Abbruch-Schaltfläche während laufender KI-Audits und Workspace-Guards anzeigen.`
2. **Tab: Tasks:**
   - `sessionDashboard.tasks.showProgressNotification`:
     - Typ: `boolean`
     - Standard: `true`
     - Beschreibung: `Fortschritts-Benachrichtigung mit Abbruch-Schaltfläche während laufender Projekt-Tasks und Builds anzeigen.`

---

## Tests & Verifikation

1. **`test/check-audit-manager.js`:**
   - Test des Progress-Hooks in `runAudit()`: Verifikation, dass `withProgress` mit `cancellable: true` aufgerufen wird.
   - Simulation des Abbruchs über `token.onCancellationRequested` und Prüfung, ob `cancelAudit()` aufgerufen wird.
2. **`test/check-update-checker.js`:**
   - Mock eines HTTP-Streams mit Chunks und Prüfung, ob `progress.report` mit MB- und Prozentangaben aufgerufen wird.
   - Prüfung des Abbruchverhaltens bei Cancellation.
3. **`test/check-project-tasks.js`:**
   - Test des Task-Progress-Lifecycle und Kündigung via `execution.terminate()`.
4. **`test/check-settings-categories-and-context.js`:**
   - Aktualisierung der erwarteten Setting-Anzahl und Prüfung der neuen Konfigurationsschlüssel.
5. **Syntax- & Gesamttests:**
   - `npm run check` (alle Module syntaktisch und testseitig fehlerfrei).
6. **VSIX-Packaging & Installation:**
   - `npm run package` -> Erzeugung von `vsix/ai-sessions-0.84.0.vsix`.
   - `code --install-extension vsix/ai-sessions-0.84.0.vsix`.

---

## Umsetzungs-Reihenfolge

1. **Schritt 1:** Update-Checker (`lib/updateChecker.js`) mit Streaming-Download, MB/Prozent-Berechnung und Cancellation ausstatten. Tests in `test/check-update-checker.js` erweitern.
2. **Schritt 2:** KI-Audits (`lib/auditManager.js`) mit Progress-Notification, Phasenanzeige und Abbruch-Hook versehen. Tests in `test/check-audit-manager.js` erweitern.
3. **Schritt 3:** Projekt-Tasks (`lib/projectTasks.js`) mit begleitendem Progress-Toast und `execution.terminate()`-Cancellation versehen. Tests in `test/check-project-tasks.js` erweitern.
4. **Schritt 4:** Settings in `package.json` ergänzen und Einstellungs-Tests in `test/check-settings-categories-and-context.js` anpassen.
5. **Schritt 5:** `npm run check`, Versionierung, Changelog und VSIX-Installation.
