# Implementierungsplan: Live-Aktivität auf Karten im Session-Dashboard

Datum: 2026-10-03
Task-Ziel: Auf den Session-Karten (insbesondere in „Arbeitet") in Echtzeit anzeigen, was der Agent gerade tut (letzter Tool-Call, Befehl oder Denkprozess).

## Hintergrund & Zielstellung

Wenn eine Session den Status „Arbeitet" hat, zeigt das Dashboard bislang lediglich eine Zeitspanne an (z. B. „Arbeitet seit 2 Min.").
Bei mehreren parallel laufenden Agenten (Claude Code und Google Antigravity) ist unklar, woran die einzelnen Sessions aktuell arbeiten, ohne jedes Mal in den Chat oder das Terminal wechseln zu müssen.
Mit einer Live-Aktivitätsanzeige sieht der Benutzer auf einen Blick:
- Welcher Befehl gerade läuft (z. B. `🛠️ npx playwright test...`, `🛠️ git diff`)
- Welche Datei gerade gelesen oder bearbeitet wird (z. B. `✏️ Bearbeitet TODO.md`, `📖 Liest boardPanel.js`)
- Ob der Agent gerade nachdenkt (`🧠 Denkt nach…`)
- Welche Suche oder welcher Skill aktiv ist (z. B. `⚡ Skill: todo-pflegen`, `🔍 Sucht transcripts.js`)

## Technische Grundlage (verifiziert)

1. **Claude Code Transkripte (`.jsonl`)**:
   - `rec.type === 'assistant'`: Enthält in `rec.message.content` Blöcke vom Typ `tool_use` (`Bash`, `Read`, `Edit`, `Write`, `Grep`, `Glob`, `Skill`) mit konkreten Parametern (`command`, `file_path`, `pattern`, `skill`), `thinking` (Gedankengang) oder `text`.
   - Bei neuem Prompt (`rec.type === 'last-prompt'`) startet die Bearbeitung.
2. **Google Antigravity Transkripte (`transcript.jsonl`)**:
   - `step.type === 'PLANNER_RESPONSE'`: Enthält in `step.tool_calls` die aktuellen Aktionen mit `toolAction` (menschenlesbare Kurzbeschreibung, z. B. `⚡ Reading project-context.md`), `toolSummary` oder Befehlsdaten (`run_command`, `view_file`, `replace_file_content`, `write_to_file`).
   - `step.thinking` signalisiert Denkphasen.
3. **Dashboard & Sidebar**:
   - Im BoardPanel Webview erhält die Karte in der Spalte „Arbeitet" ein dezentes Aktivitäts-Badge mit pulsierendem Indikator.
   - In der Sidebar (TreeView) zeigt die Beschreibung unter „Arbeitet" die Aktivität anstelle der bloßen Zeit.
   - Die Aktivität fließt in die Signatur des SessionModels ein, sodass Statuswechsel sofort neu gerendert werden.

## Vorgeschlagene Änderungen

### [Transkripte & Provider]

#### [MODIFY] [transcripts.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/transcripts.js)
- `emptyInfo()` um `activity: ''` erweitern.
- In `applyLine(info, line)`:
  - Bei `assistant`: Letzten `tool_use`- oder `thinking`-Block extrahieren und lesbar formatieren (`🛠️ Befehl`, `✏️ Bearbeitet datei`, `📖 Liest datei`, `🧠 Denkt nach…`).
  - Bei `last-prompt`: Auf `⏳ Startet…` setzen.
- In `readTranscriptInfo`: `activity: info.activity || ''` zurückgeben.

#### [MODIFY] [claude.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/providers/claude.js)
- In `readLiveSessions`: `activity: s.state === 'busy' ? (info.activity || 'Arbeitet…') : ''` übergeben.

#### [MODIFY] [antigravity.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/providers/antigravity.js)
- In `readTranscriptTail`: Letzten Tool-Call / Denkprozess aus `PLANNER_RESPONSE` auslesen und formatieren.
- In `readSessions`: `activity: state === 'busy' ? (info.activity || 'Arbeitet…') : ''` an die Session anhängen.

### [Model & UI]

#### [MODIFY] [extension.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/extension.js)
- `s.activity` in `refresh()` berechnen und in die State-Signatur aufnehmen (ermöglicht sofortige UI-Aktualisierung bei Tool-Wechsel).
- `s.activity` im QuickPick anzeigen.

#### [MODIFY] [boardPanel.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/boardPanel.js)
- `activity: s.activity || ''` in das Webview-Spaltenpayload übergeben.
- CSS: `.activity` und `.activity-pulse` animieren.
- HTML/Card-Rendering: Badge anzeigen, wenn `s.activity` vorhanden ist.
- Such-Matching: `s.activity` in `matchesSession` einbinden.

#### [MODIFY] [treeView.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/treeView.js)
- Bei `displayState === 'busy'` die Aktivität in `item.description` und im Tooltip anzeigen.

### [Version & Dokumentation]

#### [MODIFY] [package.json](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/package.json)
- Versions-Bump auf `0.9.0`.

#### [MODIFY] [TODO.md](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/TODO.md)
- Aufgabe als erledigt markieren.

## Verifikationsplan

### Automatisierte Prüfung
```powershell
npm run check
```

### Manuelle Prüfung
- Eine laufende Session beobachten (z. B. während eines Tests oder Datei-Edits).
- Prüfen:
  - Karte im Dashboard zeigt z. B. `🛠️ npx playwright test` oder `✏️ Bearbeitet ...` mit blauem Pulsieren.
  - Sidebar TreeView zeigt unter „Arbeitet" die Aktivität an.
  - Tooltip enthält die aktuelle Aktivität.
