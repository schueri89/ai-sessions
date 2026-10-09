# Implementierungsplan & Walkthrough: Rate-Limit-Erkennung für Antigravity
Datum: 2026-10-09
Task-Ziel: Antigravity-Sessions, die wegen eines erschöpften Kontingents abgebrochen wurden, wie bei Claude Code bis zum Reset unter „Arbeitet" und danach unter „Wartet auf dich" führen.

Das Dokument beschreibt die Übertragung der Rate-Limit-Behandlung aus
`2026-10-03_session-dashboard-rate-limit-handling.md` auf Antigravity (v0.30.0).

## Technische Grundlage (verifiziert)

- Bricht ein Turn wegen des Kontingents ab, setzt Antigravity die Session in
  `conversation_summaries.db` auf `CASCADE_RUN_STATUS_IDLE`, `not_fully_idle = 0` — das Dashboard
  zeigte sie deshalb als „Fertig".
- Der Fehler steht als letzter Schritt in `~/.gemini/antigravity/conversations/<id>.db`, Tabelle
  `steps`, `step_type = 17` (im Transkript `ERROR_MESSAGE`), `step_payload` als Protobuf. Beleg
  Session `db8796c2` vom 06.10.2026, Schritt 157: `Your AI credits balance is too low to continue.`
  · `RESOURCE_EXHAUSTED (code 429)` · `reason: INSUFFICIENT_G1_CREDITS_BALANCE`.
- **`transcript.jsonl` ist dafür unzuverlässig:** Bei `db8796c2` endet es einen Schritt vorher
  (Schritt 156, Tool-Ergebnis). Ältere Abbrüche (`92a0c844`, 17.09.2026) standen noch dort, als
  Wiederholungsversuche `attempt 1…8` mit einem abschließenden „Agent execution terminated due to
  error" ohne Ursache.
- Der Fehler enthält **keine Reset-Zeit**. Die liefert `RetrieveUserQuotaSummary` des lokalen
  Language Servers: am 09.10.2026 Gemini-Bucket `weekly` mit `remainingFraction: 0`,
  `resetTime` 19:34 Uhr; der 5-Std.-Bucket stand bei `1` („does not currently apply").
- Das Transkript enthält kein Modellfeld; welcher Bucket (Gemini oder Claude/GPT) die Session
  gesperrt hat, ist daher nicht direkt ablesbar.
- Die Limit-Warnung der Statusleiste (`quota.js`, `isRateLimited`) sucht `RESOURCE_EXHAUSTED` nur
  im Transkript und nur 15 Minuten lang — den aktuellen Abbruch erkennt sie nicht. Eine Erweiterung
  um erschöpfte Live-Buckets war umgesetzt und wurde auf Wunsch des Benutzers zurückgebaut: Bei
  Claude Code zeigt die Statusleiste auch keinen solchen Limit-Status.

## Hintergrund & Zielstellung

Bei aufgebrauchtem Budget standen Antigravity-Sessions unter „Fertig", obwohl ihre Aufgabe mitten im
Turn abgebrochen war. Ziel ist dasselbe Verhalten wie bei Claude Code: bis zum Reset „Arbeitet" mit
`⏳ Limit bis HH:MM Uhr`, danach „Wartet auf dich" mit Sound.

## Umgesetzte Änderungen

### [Erkennung]

#### [MODIFY] [antigravity.js](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/lib/providers/antigravity.js)
- `readLimitError(sessionId)`: liest die letzten 12 Schritte der Konversations-DB; solange es
  Fehlerschritte (`step_type 17`) sind, wird nach `RESOURCE_EXHAUSTED` gesucht. Ergebnis je Session
  über die mtime von `.db` und `.db-wal` gecacht.
- Nur für Sessions im Zustand `idle`, die in den letzten 14 Tagen aktiv waren: Alle 135 DBs zu
  öffnen kostete beim Start ~1,2 s, so sind es ~70 ms. Ältere Abbrüche liegen ohnehin hinter dem
  längsten Fenster (7 Tage).
- Treffer setzt `rateLimit = { resetsAt: 0, humanText, blockedAt }`, `blockedAt` aus
  `last_modified_time`.

### [Reset-Zeit]

#### [MODIFY] [quota.js](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/lib/quota.js)
- `resolveAntigravityReset(sessionId, blockedAt, agQuota)`: nimmt aus allen Buckets (Gemini und
  Drittanbieter, 5 Std. und Woche) die erschöpften, deren Fenster `blockedAt` überdeckt
  (`blockedAt >= resetsAt - Fensterlänge`), und liefert den spätesten Reset. Überdeckt keiner, ist
  das Limit vorbei → `blockedAt` (Vergangenheit) → „Wartet auf dich". Ohne Live-Quota der zuletzt
  ermittelte Wert, sonst `0` („Session-Limit erreicht" ohne Uhrzeit).

#### [MODIFY] [extension.js](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/extension.js)
- In `refresh()` vor der Zustandsableitung `rateLimit.resetsAt` für Antigravity-Sessions über
  `resolveAntigravityReset` setzen; Anzeige, Badge, Tooltip und Sound laufen über die bestehende
  Claude-Logik.

### [Version & Doku]

#### [MODIFY] [package.json](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/package.json)
- Version `0.30.0`.

#### [MODIFY] [README.md](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/README.md)
- Rate-Limit-Erkennung um Antigravity ergänzt.

## Walkthrough & Testergebnisse

- `npm run check`: fehlerfrei.
- Gegen die echten Daten (09.10.2026): genau `db8796c2` erkannt, `humanText` „Antigravity-Kontingent
  und AI-Credits aufgebraucht (429)", `resetsAt` 09.10.2026 19:34, Zustand `busy`, Text
  `⏳ Limit bis 19:34 Uhr`.
- Ohne Live-Quota: zuletzt ermittelter Wert aus dem Cache, unbekannte Session `0`.
- Simulierter Reset (Bucket wieder frei): `resetsAt` = `blockedAt` in der Vergangenheit → `waiting`.
- Laufzeit `readSessions()`: vorher 119 ms, nachher 188 ms beim ersten Lauf, 115 ms mit Cache.

## Hinweise / Grenzen

- Die Zuordnung zum Bucket ist eine Heuristik (kein Modellfeld); sind Gemini und Drittanbieter
  zugleich erschöpft, gilt der spätere Reset.
- Antigravity setzt nach dem Reset nicht selbst fort — wie bei Claude Code muss im Chat
  weitergeschrieben werden; danach ist der Fehler nicht mehr der letzte Schritt und die Markierung
  verschwindet.
