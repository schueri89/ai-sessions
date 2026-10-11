# Implementierungsplan: Antigravity Live-Quota- und Limit-Verbrauchsmessung
Datum: 04.10.2026
Task-Ziel: Live-Quota- und Limit-Auslastung von Google Antigravity über den internen Language Server Hub (Connect RPC) abfragen und im Session Dashboard sowie in der Statusleiste mit Prozenten, Fortschrittsbalken und Reset-Zeiten anzeigen.

Dieses Dokument beschreibt die Anbindung an den Antigravity Language Server Hub zur exakten Verbrauchsmessung und Quota-Ermittlung für das VS-Code-Dashboard `session-dashboard`.

## Technische Grundlage (verifiziert)

1. **Antigravity Extension Architektur & Language Server Hub**:
   - Die Antigravity-Erweiterung (`google.google-antigravity-1.6.0`) startet im Hintergrund den Binary-Prozess `agy.exe` mit Parametern:
     `agy.exe --hub --hub-port=<Port> --app_data_dir=antigravity --csrf_token=<Token> ...`
   - Die Webview kommuniziert via Connect RPC / gRPC-Web (HTTP POST) mit dem Hub auf `http://127.0.0.1:<Port>/`.
   - Der Header `x-codeium-csrf-token: <Token>` und `Content-Type: application/json` autorisieren Anfragen.

2. **Offizieller Quota-Endpoint**:
   - Service: `POST /exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary`
   - Vorab-Probe per Node.js HTTP-Request verifiziert (Antwort 200 OK in <10 ms):
     - `Gemini Models`:
       - `5h`: `remainingFraction: 0.44` (44% frei -> 56% genutzt), `resetTime: "2026-10-04T11:41:39Z"`, Beschreibung: "You have used some of your 5-hour limit, it will fully refresh in 2 hours, 24 minutes."
       - `weekly`: `remainingFraction: 0.45` (45% frei -> 55% genutzt), `resetTime: "2026-10-09T17:34:55Z"`, Beschreibung: "You have used some of your weekly limit, it will fully refresh in 5 days, 8 hours."
     - `Claude and GPT models` (3p-Modelle):
       - `5h`: `remainingFraction: 1` (0% genutzt), `resetTime: ...`
       - `weekly`: `remainingFraction: 1` (0% genutzt), `resetTime: ...`

3. **Dynamische Port- und Token-Erkennung**:
   - Abfrage der aktiven `agy.exe`-Kommandozeile via PowerShell `Get-CimInstance Win32_Process -Filter "Name = 'agy.exe'"` (~800 ms einmalig, danach gecacht mit Re-Check-Intervall oder Fallback bei Verbindungsfehlern).
   - Sauberes Fallback auf die bisherige SQLite/Transkript-Tokenzählung (`tokens5h`, `tokens7d`), falls kein Antigravity-Hub aktiv ist.

## Hintergrund & Zielstellung

Bislang zeigte das Session Dashboard für Claude Code exakte Prozentwerte, Warnstufen (`Normal`, `Erhöht`, `Fast voll`), Fortschrittsbalken und Reset-Uhrzeiten an. Für Google Antigravity hingegen wurden lediglich aggregierte Tokenzahlen (`5h-Verbrauch: ~80.7M`) ohne Limit-Kontext angezeigt, da bisher angenommen wurde, dass Google keine API für Quota bereitstellt.
Der Benutzer wies darauf hin, dass die Antigravity-Erweiterung selbst die Quota und Limits anzeigt.
Ziel ist es, den Antigravity-Hub direkt abzufragen und die Quota-Anzeige im Dashboard und der Statusleiste auf dasselbe Qualitätsniveau wie Claude Code zu heben:
- 5h-Limit & 7d-Woche mit echten Prozenten und Fortschrittsbalken
- Exakte Reset-Uhrzeiten und relative Restzeiten
- Status-Pill (`Normal` / `Erhöht` / `Fast voll` / `Limit (429)`)
- Beibehaltung der aggregierten Tokenzahlen (`tokens5h`, `tokens7d`) im Tooltip als historische Gesamtstatistik

## Vorgeschlagene Änderungen

### [Quota-Modul]

#### [MODIFY] [lib/quota.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/quota.js)
- `detectAgyHub()`: Ermittelt Port und CSRF-Token des laufenden `agy.exe`-Prozesses mit Caching.
- `fetchLiveAntigravityQuota()`: Ruft `POST /exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary` mit 3s-Timeout ab und extrahiert `Gemini`- und `Claude/GPT`-Buckets (5h & Weekly) inklusive `remainingFraction`, `percent` genutzt, `resetsAt`, `resetLabel` und `description`.
- `fetchAntigravityQuota()`: Kombiniert die Live-Quota mit den SQLite/Transkript-Tokenmetriken (`tokens5h`, `tokens7d`).

### [UI-Erweiterungen]

#### [MODIFY] [lib/boardPanel.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/boardPanel.js)
- `updateQuotaUI`:
  - Erkennt `hasLiveQuota` für Antigravity.
  - Rendert für Gemini-Modelle Fortschrittsbalken mit Auslastungsstufe (`low`, `medium`, `high`), Prozentanzeige (`XX%`), Reset-Subtext (`Reset HH:MM`) und Tooltip mit Restzeit und aggregiertem Tokenvolumen.
  - Dynamischer Status-Pill: `Normal` / `Erhöht` / `Fast voll` basierend auf dem maximalen Auslastungsgrad (bzw. `Limit (429)` bei Rate-Limit).
  - Graceful Fallback auf reine Tokenzahlen, falls kein Hub läuft.

#### [MODIFY] [lib/statusBar.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/statusBar.js)
- Ergänzung des Tooltips:
  - Bei Live-Quota: `⚡ Gemini 5-Std.-Limit: XX% (Reset HH:MM)` und `📅 Gemini 7-Tage-Limit: YY% (Reset Tag HH:MM)` sowie `*(Rolling Tokens: ~XX in 5h · ~YY in 7d)*`.
  - Fallback auf bisherige Tokenanzeige, falls Hub offline.

#### [MODIFY] [package.json](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/package.json)
- Versionssprung von `0.15.0` auf `0.16.0`.

## Verifikationsplan

### Automatisierte Tests & Syntax-Check
```powershell
npm run check
```

### Manuelle Prüfung
1. **Live-Abruf testen**:
   - `node scratch/test_quota_proto.js` ausführen und korrekte Werte prüfen.
2. **Extension bauen & installieren**:
   - `npx @vscode/vsce package`
   - `code --install-extension session-dashboard-0.16.0.vsix --force`
3. **Dashboard & Statusleiste prüfen**:
   - Dashboard öffnen: Im Antigravity-Kärtchen müssen jetzt Fortschrittsbalken für 5h und 7d mit Prozenten und Reset-Zeiten zu sehen sein.
   - Statusleiste hovern: Tooltip zeigt Live-Limits und Rolling-Tokens sauber formatiert.
