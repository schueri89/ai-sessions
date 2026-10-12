# Plan: OpenAI Codex Integration in Tab Analytics (v0.43.1)

## Problem & Ursachenanalyse
Ein Kollege meldete, dass im Analyse-Tab die Statistiken von GitHub Copilot und OpenAI Codex identisch seien.
Die Prüfung ergab:
1. `collectRawTurns()` in `lib/analytics.js` sammelte bisher nur Claude Code, Google Antigravity und GitHub Copilot. Codex war nicht angebunden.
2. `getAllAnalytics()` lieferte kein Provider-Objekt für `codex` zurück (`bundle.codex` war `undefined`).
3. Im Webview (`lib/boardPanel.js`) griff beim Klick auf den Codex-Filter-Button der Fallback `cachedAnalytics[currentAnalyseFilter] || cachedAnalytics.all`.
4. Wenn ein Entwickler primär Copilot und keine aktiven Claude-Code- oder Antigravity-Sessions im gewählten Zeitraum hatte, entsprach `all` exakt der Summe von `copilot` (`all === copilot`). Dadurch zeigte der Klick auf Codex exakt dieselben Zahlen, Modelle und Freigaben wie Copilot.
5. In `lib/transcriptParser.js` wurde `calculateTurnCost` mit falschen Parametern aufgerufen (`(model, inp, out, ...)` statt `(usage, model, provider)`), wodurch Codex-Kosten stets als `$0.00` berechnet wurden.
6. In der KPI-Kostenkarte im Analyse-Tab fehlte die Zeile für Codex.

## Durchgeführte Anpassungen

1. **`lib/analytics.js`**:
   - `loadCodexThreadsMap()`: Liest Thread-Metadaten (CWD, Titel, Modell, Rollout-Pfad) aus `~/.codex/state_*.sqlite`.
   - `findCodexRolloutFiles()`: Rekursive Entdeckung aller Rollout-JSONL-Dateien unter `~/.codex/sessions/YYYY/MM/DD/`.
   - `collectRawTurns()` um Schritt 4 (OpenAI Codex) erweitert: Extraktion von `session_meta`, `turn_context`, `response_item` (Reasoning & Tool-Calls) und `token_usage_record` (Netto-Input, Cached-Input, Output, Reasoning-Thinking, Kosten via Modell-Pricing).
   - `aggregateScope()` berechnet `codexCost` und führt diesen im Summary-Objekt.
   - `getAllAnalytics()` stellt `bundle.codex` für `today`, `7d` und `30d` bereit.
   - Modell-Fallback `gpt-6.1-sol` in `getSessionHistoryList()` ergänzt.

2. **`lib/boardPanel.js`**:
   - KPI-Kostenkarte um die Zeile `Codex: $X.XX` (`#kpi-codex-cost`) erweitert.
   - `renderAnalyseView()` aktualisiert `#kpi-codex-cost` mit den formatierten Kosten von `s.codexCost`.

3. **`lib/transcriptParser.js`**:
   - `parseCodexTranscript()`: Korrekter Aufruf von `calculateTurnCost({ input, output, cacheRead, cacheWrite }, model, 'codex')` und saubere Token-Akkumulierung pro Turn.

## Verifikation
1. `npm run check` erfolgreich durchgelaufen (alle 22 Module und Webview-Skripte syntaxgeprüft).
2. Verifikation via Node-Skript: `bundle.codex` liefert eigenständige Metriken (Tokens, Modelle, Tool-Aufrufe, Kosten).
3. Paketierung `vsix/ai-sessions-0.43.1.vsix` und Installation via `code --install-extension`.
