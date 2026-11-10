# Plan: Tasks-Status-Angleichung für mehrstufige Tasks

**Datum:** 10.11.2026  
**Zielversion:** `v0.86.2`  
**Status:** Umgesetzt / Verifiziert  

---

## 1. Ausgangslage & Problemstellung

Im Tab **⚡ Tasks** des Session-Dashboards zeigten einfache Tasks (wie `Web-Build (DEV)`) nach Ausführung dauerhaft den grünen Status **`✓ Erfolg`**, während mehrstufige Workflows (wie `APK bauen (PROD)` oder `AAB bauen (Play)`) nach Fertigstellung auf **`Bereit`** (`status: 'idle'`) standen, obwohl Zeitstempel und Laufzeit („09.11.2026, 20:41 (24s)“) sowie die Benachrichtigung („✅ erfolgreich beendet“) korrekt vorlagen.

### Ursachenanalyse:
1. **Unterschiedliche Event-Typen in VS Code:**
   * **Einfache Tasks (`type: "shell"`):** Führen direkt einen Shell-Prozess aus (`npm run build`). Beim Ende feuert VS Code `vscode.tasks.onDidEndTaskProcess` mit Exit-Code `0`. In `lib/projectTasks.js` wurde der Zustand persistent auf `status: 'success'` gesetzt.
   * **Zusammengesetzte Tasks (`dependsOn: [...]`):** Besitzen keinen eigenen Shell-Prozess, sondern steuern Teilschritte (`APK 1/5` bis `APK 5/5`). VS Code feuert für den übergeordneten Wrapper **kein** `onDidEndTaskProcess`, sondern ausschließlich `vscode.tasks.onDidEndTask`.
2. **Fehlerhafter Zustand in `onDidEndTask`:**
   * In `lib/projectTasks.js` setzte `onDidEndTask` die Task-Definition bei Beendigung starr auf `status: 'idle'` zurück, anstatt wie `onDidEndTaskProcess` das Ergebnis (`success`) abzubilden.
3. **Mangelnde Fehler-Propagierung:**
   * Schlägt ein Teilschritt in der Kette fehl (Exit-Code ≠ 0), brach die Kette zwar ab, der übergeordnete Task wurde jedoch mangels Fehlerübernahme fälschlicherweise als `isSuccess: true` gemeldet.

---

## 2. Zielarchitektur & Lösung

### Einheitliche Status-Semantik für alle Tasks:
- `running`: 🔄 **`Läuft...`** (blau) – Task wird gerade aktiv ausgeführt.
- `success`: ✅ **`✓ Erfolg`** (grün) – Letzter Durchlauf war erfolgreich.
- `error`: ❌ **`✕ Fehler`** (rot) – Letzter Durchlauf ist fehlgeschlagen.
- `idle`: ⚪ **`Bereit`** (neutral) – Task wurde noch nie ausgeführt.

### Umsetzungsschritte:
1. **`lib/projectTasks.js`:**
   * **Fehlererfassung in `activeExecutions`:** `activeExecutions` speichert Metadaten `{ taskId, startTime, hasError, lastExitCode, error, cancelled }`.
   * **Fehlerweiterleitung in `onDidEndTaskProcess`:** Endet ein Teilprozess mit `exitCode !== 0`, wird der Fehler an alle aktiven übergeordneten Tasks desselben Projekts weitergegeben.
   * **Abschluss in `onDidEndTask`:** Bei Beendigung ohne Fehler wird der Task sauber auf `status: 'success'` und `lastExitCode: 0` gesetzt. Bei Fehlern oder Benutzerabbruch (Notification-✕) wird `status: 'error'` mit präziser Fehlermeldung gesetzt.
   * **Migration vorhandener Zustände:** Beim Laden aus `globalState` werden Tasks, die zuvor mit `status: 'idle'`, aber vorhandenem `lastRun` und erfolgreichem Lauf gespeichert wurden, automatisch auf `status: 'success'` migriert.
2. **Qualitätssicherung (`test/check-project-tasks.js`):**
   * Unit-Tests für State-Migration bei erfolgreichem Vorlauf.
   * Lifecycle-Tests für zusammengesetzte Tasks mit `onDidStartTask` und `onDidEndTask`.
   * Testfall für Fehler-Propagierung von Teilschritten zum Parent-Task.
