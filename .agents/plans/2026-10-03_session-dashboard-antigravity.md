# Implementierungsplan: Antigravity-Sessions im Session-Dashboard
Datum: 2026-10-03
Task-Ziel: Das VSCode-Plugin session-dashboard so erweitern, dass neben Claude Code auch Sessions der Antigravity-Erweiterung angezeigt, überwacht und per Klick geöffnet werden können.

Das Dokument beschreibt die Erweiterung der VS-Code-Extension `session-dashboard` unter `tools/session-dashboard`,
um eine Multi-Provider-Architektur für Claude Code und Google Antigravity.

## Technische Grundlage (verifiziert)

Am 03.10.2026 an Antigravity 1.6.0 (`google.google-antigravity`) und VS Code 1.140 (Node.js 24) erhoben:

- **Datenquelle Antigravity:** `~/.gemini/antigravity/conversation_summaries.db` (SQLite 3).
- **Natives SQLite ohne Abhängigkeiten:** In VS Code 1.140 (Node.js v24.x) ist `node:sqlite` (`const { DatabaseSync } = require('node:sqlite');`) standardmäßig integriert. Es sind keine zusätzlichen npm-Pakete oder native C++-Builds nötig.
- **Relevante Tabellenspalten (`conversation_summaries`):**
  - `conversation_id`: Eindeutige UUID der Unterhaltung.
  - `title`: Klartext-Titel der Unterhaltung.
  - `preview`: Textvorschau der letzten Nachricht / des Prompts.
  - `status`: `CASCADE_RUN_STATUS_RUNNING`, `CASCADE_RUN_STATUS_IDLE`, etc.
  - `not_fully_idle`: `1` (Agent arbeitet), `0` (Agent fertig/idle).
  - `last_modified_time` & `last_user_input_time`: ISO-8601-Zeitstempel.
  - `workspace_uris`: JSON-Array der zugeordneten Workspace-URIs (z. B. `["file:///c%3A/lucee/tomcat/webapps/ROOT"]`).
- **Liveness & Aktive Sessions:**
  - Im Gegensatz zu Claude Code (wo `~/.claude/sessions/<pid>.json` mit dem Prozess verschwindet) bleiben Antigravity-Unterhaltungen dauerhaft in der DB gespeichert (120+ Einträge).
  - Für aktive Unterhaltungen hält Antigravity einen exklusiven OS-File-Lock auf `~/.gemini/antigravity/presence/<conversation_id>.lock`.
  - Filterkriterien für relevante Sessions im Dashboard: Aktives Lock ODER `not_fully_idle === 1` ODER Aktivität im aktuellen Workspace innerhalb der letzten 24 Stunden.
- **Zustandsabbildung:**
  - `busy` (Arbeitet): `status === 'CASCADE_RUN_STATUS_RUNNING' || not_fully_idle === 1`.
  - `waiting` (Wartet auf dich): Wenn der letzte Schritt im Transkript (`brain/<id>/.system_generated/logs/transcript.jsonl`) ein `ask_question`-Toolcall bzw. eine offene Bestätigung ist, oder im VS Code-Fenster der Kontext `antigravity.stepPending` gesetzt ist.
  - `idle` (Fertig): `status === 'CASCADE_RUN_STATUS_IDLE' && not_fully_idle === 0`.
  - `done` (Erledigt): Über den bestehenden `DoneStore` im `globalState` der Extension.
- **Chat per Klick öffnen:**
  - Die Antigravity-Erweiterung registriert den internen Befehl `antigravity.openConversation` (in `google.google-antigravity@1.6.0`, `extension.js`, Zeile 10466427 und 10479957):
    `vscode.commands.executeCommand('antigravity.openConversation', conversationId)`
    Dieser Befehl fokussiert das Chat-Panel und navigiert zu `/c/${conversationId}`.

## Hintergrund & Zielstellung

Entwickler nutzen im Projektalltag parallel Claude Code und Google Antigravity. Das bisherige `session-dashboard`
zeigt ausschließlich Claude-Code-Sessions. Ziel ist es, das Dashboard provider-agnostisch aufzubauen, sodass
Sessions beider KI-Assistenten in einer gemeinsamen Übersicht erscheinen, nach Zustand gruppiert sind und
per Klick direkt in der jeweiligen Oberfläche geöffnet werden können.

## Vorgeschlagene Änderungen

### [Extension: Provider-Architektur & Antigravity-Integration]

#### [ADD] [lib/providers/antigravity.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/providers/antigravity.js)
- Liest `~/.gemini/antigravity/conversation_summaries.db` schreibgeschützt via `node:sqlite` ein.
- Prüft `presence/<id>.lock` und filtert auf relevante Sessions (aktiv gelockt, `not_fully_idle === 1`, oder im aktuellen Workspace in den letzten 24h aktiv).
- Mappt Antigravity-Zustände auf `waiting`, `busy`, `idle`.
- Liest bei Bedarf den letzten Prompt aus dem Transkript `brain/<id>/.system_generated/logs/transcript.jsonl`.
- Liefert standardisierte Session-Objekte: `{ provider: 'antigravity', sessionId, title, lastPrompt, state, statusUpdatedAt, cwd, workspaceUris }`.

#### [ADD] [lib/providers/claude.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/providers/claude.js)
- Kapselt die bisherige Claude-Code-Logik aus `lib/registry.js` und `lib/transcripts.js`.
- Liefert standardisierte Session-Objekte mit `provider: 'claude'`.

#### [MODIFY] [lib/registry.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/registry.js)
- Fungiert als Aggregator: Ruft beide Provider (`claude.js` und `antigravity.js`) parallel ab und fasst die Sessions zusammen.
- Exportiert Pfade für Dateisystem-Watcher beider Quellen (`sessionsDir()` für Claude, `antigravityDbPath()` / `presenceDir()` für Antigravity).

#### [MODIFY] [extension.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/extension.js)
- `openSession(sessionOrId)`: Unterscheidet nach `provider`:
  - `claude`: `vscode.commands.executeCommand('claude-vscode.editor.open', id)`
  - `antigravity`: `vscode.commands.executeCommand('antigravity.openConversation', id)`
- Beobachtet Dateisystemänderungen beider Ordner (`~/.claude/sessions` und `~/.gemini/antigravity`).
- Polling-Zyklus (5s) aktualisiert beide Quellen.

#### [MODIFY] [lib/treeView.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/treeView.js)
- Session-Items erhalten ein Provider-Label/Icon (z. B. `[AG]` / `[Claude]` oder ein entsprechendes Theme-Icon/Tooltip), um auf einen Blick die Herkunft zu erkennen.
- Click-Befehl übergibt das Session-Objekt mit Provider-Info an `sessionDashboard.open`.

#### [MODIFY] [lib/boardPanel.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/boardPanel.js)
- Webview-Karten erhalten ein Provider-Tag (z. B. Antigravity / Claude Code).
- Klick-Event meldet `provider` mit an die Extension.

#### [MODIFY] [package.json](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/package.json)
- Display-Titel und Beschreibungen generalisieren: „AI Session Dashboard" (bzw. „Claude & Antigravity Sessions").
- Script `check` um die neuen Dateien erweitern.
- Version auf `0.2.0` hochzählen.

#### [MODIFY] [README.md](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/README.md)
- Dokumentation um die Antigravity-Quelle, Erkennung und den Öffnen-Befehl ergänzen.

## Verifikationsplan

### Automatisierte Tests & Syntaxprüfung
```powershell
# Syntax aller Dateien prüfen
cd tools/session-dashboard
npm run check

# Verifikation der Datenabfrage beider Provider über ein kurzes Node-Skript
node -e "
const { readSessions } = require('./lib/registry');
readSessions().then(s => console.log('Gefundene Sessions:', s.map(x => ({ provider: x.provider, title: x.title, state: x.state }))));
"

# VSIX paketieren
npm run package
```

### Manuelle Prüfung
1. Installation des neuen VSIX (`code --install-extension session-dashboard-0.2.0.vsix`) und Fenster neu laden.
2. In der Seitenleiste prüfen:
   - Antigravity-Sessions (aktuelle Unterhaltung) werden angezeigt mit korrektem Titel und Zustand.
   - Claude-Code-Sessions werden weiterhin angezeigt.
3. Klick auf eine Antigravity-Session:
   - Antigravity-Chatfenster wird fokussiert und die Unterhaltung geöffnet.
4. Klick auf eine Claude-Session:
   - Claude-Chat-Editor wird wie bisher geöffnet.
5. "Als erledigt markieren":
   - Funktioniert für Sessions beider Provider und blendet sie in den "Erledigt"-Bereich um.
6. Board-Ansicht (`sessionDashboard.showBoard`):
   - Kacheln zeigen Provider-Badge und öffnen bei Klick die richtige Session.

## Hinweise / Grenzen

- Antigravity legt Unterhaltungen zentral auf Maschinenebene ab. Durch den Workspace-Filter wird sichergestellt, dass nicht dutzende irrelevante Projekte die Liste fluten.
- Antigravity legt Unterhaltungen zentral auf Maschinenebene ab.
- Der Befehl `antigravity.openConversation` ist eine interne Schnittstelle der Google-Erweiterung, ähnlich wie `claude-vscode.editor.open` bei Anthropic.

## Erkenntnisse & Nachbesserungen während der Umsetzung (03.10.2026)

1. **Claude Code Live vs. Historisch:**
   - In `~/.claude/sessions/<pid>.json` existieren Dateien nur, solange der Claude-Prozess/Tab im VS Code aktiv läuft. Nach einem VS Code Reload oder beim Schließen von Tabs fehlen ältere Sessions.
   - Lösung: `lib/providers/claude.js` kombiniert die aktiven Sessions mit den historischen Transkripten (`~/.claude/projects/*/*.jsonl` via `scanHistory()`). Alle nicht aktiv laufenden Sessions werden mit dem Zustand `closed` („Geschlossen, nicht erledigt“) angezeigt.
   - Eine zirkuläre Abhängigkeit (`claudeDir` aus `providers/claude.js` in `history.js`) verhinderte zunächst den Aufruf von `scanHistory()` — wurde behoben.

2. **Antigravity Historie:**
   - Antigravity-Unterhaltungen älter als 24 Stunden wurden zuvor verworfen. Nun werden Sessions `<= 24h` als `idle` („Fertig“) und ältere Sessions als `closed` eingestuft.
   - Das Abfragelimit in `antigravity.js` wurde auf 250 erhöht (118 Sessions vorhanden).

3. **Status:**
   - Getestet: 248 Sessions werden in ~8ms (Cache) bzw. <400ms (Kaltstart) aggregiert (130 Claude, 118 Antigravity).
   - VSIX 0.2.0 gebaut und neu installiert.

