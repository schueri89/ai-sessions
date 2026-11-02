# Plan: Audits Polish, Fortschrittsanzeige, Reload-Persistenz & Abbrechen (v0.69.0)

## Kontext & Problemstellung
Im Tab 🛡️ **Audits** wurden fünf konkrete Optimierungsbedarfe identifiziert:
1. **Fehlende Lade-Animation:** Beim ersten Öffnen des Audits-Tabs sowie beim Klick auf `⟳ Aktualisieren` fehlt ein Lade-Indikator analog der anderen Tabs (*Analyse*, *Historie*, *Jenkins*). Stattdessen wird kurz eine leere Tabelle („Keine passenden Projekte gefunden“) angezeigt, bis das Backend antwortet.
2. **Redundante Start-Buttons im Accordion:** Beim Aufklappen eines Projekts sind die Start-Buttons für Code-Review und Security-Scan doppelt vorhanden: Einmal in den Kacheln selbst und zusätzlich darunter im Footer-Bereich (`dActions`).
3. **Workspace-Banner Beschriftungen:** Der Löschen-Button für Guards-Berichte ist ein reines Icon `🗑️` ohne Text (sollte `🗑️ Bericht löschen` heißen) und der Bericht-Button `📄 Bericht` soll um `öffnen` zu `📄 Bericht öffnen` ergänzt werden.
4. **Fortschrittsbalken, Live-Dauer & Reload-Persistenz:** Während ein Review läuft, gibt es weder einen visuellen Fortschrittsbalken noch eine Zeitanzeige. Zudem gingen laufende Reviews bisher verloren, wenn VS Code neu geladen (`Developer: Reload Window`) oder geschlossen wurde, weil `runningProjects` rein flüchtig im Speicher lag.
5. **Abbrechen-Funktion:** Laufende Audits oder Workspace-Guards sowie Aufträge in der Warteschlange können nicht aus der Benutzeroberfläche abgebrochen werden.

## Geplante Maßnahmen

### 1. Lade-Animation in `lib/boardPanel.js`
- Einbindung eines `#audits-loader` Containers mit `.loader-spinner` und `.loader-text` („Lade Audit-Berichte & Workspace-Status...“) in `#audits-view`.
- `cachedAudits` initial auf `null` setzen; Einführung von `auditsLoading`.
- Beim Umschalten auf den Audits-Tab (falls noch keine Daten) sowie beim Klick auf `⟳ Aktualisieren` (`#audits-refresh`) wird der Loader angezeigt und die Tabelle während des Ladens verborgen.
- Sobald `auditsData` eintrifft, wird der Loader ausgeblendet und die Tabelle gerendert.

### 2. Bereinigung der doppelten Start-Buttons im Detail-Accordion
- Entfernen von `dBtnReview` und `dBtnSecurity` aus dem Footer-Bereich (`dActions`) unter den Kacheln.
- Kacheln autark halten:
  - Code-Review Kachel: `▶ Code-Review starten` (bzw. `▶ Neu prüfen`), `📄 Bericht öffnen`, `🚀 An KI`, `🗑️`.
  - Security-Audit Kachel: `🛡️ Security-Scan starten` (bzw. `🛡️ Neu prüfen`), `📄 Bericht öffnen`, `🚀 An KI`, `🗑️`.
- Im Footer (`dActions`) darunter verbleiben nur noch übergreifende Aktionen:
  - `📦 Beide Berichte zusammen an KI übergeben` (falls beide Berichte vorliegen).
  - `✓ Als geprüft quittieren` (falls Review-Status pending).

### 3. Anpassung der Button-Texte im Workspace-Guards-Banner
- Anpassen von `📄 Bericht` zu `📄 Bericht öffnen`.
- Anpassen von `🗑️` zu `🗑️ Bericht löschen`.
- CSS-Anpassung für harmonisches Alignment und Padding.

### 4. Fortschrittsanzeige, Live-Timer & Reload-Persistenz
- **Backend in `lib/auditManager.js`:**
  - Persistierung aktiver Prozesse in `.agents/reports/audit-running.json` (PID, Projekt, Modus, Diff, Modell, Startzeitstempel).
  - Methode `reconcileRunningProcesses()`:
    - Wird beim Instanziieren von `AuditManager` sowie bei `getAuditOverview()` / Refresh ausgeführt.
    - Prüft Einträge in `audit-running.json` per `process.kill(pid, 0)` auf Existenz.
    - Scannt bei Bedarf per WMI nach laufenden `project-audit.py`-Prozessen als Fallback.
    - Hängt aktive Prozesse wieder in `runningProjects` ein und startet einen periodischen Watcher.
    - Sobald der Prozess endet, werden Berichte synchronisiert, Benachrichtigungen (Toast/Sound) ausgelöst und `notifyChange()` gerufen.
- **Frontend in `lib/boardPanel.js`:**
  - Animierter CSS-Fortschrittsbalken (`.audit-progress-bar` mit Shimmer-Animation).
  - Anzeige in der laufenden Tabellenzeile, im Accordion und im Guards-Banner.
  - Live-Laufzeit-Timer (`<strong class="audit-live-duration" data-start="...">`): Ein leichtgewichtiger `setInterval` im Webview aktualisiert die Sekunden sekündlich flackerfrei. Nach einem Window-Reload startet der Timer sofort ab dem echten Startzeitpunkt.

### 5. Abbrechen-Funktion (`⏹ Abbrechen`)
- **Backend in `lib/auditManager.js`:**
  - Neue Methode `cancelAudit(projectName)` / `cancelWorkspaceGuards()`.
  - Beendet den Prozess und alle Kindprozesse via `taskkill /PID <pid> /T /F` (Windows) bzw. `proc.kill()`.
  - Falls das Projekt in der Warteschlange (`auditQueue`) liegt: Entfernen aus der Queue.
  - Bereinigung von `audit-running.json` und sofortiges `notifyChange()`.
- **Frontend in `lib/boardPanel.js`:**
  - Aktionsspalte: Bei laufendem Audit erscheint ein `⏹ Abbrechen`-Button (`.btn-cancel`), bei Warteschlange `✕ Entfernen`.
  - Accordion-Kachel: Aktive Kachel zeigt ebenfalls `⏹ Abbrechen`.
  - Workspace-Guards-Banner: Zeigt `⏹ Abbrechen` bei laufenden Guards.
  - Webview-Message `cancelAudit` an Extension weiterleiten.

## Verifikationsschritte
1. `npm run check`: Syntaxprüfung aller Module und Webview-Scripts sowie Unit-Tests für `AuditManager`.
2. Test von `reconcileRunningProcesses` und `cancelAudit` im Test-Runner.
3. VSIX-Paketierung (`npm run package`) und lokale Installation (`code --install-extension vsix/ai-sessions-0.69.0.vsix`).
4. Manuelle Verifikation:
   - Tab-Wechsel zu Audits & Klick auf Aktualisieren: Lade-Spinner erscheint.
   - Projekt aufklappen: Kacheln enthalten Start-Buttons, keine doppelten Buttons darunter.
   - Workspace-Banner: Beschriftung `📄 Bericht öffnen` und `🗑️ Bericht löschen`.
   - Review starten: Shimmer-Fortschrittsbalken und Live-Sekundenzähler sichtbar, `⏹ Abbrechen`-Button vorhanden.
   - Reload von VS Code: Review wird nahtlos weiter als laufend mit fortlaufendem Timer erkannt.
   - Klick auf `⏹ Abbrechen`: Prozess wird gestoppt, Status bereinigt.

