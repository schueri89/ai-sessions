# Plan: Audits-Trennung (Code-Review & Security) und Logs-Fix (v0.68.0)

## Kontext & Problemstellung
1. **Audits-Verschmelzung & Überschreiben:**
   Bisher schrieben `▶ Review` (`mode: 'review'`), `🛡️ Sec` (`mode: 'security'`) und nächtliche Läufe (`mode: 'all'`) in dieselbe Datei `YYYY-MM-DD_<project>_audit.md`. Klickte man ad-hoc auf `▶ Review`, wurde der nächtliche Security-Audit-Bericht gelöscht. In der UI gab es nur eine einzige Ergebnis-Spalte, sodass der Stand von Code-Review und Security-Audit nicht unterscheidbar war.
2. **Logs-Zurückspringen:**
   Beim Auswählen des zweiten Logs (`nightly-audit.log`) wurde dessen Inhalt kurz angezeigt, nach wenigen Sekunden sprang die Konsole jedoch auf das erste Log (`backup-sync.log`) zurück. Ursache: Das periodische Hintergrund-Update (`board.update()`) rief `sendLogs()` ohne Parameter auf, wodurch auf das erste Log zurückgefallen wurde und die Webview den Cache überschrieb.

## Geplante Maßnahmen

### 1. Trennung der Berichtsdateien in `.agents/tools/project-audit.py`
- Separate Markdown-Berichte in `.agents/reports/`:
  - `YYYY-MM-DD_<project>_review.md` für Code-Reviews (`--mode review`)
  - `YYYY-MM-DD_<project>_security.md` für Security-Audits (`--mode security`)
- Bei `--mode all` (nächtlicher Lauf via `run-nightly-audit.ps1`) werden beide Berichte getrennt generiert und gespeichert.
- Altbestände mit `*_audit.md` werden nicht mehr unterstützt (sauberer Schnitt ohne Legacy-Fallback).
- Anpassung von `audit-state.json` zur getrennten Protokollierung von `review` und `security` je Projekt.

### 2. Log-Viewer Stabilisierung in `lib/boardPanel.js`
- `BoardPanel` speichert `this.activeLogName`.
- Alle Hintergrund-Updates (`board.update()`) sowie `requestLogs`, `runScheduledTask`, `clearLog` und `setViewMode` respektieren das aktive Log.
- In der Webview (`logsData`-Handler): Eintreffende `activeLog`-Daten werden nur übernommen, wenn deren Dateiname dem aktuell ausgewählten `activeLogName` entspricht.

### 3. Erweiterung von `lib/auditManager.js`
- Scannt `.agents/reports/` gezielt nach `*_review.md` und `*_security.md`.
- Liefert für jedes Projekt getrennte Objekte für `cr` (Code-Review) und `sec` (Security-Audit) samt Status, Zeitstempel, Modell und Berichtspfad.
- `dispatchAuditPrompt`:
  - Wenn beide Berichte vorliegen: Zeigt QuickPick mit Standard-Auswahl (Default):
    1. `📦 Beide Berichte zusammen übergeben (Empfohlen)`
    2. `🛡️ Security-Audit übergeben`
    3. `🔍 Code-Review übergeben`
  - Baut bei „Beide“ einen kombinierten Prompt für Antigravity / Claude Code / Copilot / Codex.
- `deleteReport`: Unterstützt gezieltes Löschen von `review`, `security` oder beiden Berichten.

### 4. Tabellarische Ansicht mit 2 Ergebnis-Spalten in `lib/boardPanel.js`
- Umstellung der Tabelle auf getrennte Spalten:
  - `Projekt`
  - `Code-Review` (Status-Badge, Zeitstempel & Modell, 📄-Icon)
  - `Security` (Status-Badge, Zeitstempel & Modell, 📄-Icon)
  - `Prüfstand` (`⚠️ Offen` / `✓ Quittiert`)
  - `Befund / Zusammenfassung`
  - `Aktionen` (`⚡ Diff/🌐`, `▶ Review`, `🛡️ Sec`, `✓`, `🚀 KI`)
- Ein einziger smarter `🚀 KI`-Button in der Aktions-Spalte:
  - Bei nur einem Bericht: Übergibt diesen direkt.
  - Bei zwei Berichten: Öffnet QuickPick mit Vorbelegung „Beide Berichte zusammen übergeben“.
- Detail-Accordion: Getrennte Abschnitte für Code-Review und Security mit individuellen Aktionen (`📄 Bericht`, `🚀 KI`, `🗑️ Löschen`).

## Verifikationsschritte
1. Python-Tests ausführen: `python .agents/tools/test_project_audit.py`
2. `npm run check` in `ai-sessions`: Validierung aller JS-Module und Test-Suites.
3. Paketierung & Installation: `npm run package` und `code --install-extension vsix/ai-sessions-0.68.0.vsix`.
4. Manuelle Verifikation:
   - Umschalten auf `nightly-audit.log` im Tab `📜 Logs` bleibt auch nach mehreren Intervallen stabil ausgewählt.
   - Tab `🛡️ Audits` zeigt separate Spalten für `Code-Review` und `Security`.
   - Starten eines Reviews überschreibt nicht das Security-Audit.
