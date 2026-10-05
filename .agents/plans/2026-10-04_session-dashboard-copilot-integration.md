# Implementierungsplan: GitHub Copilot Integration im Session-Dashboard

**Datum:** 2026-10-04  
**Status:** In Vorbereitung  
**Ziel:** Das VS-Code-Plugin `session-dashboard` um GitHub Copilot (Chat & Agent Mode / Edits) erweitern, unter vollständiger Berücksichtigung der Neuerungen aus Stufe 1–4 (Analytics Dashboard, 7-/30-Tage Historie, Tool-Breakdown, Read-Only Transcript Viewer und Statusleiste).

---

## 1. Berücksichtigte Neuerungen aus den letzten Updates

Seit der ursprünglichen 2-Provider-Architektur (Claude Code & Antigravity) wurden fundamentale Erweiterungen umgesetzt, die ein neuer Provider vollständig unterstützen muss:

1. **Stufe 1 & 2 (Analytics Dashboard & 7-/30-Tage Historie — v0.23 & v0.24):**
   - Copilot-Sessions müssen in `lib/analytics.js` (`scanTurnData`) erfasst werden.
   - Aggregation für KPIs (Tokens, geschätzte Kosten, Turn-Anzahl, Session-Dauer).
   - Einbindung in das tägliche Timeline-Balkendiagramm (Heute, 7 Tage, 30 Tage) und die Projekt-Tabelle.
   - Pricing-Matrix: Berücksichtigung von Copilot-Modellen (z. B. `gpt-4o`, `claude-3-5-sonnet`, `o1`, `copilot-auto`).

2. **Stufe 3 (Tool- & Content-Breakdown — v0.25):**
   - Erfassen der von Copilot ausgeführten Tools (`read_file`, `edit_file`, Terminal/Commands, Search, MCP-Tools).
   - Zuordnung in die Kategorien: Read, Edit, Bash/Terminal, Search, Web, Tasks.

3. **Stufe 4 (Read-Only Transcript Viewer & Session-Detailansicht — v0.26):**
   - Klick auf `[ 👁️ Details ]` auf Karten oder im TreeView muss auch für Copilot-Sessions ein vollständiges Protokoll liefern.
   - Parser in `lib/transcriptParser.js` für Copilot-Transkripte (Turns, Prompts, Antworten, Tools, Zeitstempel, Collapsible Turns).

4. **Multi-Provider Filter & Statusleiste:**
   - Provider-Filter (`Alle | Claude Code | Antigravity | GitHub Copilot`) in Board, Sidebar und QuickPick.
   - Statusleisten-Unterstützung und Icons (`$(copilot)` / GitHub Copilot Badge).

---

## 2. Technische Grundlage (verifiziert)

Die Daten von GitHub Copilot liegen lokal in VS Code an zwei Stellen:

### A. Globale SQLite-Datenbank (`session-store.db`)
- **Pfad:** `%APPDATA%\Code\User\globalStorage\github.copilot-chat\session-store.db` (macOS: `~/Library/Application Support/Code/...`, Linux: `~/.config/Code/...`)
- **Tabellen:**
  - `sessions`: `id`, `cwd`, `repository`, `branch`, `summary`, `agent_name`, `created_at`, `updated_at`.
  - `turns`: `id`, `session_id`, `turn_index`, `user_message`, `assistant_response`, `timestamp`.
  - `session_files`: `session_id`, `file_path`, `tool_name`, `turn_index`, `first_seen_at`.
  - `search_index`: FTS5-Volltextsuche.
- **Vorteil:** Schnelles Auslesen via `node:sqlite` (ohne externe Dependencies, analog zu Antigravity).

### B. Workspace-spezifische Chat-Logs (`chatSessions/*.jsonl`)
- **Pfad:** `%APPDATA%\Code\User\workspaceStorage/<workspace-hash>/chatSessions/<sessionId>.jsonl`
- Enthält strukturierte Requests, Tool-Calls (`toolInvocationSerialized`), `modelState` (`completedAt`, `elapsedMs`), `selectedModel` und Metadaten.
- Ermöglicht detailliertes Parsen für den Read-Only Transcript Viewer (Stufe 4).

---

## 3. Architektur & Geplante Änderungen

### 1. `lib/providers/copilot.js` (Neu)
- Liest `session-store.db` und scannt relevante Workspace-Chat-Sessions.
- Standardisiert Copilot-Sessions:
  - `provider: 'copilot'`
  - `sessionId`: Copilot UUID
  - `title`: `summary` oder `customTitle`
  - `state`: `busy` (falls Request aktiv), `waiting` (falls Bestätigung aussteht), `idle` (fertig)
  - `cwd`, `project`: Zuordnung via `resolveProject`
  - `lastPrompt`: Text des letzten Turns
  - `statusUpdatedAt`, `startedAt`
- Exportiert Hilfsfunktionen: `copilotDir()`, `dbPath()`, `readSessions()`.

### 2. `lib/registry.js`
- Einbindung von `copilot.readSessions()` in `readSessions()`.
- Hinzufügen von `copilot.dbPath()` zu `watchTargets()`.

### 3. `lib/analytics.js` (Stufe 1–3 Integration)
- In `scanTurnData()`: Auslesen von Copilot-Turns der letzten 30 Tage aus `session-store.db` bzw. `chatSessions/*.jsonl`.
- Zuordnung von Tools (`session_files` / Tool-Invocations) zu den Kategorien:
  - `read_file` -> Category `read`
  - `edit_file` / `replace_string` -> Category `edit`
  - Terminal-Aufrufe -> Category `bash`
- Integration in Timeline, Projekt-Statistiken und KPIs.

### 4. `lib/transcriptParser.js` (Stufe 4 Integration)
- Funktion `parseCopilotTranscript(sessionId)`:
  - Holt Turns chronologisch aus der SQLite-Datenbank oder der JSONL-Datei.
  - Formatiert Prompts, Assistant-Antworten und ausgeführte Tools.
- Ermöglicht nahtlose Nutzung des Read-Only Webview Viewers (`TranscriptViewerPanel`).

### 5. `lib/boardPanel.js` & `lib/treeView.js` & `extension.js`
- Erweiterung des Provider-Filters: `['all', 'claude', 'antigravity', 'copilot']`.
- Icon & Badge: `copilot` mit VS Code Codicon `$(copilot)` und Tooltip.
- `openSession(info)`: Ausführen des Befehls `workbench.action.chat.open` bzw. Copilot Chat Focus für Copilot-Sessions.

### 6. `lib/statusBar.js`
- Berücksichtigung von Copilot-Sessions bei Zählern für aktive und wartende Sessions.

---

## 4. Test- & Verifikationsplan
1. Syntax- und Build-Prüfung (`npm run check`).
2. Auslesen realer Copilot-Sessions aus `session-store.db` und Workspace-Storage.
3. Test des Webview-Boards (Karten-Darstellung, Filter nach Copilot, Projekt-Badges).
4. Test des Read-Only Transcript Viewers (`[ 👁️ Details ]`) für eine Copilot-Session.
5. Test des Analytics-Dashboards (Einfluss auf KPIs, Timelines, Projekt-Tabelle).

