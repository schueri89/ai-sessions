# Plan: OpenAI Codex Provider-Integration & Settings (v0.38.0)

## Kontext & Ziel
Nach Claude Code, Google Antigravity und GitHub Copilot soll OpenAI Codex als 4. KI-Provider vollständig in die VS-Code-Extension „AI Sessions" integriert werden.
Codex speichert Threads und Sitzungen lokal unter `~/.codex/` in einer SQLite-Datenbank (`state_5.sqlite`) sowie transkribierten Rollout-Dateien (`~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`).

## Architektur & Komponenten

1. **Provider `lib/providers/codex.js`**:
   - Erkennt `~/.codex/state_*.sqlite` (dynamische Versionserkennung für zukünftige Updates).
   - Liest Tabelle `threads`: Session-ID (`id`), Rollout-Pfad (`rollout_path`), CWD (`cwd`), Titel (`title`), Tokens (`tokens_used`), Modell (`model`), Timestamps (`created_at_ms`, `updated_at_ms`).
   - Liest Rollout-JSONL-Dateien für Live-Zustand:
     - `task_complete` -> Zustand `idle` (Fertig).
     - Laufender Task (`task_started` ohne `task_complete`): Zustand `busy` (Arbeitet), Tool-Name als Aktivität.
     - Freigabe/Approval (`approval_request`, `apply_patch_approval_request`, `exec_approval_request`): Zustand `waiting` (Freigabe/Rückfrage).
     - Alterung: Älter als 30 Minuten ohne Aktivität fällt auf `idle` zurück.
   - Projekt-Zuordnung über `resolveProject()` mit normalisiertem Pfad (Entfernung des Windows-Präfix `\\?\`).
   - Token- & Context-Window-Auslastung (`gpt-6.1-sol`, `gpt-6-astra`, `gpt-5.6` etc.).

2. **Registry `lib/registry.js`**:
   - Einbindung von `codex` in `readSessions()`.
   - File-Watcher für `state_*.sqlite`, `state_*.sqlite-wal` und `~/.codex/sessions`.

3. **Settings & Konfiguration `package.json`**:
   - `sessionDashboard.providers.codex` (Standard: `true`).
   - `sessionDashboard.sound.providers.codex` (Standard: `true`).
   - Versionserhöhung auf `0.38.0`.
   - `npm run check` um `node --check lib/providers/codex.js` erweitern.

4. **UI & Navigation**:
   - `lib/boardPanel.js`:
     - Offizielles OpenAI-Logo (Blossom) als SVG.
     - Provider-Badge, Filter-Chips (Kanban, Analyse, Historie), CSS-Klassen.
   - `lib/treeView.js`:
     - Provider-Präfix `[Codex]` und Tooltips.
   - `extension.js`:
     - `openCodexSession()`: Fokussieren des Codex-Panels (`chatgpt.openSidebar`) und Navigation via URI (`vscode://openai.chatgpt/thread/${id}`).
     - Filter-QuickPick um Codex erweitern.
   - `lib/transcriptParser.js` & `lib/transcriptViewerPanel.js`:
     - Transkript-Viewer für Codex-Rollouts (User-Prompts, Tool-Calls, Agent-Nachrichten, Reasoning).
   - `lib/format.js`:
     - Context-Window-Mapping für GPT-6/GPT-5 Modelle und lesbare Modellnamen.
   - `lib/soundNotifier.js`:
     - Provider-Check für Codex-Sounds.

## Verifikation
1. `npm run check` (Syntax-Prüfung aller Module).
2. `npm run package` (Paketierung nach `vsix/`).
3. Lokale Installation via `code --install-extension vsix/ai-sessions-0.38.0.vsix`.
4. Prüfung, dass die vorhandene Codex-Session im Dashboard und im Tree-View mit Projekt, Tokens und Titel erscheint.
