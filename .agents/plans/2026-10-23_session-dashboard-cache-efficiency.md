# Plan: Cache-Effizienz-Anzeige (Cache-Hit-Rate %) auf Session-Karten und in der Historie

## 1. Motivation & Hintergrund

Prompt Caching spart signifikant Latenz und API-Kosten bei wiederkehrenden Modellaufrufen. Bislang wurde die Cache-Hit-Rate jedoch nur im aggregierten Analyse-KPI-Dashboard als Gesamtwert dargestellt. Auf den Kanban-Session-Karten (Tab 1) war die Aufschlüsselung lediglich als Text im Tooltip der Token-Leiste versteckt, und in der Historie-Tabelle (Tab 3) wurde die Cache-Quote fehlerhaft ohne Cache-Creation berechnet (`cacheRead / (input + cacheRead)` statt `cacheRead / (input + cacheRead + cacheCreation)`). Zudem erhielten Anbieter ohne Cache-Metriken (GitHub Copilot) eine irreführende `0%`-Anzeige.

### Formel
$$\text{Cache-Hit-Rate} = \frac{\text{cacheRead}}{\text{input} + \text{cacheRead} + \text{cacheCreation}}$$

### Anbieter-Unterstützung
- **Claude Code (`claude`)**: Vollständig nativ. Liefert `input_tokens`, `cache_read_input_tokens` (`cacheRead`) und `cache_creation_input_tokens` (`cacheCreation`).
- **Google Antigravity (`antigravity`)**: Liefert `input_tokens` und `cache_read_tokens` (`cacheRead`). Da Gemini API kein separates Token-Writing-Metering führt, ist $\text{cacheCreation} = 0$.
- **OpenAI Codex (`codex`)**: Liefert aus Rollout-Transkripten `input_tokens` und `cached_input_tokens` (`cacheRead`). Bei OpenAI ist $\text{cacheCreation} = 0$. Netto-Input ist $\max(0, \text{input\_tokens} - \text{cached\_input\_tokens})$.
- **GitHub Copilot (`copilot`)**: Weder VS Code noch Copilot-Chat erfassen Cache-Metriken. Anzeige zeigt dezent `–` (N/A) statt irreführendem `0%`.

---

## 2. Ziele

1. **Session-Karten (Kanban-Board)**:
   - Neues Badge `token-cache-badge` (z. B. `85% Cache`), dezent grün gestylt (`#98c379`), bei $\ge 70\%$ hervorgehoben (`high`).
   - Tooltip mit detaillierter Aufschlüsselung: `Cache-Effizienz (Hit-Rate): 85% (32k Cache-Read von 38k Input-Tokens)`.
   - Bei Anbietern ohne Cache (Copilot) wird das Badge nicht angezeigt.
2. **Historie-Tabelle (Tab 3)**:
   - Formelkorrektur in `lib/analytics.js`: `cacheTotal = inputTokens + cacheReadTokens + cacheWriteTokens`.
   - Copilot erhält `cacheRatio = null` und wird mit `–` (statt `0%`) und erklärendem Tooltip dargestellt.
   - Sortierung nach Cache berücksichtigt `null`-Werte (am Ende einreihen).
   - Detail-Accordion zeigt Cache-Chips nur bei unterstützten Anbietern und `Cache Creation` nur, wenn $> 0$.
3. **Provider & Transkripte**:
   - `lib/transcripts.js`: `cacheHitRate` im `tokens`-Objekt ergänzen.
   - `lib/providers/antigravity.js`: `cacheHitRate` im `tokens`-Objekt berechnen.
   - `lib/providers/codex.js`: Netto-Input-Korrektur und `cacheHitRate` im `tokens`-Objekt berechnen.
4. **Qualitätssicherung**:
   - Neuer Test `test/check-cache-efficiency.js` für Formel, Provider-Handling und UI-Rendering.
   - Einbindung in `npm run check`.
   - Version auf `0.54.0` erhöhen, CHANGELOG & TODO aktualisieren, VSIX bauen und installieren.

---

## 3. Umsetzungsschritte

- [ ] `lib/transcripts.js`: `cacheHitRate` im Rückgabe-Objekt von `rec.message.usage` ergänzen.
- [ ] `lib/providers/antigravity.js`: `cacheHitRate` im `tokens`-Objekt von `readSessions` berechnen.
- [ ] `lib/providers/codex.js`: Netto-Input und `cacheHitRate` im `tokens`-Objekt berechnen.
- [ ] `lib/analytics.js`: `cacheTotal` in `getSessionHistoryList` um `cacheWriteTokens` erweitern und Copilot als `null` kennzeichnen.
- [ ] `lib/boardPanel.js`:
  - CSS für `.token-badges` und `.token-cache-badge` (inkl. `.high`) hinzufügen.
  - In `renderCard`: Cache-Badge rendern, Tooltip um Hit-Rate erweitern.
  - In Historie: `hasCache`-Prüfung, `–` für nicht unterstützte Anbieter, Tooltip und Accordion-Chips verfeinern.
- [ ] `test/check-cache-efficiency.js`: Neuer Unit-Test für alle 4 Anbieter, Formelberechnung und Edge-Cases.
- [ ] `package.json`: Version `0.54.0`, Test in `npm run check` einbinden.
- [ ] `CHANGELOG.md` & `TODO.md`: Dokumentation pflegen.
- [ ] Syntax-Check, VSIX-Paketierung und lokale Installation.

