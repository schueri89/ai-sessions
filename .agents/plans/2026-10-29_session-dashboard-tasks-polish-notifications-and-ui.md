# Plan: Tasks-Polish, Fertigstellungs-Benachrichtigungen, Letzter Lauf & Favoriten-Layout

**Datum:** 29.10.2026  
**Zielversion:** `v0.60.0` (Minor-Release aufgrund neuer Features: Task-Notifications, Last-Run-Historie, UI-Restrukturierung)  
**Status:** In Planung / Vorbereitung  

---

## 1. Ausgangslage & Analyse der vier Punkte

### Punkt 1: Doppelte Trennlinie oben bei Nicht-Board-Tabs
- **Ursache:**
  - `<header class="toolbar">` umfasst sowohl die Tab-Leiste (`.view-mode-bar`) als auch die Board-Steuerelemente (`#board-controls-wrap`).
  - `.toolbar` besitzt im CSS ein eigenes `border-bottom: 1px solid ...` mit `margin-bottom: 16px; padding-bottom: 10px;`.
  - `.view-mode-bar` besitzt ebenfalls ein `border-bottom: 1px solid ...` mit `margin-bottom: 12px; padding-bottom: 10px;`.
  - Auf allen anderen Tabs (`analyse`, `history`, `jenkins`, `tasks`) wird `#board-controls-wrap` per `display: none` ausgeblendet. Dadurch verbleibt im Header nur die Tab-Leiste, wodurch zwei Rahmenlinien im Abstand von ca. 22px direkt untereinander dargestellt werden.
- **Lösung:**
  - Das untere `border-bottom` (inklusive Bottom-Padding/Margin) wird von `.toolbar` auf `#board-controls-wrap` verlagert bzw. im CSS/JS nur dann aktiviert, wenn der Board-Tab aktiv ist (`currentViewMode === 'board'`).
  - Dadurch existiert in allen Tabs unter der Tab-Navigation exakt eine saubere Trennlinie.

---

### Punkt 2: Tasks-Benachrichtigung bei Fertigstellung eines Task-Laufs (analog zu Sessions)
- **Status & Machbarkeit:**
  - `ProjectTasksManager` in `lib/projectTasks.js` horcht bereits über `vscode.tasks.onDidEndTaskProcess` und `vscode.tasks.onDidEndTask` auf die Beendigung von Task-Prozessen.
  - Alle notwendigen Daten liegen bei Task-Ende vor:
    - Task-ID, Projektname (`t.project`), Task-Label (`t.label`),
    - Dauer in ms (`lastDurationMs`), Exit-Code (`lastExitCode`),
    - Erfolgsstatus (`isSuccess = e.exitCode === 0`), Fehlermeldung (`error`).
- **Umsetzung:**
  - **VS-Code-Toast-Benachrichtigung (`vscode.window.showInformationMessage` / `showErrorMessage`):**
    - Bei Erfolg: `✅ [Projekt] Task-Name erfolgreich beendet (12s)`
    - Bei Fehler: `❌ [Projekt] Task-Name fehlgeschlagen (Exit-Code 1, 4s)`
    - Action-Button: `Terminal anzeigen` (fokussiert direkt das Task-Terminal des Laufs).
  - **Akustische Benachrichtigung (Sound):**
    - Bei Erfolg: Sound-Event `taskCompleted` über `soundNotifier.playSound('taskCompleted')`.
    - Respektiert die Benutzereinstellungen (`sessionDashboard.sound.enabled`, Mute-Toggle).
  - **Einstellungen in `package.json`:**
    - `sessionDashboard.notifications.tasks`: boolean (Standard: `true`)
    - `sessionDashboard.sound.tasks`: boolean (Standard: `true`)

---

### Punkt 3: Tasks – Wann der Task zuletzt gelaufen ist (Möglich?)
- **Ergebnis der Prüfung: Ja, absolut möglich und technisch bereits vorbereitet!**
  - `ProjectTasksManager` speichert bei jedem Start (`vscode.tasks.onDidStartTask`) bereits `lastRun = Date.now()` und persistiert diesen Wert in `context.globalState` (`sessionDashboard.projectTaskStates`).
  - **Warum es bisher nicht sichtbar war:**
    - Im Status `idle` wurde bisher starr nur `Bereit` gerendert, selbst wenn der Task zuvor erfolgreich gelaufen war.
    - Nur unmittelbar nach einem Lauf im selben Statusfenster wurde `Erfolg (vor X Min.)` ausgegeben.
- **Lösung:**
  - Dauerhafte Anzeige von `lastRun` in beiden Ansichten:
    - **In der Favoriten-Tabelle:** Status-Spalte zeigt z. B. `Bereit (vor 2 Std.)` oder `✓ Erfolg · vor 15 Min.` bzw. `Noch nie gelaufen`. Tooltip zeigt den exakten Zeitstempel mit Datum & Uhrzeit (z. B. `29.10.2026, 18:30:45 · Dauer: 7s`).
    - **Auf den Task-Karten:** Im Karten-Footer neben dem Status: `Zuletzt: vor 25 Min.` bzw. `Zuletzt: noch nie`.

---

### Punkt 4: Tasks – Favoriten immer als erstes anzeigen, danach Filter & andere Tasks (aus-/einklappbar)
- **Aktueller Zustand:**
  - Bisher liegt oben die Filterleiste (`.tasks-toolbar`), darunter die Favoriten (`.tasks-favorites-section`), darunter die restlichen Task-Karten.
- **Neues Layout:**
  1. **1. Bereich (oben):** Favoriten-Sektion (`.tasks-favorites-section`) auf voller Breite.
     - **Aus-/Einklappbar:** Klickbarer Header mit Chevron-Icon (`▼ Favoriten (4)` / `▶ Favoriten (4)`).
     - Persistenter Klapp-Zustand (eingeklappt/ausgeklappt bleibt beim Tabwechsel erhalten).
     - Eingeklappt: Schlanke Leiste mit Zähler, spart vertikalen Platz.
     - Ausgeklappt: Schnelle 1-Klick-Tabelle mit Status, letztem Lauf und Ausführen-Button.
  2. **2. Bereich (Mitte):** Filter- & Such-Toolbar (`.tasks-toolbar`).
     - Projekt-Filter-Chips, Checkbox „Nur Haupt-Tasks“, Suchfeld, Aktualisieren-Button.
  3. **3. Bereich (unten):** Weitere Tasks (`.tasks-all-section` Grid).
     - Übersichtliche Kachelkarten für alle weiteren Tasks, gefiltert nach der Toolbar darüber.

---

## 2. Detaillierter Umsetzungsplan

### Schritt 1: CSS & Header-Struktur (Doppelte Linie beheben)
- In `lib/boardPanel.js`:
  - `border-bottom` auf `.toolbar` entfernen, wenn `#board-controls-wrap` ausgeblendet ist.
  - Saubere Trennung: `.view-mode-bar` trennt die Tabs einheitlich nach unten ab. `#board-controls-wrap` besitzt die untere Trennlinie zum Board.

### Schritt 2: Task-Fertigstellungs-Benachrichtigungen (Toast & Sound)
- In `lib/projectTasks.js`:
  - Neue Methode `notifyTaskCompleted(taskDef, { isSuccess, durationMs, exitCode, error })`.
  - Auslösen von `vscode.window.showInformationMessage` / `showErrorMessage` mit Action `Terminal anzeigen`.
  - Kopplung an `soundNotifier` für den Fertigstellungs-Sound.
- In `package.json`:
  - Konfigurationsschlüssel für Benachrichtigungen und Sound bei Tasks ergänzen.

### Schritt 3: Anzeige „Zuletzt gelaufen“ (Last Run Timestamp)
- In `lib/boardPanel.js`:
  - `state.lastRun` immer berücksichtigen, auch wenn der aktuelle Zustand `idle` ist.
  - Relative Zeitangabe (`formatTaskTimeAgo`) und absoluter Tooltip (Datum + Uhrzeit).
  - Integration in die Favoriten-Tabelle sowie auf die Task-Karten.

### Schritt 4: Favoriten-Layout (Oben, aus-/einklappbar) & nachgelagerte Filter
- In `lib/boardPanel.js`:
  - HTML-Struktur im `tasks-view` anpassen: Favoriten-Sektion vor die `.tasks-toolbar` verschieben.
  - Klapp-Mechanismus für Favoriten einbauen (`isTasksFavCollapsed` State).
  - Klick-Handler auf den Favoriten-Header zum Umschalten zwischen ein- und ausgeklappt.
  - Toolbar und Task-Grid darunter anordnen.

### Schritt 5: Validierung, Tests & Paketierung
- Syntaxprüfung aller Module mit `npm run check`.
- Bestehende Tests ausführen (`test/check-project-tasks.js`, `test/check-webviews.js` etc.).
- Neue Testfälle für Task-Notification & Last-Run-Darstellung ergänzen.
- Version in `package.json` auf `0.60.0` hochzählen, `CHANGELOG.md` pflegen.
- VSIX paketieren und im Editor installieren.

---

## 3. Offene Fragen zur Abstimmung vor der Umsetzung
1. **Toast-Aktion:** Soll die Benachrichtigung bei Klick auf den Toast das Task-Terminal im Editor fokussieren (`Terminal anzeigen`)?
2. **Favoriten-Standard:** Sollen die Favoriten standardmäßig ausgeklappt starten, wenn mindestens ein Favorit existiert?
3. **Filter-Wirkung:** Sollen die Projekt-Filter-Chips unter den Favoriten nur die unteren Task-Karten filtern (Favoriten oben bleiben immer alle sichtbar), oder sollen sie auch die Favoriten-Tabelle filtern? (Empfehlung: Favoriten oben immer alle anzeigen, als feste 1-Klick-Leiste).
