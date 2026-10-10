# Implementierungsplan: Ladeanimation, Settings-Button, Lazy-Loading der Tabs & Sidebar-Bereinigung

Datum: 2026-10-10  
Status: Bereit zur Umsetzung nach Freigabe  
Betroffenes Projekt: ai-sessions  

---

## 1. Übersicht der Aufgaben

1. **Ladeanimation beim Öffnen des Tabs fehlt:**
   - Beim Start von VS Code meldet sich das Webview-Skript sofort mit `ready`. Zu diesem Zeitpunkt läuft `model.refresh()` aber noch asynchron im Hintergrund.
   - Das Webview empfängt ein vorzeitiges leeres `render`, blendet den Lade-Spinner sofort aus und zeigt kurz „keine“ Sessions in allen Spalten, bis 1–3 Sekunden später die echten Daten eintreffen.
   - **Lösung:** `SessionModel` führt `isInitialLoaded = false`. Erst nach Beendigung des ersten echten Festplatten-Scans wird `isLoaded: true` an das Webview geschickt. Solange `isLoaded === false`, bleibt der Lade-Spinner aktiv.

2. **Button für Settings auf Dashboard oben rechts & Frage bzgl. Sidebar:**
   - **Dashboard oben rechts:** In `.toolbar-actions` (neben 🐞 Debug-Log und 🔊 Sound-Toggle) wird ein Einstellungs-Button ⚙️ integriert (`btn-settings`). Ein Klick öffnet via `workbench.action.openSettings` direkt die gefilterte Einstellungsansicht `@ext:schueri.ai-sessions`.
   - **In die Sidebar?** Nein. Gemäß Anforderung 4 soll die Sidebar nicht überfrachtet werden, weshalb in der Sidebar kein Settings-Icon platziert wird.

3. **Werden Infos von allen Tabs geladen? Kann man diese beim Öffnen nachladen?**
   - **Befund:** Ja, aktuell führt `board.update()` alle 5 Sekunden synchron `getAllAnalytics()` aus und lädt 30 Tage Transkriptdaten aller drei Anbieter vor – selbst wenn der Nutzer nur das Session-Board betrachtet.
   - **Lösung (Lazy-Loading):** Im Modus `board` wird `getAllAnalytics()` übersprungen (`analytics: null`). Erst beim Umschalten auf „📊 Analyse & Verbrauch“ werden die Analytics-Daten bedarfsgerecht nachgeladen (`requestAnalytics`).

4. **In der Sidebar bitte nur das Icon für die Übersicht integrieren:**
   - In [package.json](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/package.json) unter `menus["view/title"]` für `sessionDashboard.sessions` werden die redundanten Aktionen (`filter`, `filterProject`, `search`, `showAnalyse`, `refresh`) aus der sichtbaren Leiste entfernt.
   - Es verbleibt ausschließlich `sessionDashboard.showBoard` (`$(layout)`, Übersicht öffnen).

---

## 2. Betroffene Dateien & Änderungen

| Datei | Art | Änderung |
|---|---|---|
| [package.json](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/package.json) | MODIFY | `menus["view/title"]` auf ausschließlich `sessionDashboard.showBoard` bereinigen; neuer Befehl `sessionDashboard.openSettings`; Versionserhöhung auf `0.32.0` |
| [extension.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/extension.js) | MODIFY | `isInitialLoaded`-Status in `SessionModel`; Command `sessionDashboard.openSettings` |
| [lib/boardPanel.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/boardPanel.js) | MODIFY | Lade-Spinner erst bei `isLoaded: true` ausblenden; Settings-Button ⚙️ in Toolbar; Lazy-Loading für `getAllAnalytics` bei Modus `board` |
| [TODO.md](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/TODO.md) | MODIFY | Punkte als erledigt markieren mit Versionsnummer `v0.32.0` |

---

## 3. Verifikation

1. `npm run check` (Syntaxprüfung aller Module)
2. `npm run package` (VSIX-Paketierung)
3. `code --install-extension vsix/ai-sessions-0.32.0.vsix` (Automatische Installation im Editor)
4. Manuelle Prüfung:
   - Dashboard-Tab öffnen: Ladeanimation bleibt zentriert sichtbar, bis Daten vollständig da sind.
   - Dashboard oben rechts: Button ⚙️ öffnet die VS-Code-Settings für AI Sessions.
   - Sidebar: Nur noch das eine Icon für die Übersicht sichtbar.
   - Analyse-Tab: Lädt schlank erst bei Klick auf den Reiter nach.
