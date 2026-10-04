# Plan: session-dashboard — Analyse & Verbrauchsübersicht (Stufe 3: Tool- & Content-Breakdown)

## Status: Implementiert & Verifiziert (v0.25.0)

## Kontext & Ziel
In Stufe 2 wurde die Zeitbereichs-Umschaltung (`[ Heute ]`, `[ 7 Tage ]`, `[ 30 Tage ]`) implementiert.
In Stufe 3 wird die inhaltliche und funktionale Analyse des Agenten-Verbrauchs vertieft:
- **Wohin fließen die Tokens und was macht der Agent während einer Session?**
- Aufschlüsselung aller Tool-Aufrufe von **Claude Code** und **Antigravity** nach funktionalen Kategorien.
- Detaillierte Zusammensetzung der verbrauchten Tokens (Input, Output/Thinking, Cache Read, Cache Write).
- Reorganisation des Dashboards gemäß UI-Konzept:
  - **Reihe 3**: Nebeneinanderliegende 2-Spalten-Karten für **Modelle & Provider** (links) und **Tool- & Content-Verteilung** (rechts).
  - **Reihe 4**: **Projekt-Verbrauch** als eigenständige **Full-Width Card** darunter, um horizontales Quetschen der Tabellenspalten zu verhindern.
- Dynamische Anpassung aller Werte bei Umschaltung der Scopes (`Heute`, `7 Tage`, `30 Tage`) und Provider-Filter (`Alle`, `Claude Code`, `Antigravity`).

---

## Tool-Kategorisierung
Tools beider Provider werden in 6 logische Kategorien unterteilt:

1. 📖 **Dateien lesen (Read)**:
   - Claude: `Read`, `view_file`
   - Antigravity: `view_file`, `read_file`
   - Farbe: `#06b6d4` (Cyan)

2. ✏️ **Code schreiben & anpassen (Edit)**:
   - Claude: `Edit`, `Write`
   - Antigravity: `replace_file_content`, `write_to_file`
   - Farbe: `#f59e0b` (Amber)

3. 🛠️ **Terminal & Shell-Befehle (Bash)**:
   - Claude: `Bash`
   - Antigravity: `run_command`, `manage_task`, `powershell`
   - Farbe: `#10b981` (Smaragdgrün)

4. 🔍 **Suche & Verzeichnis-Scans**:
   - Claude: `Grep`, `Glob`, `file_search`, `grep_search`
   - Antigravity: `list_dir`, `file_search`, `grep_search`
   - Farbe: `#3b82f6` (Blau)

5. 🌐 **Browser & Web-Tools**:
   - Claude: `read_url_content`, `search_web`, `mcp__Claude_Browser__*`
   - Antigravity: Web- und Browser-MCPs
   - Farbe: `#a855f7` (Lila)

6. ⚙️ **Tasks & Orchestrierung**:
   - Claude & Antigravity: `schedule`, `ask_question`, `invoke_subagent`, `send_message`, `Skill`
   - Farbe: `#64748b` (Schiefergrau)

---

## Token-Zusammensetzung & Thinking
- **Segmentierter Farbbalken**:
  - `Input`: Blau (`--vscode-charts-blue`, `#70a9ff`)
  - `Cache Read`: Grün (`#10b981`)
  - `Cache Write`: Violett (`#8b5cf6`)
  - `Output / Thinking`: Orange (`#f26522`)
- **Thinking-Turns**: Erkennung von erweiterten Denkphasen (`thinking: true` in Transkripten) mit Hervorhebung (`⚡ X Turns mit Thinking`).
- **Legend & Prozentanteile**: Präzise Angabe der prozentualen Verteilung und der absoluten Tokenzahlen.

---

## Architektur & Änderungen

1. **`lib/analytics.js`**:
   - Definition von `TOOL_CATEGORIES` und Hilfsfunktion `categorizeTool(toolName)`.
   - Erweiterung von `collectRawTurns()`:
     - Extrahiert `toolCalls` aus Transkripten (`tool_use` bei Claude, `tool_calls` bei Antigravity).
     - Extrahiert `hasThinking` (`content.type === 'thinking'` bzw. `rec.thinking`).
     - Auto-Invalidierung des Caches (`cached.turns[0].tools === undefined`), um vorhandene Cache-Einträge nahtlos auf die neue Struktur zu migrieren.
   - Erweiterung von `aggregateScope()`:
     - Aggregiert `tools`: `totalCalls`, `categories` (mit Prozent und Farben) und `topTools`.
     - Aggregates `content`: `inputTokens`, `outputTokens`, `cacheReadTokens`, `cacheWriteTokens`, `totalTokens`, `thinkingTurns` und Anteile in %.

2. **`lib/boardPanel.js`**:
   - **CSS**:
     - `.full-card`: Volle Kartenbreite für die Projekt-Tabelle.
     - `.tool-content-wrap`, `.tool-list`, `.tool-row`, `.tool-meta`, `.tool-bar-track`, `.tool-bar-fill`.
     - `.token-comp-wrap`, `.token-comp-track`, `.token-comp-seg`, `.token-comp-legend`, `.token-comp-dot`.
   - **HTML**:
     - Reihe 3 (`.details-grid`): Linke Karte für `Modelle & Provider`, rechte Karte für `Tool- & Content-Verteilung`.
     - Reihe 4 (`.full-card`): `Projekt-Verbrauch` über die gesamte Breite mit Sticky Header.
   - **Client-Script**:
     - Funktion `renderToolsAndContent(tools, content, scope)` zum Rendern der Tool-Balken, des segmentierten Token-Balkens und der Legende.
     - Dynamische Anpassung von `#proj-card-title` und `#tools-count-label` an Scope und Zähler.

3. **Verifikation & Test**:
   - `verify-css.js`: Klammer-Balancierung aller CSS-Regeln im Webview.
   - `verify-webview.js`: Syntax-Validierung des eingebetteten JavaScripts via Node `vm.Script`.
   - `npm run check`: Vollständiger Node-Syntaxcheck aller Extension-Module.
   - `vsce package`: Bau von `session-dashboard-0.25.0.vsix`.
   - `code --install-extension`: Lokale Installation und Bereitstellung.
