# Implementierungsplan: Gemini 4 Argon Budget-Fenster für Google Antigravity
Datum: 2026-10-16
Version: v0.47.0

## Ausgangslage & Motivation

Google hat für Antigravity das Modell **Gemini 4 Argon** ausgerollt. Im Language Server (`RetrieveUserQuotaSummary`) wird dafür ein eigenes Kontingent-Fenster mit wöchentlichem Limit bereitgestellt:

```json
{
  "displayName": "Gemini 4 Argon",
  "description": "For paid Pro plans, Argon quota is separate. Higher Argon quota (included as part of the larger Gemini quota bucket) is available on Ultra plans.",
  "buckets": [
    {
      "bucketId": "gemini-argon-wtu-weekly",
      "displayName": "Gemini 4 Argon Weekly Limit",
      "window": "weekly",
      "remainingFraction": 1,
      "resetTime": "2026-10-23T05:12:10Z"
    }
  ]
}
```

Bisher matchte die Parsing-Logik in `quota.js` Gruppen über `name.includes('gemini')`. Da „Gemini 4 Argon" den String „gemini" enthält und als 3. Gruppe geliefert wird, überschrieb Argon zuvor fälschlicherweise das wöchentliche Limit der Standard-Gemini-Modelle (Flash/Pro).

## Umgesetzte Architektur & Änderungen

### 1. Quota Parsing & Datenmodell (`lib/quota.js`)
- `parseLiveQuotaGroups(groups)` als dedizierte Funktion extrahiert:
  - Erkennt `isArgon` vorrangig (`name.includes('argon') || bucketId.includes('argon')`).
  - Schließt `isArgon` explizit aus `isGemini` aus, sodass `gemini.weekly` unverfälscht bleibt.
  - Liefert `argon: { fiveHour: null, weekly: bucketData }`.
- `hasLiveQuota` ist auch wahr, wenn ausschließlich ein Argon-Bucket vorhanden ist.
- `resolveAntigravityReset`: bindet `agQuota.argon` in die überwachten Gruppen ein, sodass bei einem Rate-Limit auf Argon die korrekte Reset-Zeit ermittelt wird.

### 2. Statusleiste & Tooltips (`lib/statusBar.js`)
- `formatAntigravityText(format, antigravity)`:
  - Berücksichtigt Argon im Format `detailed`: `... · X% (Argon)`.
  - Fallback auf Argon-Anzeige, falls nur Argon aktiv ist.
- `updateAntigravityItem`:
  - `maxPercent` für Farbschwellen (Warnung/Fehler) bezieht `q.antigravity.argon.weekly.percent` ein.
  - Tooltip ergänzt um `📅 Gemini 4 Argon 7-Tage-Limit: X% (Reset ...)`.
- Haupt-Statusleisten-Tooltip um dieselbe Zeile erweitert.

### 3. Dashboard Quota-Card (`lib/boardPanel.js`)
- `renderQuotaStrip`:
  - Eigener Meter `Argon (7d)` mit Füllbalken, Farbklassen (low/medium/high), Reset-Hinweis und Hover-Tooltip.
  - Header-Status-Pill bezieht Argon in `maxPct` ein.
- `friendlyModel(m)`:
  - Erkennt `lower.includes('argon')` und formatiert es als `Gemini 4 Argon`.

### 4. Hilfsfunktionen & Analytics (`lib/format.js`, `lib/analytics.js`, `lib/soundNotifier.js`, `extension.js`)
- `lib/format.js`: `friendlyModel` mappt `argon` auf `Gemini 4 Argon`.
- `lib/analytics.js`: Bepreisung für `gemini-4-argon` hinterlegt.
- `lib/soundNotifier.js`: Benachrichtigungen bei Erschöpfung und Reset des Argon-Wochenlimits.
- `extension.js`: Rerender-Signatur berücksichtigt `quota.antigravity.argon.weekly.percent`.

### 5. Qualitätssicherung & Tests
- `test/check-antigravity-quota.js`:
  - Validiert echtes `RetrieveUserQuotaSummary`-Payload.
  - Sichert ab, dass `gemini.weekly` nicht durch `argon.weekly` überschrieben wird.
  - Prüft Reset-Auflösung und `friendlyModel`.
- In `package.json` `scripts.check` eingebunden.
