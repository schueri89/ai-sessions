# Plan: Tabellarische Ansicht & Status-Filter für lokale KI-Audits (v0.65.0)

## Kontext & Ziel
Im Tab `🛡️ Audits` wurden bisher alle 27 Repositories in einem gleichförmigen Raster aus 27 großen Kacheln dargestellt.
Dadurch wirkte die Ansicht unübersichtlich und unruhig:
1. **Signal-to-Noise:** 24 von 27 Projekten hatten noch nie ein Audit durchgeführt und zeigten identische, leere Boxen („Bisher keine Berichtsdatei vorhanden“).
2. **Button-Inflation:** Auf dem Bildschirm waren über 80 Buttons gleichzeitig sichtbar (Scope-Toggles, Review-, Security-, Bericht-, Quittierungs- und KI-Buttons).
3. **Mangelnde Priorisierung:** Relevante Probleme (z. B. kritische Befunde in `smartwatch-app` und `cf-shared` oder laufende Scans in `cf-devtools`) gingen in der Masse unter.
4. **Fehlende Filter:** Es gab nur eine Freitextsuche, aber keine Schnellfilter nach Dringlichkeit.

### Ziel von Konzept 2:
- Umstellung auf eine tabellarische Listenansicht (analog zum Look & Feel von `📜 Logs` und `Historie`).
- Schnelle Status-Filter-Pills in der Toolbar: `Alle`, `🚨 Befunde`, `⏳ Läuft`, `⚠️ Offen`, `✓ Quittiert`, `✅ Bestanden`, `⚪ Noch kein Audit`.
- Kompakte Spaltenstruktur: Accordion-Toggle, Projekt, Ergebnis-Badge, Prüfstand, Letzter Scan, Befund-Zusammenfassung und kompakte Aktions-Buttons.
- Detail-Accordion bei Klick auf eine Zeile: Ausführlicher Befundtext, Metadaten und Aktions-Buttons.
- Spaltensortierung (Standard: Handlungsbedarf & laufende Tasks ganz oben).
- Schlankes, aufgeräumtes Erscheinungsbild ohne visuelle Überladung.

---

## Architektur & Komponenten

### 1. Webview-HTML (`lib/boardPanel.js`)
- Workspace-Guards-Banner (`workspace-guards-banner`) bleibt an oberster Stelle erhalten.
- Toolbar-Erweiterung:
  - Filter-Chips-Gruppe: `audits-filter-all`, `audits-filter-errors`, `audits-filter-running`, `audits-filter-pending`, `audits-filter-reviewed`, `audits-filter-passed`, `audits-filter-never`.
  - Freitextsuche: Filtert live nach Projekt, Befundtext und Status.
  - Voreinstellung: `⚡ Diff` / `🌐 Komplett`.
  - Aktualisieren-Button: `⟳ Aktualisieren`.
  - Statustext mit Zählern.
- Tabellen-Container (`audits-table-wrap`):
  - Tabelle `audits-table` mit Spalten:
    - `col-expand` (Chevron-Icon `▶` / `▼`)
    - `col-project` (Projektname mit Sortier-Icon)
    - `col-status` (Ergebnis-Badge: Fehler, Warnung, Läuft, Bestanden, Ungeprüft)
    - `col-review` (Prüfstand: Offen, Quittiert, –)
    - `col-lastrun` (Datum, Uhrzeit & Modell)
    - `col-summary` (Kurzzusammenfassung mit Text-Kürzung)
    - `col-actions` (Kompakte Schnell-Aktionen)
  - `audits-tbody` für dynamische Zeilen.
  - Detail-Accordion-Zeilen (`audit-detail-row`) für ausgeklappte Projekte.
  - Empty-State bei Filtern ohne Treffer.

### 2. Client-Logik im Webview (`lib/boardPanel.js`)
- **Zustandsverwaltung:**
  - `auditsStatusFilter`: aktiver Filter-Tab (`all`, `error`, `running`, `pending`, `reviewed`, `passed`, `never`).
  - `auditsSortColumn` / `auditsSortAsc`: Spaltensortierung (Projekt, Status, Review, LastRun).
  - `auditsExpandedProjects`: `Set` der aktuell ausgeklappten Projekt-Zeilen.
  - `auditsProjectScope`: `Map` für zeilenindividuelle Scopes (`unstaged` vs. `full`).
- **Rendering-Logik (`renderAuditsView`):**
  - Filterung nach Suchbegriff und aktivem Filter-Chip.
  - Sortierung mit konfigurierbaren Schlüsseln (Default: Handlungsbedarf zuerst).
  - Dynamischer Zusammenbau der Tabellenzeilen und Detail-Accordions.
  - Event-Handler für Zeilenklick (Expand/Collapse), Scope-Pills, Scan-Start, Bericht-Öffnen, Quittieren und KI-Übergabe.

### 3. Styling & UX (`lib/boardPanel.js`)
- CSS-Styling für `.audits-table-wrap`, `.audits-table`, Zeilen-Hover, Status-Badges und Action-Pills.
- Horizontale Scrollbarkeit bei schmalen Fenstern.
- Subtile Puls-Animation bei laufenden Audits.
- Harmonische Einbindung in das VS-Code-Theme (`--vscode-*` Farbtokens).

### 4. Manager & Tests (`lib/auditManager.js` & `test/check-audit-manager.js`)
- Fehlerbehebung in `lib/auditManager.js`: `markProjectReviewed` auch im Headless-Modus (ohne VS Code) vor dem Return aufrufen, sodass automatisierte Tests und `npm run check` erfolgreich durchlaufen.
- Aktualisierung der Tests und Validierung aller Module.

---

## Verifikationsschritte
1. `npm run check`: Syntax aller Module prüfen und Unit-Tests ausführen.
2. Manuelle Prüfung im Webview: Filter-Chips, Sortierung, Zeilenaufklappen (Accordion), Scope-Umschaltung und Button-Aktionen.
3. VSIX-Paketierung (`npm run package`) und automatische Installation im Editor (`code --install-extension vsix/ai-sessions-0.65.0.vsix`).
