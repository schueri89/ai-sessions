# Plan: Neuer Tab Logs für Windows-Tasks & Backup-Logs (v0.62.0)

## Kontext & Ziel
In der Entwicklungsumgebung laufen nächtliche Hintergrundaufgaben über die Windows-Aufgabenplanung (`schtasks.exe`), insbesondere:
1. `DevBox-Nightly-BackupSync`: Schließt nachts VS Code, aktiviert 15 Minuten lang den Google Drive Sync, pausiert ihn anschließend und öffnet VS Code wieder. Logdatei: `.agents/reports/backup-sync.log`.
2. `DevBox-Nightly-Audit`: Führt nächtliche Guards und lokale KI-Audits über Ollama durch. Logdatei: `.agents/reports/nightly-audit.log`.

Bisher gab es in VS Code keine direkte Sichtbarkeit über den Zustand, den letzten/nächsten Lauf und eventuelle Fehler dieser Tasks.
Ziel ist es:
- Einen 7. Dashboard-Tab `📜 Logs` in der Extension bereitzustellen.
- Eine Live-Übersicht der Windows Scheduled Tasks mit Status, Zeitplan, letztem Ergebnis und 1-Klick-Ausführung (`schtasks.exe /Run`) einzubinden.
- Einen integrierten Log-Viewer mit automatischer Syntax-Farbcodierung für Fehler und Warnungen, Auto-Scroll und Direktzugriff bereitzustellen.
- Bei fehlgeschlagenen Tasks ein dynamisches Fehler-Badge (⚠️ Anzahl) direkt am Tab-Button anzuzeigen.
- Zeitstempel einheitlich im deutschen Format ohne Sekunden (`HH:mm`) darzustellen und CLI-/Konsolen-Umlaute robust zu dekodieren (CP850/CP1252/Mojibake).

---

## Architektur & Komponenten

### 1. Modul `lib/tasksLogManager.js`
- **Task-Discovery & Status-Query:**
  - Liest Aufgaben via `schtasks.exe /Query /TN <taskName> /FO CSV /V /NH`.
  - Robuste Puffer-Dekodierung (`decodeCliBuffer`): Unterscheidet UTF-8, CP850 und CP1252; bereinigt Mojibake (`fixUmlauts`).
  - Erkennt Statuswerte: `ready` (Bereit), `running` (Läuft), `success` (Exit-Code 0), `failed` (Exit-Code ≠ 0), `never` (Noch kein Lauf).
  - Zeitformatierung über `formatTimeHM`: Entfernt Sekunden aus Zeitstempeln (`02.11.2026 03:00` statt `03:00:00`).
- **Logdateien-Verwaltung:**
  - Durchsucht `.agents/reports/*.log`.
  - Ermittelt Metadaten (Größe, Zeilenanzahl, Fehler- und Warnungs-Zähler).
  - Stellt Log-Inhalte (`getLogContent`) für den Webview bereit (inkl. UTF-8-BOM-Bereinigung und Umlaut-Korrektur).
  - 1-Klick-Aktionen: `runTask`, `openLogInEditor`, `clearLog`.

### 2. Dashboard-Integration in `lib/boardPanel.js`
- **Tab-Header:**
  - Neuer Tab-Button: `<button class="mode-tab-btn" id="btn-mode-logs">📜 Logs <span class="logs-error-badge" id="logs-tab-badge">0</span></button>`.
  - Roter Badge signalisiert sofort fehlerhafte Tasks (`cachedFailedTasksCount > 0`).
- **Logs-View (`logs-view`):**
  - **Sektion 1: Geplante Windows-Aufgaben (DevBox):**
    - Tabelle mit Spalten: Aufgabe & Zweck, Zeitplan, Status, Letzter Lauf, Ergebnis-Pille, Nächster Lauf, Aktionen (▶ Ausführen, 📄 Log).
    - Status-Zusammenfassung oben rechts (`✓ Alle Aufgaben betriebsbereit` bzw. `⚠️ X Aufgabe(n) fehlgeschlagen`).
  - **Sektion 2: Logdateien & Inspektor:**
    - Pillen-Selektor für bekannte und gefundene Logs (`backup-sync.log`, `nightly-audit.log`).
    - Toolbar mit Auto-Scroll-Checkbox, Aktualisieren, „Im Editor öffnen“ und „Leeren“.
    - Konsolen-Viewer mit Syntax-Farbhervorhebung (`colorizeLogLine`) für Fehler (rot), Warnungen (gelb), Erfolgsmeldungen (grün) und Trennlinien (blau).

### 3. Tests & Absicherung
- Syntax- und Unit-Tests in `test/check-tasks-log-manager.js`:
  - CSV-Parsing mit eingebetteten Anführungszeichen.
  - Zeitformatierung (`formatTimeHM`) ohne Sekunden.
  - CP850- und Mojibake-Dekodierung.
  - Validierung aller Task- und Log-Strukturen.
