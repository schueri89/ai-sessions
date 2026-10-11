# Implementierungsplan: Alphabetische Sortierung des Projektfilters

Datum: 04.10.2026
Task-Ziel: Die Filter für Projekte im Dashboard (Chips) und im QuickPick-Menü alphabetisch sortieren statt nach Häufigkeit.

## Hintergrund & Zielstellung
Bisher wurden die Projekte im Projektfilter des Dashboards (`lib/boardPanel.js`) sowie im QuickPick-Filter (`extension.js`) nach der Anzahl der Sessions absteigend sortiert (`b[1] - a[1]`). Mit wachsender Projektanzahl (`tools`, `tvw-hub`, `status-portal`, `haushalt-hub`, `cf-admin`, `app-kit` etc.) war es dadurch unübersichtlich, gezielt nach einem Projekt zu suchen, da die Reihenfolge bei sich ändernden Sessionzahlen ständig variierte.

Ziel ist eine stabile, alphabetische Sortierung der Projekte nach ihrem Namen (unter Beibehaltung der führenden Option „Alle“ bzw. „Alle Projekte“).

## Umgesetzte Änderungen

### [session-dashboard]

#### [MODIFY] [lib/boardPanel.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/boardPanel.js)
- `updateProjectChipsUI`: Sortierung der `projEntries` von `b[1] - a[1]` umgestellt auf:
  `a[0].localeCompare(b[0], undefined, { sensitivity: 'base', numeric: true }) || a[0].localeCompare(b[0])`
- „Alle“-Chip bleibt wie gehabt als erster Eintrag vorangestellt.

#### [MODIFY] [extension.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/extension.js)
- Command `sessionDashboard.filterProject`: Sortierung von `sortedProjects` im QuickPick analog umgestellt auf alphabetische Sortierung nach Projektname.

#### [MODIFY] [package.json](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/package.json)
- Versions-Bump auf `0.21.2`.

## Verifikation
1. `npm run check` (Syntax-Prüfung aller Dateien erfolgreich).
2. `npm run package` (VSIX `session-dashboard-0.21.2.vsix` erfolgreich gebaut).
3. `code --install-extension session-dashboard-0.21.2.vsix --force` (Erfolgreich in VS Code installiert).
