# Implementierungsplan: Permanente Quota- & Usage-Anzeige in der Footerbar (Statusleiste)
Datum: 04.10.2026
Task-Ziel: Usage von Claude Code und Google Antigravity in der Footerbar (Statusleiste) dauerhaft anzeigen, nicht erst beim Hovern über das Widget.

Dieses Dokument beschreibt die Konzeption und Umsetzung der dauerhaften Quota- & Usage-Anzeige im VS-Code-Dashboard `session-dashboard`.

## Technische Grundlage (verifiziert)

1. **Statusleisten-Widget (`lib/statusBar.js`)**:
   - `StatusBarWidget.update()` berechnete bisher nur die Session-Aktivitäten (`🤖 X arbeitet · Y wartet · Z fertig`).
   - Die Quota- und Limitdaten aus `model.quota` (Claude Code 5h/7d-Limits sowie Antigravity Gemini Live-Limits und Rolling-Tokens) wurden ausschließlich im Hover-Tooltip (`this.item.tooltip`) als Markdown gerendert.
   - Durch Trennung via Trennzeichen (` | `) können Task-Status und Provider-Auslastung (`Claude: 100% · AG: 65%`) kompakt nebeneinander in `this.item.text` platziert werden.

2. **Claude Code Quota-Abruf (`lib/quota.js`)**:
   - Der Anthropic OAuth-Usage-Endpoint (`https://api.anthropic.com/api/oauth/usage`) wird über Cloudflare geschützt. Node.js `fetch` ohne expliziten `User-Agent` wurde teilweise mit HTTP 429 blockiert.
   - Mit `User-Agent: claude-code/0.2.29` antwortet die API stabil in <200 ms mit den echten Prozentwerten (5h: 100%, 7d: 83%).
   - Caching der letzten erfolgreichen Antwort (`lastSuccessfulClaude`) verhindert, dass temporäre Netzwerkfehler oder Rate-Limits die Anzeige leeren.

3. **Antigravity Quota-Abruf (`lib/quota.js`)**:
   - Über den Antigravity Language Server Hub (`agy.exe --hub`) liefert Connect RPC `RetrieveUserQuotaSummary` in Echtzeit die prozentuale Auslastung von `Gemini Models` (5h und wöchentlich) sowie Fallback-Rolling-Tokens (`tokens5h`, `tokens7d`).

4. **Dashboard-Icons als Vektor-Schriftart (`resources/icons.woff`)**:
   - Da die native VS-Code-Statusleiste kein HTML/SVG direkt rendern kann, wurden die Original-Vektorgrafiken von Claude Code und Google Antigravity aus dem Dashboard in einen dedizierten WOFF-Icon-Font kompiliert.
   - Über `contributes.icons` in `package.json` stehen `$(claude)` und `$(antigravity)` in der gesamten VS-Code-Oberfläche (Statusleiste, QuickPicks, Menüs) zur Verfügung.
   - Anzeige in der Statusleiste: `🤖 1 arbeitet | $(claude) 100% · $(antigravity) 66%`.

5. **Konfigurierbarkeit (`package.json`)**:
   - Setting `sessionDashboard.statusBarUsage`:
     - `compact` (Standard): `$(claude) 100% · $(antigravity) 66%`
     - `text`: `Claude: 100% · AG: 66%`
     - `5h`: `$(claude) 100% (5h) · $(antigravity) 66% (5h)`
     - `both`: `$(claude) 100%/83% · $(antigravity) 66%/56%`
     - `detailed`: `$(claude) 100% (5h) · 83% (7d) · $(antigravity) 66% (5h) · 56% (7d)`
     - `off`: Nur Sessions, Usage wie bisher im Tooltip.

## Vorgeschlagene Änderungen

### [Icon-Font & Ressourcen]

#### [ADD] [resources/icons.woff](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/resources/icons.woff)
- Kompilierter WOFF-Icon-Font mit Glyphen für `claude` (`\uea02`) und `antigravity` (`\uea01`).

### [Quota-Modul]

#### [MODIFY] [lib/quota.js](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/lib/quota.js)
- `User-Agent: claude-code/0.2.29` für `fetch` und `curl.exe` setzen.
- `lastSuccessfulClaude` Caching implementieren.
- Fehlerprüfung auf `data.error` bei der JSON-Rückgabe.

### [Statusleisten-Widget]

#### [MODIFY] [lib/statusBar.js](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/lib/statusBar.js)
- Methode `formatUsage(format)` ergänzen, die standardmäßig `$(claude)` und `$(antigravity)` Icons verwendet (oder Text bei Option `text`).
- `update()`: `this.item.text` kombiniert Session-Teil und Quota-Icons:
  - Z. B. `🤖 1 arbeitet | $(claude) 100% · $(antigravity) 66%`.
- Tooltip-Abschnitte mit den Icons versehen.

### [Extension & Reaktivität]

#### [MODIFY] [extension.js](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/extension.js)
- In `model.refresh()`: Antigravity Live-Quota in `signature` aufnehmen.
- `onDidChangeConfiguration` registrieren für `sessionDashboard.statusBarUsage`.
- `sessionDashboard.filter` und `quickMenu`: Provider mit `$(claude)` und `$(antigravity)` Icons versehen.

### [Konfiguration & Metadaten]

#### [MODIFY] [package.json](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/package.json)
- Versionssprung auf `0.19.0`.
- `contributes.icons`: `claude` und `antigravity` mit Pfad zu `resources/icons.woff`.
- Konfigurationseigenschaft `sessionDashboard.statusBarUsage` um `text` ergänzt.

#### [MODIFY] [TODO.md](file:///c:/lucee/tomcat/webapps/ROOT/tools/TODO.md)
- Aufgabe als erledigt markieren.

## Verifikationsplan

### Automatisierte Tests & Syntax-Check
```powershell
npm run check
```
- Eigener Formatierungs- und Logik-Test via Node-Skript.

### Manuelle Prüfung
1. **Extension paketieren & installieren**:
   - `npm run package`
   - `code --install-extension session-dashboard-0.19.1.vsix --force`
2. **Statusleiste prüfen**:
   - Dauerhafte Anzeige von `$(dashboard-claude) 100% · $(dashboard-antigravity) 82%` in der Footerbar sichtbar (ohne Hovern).
   - Bei aktiven Tasks z. B. `🤖 1 arbeitet | $(dashboard-claude) 100% · $(dashboard-antigravity) 82%`.
   - Hovern zeigt weiterhin ausführlichen Tooltip mit Reset-Uhrzeiten und Tokenzahlen.
   - Umschalten von `sessionDashboard.statusBarUsage` in den VS-Code-Einstellungen (z. B. auf `both` oder `5h`) aktualisiert die Leiste unmittelbar.

### Hotfix v0.19.1: VS Code Icon ID Hyphen Requirement & Glyph Rescaling
- **Ursache Icon-Fehlen**: VS Code verlangt für `contributes.icons` zwingend mindestens zwei Segmente getrennt durch Bindestrich (`^[A-Za-z0-9]+(-[A-Za-z0-9]+)+$`). Ungehyphte IDs wie `claude` und `antigravity` wurden vom internen Registry-Handler stillschweigend mit Fehler 25869 verworfen.
- **Lösung**: Umbenennung zu `dashboard-claude` und `dashboard-antigravity`.
- **Glyph-Skalierung**: Die Bounding Box von Antigravity im SVG-Font wurde exakt auf die Pfadgrenzen zugeschnitten, sodass das Symbol bei 16px exakt die optische Höhe und Strichstärke des Claude-Sonnenstrahls besitzt.
