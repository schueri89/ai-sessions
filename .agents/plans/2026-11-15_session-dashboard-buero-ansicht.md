# Implementierungsplan: Büro-Ansicht (Office Floor) im Session-Dashboard
Datum: 2026-11-15
Task-Ziel: Integration einer interaktiven 2D-Pixel-Büro-Ansicht („🏢 Büro“) als vierte Unteransicht im Bereich „Sessions“ sowie als eigenständiges Popout-Panel für einen Zweitmonitor in der VS-Code-Extension `ai-sessions`.

Dieser Plan beschreibt die Einbindung einer leichtgewichtigen, vollständig lokal auf HTML5-Canvas laufenden Büro-Visualisierung in [`BoardPanel`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/boardPanel.js#L67) und ein separates [`OfficePanel`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/officePanel.js) auf Basis derselben Session- und Provider-Daten.

## Hintergrund & Zielstellung
Aktuell stellt `ai-sessions` alle erfassten KI-Sessions (`claude`, `antigravity`, `copilot`, `codex`, `cline`) innerhalb des Reiters „Sessions“ in drei Unteransichten dar: `📊 Board`, `📈 Analyse` und `📋 Historie`. Inspiriert von `munderdiffl.in` soll ein optionaler vierter Modus `🏢 Büro` ergänzt werden, der laufende und wartende Sessions als Avatare an Schreibtischen in einem virtuellen Entwicklerbüro visualisiert.

Wesentliche Entwurfsziele:
- **Keine doppelte Datenerfassung:** Sowohl der Sub-Tab als auch das Popout-Panel nutzen direkt das bestehende `render`-Payload (`columns`, `counts`, `justCompletedSessionIds`, Filter & Suche) aus [`SessionModel`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/extension.js#L57).
- **Keine externen Pakete:** Reines HTML5-`<canvas>` mit `image-rendering: pixelated` in einem gemeinsam genutzten Renderer-Modul (`lib/officeView.js`), damit die `.vsix`-Paketgröße minimal bleibt und beide Panels exakt dieselbe Darstellung verwenden.
- **Zweitmonitor-fähig & interaktiv:** Ein eigenes `WebviewPanel` (`sessionDashboard.office`) lässt sich per Button (`↗ Popout`) oder Command Palette öffnen und in VS Code auf einen zweiten Monitor verschieben. Klicks auf einen Schreibtisch lösen in beiden Fenstern dieselben Aktionen (`open`, `showDetails`, `bookmark`, `markDone`) aus, synchron zu VS-Code-Light/Dark-Themes.

## Vorgeschlagene Änderungen

### [Büro-Renderer & Client-Logik]

#### [ADD] [officeView.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/officeView.js)
- Exportiert Styles (`getOfficeStyles()`), HTML-Gerüst (`getOfficeHtml()`) und das in das Webview eingebettete Client-Skript (`getOfficeClientScript()`), analog zu einem gekapselten View-Modul.
- **Daten-Mapping auf Schreibtische (`buildOfficeLayout`):**
  - Verwendet ausschließlich die aktiven/offenen Zustände aus `STATE_ORDER` ([`format.js`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/format.js#L13)): `waiting`, `busy`, `bookmarked` und `idle`. Sessions mit Zustand `done` („Erledigt“) werden standardmäßig ausgeblendet, damit das Büro übersichtlich bleibt (begrenzt über eine konfigurierbare Maximalzahl sichtbarer Plätze bzw. dynamisch wachsende Büro-Reihen).
  - Beachtet aktive Filter (Provider-Filter, Projekt-Filter und Freitextsuche aus `applySearchAndRender()`), sodass das Büro immer exakt dieselbe Teilmenge wie das Kanban-Board zeigt.
  - Stabilisiert Tisch-Positionen je `sessionId`, damit Avatare bei Statuswechseln (`busy` → `waiting` → `idle`) nicht bei jedem 5-Sekunden-Poll die Plätze tauschen.
- **Canvas-Rendering & Animation (`requestAnimationFrame`):**
  - Liest VS-Code-CSS-Variablen (`--vscode-editor-background`, `--vscode-editor-foreground`, `--vscode-focusBorder` usw.) für automatische Light-/Dark-Theme-Anpassung und reagiert auf Theme-Wechsel.
  - Zeichnet Schreibtische, Monitore, Projekt-Namensschilder (`s.project`), Provider-Farbcodes/Badges sowie zustandsabhängige Avatar-Animationen:
    - `busy`: Tipp-Animation am leuchtenden Code-Monitor + pulsierender Aktivitätshinweis (`s.activity`).
    - `waiting`: Winkender Avatar mit hüpfender `?!`-Sprechblase.
    - `bookmarked`: Pin-/Stern-Markierung am Schreibtisch.
    - `idle`: Kaffeetasse mit Dampf-Animation und `✓`-Status; bei `justCompletedSessionIds` kurze Abschluss-Hervorhebung.
  - Pause-Mechanismus für die Animationsschleife (`visibilitychange` / `currentViewMode !== 'office'`), damit im Hintergrund keine CPU-Last entsteht.
- **Interaktion & Inspector-Leiste unter dem Canvas:**
  - Hover-Tooltip mit Session-Titel, Provider, Projekt und `detail`-Text.
  - Einfacher Klick selektiert den Schreibtisch und zeigt unterhalb des Canvas eine kompakte Aktionsleiste (`💬 Chat öffnen` → `action: 'open'`, `👁️ Details` → `action: 'showDetails'`, `📌 Merken`, `✓ Erledigt`).
  - Doppelklick auf einen Schreibtisch springt direkt über `action: 'open'` in den zugehörigen Chat.

### [Webview-Integration & Navigation]

#### [MODIFY] [boardPanel.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/boardPanel.js)
- `getViewModes()` (Zeile 19–32): `'office'` in die erlaubten Ansichtsmodi aufnehmen.
- HTML-Template (`.session-subnav` in Board-, Büro-, Analyse- und Historie-Toolbar, ab Zeile 3845): vierten Sub-Tab-Button `<button class="session-subnav-btn" data-submode="office" id="subtab-office" title="Virtuelles Entwicklerbüro">🏢 Büro</button>` ergänzen und den Container `<div class="office-view" id="office-view" style="display: none;">` einfügen (inkl. Button `↗ Popout` zum Öffnen im eigenen Tab/Fenster).
- Webview-Logik:
  - `setViewMode(mode)` (Zeile 5855 ff.): `'office'` in `validModes`, Markierung des aktiven `btnModeBoard` („Sessions“), Ein-/Ausblenden von `officeEl` sowie Start/Stopp der Büro-Animationsschleife ergänzen.
  - `applySearchAndRender()` / `render()` (Zeile 5534 ff.): gefilterte Spalten und `justCompletedSessionIds` an `window.__aiOffice.update(...)` übergeben, sobald `currentViewMode === 'office'` aktiv ist (oder zwischengespeichert beim Umschalten).
  - Provider- und Projekt-Filterleiste im Büro-Tab wiederverwenden bzw. synchron halten, sodass im Büro direkt nach Provider oder Projekt gefiltert werden kann.
  - Action `'openOfficePopout'` in `onDidReceiveMessage`: führt `vscode.commands.executeCommand('sessionDashboard.openOffice')` aus.

### [Eigenständiges Popout-Panel für Zweitmonitor]

#### [ADD] [officePanel.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/officePanel.js)
- Eigenständiger `WebviewPanel`-Wrapper (`'sessionDashboard.office'`, Titel `'AI Sessions · Büro'`) mit `retainContextWhenHidden: true`.
- Nutzt direkt `getOfficeStyles()`, `getOfficeHtml()` und `getOfficeClientScript()` aus [`lib/officeView.js`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/officeView.js) samt kompakter Filterleiste (Provider & Projekt) und eigenem Popout-Hinweis („Tab per Rechtsklick → In neues Fenster verschieben auf Zweitmonitor“).
- `update(justCompletedSessionIds)` baut aus `this.model.visibleSessions()` dieselbe `columns`-Struktur wie `BoardPanel.update()` und schickt sie per `postMessage({ type: 'render', ... })` an das Popout-Webview.
- `onDidReceiveMessage` delegiert Klick-Aktionen (`open`, `showDetails`, `bookmark`, `unbookmark`, `markDone`, `setFilter`, `setProjectFilter`) direkt an die bestehenden Commands in `extension.js`.
- Unterstützt `vscode.window.registerWebviewPanelSerializer('sessionDashboard.office', ...)` (optional), damit ein ausgelagertes Zweitmonitor-Fenster bei einem VS-Code-Reload erhalten bleibt.

#### [MODIFY] [extension.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/extension.js)
- `OfficePanel` neben `BoardPanel` (Zeile 652) instanziieren und bei jedem `board.update(...)` (Zeilen 718, 799, 802, 805, 819, 1483) ebenfalls `officePanel.update(...)` aufrufen (über gemeinsamen Helper oder direkt neben `board.update`).
- Command `sessionDashboard.openOffice` registrieren, der `officePanel.show()` öffnet bzw. fokussiert.

### [Konfiguration, Tests & Paketierung]

#### [MODIFY] [package.json](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/package.json)
- `activationEvents` (Zeile 16–19) um `"onWebviewPanel:sessionDashboard.office"` ergänzen.
- `contributes.commands` um `"sessionDashboard.openOffice"` (`"Büro-Ansicht im eigenen Tab öffnen"`) ergänzen.
- `sessionDashboard.defaultTab.enum` (Zeile 1222–1231) um `"office"` erweitern, damit Nutzer das Büro bei Bedarf als Startansicht wählen können.
- `scripts.check` (Zeile 1255) um `node --check lib/officeView.js`, `node --check lib/officePanel.js` und `node test/check-office-view.js` erweitern (gemäß [`project-context.md`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/.agents/project-context.md#L20-L21)).
- Version bei Umsetzung um einen Minor-Schritt erhöhen (`0.95.0` → `0.96.0`), samt Eintrag in [`CHANGELOG.md`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/CHANGELOG.md) und Abhaken in [`TODO.md`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/TODO.md).

#### [ADD] [check-office-view.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/test/check-office-view.js)
- Unit-Tests für `lib/officeView.js`:
  - Validierung des erzeugten HTML/JS-Outputs (`new vm.Script(...)` wie in `test/check-webviews.js`).
  - Prüfung, dass `done`-Sessions standardmäßig herausgefiltert werden und `waiting`/`busy`/`bookmarked`/`idle` erhalten bleiben.
  - Prüfung der stabilen Tisch-Zuordnung über zwei Update-Zyklen hinweg (kein Platztausch bei Statuswechsel).

#### [MODIFY] [check-webviews.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/test/check-webviews.js)
- Sicherstellen, dass sowohl `BoardPanel.html()` als auch `OfficePanel.html()` inkl. eingebettetem `officeView.js`-Client-Skript fehlerfrei geparst werden.

## Verifikationsplan

### Automatisierte Tests
```powershell
cd c:\lucee\tomcat\webapps\ROOT\ai-sessions
npm run check
npm run package
```

### Manuelle Prüfung in VS Code
- Installation der gebauten `.vsix` aus `vsix/` (`code --install-extension vsix/ai-sessions-<version>.vsix`).
- Im Reiter „Sessions“ zwischen `📊 Board`, `🏢 Büro`, `📈 Analyse` und `📋 Historie` umschalten → aktive Filter und Suche bleiben konsistent, beim Verlassen von `🏢 Büro` stoppt die Canvas-Animationsschleife.
- Über den Button `↗ Popout` (oder Command `AI Sessions: Büro-Ansicht im eigenen Tab öffnen`) das `OfficePanel` öffnen, in ein neues VS-Code-Fenster auf den Zweitmonitor ziehen und prüfen, dass Live-Updates synchron zum Haupt-Board eintreffen.
- Prüfen der vier dargestellten Zustände (`waiting`, `busy`, `bookmarked`, `idle`) bei laufenden Sessions (Claude, Antigravity, Copilot, Codex, Cline) sowie Theme-Umschaltung Hell/Dunkel.
- Klick auf einen Schreibtisch (in beiden Panels) → Detailleiste erscheint; Doppelklick bzw. `💬 Chat öffnen` fokussiert die echte Session im Hauptfenster.

## Hinweise / Grenzen
- `ai-sessions` arbeitet streng lesend auf den lokalen Provider-Ordnern (`project-context.md`); aktive Subagenten werden nur dort zusätzlich dargestellt, wo das jeweilige Transkript bereits laufende Subagenten-Metadaten liefert (optionaler Folge-Schritt).
- Dieser Plan betrifft ausschließlich das eigenständige Repo `ai-sessions` und wird bei Umsetzung dort gemeinsam mit den Code-Änderungen committet.
