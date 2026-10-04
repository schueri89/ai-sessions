# Plan: session-dashboard — Analyse & Verbrauchsübersicht (Stufe 4: Read-Only Viewer / Session-Detailansicht)

## Status: Implementiert & Verifiziert (v0.26.0)

## Kontext & Motivation
Bisher gibt es zwei Möglichkeiten, mit einer Session zu interagieren:
1. Die operative Karte im Board oder TreeView zeigt Status, Tokens und Aktivität.
2. Ein Klick auf "Öffnen" startet die interaktive CLI-Umgebung (Claude Code) bzw. den Live-Chat (Antigravity).

**Problem:**
- Viele Sessions sind bereits abgeschlossen, pausiert oder historisch (z. B. aus den letzten 7 oder 30 Tagen).
- Oft möchte man nur kurz nachschauen:
  - *Was hat der Agent in dieser Session genau gemacht?*
  - *Welche Dateien wurden gelesen oder geändert?*
  - *Welche Shell-Befehle wurden ausgeführt und was war die Ausgabe?*
  - *Wie sah der Denkprozess (Thinking) bei einem bestimmten Turn aus?*
  - *Wie viele Tokens und Kosten sind in welchem Turn angefallen?*
- Das Starten der interaktiven CLI nur zum Nachschauen ist langsam, kann abgebrochene Prozesse stören oder scheitern, wenn eine Session archiviert ist.

## Ziele von Stufe 4
Ein schneller, leichtgewichtiger **Read-Only Session Viewer** in VS Code:
1. **Universell für beide Provider**:
   - Claude Code (`~/.claude/projects/*/<sessionId>.jsonl`)
   - Antigravity (`~/.gemini/antigravity/brain/<sessionId>/.system_generated/logs/transcript.jsonl`)
2. **Turn-basierte chronologische Darstellung**:
   - 👤 **User Prompts** (mit Zeitstempel)
   - 🧠 **Denkprozesse / Thinking** (aufklappbar/collapsible, Token-Zahl)
   - 🛠️ **Tool-Calls & Ausgaben** (z. B. `view_file`, `Edit`, `Bash` mit Parametern & Kurzauszug)
   - 🤖 **Agenten-Antworten** (sauber formatiertes Markdown mit Syntax-Highlighting)
3. **Session-Metriken im Header**:
   - Titel & Projekt-Badge
   - Modell (`Claude 3.7 Sonnet`, `Gemini 2.5 Flash` etc.)
   - Status (`wartet`, `arbeitet`, `fertig`, `erledigt`)
   - Gesamttokens & Kosten-Aufschlüsselung (Input, Output, Cache)
   - Gesamtdauer & Anzahl Turns / Tools
   - Button: `🚀 In CLI / Chat öffnen` (um bei Bedarf nahtlos weiterzuarbeiten)
4. **Interaktive Filter & Suche im Viewer**:
   - Suche nach Begriffen im Verlauf
   - Filter-Toggles: `[ 🛠️ Tools ein/aus ]`, `[ 🧠 Thinking ein/aus ]`
5. **Nahtlose Einstiegspunkte**:
   - **Board-Karten**: Neues `👁️ Details`-Icon auf jeder Karte
   - **TreeView**: Rechtsklick / Inline-Icon `Session-Details anzeigen (Read-Only)`
   - **Projekt-Verbrauch Tabelle**: Klick auf ein Projekt öffnet die zugehörigen Sessions

---

## Architektur & Komponenten

### 1. `lib/transcriptParser.js`
Parst die JSONL-Transkripte deterministisch in eine strukturierte Datenstruktur:
```typescript
interface SessionTranscript {
  sessionId: string;
  provider: 'claude' | 'antigravity';
  title: string;
  project: string;
  model: string;
  startedAt: number;
  lastActivity: number;
  totalTokens: number;
  cost: number;
  turns: Turn[];
}

interface Turn {
  index: number;
  timestamp: number;
  userPrompt?: string;
  thinking?: string;
  tools: ToolCall[];
  assistantResponse?: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cost: number;
}
```

### 2. `lib/transcriptViewer.js` (Webview-Panel)
- Verwaltet Editor-Tabs `Session: <Titel> (Read-Only)`.
- Responsive, VS Code native Benutzeroberfläche mit dunklem Farbschema.
- Copy-Code-Buttons, Collapsible Tool- und Thinking-Container.

### 3. Erweiterung von `extension.js`, `boardPanel.js`, `treeView.js`
- Registrierung des Commands `sessionDashboard.viewDetails`.
- Hinzufügen des Detail-Buttons auf den Karten und im TreeView.

---

## Verifikationsschritte
1. Öffnen von realen Claude-Code-Transkripten (große JSONL-Dateien > 5 MB).
2. Öffnen von Antigravity-Transkripten.
3. Performance-Prüfung: Schnelles Laden ohne Blockieren des VS Code Hauptthreads.
4. Test von Filtern (Tools ausblenden, Thinking ein-/ausklappen).
5. CSS- und Script-Validierung mit `verify-css.js` und `verify-webview.js`.
