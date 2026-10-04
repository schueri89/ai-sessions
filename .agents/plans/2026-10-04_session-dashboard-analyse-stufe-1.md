# Plan: session-dashboard — Analyse- & Verbrauchsübersicht (Stufe 1)

## Kontext & Motivation
Inspiriert von der VS Code Extension „Claude Code Usage“ (`growthjack.claude-code-usage`) soll das **AI Session Dashboard** um eine strukturierte Verbrauchs- und Token-Analyse erweitert werden.
In Stufe 1 wird ein integrierter Tab-Modus (`📊 Analyse & Verbrauch`) bereitgestellt, der tagesaktuelle Metriken (Heute 00:00–23:59 Uhr) aggregiert, visualisiert und filterbar macht.

## Architektur & Komponenten

### 1. Metriken-Engine (`session-dashboard/lib/analytics.js`)
- **Quellen:**
  - Claude Code: `~/.claude/transcripts/` (JSONL-Dateien, Auswertung von `usage`-Blöcken auf `assistant`-Nachrichten).
  - Google Antigravity: `~/.gemini/antigravity/brain/*/transcript*.jsonl`.
- **Kennzahlen:**
  - Gesamt-Tokens, Input, Output/Thinking, Cache-Read, Cache-Write.
  - Cache Hit-Rate (% Anteil der Cache-Reads an der gesamten Input-Basis).
  - Geschätzte Kosten auf Basis aktueller Standard-API-Preise (Claude 3.7 Sonnet, Claude 3.5 Sonnet, Claude 3.5 Haiku, Gemini 2.5 Pro / Flash).
  - Aktive Arbeitszeit: Wall-Clock-Minuten (eindeutige Minuten mit mindestens einem Turn), statt Session-Summen.
  - Sessions- und Dialog-Turn-Anzahl.
- **Breakdowns:**
  - 24-Stunden-Verlauf (`00:00` bis `23:00` Uhr) für Input, Output und Cache-Reads.
  - Modell-Aktivität (Filterung von 0-Token-Einträgen und `<synthetic>`).
  - Projekt-Verbrauch (sortiert nach Token-Volumen).

### 2. UI & Webview-Integration (`session-dashboard/lib/boardPanel.js`)
- **Modus-Umschalter:**
  - `📋 Board`: Operatives Kanban-Board mit Live-Zuständen.
  - `📊 Analyse & Verbrauch`: Analytisches Dashboard für den heutigen Tag.
- **Toolbar & Filter:**
  - Provider-Filter (`Alle`, `Claude Code`, `Antigravity`).
  - Zeitebenen-Badge (`Heute`).
- **KPI-Karten (4er-Grid):**
  - Gesamt-Tokens (mit Aufschlüsselung Input / Output / Cache).
  - Geschätzte Kosten (API-Äquivalent für Claude & Antigravity).
  - Cache Hit-Rate (Optimierung durch Prompt-Caching).
  - Arbeitszeit & Turns (Netto-Wall-Clock-Zeit und Turn-Zähler).
- **Stündlicher Verlauf:**
  - Stacked SVG-Balkendiagramm mit Modus-Toggle (`Inkl. Cache` vs. `Nur Input & Output`).
  - Saubere HTML-Flexbox-X-Achse mit 13 Zeitmarken (`00:00` bis `24:00` im 2h-Takt).
  - Dezent gesetzte Ticks auf der Grundlinie.
- **Modelle & Projekt-Tabelle:**
  - Modell-Balken mit Provider-Farbgebung und Prozentanteilen.
  - Projekt-Tabelle mit Badges, Sessions, Turns, Tokens und geschätzten Kosten.

### 3. Typografie & Skalierung (Polish v0.23.4)
- Feste, komfortable Schriftgrößen für alle Bildschirme und High-DPI-Monitore:
  - Header-Tabs: 14px (Badges 12px)
  - Filter-Buttons: 13.5px (Counts 12.5px)
  - Sucheingabe: 13px (Höhe 30px)
  - Projekt-Chips: 12.5px (Counts 12px, Label 12.5px bold)
  - Quota-Karten: Provider-Titel 14px, Status-Pillen 12px, Labels 13px, Prozentwerte 14px bold, Sub 12px, Track-Höhe 6px.
  - Badges & Tabelleninhalte: 12.5px / 13px.

## Verifikation
- Syntax-Prüfung aller 15 Module mit `npm run check` (Exit Code 0).
- VSIX-Paketierung mit `@vscode/vsce` (v0.23.4).
- Lokale Installation und optischer Test im VS Code Editor-Tab.
