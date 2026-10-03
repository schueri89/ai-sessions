# Implementierungsplan: Echte Transkript-Zeitstempel für Claude Code

Datum: 2026-10-03
Task-Ziel: Das Datum von Claude-Code-Sessions unveränderlich aus den Transkript-Zeilen auslesen (`startedAt` und `lastActivity`), statt vom Windows-Dateisystem (`mtime`) oder der Prozess-Startzeit (`pid.startedAt`).

## Hintergrund & Zielstellung

Bislang wurde für Claude-Code-Sessions:
1. Bei geschlossenen Sessions `lastActivity = mtimeMs` (Dateisystem-Änderungsdatum der `.jsonl`-Datei) verwendet.
2. Bei laufenden Sessions `startedAt = raw.startedAt` aus der PID-Datei verwendet.

Sobald der Benutzer eine alte Session im VS-Code-Editor öffnete:
- Spawnt Claude Code einen Bridge-Prozess mit `startedAt = jetzt`.
- Aktualisiert Claude Code die Transkriptdatei, wodurch Windows `mtimeMs` auf die aktuelle Sekunde setzt.
- In der Folge sprang die geöffnete alte Session im Dashboard an die oberste Stelle von „Erledigt" und zeigte im Tooltip das heutige Startdatum an.

## Lösung

Die Transkripte (`.jsonl`) enthalten für jede Zeile einen unveränderlichen Zeitstempel (`"timestamp": "2026-07-21T06:10:01.487Z"`):
- Die erste Zeile (Kopf des Transkripts) liefert das exakte Erstellungsdatum (`startedAt`).
- Die letzte `user`- oder `assistant`-Interaktion liefert den echten letzten Aktivitätszeitpunkt (`lastActivity`).
- Das Öffnen einer Session ohne neue Nachricht ändert weder `startedAt` noch `lastActivity`.
- Sessions behalten in der Sortierung und Anzeige dauerhaft ihr historisches Datum.

## Vorgeschlagene Änderungen

### [Transkript-Parser & History]

#### [MODIFY] [transcripts.js](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/lib/transcripts.js)
- `emptyInfo()` um `startedAt: 0` und `lastActivity: 0` erweitern.
- In `applyLine`:
  - `startedAt` aus dem ersten Zeilen-Zeitstempel setzen.
  - `lastActivity` bei `user`-, `assistant`- und `last-prompt`-Nachrichten aktualisieren.
- In `readTranscriptInfo`: `startedAt` und `lastActivity` im Rückgabe-Objekt zurückgeben.

#### [MODIFY] [history.js](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/lib/history.js)
- In `readEntry`:
  - `startedAt: info.startedAt || mtimeMs`
  - `lastActivity: info.lastActivity || info.startedAt || mtimeMs`

#### [MODIFY] [claude.js](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/lib/providers/claude.js)
- Für Live-Sessions:
  - `startedAt: info.startedAt || s.startedAt` (echtes Erstellungsdatum statt PID-Start)
  - `statusUpdatedAt`: für `busy`/`waiting` weiterhin der Status-Zeitpunkt, für `idle`/`closed` die echte `info.lastActivity`
- Für geschlossene Sessions:
  - `startedAt: h.startedAt || 0`
  - `statusUpdatedAt: h.lastActivity`

### [Version & Dokumentation]

#### [MODIFY] [package.json](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/package.json)
- Bump auf `0.7.0`.

#### [MODIFY] [TODO.md](file:///c:/lucee/tomcat/webapps/ROOT/tools/TODO.md)
- Aufgabe als erledigt markieren.

## Verifikationsplan

### Automatisierte Prüfung
```powershell
npm run check
```

### Manuelle Prüfung
- Prüfen von Sessions aus Juli (z. B. `b151f677...`):
  - `startedAt` und `statusUpdatedAt` müssen auf Juli 2026 datiert sein.
- Testen, ob nach Öffnen einer Session das Datum stabil bleibt.
