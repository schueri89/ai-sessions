# Implementierungsplan: Context-Window- & Token-Auslastung auf den Session-Karten

Datum: 04.10.2026
Task-Ziel: Reale Kontextfenster- und Token-Auslastung aus Claude-Code- und Antigravity-Transkripten extrahieren und auf den Session-Karten sowie in der Sidebar visualisieren.

## Hintergrund & Zielstellung
Entwickler müssen jederzeit im Blick haben, wie stark das Arbeitsgedächtnis (Kontextfenster) einer KI-Session ausgelastet ist:
- **Kontext-Kompression vermeiden:** Sobald das Limit eines Modells zu 75–85% gefüllt ist, drohen Verdichtung, Informationsverlust oder das „Vergessen" früherer Anweisungen.
- **Modell-Transparenz:** Welches Modell rechnet in der Session (z. B. `Opus 5.5`, `Sonnet 3.5`, `Gemini`)?
- **Token-Aufschlüsselung:** Wie viele Tokens entfallen auf Cache-Read, Cache-Creation, neue Input-Tokens und generierten Output?

Sowohl Claude Code als auch Antigravity erfassen diese Metriken präzise in ihren lokalen Transkript-Dateien bei jedem Turn.

## Technische Grundlage (verifiziert)

### Claude Code (`~/.claude/projects/*/<sessionId>.jsonl`)
In `type: "assistant"`-Nachrichten:
```json
{
  "message": {
    "model": "claude-opus-5-5",
    "usage": {
      "input_tokens": 2,
      "cache_creation_input_tokens": 19266,
      "cache_read_input_tokens": 31280,
      "output_tokens": 380
    }
  }
}
```
- **Aktueller Turn-Kontext:** `input_tokens + cache_creation_input_tokens + cache_read_input_tokens` (z. B. 50.548 Tokens).
- **Max. Kontextfenster:** 200.000 Tokens (200k) für gängige Claude-Modelle (Sonnet, Opus).
- **Modellname:** `rec.message.model` (z. B. `claude-opus-5-5`).

### Antigravity (`~/.gemini/antigravity/brain/<sessionId>/.system_generated/logs/transcript.jsonl`)
In `type: "PLANNER_RESPONSE"`-Schritten:
```json
{
  "input_tokens": 2237,
  "cache_read_tokens": 68979,
  "output_tokens": 292
}
```
- **Aktueller Turn-Kontext:** `(input_tokens || 0) + (cache_read_tokens || 0)` (z. B. 71.216 Tokens).
- **Max. Kontextfenster:** 1.000.000 Tokens (1M) für Gemini 1.5 / 2.0.
- **Modell:** `Gemini`.

## Umgesetzte Änderungen

### [session-dashboard]

#### [MODIFY] [lib/format.js](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/lib/format.js)
- Neue Hilfsfunktion `formatTokens(n)`: Kompakte Formatierung von Tokenzahlen (`50.5k`, `200k`, `1M`).
- Neue Hilfsfunktion `friendlyModel(m)`: Bereinigt Modellnamen zu lesbaren Labels (`Opus 5.5`, `Sonnet 3.5`, `Gemini`).

#### [MODIFY] [lib/transcripts.js](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/lib/transcripts.js)
- Erweitert `INTERESTING` um `'"usage"'`.
- `emptyInfo()` initialisiert `tokens: null`.
- Liest in `applyLine()` bei `type === 'assistant'` `rec.message.usage` und `rec.message.model` aus.
- Berechnet `context`, `maxContext` (200k), `percent` und liefert `tokens` im Info-Objekt zurück.

#### [MODIFY] [lib/history.js](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/lib/history.js)
- Reicht `tokens: info.tokens || null` bei historischen Claude-Code-Sessions durch.

#### [MODIFY] [lib/providers/claude.js](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/lib/providers/claude.js)
- Hängt `tokens` an Live-Sessions und an geschlossene Sessions an.

#### [MODIFY] [lib/providers/antigravity.js](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/lib/providers/antigravity.js)
- Liest im `readTranscriptTail()` die Token-Metriken des letzten `PLANNER_RESPONSE` (`input_tokens`, `cache_read_tokens`, `output_tokens`).
- Berechnet Kontextgröße gegen das 1M-Gemini-Fenster.
- Bindet `tokens` an das Session-Objekt.

#### [MODIFY] [lib/boardPanel.js](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/lib/boardPanel.js)
- CSS für `.token-bar`, `.token-track`, `.token-fill` mit Farbstufen:
  - `< 65%`: Blau (`var(--vscode-charts-blue)`)
  - `65% – 85%`: Gelb (`var(--vscode-charts-yellow)`)
  - `> 85%`: Orange/Rot (`var(--vscode-charts-red)`) – visuelle Frühwarnung.
- Anzeige von Prozent, belegten/maximalen Tokens (`51k / 200k`) und Modell-Badge (`Opus 5.5`, `Gemini`).
- Reicher Tooltip beim Überfahren mit Aufschlüsselung von Cache-Read, Cache-Creation, neuem Input und Output.
- Freitextsuche filtert auch nach Modellnamen (`opus`, `sonnet`, `gemini`).

#### [MODIFY] [lib/treeView.js](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/lib/treeView.js)
- Ergänzt den Sidebar-Tooltip um das Kontextfenster: `🧠 **Kontextfenster:** 51k / 200k (25%) · Opus 5.5`.

#### [MODIFY] [extension.js](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/extension.js)
- Integriert `s.tokens` in den Signature-Vergleich zur automatischen Aktualisierung bei neuen Modell-Turns.
- Zeigt Modell und Tokenstand in QuickPick-Suche und Schnellmenü an.

#### [MODIFY] [package.json](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/package.json)
- Bump auf Version `0.12.0`.

#### [MODIFY] [TODO.md](file:///c:/lucee/tomcat/webapps/ROOT/tools/TODO.md)
- Aufgabe als erledigt markiert und auf diesen Plan verlinkt.

## Verifikationsplan

### Manuelle & automatisierte Tests
1. `npm run check`: Alle JS-Dateien fehlerfrei syntaktisch validiert.
2. Reale Transkript-Prüfung:
   - Claude Code: 200/200 Sessions liefern reale `tokens`-Objekte.
   - Antigravity: Alle 6 aktiven Sessions liefern reale `tokens`-Objekte.
3. Dashboard im Browser/Webview:
   - Token-Balken mit Pegelfarben und Tooltip auf den Karten sichtbar.
   - Sidebar-Tooltip zeigt Kontextgröße und Modell.
   - Schnellsuche findet Sessions nach Modell.
