# Implementierungsplan: Getrennte Statusleisten-Items für Claude Code & Antigravity mit gelb/rotem Hintergrund

Datum: 04.10.2026  
Task-Ziel: Status Bar trennt Usage-Informationen für Claude Code und Google Antigravity in eigenständige Statusleisten-Items auf und hebt hohe Quota-Auslastungen mit gelbem bzw. rotem Hintergrund hervor.

---

## Technische Grundlage

1. **Getrennte `vscode.StatusBarItem`s (`lib/statusBar.js`)**:
   - Statt eines einzigen kombinierten Statusleisten-Widgets werden drei dedizierte Statusleisten-Elemente verwaltet:
     1. `sessionDashboard.status` (Priority 100): Session-Zähler (`🤖 X arbeitet · Y wartet · Z fertig`).
     2. `sessionDashboard.claude` (Priority 99): Claude Code Quota (`$(dashboard-claude) 100%`).
     3. `sessionDashboard.antigravity` (Priority 98): Antigravity Quota (`$(dashboard-antigravity) 66%`).
   - Durch die absteigenden Prioritäten bei `StatusBarAlignment.Right` erscheinen sie nebeneinander in stabiler Reihenfolge:
     `[ 🤖 Sessions ]  [ $(dashboard-claude) Usage ]  [ $(dashboard-antigravity) Usage ]`.

2. **Farbliche Hintergründe via `vscode.ThemeColor`**:
   - Die VS Code API unterstützt auf Statusleisten-Items zwei offizielle Hintergrundfarben:
     - `statusBarItem.warningBackground` (Gelb/Orange)
     - `statusBarItem.errorBackground` (Rot)
   - Da `backgroundColor` das gesamte Element einfärbt, ermöglicht die Aufteilung in getrennte Items, dass Claude Code und Antigravity völlig unabhängig voneinander gefärbt werden können (z. B. Claude rot bei 95+ %, Antigravity normal bei 40 %).

3. **Schwellenwerte & Kriterien**:
   - **Claude Code**:
     - Normal (`< 80 %`): Kein Hintergrund.
     - Warnung (`80 % – 94 %`): Gelber Hintergrund (`statusBarItem.warningBackground`).
     - Kritisch (`≥ 95 %`): Roter Hintergrund (`statusBarItem.errorBackground`).
     - Basis ist der Maximalwert aus 5-Stunden- und 7-Tage-Limit (`Math.max(5h, 7d)`).
   - **Google Antigravity**:
     - Normal (`< 80 %`): Kein Hintergrund.
     - Warnung (`80 % – 94 %`): Gelber Hintergrund.
     - Kritisch (`≥ 95 %` oder Rate-Limit `isRateLimited` / 429): Roter Hintergrund.
   - Konfigurierbarkeit in `package.json`:
     - `sessionDashboard.quotaWarningThreshold` (Standard: 80)
     - `sessionDashboard.quotaErrorThreshold` (Standard: 95)

4. **Dedizierte Tooltips & Klick-Aktionen**:
   - Klick auf Claude-Item: Filtert zu Claude Code (`model.setFilter('claude')`) und öffnet das Dashboard.
   - Klick auf Antigravity-Item: Filtert zu Google Antigravity (`model.setFilter('antigravity')`) und öffnet das Dashboard.
   - Klick auf Session-Item: Gewohnte konfigurierbare Aktion (`statusBarClickAction`).
   - Jeder Tooltip ist auf den jeweiligen Provider fokussiert (inkl. Resets & Tokens).

---

## Vorgeschlagene Änderungen

### [Statusleisten-Modul]

#### [MODIFY] [lib/statusBar.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/statusBar.js)
- Refactoring von `StatusBarWidget`:
  - Erzeugt `sessionItem`, `claudeItem`, `antigravityItem`.
  - Methoden `updateSessionItem()`, `updateClaudeItem(config)`, `updateAntigravityItem(config)`.
  - Farbzuweisung via `warningBackground` und `errorBackground` abhängig von Schwellenwerten und Rate-Limits.
  - Dynamisches `.show()` und `.hide()` je nach Verfügbarkeit der Provider und Einstellung `statusBarUsage`.
  - Saubere Entsorgung aller 3 Items in `dispose()`.

### [Extension & Befehle]

#### [MODIFY] [extension.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/extension.js)
- Registrierung der neuen Klick-Befehle:
  - `sessionDashboard.claudeStatusClick`
  - `sessionDashboard.antigravityStatusClick`

### [Konfiguration & Metadaten]

#### [MODIFY] [package.json](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/package.json)
- Versionssprung auf `0.21.0`.
- Neue Konfigurationsoptionen:
  - `sessionDashboard.quotaWarningThreshold` (Standard: 80)
  - `sessionDashboard.quotaErrorThreshold` (Standard: 95)
- Neue Commands deklarieren:
  - `sessionDashboard.claudeStatusClick`
  - `sessionDashboard.antigravityStatusClick`

#### [MODIFY] [TODO.md](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/TODO.md)
- Aufgabe als erledigt abhaken und Plan referenzieren.

---

## Verifikationsplan

### Automatisierte Tests & Syntax-Check
```powershell
npm run check
```

### Manuelle Prüfung
1. **Extension paketieren & installieren**:
   - `npm run package`
   - `code --install-extension session-dashboard-0.21.0.vsix --force`
2. **Statusleiste visuell prüfen**:
   - Sessions, Claude Code und Antigravity erscheinen als getrennte Elemente nebeneinander.
   - Wenn Claude bei 100 % ist -> Claude-Item hat roten Hintergrund.
   - Wenn Antigravity bei z. B. 66 % ist -> Antigravity-Item hat normalen Hintergrund.
   - Klick auf Claude-Item filtert Dashboard auf Claude.
   - Klick auf Antigravity-Item filtert Dashboard auf Antigravity.
   - Tooltips zeigen provider-spezifische Detail-Daten.

---

### Hotfix v0.21.1: Positionierung ganz rechts ohne Durchmischung mit anderen Extensions
- **Problem**: Bei Prioritäten im positiven Bereich (100, 99, 98) mischten sich andere Extensions (wie Git, Prettier, Spracheinstellungen) zwischen die drei Elemente, und die Gruppe lag zu weit mittig.
- **Lösung**: Umstellung auf aufeinanderfolgende negative Prioritäten:
  - `sessionDashboard.status`: `-1000` (am weitesten links des Trios)
  - `sessionDashboard.claude`: `-1001` (mittig)
  - `sessionDashboard.antigravity`: `-1002` (ganz rechts)
- Dadurch wandert das gesamte Trio an den rechten Rand der Statusleiste und bleibt lückenlos zusammenhängend.
