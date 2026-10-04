# Implementierungsplan: Quota- und Limit-Anzeige für Claude Code & Antigravity (5h & 7d)
Datum: 04.10.2026
Task-Ziel: 5-Stunden- und 7-Tage-Limits sowie Verbrauchsmetriken für Claude Code und Google Antigravity im Session Dashboard und der Statusleiste anzeigen.

Dieses Dokument beschreibt die Konzeption und Implementierung der Quota- und Limit-Verfolgung für Claude Code und Google Antigravity im VS-Code-Dashboard `session-dashboard`.

## Technische Grundlage (verifiziert)

1. **Claude Code (Anthropic OAuth Usage API)**:
   - Pfad: `~/.claude/.credentials.json` enthält `claudeAiOauth.accessToken` und `refreshToken`.
   - Endpoint: `https://api.anthropic.com/api/oauth/usage` mit Header `anthropic-beta: oauth-2025-04-20`.
   - Liefert in Echtzeit:
     - `five_hour`: `utilization` (z. B. `79`%), `resets_at` (ISO-Timestamp, z. B. `13:10 Uhr`).
     - `seven_day`: `utilization` (z. B. `80`%), `resets_at` (ISO-Timestamp, z. B. `Mi 23:00 Uhr`).
     - `limits`: Status und Warnschwellen.
   - Vorab-Probe per Node.js 24 `fetch`: Status 200, Antwortzeit <200 ms. Falls TLS-Fingerprint greift, Fallback auf `curl.exe`.
   - Automatischer Token-Refresh bei Bedarf über `https://console.anthropic.com/v1/oauth/token`.
   - Wenn ein Rate-Limit aktiv ist: `quotaLimits.resetsAt` und `rateLimitType` ("five_hour", "weekly") werden aus dem Transkript ausgelesen.

2. **Google Antigravity**:
   - Transkripte unter `~/.gemini/antigravity/brain/<id>/.system_generated/logs/transcript.jsonl`.
   - Jeder `PLANNER_RESPONSE`-Schritt enthält `created_at`, `input_tokens`, `cache_read_tokens` und `output_tokens`.
   - Vorab-Probe: Aggregation aller Antigravity-Sessions der letzten 7 Tage benötigt nur ~50 ms.
   - Erkennt `RESOURCE_EXHAUSTED (code 429)` in Fehlermeldungen für akute Rate-Limits.

## Hintergrund & Zielstellung

Entwickler arbeiten parallel mit mehreren Instanzen von Claude Code und Google Antigravity. Bislang war unklar, wie nahe man sich am 5-Stunden-Session-Limit oder am wöchentlichen Kontingent befindet, bis ein harter Rate-Limit-Fehler auftritt.
Ziel ist es, die Auslastung transparent im Dashboard-Header und in der Statusleiste einzublenden, inklusive Reset-Uhrzeiten und Farbwarnungen (<65% normal/blau, 65-85% erhöht/gelb, >85% kritisch/rot).

## Vorgeschlagene Änderungen

### [Quota-Modul]

#### [ADD] [lib/quota.js](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/lib/quota.js)
- `fetchClaudeQuota()`: Liest Token aus `~/.claude/.credentials.json`, ruft Anthropic Usage API ab (mit Fallback auf `curl.exe` und Token-Refresh bei Bedarf).
- `fetchAntigravityQuota()`: Berechnet aus `conversation_summaries.db` und den Transkripten der letzten 7 Tage das Tokenvolumen im 5-Stunden- und 7-Tage-Fenster und prüft auf 429-Fehler.
- `getQuotaSummary()`: Führt beide Provider zusammen, cached die Ergebnisse für 45 Sekunden (vermeidet unnötige API-Calls und Dateiscans).

### [Model & Registry Integration]

#### [MODIFY] [lib/registry.js](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/lib/registry.js)
- Export von `getQuotaSummary` zur zentralen Abfrage durch das `SessionModel`.

#### [MODIFY] [extension.js](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/extension.js)
- `SessionModel`: Hält aktuellen `quota`-Zustand.
- Aktualisiert Quota bei Modell-Refresh (oder via TTL).
- Reicht Quota an `boardPanel.js` und `statusBar.js` weiter.
- Zeigt bei aktivem Filter das 5h-Limit in `view.description` an.

### [UI-Erweiterungen]

#### [MODIFY] [lib/boardPanel.js](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/lib/boardPanel.js)
- HTML/CSS: Neuer `.quota-strip` direkt unter der Toolbar.
- Zeigt je nach Provider-Filter Claude-Code- und Antigravity-Karten:
  - Claude Code: 5-Stunden-Auslastungsbalken (% + Reset-Uhrzeit) und 7-Tage-Auslastungsbalken (% + Reset-Datum).
  - Antigravity: 5-Stunden-Tokenvolumen und 7-Tage-Tokenvolumen (z. B. `20.9M` / `299M`) mit Statusanzeige (`Bereit` bzw. `Limit (429)`).
- Farbschema konsistent mit Token-Balken (<65% blau, 65-85% gelb, >85% rot).
- Tooltips mit detaillierten Metriken.

#### [MODIFY] [lib/statusBar.js](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/lib/statusBar.js)
- Hover-Tooltip um Quota-Übersicht ergänzen:
  - Claude: `⚡ 5-Std.-Limit: X% (Reset HH:MM) · 📅 7-Tage-Limit: Y% (Reset Wochentag HH:MM)`
  - Antigravity: `⚡ 5-Std.-Verbrauch: ~X Tokens · 📅 7-Tage-Verbrauch: ~Y Tokens`

#### [MODIFY] [package.json](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/package.json)
- Versionssprung von `0.12.0` auf `0.13.0`.
- `npm run check` prüft auch `lib/quota.js`.

## Verifikationsplan

### Automatisierte Tests & Syntax-Check
```powershell
npm run check
```

### Manuelle Prüfung
1. **Extension bauen & installieren**:
   - `npx @vscode/vsce package`
   - `code --install-extension session-dashboard-0.13.0.vsix --force`
2. **Dashboard öffnen**:
   - Quota-Strip im Board prüfen: Claude Code zeigt 5h- und 7d-% mit korrekt formatierter Reset-Zeit; Antigravity zeigt 5h- und 7d-Tokens.
   - Filter-Umschaltung prüfen: Bei "Claude Code" rückt Claude in den Fokus, bei "Antigravity" Antigravity, bei "Alle" beide sichtbar.
3. **Statusleisten-Hover prüfen**:
   - Maus über Statusleisten-Widget bewegen: Markdown-Tooltip zeigt saubere Quota-Zusammenfassung beider Provider.
