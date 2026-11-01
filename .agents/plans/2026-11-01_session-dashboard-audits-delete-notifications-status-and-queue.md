# Plan: Audits-Optimierung (Löschen-Button, Benachrichtigungen, Befunde-Status-Fix & Serielle Queue gegen Timeouts) (v0.66.0)

## Kontext & Problemstellung
Im Tab `🛡️ Audits` und den zugehörigen Audit-Skripten wurden folgende 4 Punkte festgestellt:
1. **Keine Löschmöglichkeit für Berichtsdateien:** Wurde ein Audit erzeugt (z. B. fehlerhaft oder obsolet), gab es keine Möglichkeit, die Berichtsdatei (`.agents/reports/<datum>_<project>_audit.md`) direkt aus der UI zu löschen.
2. **Fehlende Benachrichtigungen bei Fertigstellung:** Nach Abschluss eines Audits gab es keine Toast- und Sound-Benachrichtigungen analog zu Sessions und Projekt-Tasks (`taskCompleted`).
3. **Falsch-positive Befundanzeige („Ergebnis=Befunde, auch wenn es keine gibt“):** `parseReportStatus` prüfte den gesamten Markdown-Inhalt inklusive des generierten Footer-Prompts (`## 🚀 Übergabe an KI-Assistenten`), in dem das Wort `Kritisch` („Schweregrade: Kritisch / Hoch / Mittel“) vorkommt. Dadurch wurden selbst komplett fehlerfreie Audits (wie `cf-devtools` und `web-libs`) als `❌ Befunde (Kritische Sicherheitsfunde)` klassifiziert.
4. **„ERROR: Request to Ollama failed: timed out“:**
   - `gemma4:26b` ist ein 18-GB-Modell (26 Mrd. Parameter), das auf der Testmaschine wegen begrenztem iGPU-VRAM zu **100% auf der CPU** läuft.
   - Ollama verarbeitet Anfragen standardmäßig seriell (`OLLAMA_NUM_PARALLEL=1`).
   - Bei parallelem Klick auf mehrere Projekt-Audits wurden parallele Python-Prozesse gestartet, die in die Ollama-Queue liefen. Da `project-audit.py` mit `stream: False` und einem Socket-Timeout von 300 Sekunden arbeitete, liefen nachfolgende Anfragen in den HTTP-Timeout.

---

## Geplante Maßnahmen

### 1. Löschen-Button für Berichte (`lib/auditManager.js` & `lib/boardPanel.js`)
- Methode `deleteReport(project, reportPath)` in `AuditManager`:
  - Findet die Berichtsdatei und fragt in VS Code per modalem Bestätigungsdialog nach (`Audit-Bericht wirklich löschen?`).
  - Löscht die Datei synchron via `fs.unlinkSync()`.
  - Bereinigt den Projekt-Status in `audit-state.json`, falls für das Projekt kein Bericht mehr existiert.
  - Invalidiert den Report-Cache und benachrichtigt Change-Listener.
- Webview-Buttons:
  - Tabellenzeile: `🗑️`-Button (`.btn-delete`) neben dem `📄`-Button.
  - Detail-Accordion: `🗑️ Bericht löschen`-Button (`.btn-delete`).
  - Workspace Guards Banner: `🗑️`-Button für Guard-Berichte.
  - CSS-Styling mit roter Hover-Farbe.

### 2. Benachrichtigungen analog Sessions/Tasks (`lib/auditManager.js`)
- Neue Methode `notifyAuditCompletion(projectName, { isSuccess, status, summary, durationMs, error, scopeLabel })`:
  - Toast-Benachrichtigung mit Status-Icon (`✅ Bestanden`, `⚠️ Prüfbedarf`, `🚨 Befunde`, `❌ Fehlgeschlagen`) und Ausführungsdauer.
  - Steuerung über `sessionDashboard.notifications.enabled` und neues Setting `sessionDashboard.notifications.audits`.
  - Sound-Benachrichtigung (`taskCompleted`) über `sessionDashboard.sound.enabled` und neues Setting `sessionDashboard.sound.audits.enabled`.

### 3. Korrektur der Befund-Erkennung (`lib/auditManager.js`)
- In `parseReportStatus(content, mtimeMs)`:
  - Header und Body vor der Auswertung am Prompt-Trenner `## 🚀 Übergabe an KI-Assistenten` abschneiden, damit das Prompt-Template die Statusbewertung nicht verfälscht.
  - Dedizierte Erkennung von Ollama-Verbindungs- und Timeout-Fehlern (`ERROR: Request to Ollama failed: timed out`) mit Status `error` und Klartext-Summary `Ollama Timeout (Zeitüberschreitung)`.
  - Wortgrenzen (`\b`) für `CRITICAL`, `KRITISCH`, `HIGH`, `HOCH`, `WARN`, `WARNUNG`.
  - Korrekte Einstufung von unbeanstandetem Code als `passed` (`Bestanden (Keine Risiken)`).

### 4. Serielle Queue & Streaming gegen Ollama-Timeouts (`lib/auditManager.js` & `tools/project-audit.py`)
- In `AuditManager`:
  - Warteschlange `auditQueue = []`.
  - Wenn ein Audit läuft und ein weiteres gestartet wird, wird es nicht parallel gestartet, sondern in die Queue eingereiht.
  - In der Übersicht und Tabelle Status `⏳ In Warteschlange (#Position)` anzeigen.
  - Nach Abschluss eines Laufs wird automatisch der nächste Auftrag aus der Queue abgearbeitet.
- In `c:\lucee\tomcat\webapps\ROOT\.agents\tools\project-audit.py`:
  - Umstellung von `stream: False` auf `stream: True` mit NDJSON-Chunking in `query_ollama`.
  - Erhöhung des Timeout-Limits auf 600s, sodass kontinuierlich eintreffende Token-Streams nicht vom Socket-Read-Timeout gekappt werden.

---

## Verifikationsschritte
1. Unit-Tests in `test/check-audit-manager.js` erweitern (Lösch-Funktion, Status-Parsing mit Handover-Footer, Timeout-Erkennung, Queue).
2. `npm run check` ausführen.
3. Version auf `0.66.0` anheben in `package.json` und Eintrag in `CHANGELOG.md`.
4. Paketierung mit `npm run package` und automatische Installation via `code --install-extension vsix/ai-sessions-0.66.0.vsix`.
5. Überprüfung der bestehenden Berichtsdateien mit dem neuen Parser.

