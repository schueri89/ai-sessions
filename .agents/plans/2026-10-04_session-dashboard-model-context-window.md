# Implementierungsplan: Dynamisches Kontextfenster pro Modell (1M für Opus 5.5 etc.)
Datum: 04.10.2026
Task-Ziel: Kontextfenster-Größe dynamisch anhand des Modells auflösen (1M Tokens für Claude Opus 5.5, Sonnet 5.5, Fable 5.1 etc. und Gemini, 200k für Haiku / ältere Modelle), statt starr 200k anzunehmen.

Dieses Dokument beschreibt die Konzeption und Umsetzung der dynamischen Modell-Kontextfenster-Auflösung im VS-Code-Dashboard `session-dashboard`.

## Technische Grundlage (verifiziert)

Die offiziellen Spezifikationen von Anthropic (`https://platform.claude.com/docs/en/build-with-claude/context-windows` und `https://platform.claude.com/docs/en/models/opus-5-5/overview`) dokumentieren folgende Kontextfenster-Größen:

1. **1.000.000 Tokens (1M) Kontextfenster**:
   - `Claude Opus 5.5` (`claude-opus-5-5`): 1.000.000 Tokens Kontext (128k Max Output)
   - `Claude Opus 5` (`claude-opus-5`): 1.000.000 Tokens Kontext
   - `Claude Opus 4.8` (`claude-opus-4-8`), `4.7`, `4.6`: 1.000.000 Tokens Kontext
   - `Claude Sonnet 5.5` (`claude-sonnet-5-5`), `Sonnet 5` (`claude-sonnet-5`), `Sonnet 4.6`: 1.000.000 Tokens Kontext
   - `Claude Fable 5.1` (`claude-fable-5-1`), `Fable 5`: 1.000.000 Tokens Kontext
   - `Claude Mythos 5.1`, `Mythos 5`, `Mythos Preview`: 1.000.000 Tokens Kontext
   - `Google Gemini` / `Antigravity` (`gemini-1.5-*`, `gemini-2.0-*`): 1.000.000 Tokens Kontext (Standard)

2. **200.000 Tokens (200k) Kontextfenster**:
   - `Claude Haiku 4.5` (`claude-haiku-4-5*`), `Haiku 3.5`, `Haiku 3`
   - `Claude Sonnet 4.5`, `Sonnet 4`, `Sonnet 3.7`, `Sonnet 3.5`
   - `Claude Opus 4.5`, `Opus 4.1`, `Opus 4`, `Opus 3`
   - Ältere Claude-Modelle

3. **Transkript-Analyse**:
   - In Claude-Code-Transkripten (`~/.claude/projects/*/*.jsonl`) meldet die Zeile `rec.type === 'assistant'` mit `rec.message.usage` das Modell verlässlich unter `rec.message.model` (z. B. `"claude-opus-5-5"`, `"claude-opus-5"`, `"claude-sonnet-5"`).
   - Bislang war in `lib/transcripts.js` Zeile 155 fix `const maxContext = 200000;` hinterlegt, wodurch bei Opus 5.5 mit 200k Tokens bereits 100% Auslastung angezeigt wurde, obwohl erst 20% des 1M-Fensters belegt waren.

## Hintergrund & Zielstellung

Auf den Session-Karten und in der Baumansicht wird die Kontextfenster-Auslastung (`Token-Balken`, `X / Y`, `%`) visualisiert. Da moderne Modelle wie Opus 5.5 über ein 1M-Token-Fenster verfügen, führten die fixen 200k zu irreführenden Warnfarben (rot/gelb) und falschen Prozentwerten bei noch reichlich freiem Kontext.
Ziel ist es, eine zentrale Hilfsfunktion `resolveMaxContext(model)` bereitzustellen, die anhand des Modellbezeichners das korrekte Limit zurückgibt.

## Vorgeschlagene Änderungen

### [Modell- & Kontextauflösung]

#### [MODIFY] [lib/format.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/format.js)
- Neue exportierte Funktion `resolveMaxContext(model)`:
  - Prüft auf `gemini`/`antigravity` (1M) bzw. `2m` (2M).
  - Erkennt alle 1M-Claude-Modelle: `opus-5*`, `opus-4.8`, `opus-4.7`, `opus-4.6`, `sonnet-5*`, `sonnet-4.6`, `fable*`, `mythos*`, `1m`.
  - Fallback für Haiku / Sonnet 3.x/4.x / ältere: 200.000.
- `friendlyModel(m)` erweitern:
  - Ergänzung von `Opus 5`, `Opus 4.8`, `Opus 4.7`, `Opus 4.6`, `Sonnet 5.5`, `Sonnet 5`, `Sonnet 4.6`, `Fable 5.1`, `Fable`, `Mythos`.

#### [MODIFY] [lib/transcripts.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/transcripts.js)
- Import von `resolveMaxContext` aus `./format`.
- `emptyInfo()` um `model: ''` erweitern.
- In `applyLine()`:
  - `info.model` erfassen, falls `rec.message.model` vorhanden ist.
  - Bei `rec.message.usage`:
    - `model = rec.message.model || info.model || ''`.
    - `maxContext = resolveMaxContext(model)`.
    - `percent = Math.min(100, Math.round((context / maxContext) * 100))`.

#### [MODIFY] [lib/providers/antigravity.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/providers/antigravity.js)
- Import von `resolveMaxContext` aus `../format`.
- In `readTranscriptTail()`: `maxContext = resolveMaxContext(step.model || 'Gemini')`.

#### [MODIFY] [lib/boardPanel.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/boardPanel.js)
- Client-seitige Hilfsfunktion `friendlyModel(m)` synchronisieren mit `format.js`.
- Im Karten-Rendering bei Bedarf Fallback für `maxContext` via `resolveMaxContext(t.model)` absichern.

### [Projekt & Dokumentation]

#### [MODIFY] [package.json](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/package.json)
- Versionssprung auf `0.14.0`.

#### [MODIFY] [TODO.md](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/TODO.md)
- Punkt `Context-Window pro Modell prüfen, ggf. korrigieren` abhaken und nach Erledigt verschieben.

## Verifikationsplan

### Automatisierte Tests
```powershell
npm run check
```
- Eigener Unit-Check mit Node.js gegen alle Testmodelle (Opus 5.5 -> 1M, Opus 5 -> 1M, Opus 4.8 -> 1M, Sonnet 5.5 -> 1M, Sonnet 5 -> 1M, Haiku 4.5 -> 200k, Sonnet 3.7 -> 200k, Gemini -> 1M).

### Manuelle Prüfung
1. **Extension bauen & installieren**:
   - `npx @vscode/vsce package`
   - `code --install-extension session-dashboard-0.14.0.vsix --force`
2. **Dashboard öffnen**:
   - Opus 5.5 Sessions prüfen: Token-Bar zeigt z. B. `150k / 1M (15%)` statt `150k / 200k (75%)`.
   - Tooltip prüfen: `Kontextfenster: X / 1M (Y% belegt) · Modell: Opus 5.5`.
   - Antigravity-Sessions prüfen: weiterhin `X / 1M (Y% belegt) · Modell: Gemini`.
