# Plan: Cline Provider-Integration (v0.57.0)

## Kontext & Ziel
Nach Claude Code, Google Antigravity, GitHub Copilot und OpenAI Codex soll **Cline** als 5. KI-Provider vollständig in die VS-Code-Extension „AI Sessions" integriert werden.
Dadurch werden lokale KI-Sessions (z. B. Ollama mit Gemma 4) sowie alle weiteren in Cline genutzten Modelle direkt auf dem Kanban-Board, in der Statusleiste, im Transkript-Viewer, in der Historie und im Analyse-Tab sichtbar.

Cline speichert seine Daten lokal unter `~/.cline/data/`:
- **SQLite-Datenbank:** `~/.cline/data/db/sessions.db` (Tabelle `sessions`)
- **Transkripte & Turns:** `~/.cline/data/sessions/<sessionId>/<sessionId>.messages.json`
- **Metadaten:** `~/.cline/data/sessions/<sessionId>/<sessionId>.json`

## Architektur & Komponenten

### 1. Provider-Modul `lib/providers/cline.js`
- **Pfade & DB-Zugriff:**
  - `clineDir()`: `process.env.CLINE_DIR || path.join(os.homedir(), '.cline')`
  - `dataDir()`: `process.env.CLINE_DATA_DIR || path.join(clineDir(), 'data')`
  - `dbPath()`: `path.join(dataDir(), 'db', 'sessions.db')`
  - `sessionsDir()`: `path.join(dataDir(), 'sessions')`
  - Verbindung via `node:sqlite` (`DatabaseSync`, read-only) mit automatischer Re-Open-Prüfung bei geänderter `mtime` von DB/WAL/SHM.
- **Session-Abfrage:**
  - SQL: `SELECT session_id, source, pid, started_at, ended_at, exit_code, status, provider, model, cwd, workspace_root, prompt, metadata_json, messages_path, updated_at FROM sessions ORDER BY updated_at DESC`
- **Zustands- & Aktivitätserkennung:**
  - `running`: Zustand `busy` (Arbeitet), Tool-Name / Thinking aus dem letzten Block in `messages.json` als Aktivität (z. B. „🔍 Sucht im Code…“, „🛠️ Führt Befehl aus…“, „📖 Liest Datei…“).
  - Letzter Assistant-Turn hat unaufgelöstes `tool_use` (wartet auf Bestätigung) oder offene Rückfrage: Zustand `waiting` (Wartet auf dich, `waitingFor`: „Freigabe nötig“ bzw. „Rückfrage“).
  - `idle`: Zustand `idle` (Fertig / wartet auf Prompt).
  - Beendete Tasks (`ended_at` gesetzt, Status `completed` / `stopped` / etc.): Zustand `idle` (kann via `doneStore` als erledigt markiert werden).
  - Alterung/Timeout: Tasks, die älter als 30 Minuten ohne Aktivität im Status `running` verharren, fallen auf `idle` zurück.
- **Projekt-Zuordnung:**
  - Normalisierung von `cwd` / `workspace_root` und Übergabe an `resolveProject({ cwd, title, lastPrompt, detectionMode })`.
- **Token & Modell:**
  - Extraktion aus `metadata.usage` / `tokensIn` / `tokensOut` und Context-Window-Auflösung via `resolveMaxContext(model)`.
  - Kosten: `metadata.totalCost` (bei Ollama 0,00 $).

### 2. Registry `lib/registry.js`
- Einbindung von `cline` in `readSessions()`.
- Überwachung (`watchTargets`) von `sessions.db`, `sessions.db-wal` und dem Verzeichnis `~/.cline/data/sessions`.

### 3. Settings & Konfiguration `package.json`
- Neue Einstellungen:
  - `sessionDashboard.providers.cline` (Standard: `true`).
  - `sessionDashboard.sound.providers.cline` (Standard: `true`).
- `npm run check` um `node --check lib/providers/cline.js` erweitern.
- Versionserhöhung auf `0.57.0`.

### 4. UI & Dashboard `lib/boardPanel.js`
- Offizielles Cline-Roboter-Icon als SVG (`ICONS.cline`).
- Styling für Cline (`.provider-icon.cline`, Filter-Buttons, Badges, etc.) in passendem Cline-Cyan/Blau (`#007acc` / `#388bfd`).
- Filter-Buttons auf Kanban-Board, Analyse-Tab und Historie-Tabelle.
- Tooltip- und Kachel-Anzeige harmonisiert mit bestehenden Providern.

### 5. Navigation & Click-to-Focus `extension.js`
- Neue Funktion `openClineSession(info)`:
  - Öffnet/fokussiert die Cline-Sidebar via `vscode.commands.executeCommand('claude-dev.SidebarProvider.focus')`.
- Einbindung in `openSession()`, QuickPick, Filter-Menü und Toast-Benachrichtigungen.

### 6. Transkript-Viewer & Parser `lib/transcriptParser.js`
- Erkennung von Cline-Transkripten (`findClineTranscript(sessionId)` über `messages_path` bzw. `~/.cline/data/sessions/<id>/<id>.messages.json`).
- Parser `parseClineTranscript()`: Standardisiert Nachrichten in Turns (User-Prompt, Assistant-Text, Thinking-Blöcke, Tool-Calls mit Parametern, Tool-Ergebnisse, Token-Metriken).

### 7. Formate & Modelle `lib/format.js`
- `friendlyModel()` um `gemma4`, `gemma`, `ollama` erweitern.
- `resolveMaxContext()` um Gemma 4 (128k / 256k) erweitern.

### 8. Analytics & Historie `lib/analytics.js` & `lib/history.js`
- Einbindung von Cline-Turns in KPI-Cards, Token-Balken, Tool-Statistik und Historien-Tabelle.

## Verifikation & Abnahme
1. `npm run check` prüft Syntax aller Module fehlerfrei.
2. `npm run package` erstellt `vsix/ai-sessions-0.57.0.vsix`.
3. Installation via `code --install-extension vsix/ai-sessions-0.57.0.vsix`.
4. Überprüfung im Dashboard:
   - Vorhandene Gemma4/Ollama-Session wird sofort mit Projekt, Modell, Tokens und Status angezeigt.
   - Filter auf „Cline" schränkt Kacheln und Historie korrekt ein.
   - Klick auf Session fokussiert die Cline-Sidebar.
   - Transkript-Viewer öffnet den vollständigen Dialogverlauf inkl. Tool-Aufrufen.

