# Implementierungsplan & Walkthrough: Rate-Limit-Erkennung & Behandlung (Session Limit)

Datum: 2026-10-03
Task-Ziel: Claude-Code-Sessions mit „You've hit your session limit" präzise erkennen, während des Limits in „Arbeitet" (mit gelbem Warn-Badge) halten und nach Ablauf des Limits nach „Wartet auf dich" verschieben.

## Technische Grundlage (verifiziert)

In den Transkripten von Claude Code (`~/.claude/projects/*/<sessionId>.jsonl`) erzeugt Claude Code bei einem 429-Fehler einen strukturierten Assistant-Eintrag:
- `error: "rate_limit"`
- `apiErrorStatus: 429`
- `quotaLimits.resetsAt`: Unix-Timestamp in Sekunden (z. B. `1791045600` = 18:40:00 Uhr)
- `quotaLimits.rateLimitType`: z. B. `"five_hour"`
- `message.content[0].text`: `"You've hit your session limit · resets 6:40pm (Europe/Berlin)"`
- Der Prozess setzt seinen Status in `sessions/<pid>.json` auf `idle` und bricht den aktuellen Turn ab.
- Claude Code setzt die Ausführung nach Erreichen des Limits **nicht** automatisch fort; der Benutzer muss im Chat interagieren.

## Hintergrund & Zielstellung

Bislang wertete das Session-Dashboard `status: "idle"` schlicht als „Fertig“ (`pass` / grün). Dadurch entstand der falsche Eindruck, Claude habe die gestellte Aufgabe abgeschlossen, obwohl der Turn wegen des Kontingentlimits abgebrochen wurde.

Ziel ist eine zweiphasige Behandlung:
1. **Vor Reset (`jetzt < resetsAt`)**:
   - Die Session verbleibt in der Spalte **„Arbeitet“** (die Aufgabe ist noch in Arbeit).
   - Optische Kennzeichnung: Gelbes Warn-Icon (`clock`, `charts.yellow`), Badge `⏳ Limit bis HH:MM Uhr`.
2. **Nach Reset (`jetzt >= resetsAt`)**:
   - Die Session wechselt automatisch nach **„Wartet auf dich“** (Badge-Alarmierung an der Aktivitätsleiste).
   - Hinweis: `⚠️ Limit vorbei · Bereit zum Fortsetzen`.
3. **Auflösung**: Sobald ein neuer Turn erfolgreich ausgeführt wird (neue Assistant-Nachricht ohne `error`), wird der Rate-Limit-Zustand wieder gelöscht.

## Umgesetzte Änderungen

### [Transkript-Parser & History]

#### [MODIFY] [transcripts.js](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/lib/transcripts.js)
- `INTERESTING`-Filter um `"rate_limit"`, `"quotaLimits"` und `"type":"assistant"` erweitert.
- In `applyLine`:
  - Erkennt Assistant-Nachrichten mit `error === 'rate_limit'` oder `rec.quotaLimits?.status === 'rejected'` bzw. `apiErrorStatus === 429`.
  - Extrahiert `rateLimit: { resetsAt: ms, humanText: string }`.
  - Bei nachfolgender erfolgreicher Assistant-Nachricht (`rec.type === 'assistant' && !rec.error && !rec.isApiErrorMessage`) wird `rateLimit` auf `null` zurückgesetzt.
- In `readTranscriptInfo`: `rateLimit` im Rückgabe-Objekt ergänzt.

#### [MODIFY] [history.js](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/lib/history.js)
- In `readEntry`: `rateLimit: info.rateLimit || null` in den History-Cache übernommen, damit auch geschlossene oder historische Sessions den Rate-Limit-Status kennen.

#### [MODIFY] [claude.js](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/lib/providers/claude.js)
- `rateLimit` an Live- und Closed-Sessions durchgereicht.

#### [MODIFY] [antigravity.js](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/lib/providers/antigravity.js)
- `rateLimit: null` für einheitliche Session-Objektstruktur ergänzt.

### [Statuslogik & Modell]

#### [MODIFY] [extension.js](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/extension.js)
- In `model.refresh()`:
  - Bei vorhandenem `s.rateLimit`:
    - Falls `Date.now() < s.rateLimit.resetsAt`: `displayState = 'busy'` (Phase 1).
    - Falls `Date.now() >= s.rateLimit.resetsAt`: `displayState = 'waiting'` (Phase 2) und `waitingFor = 'Limit abgelaufen'`.
  - Berücksichtigung in der Update-Signatur (`s.rateLimit` + Zeit), damit Statuswechsel automatisch ohne manuellen Refresh feuern.

### [Formatierung & Darstellung]

#### [MODIFY] [format.js](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/lib/format.js)
- `formatTime(ts)` für Uhrzeitanzeige im Format `HH:MM Uhr` hinzugefügt.
- In `describe(s)`:
  - Rate-Limit-spezifische Beschreibung: `⏳ Limit bis HH:MM Uhr` bzw. `⚠️ Limit vorbei · Bereit zum Fortsetzen`.

#### [MODIFY] [treeView.js](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/lib/treeView.js)
- Rate-Limited Sessions in Phase 1 mit `clock`-Icon in `charts.yellow` statt Endlos-Spinner anzeigen.
- Tooltip um Rate-Limit-Details und genaue Reset-Uhrzeit ergänzen.

#### [MODIFY] [boardPanel.js](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/lib/boardPanel.js)
- Karte bei aktivem Limit mit Klasse `.rate-limited` (gelber Rahmen, gelbe Detail-Schrift) und Badge `⏳ Limit erreicht` bzw. `⚠️ Limit vorbei` kennzeichnen.
- CSS-Styling für `.rate-limit-badge` und `.card.rate-limited` ergänzt.

### [Version & Dokumentation]

#### [MODIFY] [package.json](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/package.json)
- Bump auf `0.5.0` und `lib/history.js` in `scripts.check` aufgenommen.

#### [MODIFY] [README.md](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/README.md)
- Dokumentation der Rate-Limit-Erkennung.

#### [MODIFY] [TODO.md](file:///c:/lucee/tomcat/webapps/ROOT/tools/TODO.md)
- Aufgabe als erledigt abgehakt.

## Verifikationsplan & Testergebnisse

### Automatisierte Prüfung
```powershell
npm run check
```
- Ergebnis: Alle 11 JS-Dateien fehlerfrei validiert (Exit Code 0).

### Manuelle Prüfung mit realen Session-Daten
- Getestet auf Live-Session `944a983e-ca9e-42b2-991b-06209db8e8f4` und History-Session `5e2d1cf2-fd32-456d-b678-50143c38ad5e`:
  - Beide Transkripte wurden korrekt erkannt mit `resetsAt: 1791045600000` (18:40:00 Uhr).
  - `describe(s)` gibt `⏳ Limit bis 18:40 Uhr` zurück.
  - VSIX 0.5.0 gebaut und in VS Code installiert.
