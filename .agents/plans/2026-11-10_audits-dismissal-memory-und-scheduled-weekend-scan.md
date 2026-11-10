# Implementierungsplan: Audits Dismissal Memory & konfigurierbares Wochenend-Voll-Audit

Datum: 10.11.2026
Task-Ziel: Umsetzung von Dismissal Memory (Ignorieren-Funktion / Gedächtnis für abgelehnte Befunde & False Positives je Projekt) und konfigurierbarem Wochenend-Voll-Audit (Unterscheidung tägliches Diff-Audit vs. wöchentlicher Komplett-Scan) für lokale KI-Audits im Session-Dashboard und im Scheduled Task Runner.

## Hintergrund & Zielstellung

Im Rahmen des Google-Jules-Vergleichs wurden zwei zentrale Funktionsbereiche für das KI-Audit-System identifiziert:

1. **Dismissal Memory (Gedächtnis für abgelehnte Befunde & False Positives):**
   - Entwickler prüfen Audit-Meldungen und stufen bestimmte Befunde als False Positives oder beabsichtigtes Framework-/Architektur-Design ein (z. B. serverseitige Absicherung über Caddy, bewusstes Fall-Through, bekannte Nicht-Risiken).
   - Bisherige Einschränkung: Beim nächsten Audit (insbesondere bei kumulativen Reviews oder Voll-Scans) meldet das LLM exakt denselben Befund erneut, was zu unnötiger Prüfzeit führt.
   - Lösung: Persistente Speicherung abgelehnter Befunde je Projekt in `audit-state.json`, Einspeisung als "Dismissal Memory"-Kontext in die Audit-Prompts zur Vermeidung von Wiederholungsmeldungen, automatische Entlastung der Status-Klassifizierung und interaktive Verwaltung im Session-Dashboard (Befund ignorieren, Übersicht, Löschen).

2. **Scheduled Tasks & konfigurierbares Wochenend-Voll-Audit:**
   - Bisher lief der nächtliche Task `DevBox-Nightly-Audit` pauschal mit `--diff since-yesterday`.
   - Anforderung: Klare Differenzierung zwischen schnellem täglichem Diff-Audit an Wochentagen (Montag bis Freitag) und einem gründlichen wöchentlichen Komplett-Scan (Full Audit `--diff full`) am Wochenende (Samstag, Sonntag oder beide Tage).
   - Konfigurierbarkeit über VS-Code-Settings (`sessionDashboard.audits.weekendFullAudit`, `weekendDay`, `dailyDiffMode`, `scheduledTaskTime`), automatische Synchronisation nach `audit-state.json`, dynamische Auswertung in `run-nightly-audit.ps1` und Parameterunterstützung in `setup-task-scheduler.ps1`.

## Vorgeschlagene Änderungen

### [.agents]

#### [MODIFY] [project-audit.py](file:///c:/lucee/tomcat/webapps/ROOT/.agents/tools/project-audit.py)
- **Dismissal-Memory-Funktionen:**
  - `get_project_dismissals(report_dir, project_name)`: Liest gespeicherte Dismissals aus `audit-state.json`.
  - `add_project_dismissal(report_dir, project_name, dismissal)`: Speichert neuen ignorierten Befund mit UUID, Zeitstempel, Fundstelle, Typ und Begründung.
  - `remove_project_dismissal(report_dir, project_name, dismissal_id)`: Entfernt Dismissal.
  - `format_dismissals_prompt_block(dismissals)`: Erzeugt Prompt-Instruktionen für Ollama, um bekannte False Positives nicht erneut zu bemängeln.
  - `filter_dismissed_findings(text, dismissals, audit_type)`: Bereinigt Findings anhand der Dismissals vor der Status-Auswertung.
  - Erweiterung von `evaluate_cr_status` und `evaluate_sec_status` um Dismissal-Filterung.
- **CLI-Erweiterungen:**
  - `--add-dismissal PROJECT`, `--remove-dismissal PROJECT ID`, `--list-dismissals [PROJECT]`.
  - Zusätzliche Parameter `--dismiss-title`, `--dismiss-file`, `--dismiss-line`, `--dismiss-reason`, `--dismiss-type`.
  - `--diff scheduled`: Erkennt anhand von Wochentag und Konfiguration automatisch, ob Diff- oder Full-Scan auszuführen ist.

#### [MODIFY] [run-nightly-audit.ps1](file:///c:/lucee/tomcat/webapps/ROOT/.agents/tools/run-nightly-audit.ps1)
- Auslesen der Konfiguration (`weekend_full_audit`, `weekend_day`, `daily_diff_mode`) aus `audit-state.json`.
- Ermittlung des Wochentags und Umschaltung auf `--diff full` am konfigurierten Wochenendtag bzw. `$DailyDiffMode` an Wochentagen.
- Unterstützung manueller Switches `-ForceFull` und `-ForceDiff`.
- Prägnante Protokollierung im Log `nightly-audit.log`.

#### [MODIFY] [setup-task-scheduler.ps1](file:///c:/lucee/tomcat/webapps/ROOT/.agents/tools/setup-task-scheduler.ps1)
- Parameter `param([string]$TaskName = "DevBox-Nightly-Audit", [string]$At = "04:30")` für anpassbare Task-Uhrzeiten und Namen.

#### [MODIFY] [test_project_audit.py](file:///c:/lucee/tomcat/webapps/ROOT/.agents/tools/test_project_audit.py)
- Tests für Dismissal Memory (Hinzufügen, Entfernen, Prompt-Block-Generierung, Status-Unterdrückung bei ignorierten Befunden).
- Tests für den scheduled Diff-Modus (Wochentag- und Wochenend-Auflösung).

### [ai-sessions]

#### [MODIFY] [lib/auditManager.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/auditManager.js)
- Erweiterung von `syncAuditConfig()` um `weekendFullAudit`, `weekendDay`, `dailyDiffMode`, `scheduledTaskTime`.
- Neue Methoden `getDismissals(projectName)`, `addDismissal(projectName, dismissal)`, `removeDismissal(projectName, dismissalId)`.
- Aktualisierung von `parseReportStatus` mit Dismissal-Unterstützung.
- Aktualisierung von `getScheduledTask()` mit differenziertem Zeitplan-Text (z. B. "Täglich 04:30 Uhr (Mo–Fr: Diff, Sa: Komplett)").
- Aktualisierung von `registerScheduledTask()` zur Weitergabe der konfigurierten Uhrzeit.
- Einbindung von Dismissals in `dispatchAuditPrompt()` als Kontext für KI-Assistenten.

#### [MODIFY] [lib/boardPanel.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/boardPanel.js)
- Webview UI für Dismissals:
  - Neuer Bereich "🛡️ Dismissal Memory" in der Projekt-Detailzeile (Accordion) mit Liste ignorierter Befunde, Begründung, Zeitstempel und Löschen-Button (`🗑️`).
  - Button "+ Befund ignorieren" für manuelle Erfassung.
  - Button "🚫 Ignorieren / False Positive" auf Code-Review- und Security-Audit-Karten bei Befunden.
- Message-Handling: `addAuditDismissal`, `removeAuditDismissal`, `promptAddAuditDismissal` (mit interaktiven Eingabedialogen für Titel, Datei, Begründung).

#### [MODIFY] [package.json](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/package.json)
- Version `0.86.2` → `0.87.0`.
- Neue Settings unter `Tab: Audits`:
  - `sessionDashboard.audits.weekendFullAudit` (boolean, default: true)
  - `sessionDashboard.audits.weekendDay` (enum: Saturday, Sunday, Both, default: Saturday)
  - `sessionDashboard.audits.dailyDiffMode` (enum: since-yesterday, HEAD~1, unstaged, default: since-yesterday)
  - `sessionDashboard.audits.scheduledTaskTime` (string, default: "04:30")

#### [MODIFY] [CHANGELOG.md](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/CHANGELOG.md)
- Eintrag für `[0.87.0] – 10.11.2026`.

#### [MODIFY] [test/check-audit-manager.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/test/check-audit-manager.js)
- Regressionstests für Dismissal Memory und Scheduled Task Schedule-Generierung.

## Verifikationsplan

### Automatisierte Tests
```powershell
# 1. Python-Tests im .agents Repo
python .agents/tools/test_project_audit.py

# 2. Syntax- und Regressionstests in ai-sessions
cd ai-sessions
npm run check

# 3. Paketierung & Installation testen
npm run package
```

### Manuelle Tests
- Hinzufügen eines Dismissals über Dashboard & CLI, Prüfung in `audit-state.json`.
- Prüfung, ob ignorierter Befund nicht mehr als Warnung/Fehler gewertet wird.
- Testen des Zeitplan-Strings im Workspace-Banner bei aktivem/inaktivem Wochenend-Audit.
