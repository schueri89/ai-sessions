# Implementierungsplan: Einstellbare Anzeige des letzten Prompts auf Dashboard-Kacheln

Datum: 2026-10-26  
Version: v0.56.0

## Ausgangslage & Motivation

Auf den Kanban-Karten des Dashboards wurde bisher unterhalb der Badges und Live-Aktivität immer ein zweizeilig abgeschnittener `.prompt`-Block (`s.lastPrompt`) angezeigt.
In der Praxis führt dies zu:
1. **Visueller Überladung & stark vergrößerter Kachelhöhe:** Die Spalten werden unnötig lang, was zu viel vertikalem Scrollen führt.
2. **Redundanz zum Titel:** Der Session-Titel fasst das Thema meistens bereits prägnant zusammen (bei Claude, Antigravity, Copilot und Codex).
3. **Mangelnder Aussagekraft bei Rückfragen:** Der Prompt zeigt die letzte Nutzer-Eingabe, nicht die Frage der KI im Zustand „Wartet auf dich“.

## Ziel & Konzept

1. **Neue Einstellung in `package.json`:**
   - `sessionDashboard.showLastPrompt`
   - Typ: `boolean`, Standard: `false`
   - Beschreibung: „Letzten Benutzer-Prompt als Textblock auf den Dashboard-Kacheln anzeigen.“

2. **Reaktive Aktualisierung in `extension.js`:**
   - `onDidChangeConfiguration`: Reagiert auf `sessionDashboard.showLastPrompt` und aktualisiert das Board via `board.update()` sofort und ohne Fenster-Reload.

3. **Rendering in `lib/boardPanel.js`:**
   - Übergabe von `showLastPrompt: Boolean(vscode.workspace.getConfiguration('sessionDashboard').get('showLastPrompt', false))` an das Webview-Script.
   - Webview verwaltet `cachedShowLastPrompt`.
   - `.prompt`-Div wird nur gerendert, wenn:
     - `cachedShowLastPrompt === true` ist, ODER
     - eine aktive Freitextsuche Begriffe enthält, die im `lastPrompt` vorkommen (intelligenter Suchtreffer-Fallback mit `<mark class="search-highlight">`).
   - Tooltip-Erweiterung auf Kachel und Titel: `Letzter Prompt:\n...` bleibt per Maus-Hover jederzeit schnell einsehbar.

4. **Tests & Qualitätssicherung:**
   - `test/check-webviews.js` Syntax-Check.
   - Testfall für das bedingte Prompt-Rendering.
   - `npm run check`
   - Paketierung & automatische Installation von `vsix/ai-sessions-0.56.0.vsix`.
