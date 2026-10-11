# Implementierungsplan: Statusleisten-Widget mit Direktzugriff

Datum: 03.10.2026
Task-Ziel: Statusleisten-Widget (`🤖 X arbeitet · Y wartet`) mit Direktzugriff auf das Dashboard und laufende Sessions implementieren.

## Hintergrund & Zielstellung
Entwickler arbeiten oft in Vollbild-Editoren oder mit geschlossener Sidebar. Ein Statusleisten-Widget unten rechts in VS Code ermöglicht es, jederzeit im Augenwinkel zu erkennen:
- Ob eine oder mehrere KI-Sessions aktuell arbeiten (`X arbeitet`)
- Ob eine Session auf Benutzereingabe wartet (`Y wartet`) – bei wartenden Sessions auffällig hervorgehoben (Warn-Hintergrundfarbe).
- Ein Direktzugriff per Klick öffnet sofort das Dashboard oder ein kompaktes Quick-Menü mit direktem Sprung in den jeweiligen Chat.

## Vorgeschlagene Änderungen

### [session-dashboard]

#### [ADD] [lib/statusBar.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/statusBar.js)
- Klasse `StatusBarWidget` zur Verwaltung des VS-Code-Statusleisteneintrags (`vscode.window.createStatusBarItem`).
- Formatierung:
  - `🤖 X arbeitet · Y wartet` (wenn beides aktiv)
  - `🤖 X arbeitet` (wenn nur arbeitend)
  - `🤖 Y wartet` (mit `statusBarItem.warningBackground` hervorgehoben)
  - `🤖 Z gemerkt` (wenn nur gemerkte Sessions)
  - `🤖 KI bereit` (im Ruhezustand)
- Reicher Markdown-Tooltip mit Aufschlüsselung aller Zustände.
- Verknüpfung mit Befehl `sessionDashboard.statusBarClick`.

#### [MODIFY] [extension.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/extension.js)
- Instanziiert `StatusBarWidget` und aktualisiert es bei jedem `update()`.
- Neuer Befehl `sessionDashboard.statusBarClick` (liest Konfiguration `sessionDashboard.statusBarClickAction`: `board`, `quickpick` oder `firstWaiting`).
- Neuer Befehl `sessionDashboard.quickMenu` für schnellen Zugriff auf wartende/arbeitende Sessions und Aktionen.

#### [MODIFY] [package.json](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/package.json)
- Bump auf Version `0.11.0`.
- Registriert Befehle `sessionDashboard.statusBarClick` und `sessionDashboard.quickMenu`.
- Konfiguration `sessionDashboard.statusBarClickAction` (`board` [Default], `quickpick`, `firstWaiting`).

## Verifikationsplan

### Manuelle Prüfung
1. Statusleiste unten rechts prüfen: `🤖 ...` wird angezeigt.
2. Tooltip überfahren: Aufschlüsselung der Sessions sichtbar.
3. Klick auf das Widget: Dashboard öffnet sich direkt (`sessionDashboard.showBoard`).
4. Aufruf von `sessionDashboard.quickMenu`: Schnellauswahl mit wartenden/arbeitenden Sessions und Dashboard-Link.
5. Wenn eine Session wartet: Gelbe Hervorhebung des Statusleisteneintrags.
