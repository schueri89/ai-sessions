# Implementierungsplan: Projekt-Badges & Filter-Chips nach Workspace/Unterordner

Datum: 2026-10-03
Task-Ziel: Sessions automatisch ihrem Projekt/Unterordner zuordnen, Projekt-Badges auf Karten und in der Sidebar anzeigen sowie Filter-Chips im Dashboard und QuickPick bereitstellen.

## Hintergrund & Zielstellung
Im Workspace `c:/lucee/tomcat/webapps/ROOT/` existieren zahlreiche Teilprojekte (`tools`, `tvw-hub`, `status-portal`, `cf-admin`, `haushalt-hub`, `app-kit` etc.). Bisher wurden Sessions nur nach Provider (`Claude Code` vs. `Google Antigravity`) gefiltert. Der Benutzer wünscht:
1. **Projekt-Badges**: Jede Session zeigt sichtbar an, welchem Teilprojekt/Unterordner sie angehört (auf den Dashboard-Karten, im Sidebar-Tree und im QuickPick).
2. **Filter-Chips**: Im Dashboard können Sessions bequem per Klick auf Projekt-Chips gefiltert werden (z. B. nur `tvw-hub`, nur `tools` etc.), kombinierbar mit dem Provider-Filter und der Freitextsuche.

## Vorgeschlagene Änderungen

### [session-dashboard]

#### [ADD] [lib/project.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/project.js)
- Scannt dynamisch die Projektunterordner unter dem Workspace-Root (`c:/lucee/tomcat/webapps/ROOT`).
- Ignoriert Systemordner (`WEB-INF`, `META-INF`, `node_modules`, `.git`, `.vscode`, `logs`, `data`, `backups` etc.).
- Heuristik zur Projekterkennung:
  1. `cwd` des Prozesses bzw. der Session
  2. Workspace-URIs (bei Antigravity)
  3. Zugegriffene Dateipfade in Tool-Calls / Transkriptzeilen (höhere Priorität als generische Ordner wie `.agents`)
  4. Vorkommen des Projektnamens in Titel / Prompt
  5. Fallback auf `ROOT` für übergreifende Aufgaben.

#### [MODIFY] [lib/transcripts.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/transcripts.js)
- Erkennt in `applyLine()` Dateizugriffe auf Projektunterordner und merkt sich das erkannte Projekt auf dem Info-Objekt.

#### [MODIFY] [lib/history.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/history.js)
- Ermittelt beim Parsen von Head/Tail das Projekt jeder historischen Claude-Session und speichert es gecacht im History-Eintrag.

#### [MODIFY] [lib/providers/claude.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/providers/claude.js)
- Übergibt `project` für Live-Sessions und historische Sessions.

#### [MODIFY] [lib/providers/antigravity.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/providers/antigravity.js)
- Liest bei Sessions mit `cwd = ROOT` Pfade aus `transcript.jsonl` und ordnet sie dem konkreten Projekt zu.
- Übergibt `project` im Session-Objekt.

#### [MODIFY] [lib/boardPanel.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/boardPanel.js)
- Rendert Projekt-Badges (`📁 <projekt>`) auf Session-Karten (Klick auf Badge aktiviert direkt den Projektfilter).
- Rendert dynamische Filter-Chips für alle Projekte mit aktiven Sessions in der Toolbar.
- Unterstützt nahtloses Umschalten und Zurücksetzen ("Alle Projekte").
- Bezieht `project` in die Freitextsuche ein.

#### [MODIFY] [lib/treeView.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/treeView.js)
- Zeigt `[<projekt>]` in der Beschreibung der Tree-Items.
- Ergänzt `📁 **Projekt:** <projekt>` im Markdown-Tooltip.

#### [MODIFY] [extension.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/extension.js)
- Verwaltet `projectFilter` im `SessionModel` (persistiert in `globalState`).
- `visibleSessions()` filtert nach Provider- und Projekt-Filter.
- `counts()` liefert `byProject`-Verteilung.
- Neuer Befehl `sessionDashboard.filterProject` für QuickPick-Filterung.
- Korrigiert Referenz in `sessionDashboard.search` und ergänzt Projekt in QuickPick-Labels.
- Zeigt aktiven Projektfilter in `view.description` der Sidebar an.

#### [MODIFY] [package.json](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/package.json)
- Bump auf Version `0.10.0`.
- Registriert Befehl `sessionDashboard.filterProject`.

## Verifikationsplan

### Manuelle Prüfung
1. Board im Editor öffnen (`AI Sessions`).
2. Prüfen, ob jede Karte ein Projekt-Badge besitzt (z. B. `📁 tvw-hub`, `📁 tools`, `📁 cf-admin`).
3. Klick auf einen Projekt-Filterchip (z. B. `tvw-hub`) → nur Sessions dieses Projekts werden angezeigt.
4. Klick auf ein Projekt-Badge auf einer Karte → Filterchip wechselt direkt auf dieses Projekt.
5. Klick auf "Alle Projekte" → Filter wird zurückgesetzt.
6. Freitextsuche nach Projektnamen testen (z. B. "status-portal").
7. Sidebar-Treeview prüfen: `[<projekt>]` in der Beschreibung und im Tooltip sichtbar.
8. Befehl `sessionDashboard.filterProject` über Command Palette testen.
