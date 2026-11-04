# Implementierungsplan: Settings-Gruppierung nach Dashboard-Tabs & Kontext-Navigation

**Datum:** 04.11.2026  
**Ziel:** 
1. **Stufe 1 (VS-Code-Settings-Strukturierung):** Alle 50 Einstellungen in `package.json` nach den echten Reitern des Session-Dashboards und ihren Querschnittsthemen in 9 Kategorien gliedern (`Tab: Sessions`, `Tab: Tasks`, `Tab: Audits`, `Tab: Logs`, `Tab: Deploys`, `Statusleiste & Limits`, `Sounds`, `Benachrichtigungen`, `Allgemein`).
2. **Stufe 2 (Kontextuelle Tab-Settings im Dashboard):** 
   - Kontextsensitive Weiterleitung beim Klick auf das globale Zahnrad `⚙️` oben rechts im Dashboard anhand des aktuell aktiven Tabs (`currentViewMode`).
   - Direkte, dezente `⚙️ Einstellungen`-Buttons in den Toolbars der jeweiligen Tabs (`Tasks`, `Audits`, `Logs`, `Deploys`).
   - Abwärtskompatible Erweiterung des VS-Code-Commands `sessionDashboard.openSettings(target)` zur gezielten Filterung in den VS-Code-Einstellungen.

---

## 1. Ausgangslage & Motivation

- In Version `v0.70.0` wurden die Einstellungen erstmals in 7 funktionale Kategorien gegliedert.
- Dabei waren tab-spezifische Einstellungen jedoch fragmentiert: Wer z. B. den Tab „Audits“ konfigurieren wollte, musste in `Dashboard-Tabs` (Aktivierung & Modell), in `Sounds` (Audit-Sound) und in `Benachrichtigungen` (Audit-Toast) suchen. Gleiches galt für Tasks und Deploys (Jenkins).
- Der Klick auf `⚙️` im Dashboard öffnete bisher stets unselektiert die gesamte Erweiterungsseite (`@ext:schueri.ai-sessions`), ohne zu berücksichtigen, in welchem Tab sich der Benutzer gerade befindet.

---

## 2. Änderungen im Detail

### 2.1 Restrukturierung von `contributes.configuration` (`package.json`)
Die 50 Einstellungen werden in 9 geordnete Blöcke aufgeteilt:

1. **Tab: Sessions** (`order: 1`):
   - `sessionDashboard.providers.claude`
   - `sessionDashboard.providers.antigravity`
   - `sessionDashboard.providers.copilot`
   - `sessionDashboard.providers.codex`
   - `sessionDashboard.providers.cline`
   - `sessionDashboard.showLastPrompt`
   - `sessionDashboard.projectDetection`
   - `sessionDashboard.jiraBaseUrl`
2. **Tab: Tasks** (`order: 2`):
   - `sessionDashboard.tasks.enabled`
   - `sessionDashboard.tasks.onlyTopLevelDefault`
   - `sessionDashboard.sound.tasks.enabled`
   - `sessionDashboard.notifications.tasks`
3. **Tab: Audits** (`order: 3`):
   - `sessionDashboard.audits.enabled`
   - `sessionDashboard.audits.defaultModel`
   - `sessionDashboard.sound.audits.enabled`
   - `sessionDashboard.notifications.audits`
4. **Tab: Logs** (`order: 4`):
   - `sessionDashboard.logs.enabled`
5. **Tab: Deploys** (`order: 5`):
   - `sessionDashboard.jenkins.enabled`
   - `sessionDashboard.jenkins.baseUrl`
   - `sessionDashboard.jenkins.user`
   - `sessionDashboard.jenkins.jobFilter`
6. **Statusleiste & Limits** (`order: 6`):
   - `sessionDashboard.statusBarClickAction`
   - `sessionDashboard.statusBarUsage`
   - `sessionDashboard.quotaWarningThreshold`
   - `sessionDashboard.quotaErrorThreshold`
7. **Sounds** (`order: 7`):
   - `sessionDashboard.sound.enabled`
   - `sessionDashboard.sound.providers.*` (Claude, Antigravity, Copilot, Codex, Cline)
   - `sessionDashboard.sound.taskCompleted.*` (enabled, sound)
   - `sessionDashboard.sound.idleReminder.*` (enabled, sound, delaySeconds)
   - `sessionDashboard.sound.needsInput.*` (enabled, sound)
   - `sessionDashboard.sound.limitAvailable.*` (enabled, sound)
8. **Benachrichtigungen** (`order: 8`):
   - `sessionDashboard.notifications.enabled`
   - `sessionDashboard.notifications.providers.*` (Claude, Antigravity, Copilot, Codex, Cline)
   - `sessionDashboard.notifications.taskCompleted`
   - `sessionDashboard.notifications.needsInput`
9. **Allgemein** (`order: 9`):
   - `sessionDashboard.openOnStartup`
   - `sessionDashboard.autoPinTab`

### 2.2 Command `sessionDashboard.openSettings` (`extension.js`)
- Unterstützung des Parameters `target`:
  - `'tasks'`: Öffnet `sessionDashboard.tasks`
  - `'audits'`: Öffnet `sessionDashboard.audits`
  - `'logs'`: Öffnet `sessionDashboard.logs`
  - `'jenkins'` / `'deploys'`: Öffnet `sessionDashboard.jenkins`
  - `'sessions'` / `'board'` / `'history'` / `'analyse'`: Öffnet `@ext:schueri.ai-sessions`
  - Standard / kein Parameter: Öffnet `@ext:schueri.ai-sessions`

### 2.3 Kontextuelle Buttons & Webview-Logik (`lib/boardPanel.js`)
- **Globaler Button `#btn-settings`:**
  - Sendet `target: currentViewMode` bei Klick an die Extension.
  - Dynamischer Tooltip je nach aktivem Tab (`Tasks-Einstellungen öffnen`, `Audits-Einstellungen öffnen` etc.).
- **Tab-spezifische Buttons:**
  - Tasks Toolbar: Button `#tasks-settings` (`⚙️ Einstellungen`)
  - Audits Toolbar: Button `#audits-settings` (`⚙️ Einstellungen`)
  - Logs Header: Button `#logs-settings-btn` (`⚙️ Einstellungen`)
  - Jenkins Toolbar: Button `#jenkins-settings` (`⚙️ Einstellungen`)
- **Message-Handling:**
  - `msg.action === 'openSettings'` leitet `msg.target` an `vscode.commands.executeCommand('sessionDashboard.openSettings', msg.target)` weiter.

---

## 3. Betroffene Dateien

| Datei | Status | Beschreibung |
|---|---|---|
| `package.json` | MODIFY | Version auf `0.73.0`; 9 Kategorien in `contributes.configuration` nach Tabs strukturiert; Test-Script ergänzt |
| `extension.js` | MODIFY | `sessionDashboard.openSettings` um Target-Filterung erweitert |
| `lib/boardPanel.js` | MODIFY | Kontextuelle Tab-Settings-Buttons in Toolbars integriert, dyn. Tooltip für `#btn-settings`, Message-Target-Übergabe |
| `test/check-settings-categories-and-context.js` | CREATE | Validierung aller 9 Kategorien, Vollständigkeit der 50 Settings und Toolbar-Buttons |
| `CHANGELOG.md` | MODIFY | Eintrag für Version 0.73.0 |
| `TODO.md` | MODIFY | Aufgabe als erledigt markieren mit Version 0.73.0 |

