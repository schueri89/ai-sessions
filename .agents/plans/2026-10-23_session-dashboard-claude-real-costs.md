# Plan: Claude Code Echte Kosten (totalCostUSD) Integration

## 1. Motivation & Hintergrund

Bisher berechnete `ai-sessions` Kosten für alle Anbieter synthetisch anhand statischer Token-Preistabellen (`calculateTurnCost`). Bei Claude Code führte dies zu massiven Über-Schätzungen (teilweise das 4- bis 5-fache der tatsächlichen Kosten), da Zwischenschritte (Tool-Use Loops innerhalb desselben Turns) in den Transkript-Dateien (`*.jsonl`) mehrfach denselben Prompt-/Cache-Kontext protokollieren.

Claude Code selbst schreibt jedoch periodisch und am Ende von Turns/Sessions ein aggregiertes Status-Objekt vom Typ `cost-state` in das Transkript:
```json
{
  "type": "cost-state",
  "sessionId": "...",
  "totalCostUSD": 10.236182800000005,
  "totalAPIDuration": 993436,
  "totalToolDuration": 252539,
  "totalLinesAdded": 807,
  "totalLinesRemoved": 122,
  "totalDuration": 3199427,
  "startTime": 1791094178539,
  "modelUsage": { ... }
}
```
Dieser Wert entspricht centgenau der tatsächlichen Abrechnung durch Anthropic.

## 2. Ziele

1. **Transkripte (`lib/transcripts.js`)**:
   - `cost-state` in `INTERESTING` aufnehmen und `totalCostUSD` inkrementell extrahieren.
2. **Historie (`lib/history.js`) & Provider (`lib/providers/claude.js`)**:
   - `totalCostUSD` sowohl für laufende als auch für historische/geschlossene Sessions bereitstellen.
3. **Analyse (`lib/analytics.js`)**:
   - In `collectRawTurns`: Bei Claude-Transkripten vorhandene `cost-state`-Einträge erfassen und die synthetisch berechneten Turn-Kosten intervallweise/proportional auf den echten Dollar-Betrag skalieren.
   - In `getSessionHistoryList`: Reale Kosten `totalCostUSD` bevorzugt verwenden und `isRealCost: true` setzen.
4. **Dashboard & Webview (`lib/boardPanel.js`)**:
   - **Kanban-Karten**: Kosten-Badge auf der Karte (`$10.24`) neben den Tokens und im Tooltip („Reale Kosten aus Claude-Transkript“).
   - **Historie-Tabelle**: Reale Kosten in der Kosten-Spalte mit optischem Kennzeichen (✓ / Tooltip „Reale Kosten aus Claude-Transkript“), sowie Detail-Chip im Accordion.
   - **Analyse-Tab**: Reale Claude-Kosten fließen in KPI-Karten, Diagramme und Projekt-/Modell-Statistiken ein.
5. **Qualitätssicherung**:
   - Unit-Tests in `test/check-claude-cost.js`.
   - `npm run check` und VSIX-Paketierung.

## 3. Umsetzungsschritte

- [ ] `lib/transcripts.js`: `INTERESTING` um `'"cost-state"'` erweitern, `totalCostUSD` in `applyLine`, `emptyInfo` und `readTranscriptInfo` verankern.
- [ ] `lib/history.js`: `totalCostUSD` im Rückgabe-Objekt von `readEntry` durchreichen.
- [ ] `lib/providers/claude.js`: `totalCostUSD` in `readLiveSessions` und `readSessions` an die Session-Objekte hängen.
- [ ] `lib/analytics.js`: Chunk-/Proportional-Skalierung der Claude-Turns anhand von `cost-state` in `collectRawTurns`, Bevorzugung in `getSessionHistoryList`.
- [ ] `lib/boardPanel.js`: `totalCostUSD` an Webview übergeben; Anzeige auf Kanban-Karten (Token-Meta & Card-Meta), in der Historie-Tabelle & Detail-Accordion; Währungsformatierung verfeinern.
- [ ] `test/check-claude-cost.js`: Unit-Tests für `transcripts.js`, `history.js`, `analytics.js` und `boardPanel.js`.
- [ ] `package.json`: Version auf `0.53.0` erhöhen, Test in `npm run check` einbinden.
- [ ] Validierung via `npm run check`, VSIX bauen und installieren.
