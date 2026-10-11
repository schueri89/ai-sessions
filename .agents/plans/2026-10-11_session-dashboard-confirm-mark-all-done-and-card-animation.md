# Implementierungsplan: Bestätigungsdialog für „Alles erledigt markieren“ & Card-Highlight bei Fertigstellung

Datum: 11.10.2026  
Status: Erledigt (v0.42.0)  
Betroffenes Projekt: ai-sessions  

---

## 1. Übersicht & Zielsetzung

1. **Bestätigungsdialog für „Alles erledigt markieren“**:
   - Im Spaltenkopf der Kanban-Spalte „Fertig“ (`idle`) existiert ab 10 Sessions der Sammel-Aktionsbutton `✅ Alles erledigt markieren`.
   - Zuvor wurden beim Klick sofort alle fertigen Sessions ohne jede Rückfrage als erledigt markiert (`model.done.markMany()`), was bei versehentlichem Klick dutzende Sessions unumkehrbar verschob.
   - Neu: Ein nativer, modaler Bestätigungsdialog (`vscode.window.showWarningMessage` mit `{ modal: true }`) fängt den Befehl `sessionDashboard.markAllDone` vor der Ausführung ab, nennt die exakte Session-Anzahl und erfordert eine explizite Bestätigung.

2. **Dashboard Session-Card Highlight-Animation bei Fertigstellung**:
   - Wenn eine KI-Session ihre Arbeit beendet (Wechsel von `busy` nach `idle`), ertönt der Erfolgs-Sound `taskCompleted` (z. B. *Tada* unter Windows bzw. *Hero* unter macOS, ca. 2,5s Dauer).
   - Bisher gab es im Dashboard dazu kein visuelles Feedback auf der Karte selbst.
   - Neu: Die fertig gewordene Session-Card wird während des Abspielens des Sounds für 2,8 Sekunden optisch hervorgehoben (grüner Glow, pulsierender Rand in `--vscode-charts-green`, sanfter Impuls und bedarfsweises Einscrollen).

---

## 2. Technische Umsetzung

### 2.1 Modaler Bestätigungsdialog (`extension.js`, `lib/boardPanel.js`)
- **Befehl `sessionDashboard.markAllDone` (`extension.js`)**:
  - Prüfung der betroffenen Session-IDs (`ids.length`).
  - Wenn `ids.length === 0`: Vorzeitiger Abbruch ohne Dialog.
  - Ermittlung von Singular/Plural-Label (`1 fertige Session` vs. `${count} fertigen Sessions`).
  - Anzeige des modalen Dialogs:
    ```javascript
    const answer = await vscode.window.showWarningMessage(
      `Möchtest du wirklich ${count === 1 ? 'diese' : 'alle'} ${countLabel} als erledigt markieren?`,
      { modal: true, detail: 'Die Sessions werden in den Zustand „Erledigt“ verschoben.' },
      confirmAction
    );
    if (answer !== confirmAction) return;
    ```
  - Erst bei Bestätigung werden `model.done.markMany(ids)` und `model.bookmarks.unmarkMany(ids)` ausgeführt.
- **Button-Tooltip (`lib/boardPanel.js`)**:
  - Tooltip im Spaltenkopf aktualisiert auf `Alle fertigen Sessions als erledigt markieren (erfordert Bestätigung)`.

### 2.2 Signalübertragung der Fertigstellung (`lib/soundNotifier.js`, `extension.js`)
- **`lib/soundNotifier.js`**:
  - `evaluate(sessions, quota)` prüft den Übergang von `busy` zu `idle` (`isNowFinished`).
  - Sammelt die IDs in `completedSessionIds`.
  - Gibt `{ completedSessionIds }` synchron zurück (auch wenn Ton stummgeschaltet ist, damit das visuelle Feedback zuverlässig erhalten bleibt).
- **`extension.js`**:
  - In `update()` wird `soundEvents?.completedSessionIds` an `board.update()` übergeben.

### 2.3 Webview Puffer & CSS-Animation (`lib/boardPanel.js`)
- **Pufferung gegen Re-Render-Race-Conditions**:
  - `highlightedSessions = new Set()` speichert fertige Session-IDs für 2800 ms (`setTimeout`).
  - Re-Renders (z. B. durch parallele Token- oder Quota-Updates) brechen die Animation nicht vorzeitig ab.
- **Karten-Markup & Sichtbarkeit**:
  - Karten erhalten das Attribut `data-session-id="${s.sessionId}"` sowie die Klasse `just-completed`.
  - Bei Neufertigstellung wird `card.scrollIntoView({ behavior: 'smooth', block: 'nearest' })` aufgerufen, falls die Spalte gescrollt war.
- **CSS `@keyframes cardCompletedGlow`**:
  - Dauer: 2,8s (synchron zur Tonlänge).
  - Skalierung 1.02x, leuchtender Rahmen und Schatten in `var(--vscode-charts-green)` (`rgba(78, 201, 176, 0.65)`).
  - Barrierefreiheit: `@media (prefers-reduced-motion: reduce)` blendet die Skalierung aus und nutzt statischen dezenten Glanz.

---

## 3. Verifikation

- `npm run check`: Alle 21 Module geprüft, Webview-Scripts von BoardPanel und TranscriptViewer syntaktisch validiert.
- Versionserhöhung auf `0.42.0` in `package.json`.
- VSIX paketiert unter `vsix/ai-sessions-0.42.0.vsix` und im Editor installiert.
