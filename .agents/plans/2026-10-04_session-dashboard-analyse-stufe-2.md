# Plan: session-dashboard — Analyse & Verbrauchsübersicht (Stufe 2: Scope-Umschaltung 7 & 30 Tage)

## Status: Implementiert & Verifiziert (v0.24.1)

## Kontext & Ziel
In Stufe 1 wurde der Analyse-Tab mit Tages-Metriken (Tokens, Kosten, Cache Hit-Rate, aktive Turns/Zeit, 24h-Stundendiagramm, Modell- und Projektübersicht) eingeführt.
In Stufe 2 wird der Betrachtungszeitraum flexibel erweiterbar gemacht:
- `[ Heute ]`: 24-Stunden-Ansicht (00:00 - 23:00) mit stündlichem Balkendiagramm.
- `[ 7 Tage ]`: Tägliches Balkendiagramm (z. B. `Mo 29.09.`, `Di 30.09.` ...) mit aggregierten KPIs.
- `[ 30 Tage ]`: Tägliches Balkendiagramm der letzten 30 Tage mit dynamischer Beschriftung und aggregierten KPIs.
- Dynamische Anpassung aller 4 KPI-Karten, Diagrammtitel, Tooltips, Modell-Ranglisten und Projekt-Tabellen an den gewählten Scope.
- Schnelle Performance durch inkrementellen Datei-Cache (`mtimeMs` + `size`), der wiederholte Aggregationen auf < 1ms beschleunigt.

## Architektur & Änderungen
1. **`lib/analytics.js`**:
   - Inkrementeller File-Cache (`fileTurnCache`) für Claude-Code-JSONL und Antigravity-Transkripte.
   - 30-Tage-Scans erfassen Turns mit `{ provider, timestamp, dateKey, hour, sessionId, project, model, input, output, cacheWrite, cacheRead, cost }`.
   - `aggregateScope(rawTurns, scope, filterProvider)`: Berechnet Summaries, Timeline (hourly für `today`, daily für `7d`/`30d`), Models und Projects.
   - `getAllAnalytics()` liefert 9-teiliges Datenbündel (`{ all, claude, antigravity } x { today, 7d, 30d }`).

2. **`lib/boardPanel.js`**:
   - `this.analyseScope = 'today'` mit Message-Handler `setAnalyseScope`.
   - Webview Toolbar mit Scope-Buttons `[ Heute ]`, `[ 7 Tage ]`, `[ 30 Tage ]`.
   - `renderTimelineChart(timeline, maxTimelineTokens, timelineType, scope)`:
     - Automatische Slot- und Balkenbreiten (Heute: 20px, 7 Tage: 52px, 30 Tage: 18px).
     - Netto- vs. Brutto-Umschaltung bleibt vollständig erhalten.
     - Detaillierte Hover-Tooltips mit Datum, Wochentag, Uhrzeit, Tokens (In/Out/Cache) und Kosten.
     - Horizontale Hilfslinien und saubere X-Achsen-Beschriftungen.
   - Dynamische Titel für KPI-Karten, Diagramm und Zähler (`X aktiv`).
   - Leere Zustände mit Scope-angepassten Texten („Keine Modell-Aktivität im gewählten Zeitraum“).

3. **Verifikation**:
   - Standalone Syntax-Check via `verify-webview.js` (parst Webview-Client-Script via Node `vm.Script`).
   - `npm run check` (Syntax aller Backend-Module).
   - `npm run package` & `code --install-extension session-dashboard-0.24.0.vsix --force`.

