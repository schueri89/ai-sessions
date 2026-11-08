# Plan: Rubriken-Differenzierung & Aktions-Buttons in VS-Code-Benachrichtigungen (v0.78.0)

## Kontext & Problemstellung
Im Session-Dashboard erzeugen mehrere Komponenten visuelle Benachrichtigungen (VS-Code-Toasts):
1. **Sessions (`lib/toastNotifier.js`):** Aufgabenabschluss, Rückfragen, Freigaben.
2. **Tasks (`lib/projectTasks.js`):** Beendigung von Build- und Projekt-Tasks (Erfolg/Fehler).
3. **Audits (`lib/auditManager.js`):** Beendigung lokaler KI-Code-Reviews, Security-Audits und Workspace Guards.

Bisher begannen fast alle Benachrichtigungen mit demselben Muster (`✅ [Projekt] ...` bzw. `❌ [Projekt] ...`). Bei paralleler Arbeit war im flüchtigen Toast (3–5 Sekunden Einblenddauer) nicht sofort erkennbar, aus welchem Dashboard-Bereich die Meldung stammte. Zudem besaß nur die Sessions-Meldung einen Interaktions-Button (`[Chat öffnen]`), während Tasks und Audits ohne direkte Aktionsmöglichkeit blieben.

---

## Geplante Maßnahmen

### 1. Tab-Icon im Projekt-Badge der Toasts (`[<Tab-Icon> <Projekt>]`)
Die Toasts erhalten eine eindeutige Rubriken-Kennzeichnung über das etablierte Icon des jeweiligen Dashboard-Tabs:
- **`💬 Sessions` (`lib/toastNotifier.js`):**
  - Fertig: `✅ [💬 <Projekt>] <Session-Titel>`
  - Rückfrage: `❓ [💬 <Projekt>] <Session-Titel>`
  - Freigabe: `⚠️ [💬 <Projekt>] <Session-Titel>`
- **`⚡ Tasks` (`lib/projectTasks.js`):**
  - Erfolg: `✅ [⚡ <Projekt>] <Task-Label> erfolgreich beendet (<Dauer>)`
  - Fehler: `❌ [⚡ <Projekt>] <Task-Label> fehlgeschlagen (<Fehler/ExitCode>, <Dauer>)`
- **`🛡️ Audits` (`lib/auditManager.js`):**
  - Bestanden: `✅ [🛡️ <Projekt>] Audit (<Scope>) erfolgreich bestanden (Keine Befunde) (<Dauer>)`
  - Befunde: `🚨 [🛡️ <Projekt>] Audit (<Scope>) abgeschlossen: <Summary> (<Dauer>)`
  - Warnung: `⚠️ [🛡️ <Projekt>] Audit (<Scope>) abgeschlossen: <Summary> (<Dauer>)`
  - Fehler: `❌ [🛡️ <Projekt>] Audit (<Scope>) fehlgeschlagen: <Fehler> (<Dauer>)`
  - Workspace Guards: `[🛡️ Workspace Guards]`

### 2. Kontextsensitive 1-Klick-Aktionen (Click-to-Focus)
Jede Rubrik erhält eine maßgeschneiderte Interaktions-Schaltfläche:
- **Sessions:** Bestehender Button `[Chat öffnen]` bleibt unverändert.
- **Tasks:** Neuer Button `[Terminal anzeigen]`. Bei Klick wird das integrierte Terminal des Task-Laufs (`vscode.window.terminals`) fokussiert.
- **Audits:** Neuer Button `[Bericht öffnen]` (sofern Berichtsdatei vorhanden). Bei Klick wird die Markdown-Berichtsdatei via `auditManager.openReport(reportPath)` direkt in der Vorschau / im Editor geöffnet.

### 3. Tests & Verifikation
- Anpassung und Erweiterung von:
  - `test/check-toast-notifier.js` auf das neue `[💬 <Projekt>]`-Format.
  - `test/check-project-tasks.js` auf das neue `[⚡ <Projekt>]`-Format und die Terminal-Aktion.
  - `test/check-audit-manager.js` auf das neue `[🛡️ <Projekt>]`-Format und die Report-Aktion.
- Durchlauf von `npm run check`.
- Paketierung (`npm run package`) und automatische Installation im Editor (`code --install-extension vsix/ai-sessions-0.78.0.vsix`).
