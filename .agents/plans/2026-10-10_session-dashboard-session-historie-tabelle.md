# Implementierungsplan: 3. Tab für Session-Historie aller Sessions (Tabelle)

Datum: 2026-10-10  
Status: Bereit zur Abstimmung & Freigabe  
Betroffenes Projekt: ai-sessions  
Referenz: VS-Code-Extension „Claude Code Usage“ (`growthjack.claude-code-usage`), Tab „Sessions“

---

## 1. Ausgangslage & Analyse

Aktuell verfügt das Dashboard von **AI Sessions** über zwei Ansichten im Haupt-Webview:
1. **📊 Board:** Operatives Kanban-Board mit Spalten nach Session-Zustand (*Wartet auf dich*, *Arbeitet*, *Gemerkt*, *Fertig*, *Erledigt*).
2. **📈 Analyse & Verbrauch:** Aggregierte Kennzahlen für Heute / 7 Tage / 30 Tage mit KPI-Karten, Verbrauchsdiagrammen, Tool-Breakdown und Projekt-Verbrauchstabelle.

### Anforderung
- Hinzufügen eines **3. Tabs** für die **Historie aller Sessions** in Form einer detaillierten Tabelle.
- **Vorbild:** Die Tabellenansicht der Extension *Claude Code Usage* (`growthjack.claude-code-usage`), in der jede Session als tabellarische Zeile mit vollständigen Metriken (Zeitstempel, Titel, Projekt, Modell, Tokens, Kosten, Cache, Turns, Dauer und Direktaktionen) aufgeführt und sortierbar/filterbar ist.

### Datenquellen in `ai-sessions`
1. **Sitzungsbestand (`model.sessions`):**
   - Umfasst alle aktiven und archivierten Sessions aus Claude Code (`~/.claude/projects/*/*.jsonl`), Antigravity (`~/.gemini/antigravity/conversation_summaries.db`) und GitHub Copilot (`workspaceStorage/*/chatSessions/*.jsonl`).
   - Liefert: `sessionId`, `provider`, `title`, `project`, `cwd`, `displayState`, `startedAt`, `statusUpdatedAt`, `lastPrompt`, `activity`, `rateLimit`, `tokens`.
2. **Turn- & Transkriptmetriken (`lib/analytics.js`):**
   - Das System parst und cacht über `fileTurnCache` bereits die Transkript-Turns aller drei Anbieter der letzten 30 Tage.
   - Hieraus lassen sich exakte Zahlen pro Session ermitteln:
     - **Tokens:** Input, Output, Cache-Creation, Cache-Read, Gesamt
     - **Kosten:** Dollarbetrag gemäß Modellpreis-Tabelle (`MODEL_PRICING`)
     - **Modelle:** Konkret genutzte LLMs (z. B. `claude-3-7-sonnet`, `gemini-2.5-flash`, `gpt-4o`)
     - **Turns & Thinking:** Interaktionsanzahl und Thinking/Reasoning-Turns
     - **Tool-Verteilung:** Aufgerufene Tools (Read, Edit, Bash, Grep, etc.)
     - **Dauer:** Zeitspanne zwischen Start und letzter Aktivität

---

## 2. Konzept & Architektur des 3. Tabs („📋 Historie“)

### 2.1 Tab-Navigation im Header
Im Header `.view-mode-bar` wird neben `📊 Board` und `📈 Analyse & Verbrauch` ein dritter Reiter ergänzt:
```html
<button class="mode-tab-btn" id="btn-mode-history" title="Tabellarische Historie aller Sessions">
  📋 Historie <span class="mode-badge" id="mode-badge-history">…</span>
</button>
```
- **Lazy-Loading:** Genau wie beim Analyse-Tab (aus v0.32.0) werden detaillierte Verbrauchsmetriken erst geladen, wenn der Reiter „Historie“ angeklickt wird (`requestHistoryAnalytics`). Dadurch bleibt der Start des Boards ultra-schnell.

### 2.2 Filter- und Werkzeugleiste
Direkt über der Tabelle befindet sich eine kompakte Filter-Toolbar:
- **Zeitbereich-Buttons:** `[Alle]` · `[Heute]` · `[7 Tage]` · `[30 Tage]`
- **Provider-Pillen:** `[Alle]` · `[Claude]` · `[Antigravity]` · `[Copilot]`
- **Status-Filter:** Dropdown / Schnellfilter (`Alle`, `Wartet`, `Arbeitet`, `Gemerkt`, `Fertig`, `Erledigt`)
- **Projekt-Filter:** Dropdown aller erkannten Projekte
- **Modell-Filter:** Dropdown der beteiligten Modelle
- **Freitextsuche:** Schnelle Filterung über Session-Titel, ID, Prompts und Verzeichnisse
- **Ergebnis-Zähler:** Z. B. *„48 von 142 Sessions“*

### 2.3 Tabellenstruktur & Spalten (analog Vorbild)

| Spalte | Typ / Ausrichtung | Inhalt & Interaktion |
|---|---|---|
| **Datum / Zeit** | Text (Links) | Startzeitpunkt bzw. letzte Aktivität (`10.10. 21:45`), sortierbar |
| **Session & Titel** | Text (Links) | Chat-Titel mit Tooltip zur Session-ID; Klick klappt Zeilendetails auf |
| **Projekt** | Badge (Links) | Projekt-Pille (`📁 ai-sessions`, `📁 tvw-hub` etc.) |
| **Anbieter / Modell** | Icon + Text (Links) | Provider-Icon (Claude/Antigravity/Copilot) + Modellname (z. B. `Sonnet 3.7`) |
| **Status** | Badge (Zentriert) | Farbiger Status-Badge (*Wartet*, *Arbeitet*, *Gemerkt*, *Fertig*, *Erledigt*) |
| **Kosten** | Währung (Rechts) | Geschätzte Kosten (z. B. `$0.042`), farblich hervorgehoben (`#4ec9b0`) |
| **Tokens** | Zahl (Rechts) | Gesamttokens formatiert (z. B. `142k`), Tooltip mit Input/Output/Cache |
| **Cache-Quote** | Prozent (Rechts) | Cache Read Rate (z. B. `88%`), zeigt Sparpotenzial |
| **Turns** | Zahl (Rechts) | Anzahl Turns / Interaktionen, optional mit ⚡-Symbol bei Thinking |
| **Dauer** | Zeit (Rechts) | Zeitspanne (z. B. `24m` oder `1h 12m`) |
| **Aktionen** | Buttons (Rechts) | `▶` Chat öffnen · `👁` Transkript · `📋` ID kopieren · `🔖` Merken · `✅` Erledigt |

### 2.4 Aufklappbare Detailansicht (Sub-Row / Accordion)
Klick auf eine Zeile öffnet direkt darunter einen ausklappbaren Detailbereich:
- **Letzter User-Prompt:** Vollständiger Wortlaut des letzten Prompts bzw. der Aufgabenstellung.
- **Token-Breakdown:** Horizontale Balken-/Kartenansicht für Input, Output, Cache Creation, Cache Read und Context-Peak.
- **Tool-Verteilung:** Gezählte Tool-Aufrufe (z. B. `📖 Read: 14`, `✏️ Edit: 3`, `🛠️ Bash: 8`).
- **Verzeichnis:** Absoluter Pfad (`cwd`) mit Klick zum Kopieren oder Öffnen.

---

## 3. Technische Umsetzung

### 3.1 Backend & Datenaufbereitung (`lib/history.js` / `lib/analytics.js`)
- Neue Funktion `getSessionHistoryList(sessions, turns)`:
  - Verknüpft die `model.sessions` mit den aggregierten Turn-Metriken aus `analytics.js`.
  - Berechnet für jede Session Summen: Tokens, Kosten, Turns, Thinking-Anteil, Tool-Aufrufe, Dauer.
  - Hält ein schlankes In-Memory-Ergebnis vor, sodass Filter und Sortierung verzögerungsfrei arbeiten.

### 3.2 Webview UI (`lib/boardPanel.js`)
- **HTML:**
  - Ergänzung des dritten Buttons `#btn-mode-history` in `.mode-tabs`.
  - Neuer Container `#history-view` mit Toolbar `#history-controls` und Tabelle `#history-table`.
- **CSS:**
  - Modernes Tabellen-Layout (`border-collapse: collapse; width: 100%; font-size: 12.5px;`).
  - `position: sticky; top: 0;` für den Tabellenkopf.
  - Sortier-Indikatoren (`▲` / `▼`) an den spaltenspezifischen Headern.
  - Responsive Scroll-Container für breite Tabellen.
- **Client-JS:**
  - Clientseitiges Sortieren nach Spaltenschlüssel (`sortColumn`, `sortAsc`).
  - Schnelle Filterung im Browser über Input-Events (Debounce 150ms).
  - Akkordeon-Logik zum Ein-/Ausklappen der Detail-Zeilen.
  - Aktions-Handler verknüpft mit bestehenden VS-Code-Commands (`sessionDashboard.open`, `sessionDashboard.viewTranscript`, `sessionDashboard.markDone`, etc.).

---

## 4. Betroffene Dateien

| Datei | Art | Änderung |
|---|---|---|
| [lib/boardPanel.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/boardPanel.js) | MODIFY | 3. Tab `Historie`, Tabellen-Markup, CSS, Filter- & Sortier-Logik, Lazy-Loading-Trigger |
| [lib/analytics.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/analytics.js) | MODIFY | Bereitstellung der Session-spezifischen Verbrauchsaggregate (`getSessionMetricsMap`) |
| [package.json](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/package.json) | MODIFY | Versionserhöhung auf `0.33.0` |
| [TODO.md](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/TODO.md) | MODIFY | Aufgabe dokumentieren und verlinken |

---

## 5. Verifikationsschritte

1. `npm run check` (Syntax-Prüfung aller Module)
2. `npm run package` (VSIX-Paketierung nach `vsix/`)
3. `code --install-extension vsix/ai-sessions-0.33.0.vsix`
4. **Visuelle & funktionale Prüfung im Editor:**
   - Klick auf Tab `📋 Historie`: Tabelle öffnet sich verzögerungsfrei.
   - Sortierung nach Datum, Kosten, Tokens, Projekt und Status testen.
   - Filterung nach Provider (Claude, Antigravity, Copilot) und Suchfeld prüfen.
   - Zeile aufklappen: Prompt und Token-Breakdown sichtbar.
   - Aktionen (Chat öffnen, Transkript, Erledigt) an einer Zeile testen.

