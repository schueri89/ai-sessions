# Implementierungsplan: Fix Rate-Limit-Reset-Erkennung für Antigravity Argon

Datum: 2026-10-26  
Version: v0.55.1

## Problem & Ursachenanalyse

Bei einer Google-Antigravity-Session (z. B. „Start von Etappe 3“), die mit `RESOURCE_EXHAUSTED` (429) und `INSUFFICIENT_G1_CREDITS_BALANCE` abgebrochen wurde, wechselte der Session-Status unmittelbar in „Wartet auf dich“ mit dem Badge `⚠️ Limit vorbei · Bereit zum Fortsetzen`, obwohl das wöchentliche Gemini 4 Argon-Budget aufgebraucht war und der Reset erst am Mittwoch anstand.

### Ursache im Code

1. In `lib/quota.js` prüfte die Funktion `resolveAntigravityReset` bisher:
   ```javascript
   const exhausted = typeof b.remainingFraction === 'number' && b.remainingFraction <= 0;
   ```
2. Google Antigravity blockiert Prompts jedoch bereits, wenn das verbleibende Kontingent nicht mehr für einen vollständigen Generierungsturn ausreicht. Im Live-Quota-Payload verblieb daher ein minimaler Rest von `0.0074512` (~0,75 % Rest, gerundet 99 % verwendet).
3. Da `0.0074512 <= 0` falsch ergab, wurde der Argon-Bucket nicht als erschöpft gewertet (`resetsAt` blieb 0).
4. Der anschließende Fallback `if (!resetsAt) resetsAt = blockedAt || 1;` nahm fälschlicherweise an, das Limit sei bereits vorbei, und setzte `resetsAt` auf die Abbruchzeit in der Vergangenheit.
5. In `extension.js`, `lib/boardPanel.js` und `lib/format.js` führte `Date.now() >= resetsAt` sofort zu `isPastReset = true` und zur Anzeige „Limit vorbei“.

## Umgesetzte Änderungen

1. **`lib/quota.js` (`resolveAntigravityReset`):**
   - Erschöpfungsgrenze von strikt `<= 0` auf praxisgerechte Schwellenwerte angehoben:
     ```javascript
     const exhausted = typeof b.remainingFraction === 'number' && (b.remainingFraction <= 0.02 || (typeof b.percent === 'number' && b.percent >= 98));
     ```
   - Dadurch wird der Argon-Bucket bei 99 % Auslastung (bzw. <= 2 % Restguthaben) zuverlässig als Ursache des Limits identifiziert und der echte Reset-Zeitpunkt (z. B. Mittwoch 15:33 Uhr) übernommen.

2. **`test/check-antigravity-quota.js`:**
   - Testfall für fraktionale Restquoten ergänzt (`remainingFraction: 0.0074512`, `percent: 99`), um Regressionen zu verhindern.

3. **Dokumentation, Versionierung & Paketierung:**
   - `TODO.md`: Erledigt-Eintrag für v0.55.1 ergänzt und mit diesem Plan verknüpft.
   - `CHANGELOG.md`: Eintrag für v0.55.1 hinzugefügt.
   - `package.json`: Version auf `0.55.1` angehoben.
   - `npm run check` erfolgreich ausgeführt.
   - `vsix/ai-sessions-0.55.1.vsix` paketiert und im Editor installiert.
