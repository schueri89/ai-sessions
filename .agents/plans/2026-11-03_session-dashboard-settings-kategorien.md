# Plan: Strukturierung der Einstellungen in Kategorien (v0.70.0)

## Kontext & Problemstellung
Im Session-Dashboard (`ai-sessions`) waren in `package.json` alle 50 Konfigurationsoptionen in einem einzigen flachen JSON-Objekt (`contributes.configuration` mit `"title": "Session Dashboard"`) hinterlegt.
Dies führte dazu, dass im VS-Code-Einstellungseditor (z. B. aufgerufen über das ⚙️-Zahnrad im Dashboard via `workbench.action.openSettings` `@ext:schueri.ai-sessions` oder die VS-Code-Einstellungen) alle Einstellungen ohne visuelle oder thematische Trennung auf einer einzigen langen Seite gerendert wurden.

## Maßnahmen

### 1. Strukturierung von `contributes.configuration` in 7 Kategorien (`package.json`)
VS Code unterstützt für `contributes.configuration` ein Array von Konfigurationsobjekten mit eigenem `title` und `order`.
Die 50 Einstellungen werden in 7 thematische Blöcke aufgeteilt:

1. **Allgemein** (`order: 1`):
   - `sessionDashboard.openOnStartup`
   - `sessionDashboard.autoPinTab`
   - `sessionDashboard.showLastPrompt`
   - `sessionDashboard.projectDetection`
2. **Statusleiste & Limits** (`order: 2`):
   - `sessionDashboard.statusBarClickAction`
   - `sessionDashboard.statusBarUsage`
   - `sessionDashboard.quotaWarningThreshold`
   - `sessionDashboard.quotaErrorThreshold`
3. **KI-Provider** (`order: 3`):
   - `sessionDashboard.providers.claude`
   - `sessionDashboard.providers.antigravity`
   - `sessionDashboard.providers.copilot`
   - `sessionDashboard.providers.codex`
   - `sessionDashboard.providers.cline`
4. **Sounds** (`order: 4`):
   - Master: `sessionDashboard.sound.enabled`
   - Provider: `sound.providers.*` (Claude, Antigravity, Copilot, Codex, Cline)
   - Ereignisse & Töne: `taskCompleted`, `idleReminder` (inkl. Verzögerung), `needsInput`, `limitAvailable`, `tasks`, `audits`
5. **Benachrichtigungen** (`order: 5`):
   - Master: `sessionDashboard.notifications.enabled`
   - Provider: `notifications.providers.*` (Claude, Antigravity, Copilot, Codex, Cline)
   - Ereignisse: `taskCompleted`, `needsInput`, `tasks`, `audits`
6. **Dashboard-Tabs** (`order: 6`):
   - Tasks: `tasks.enabled`, `tasks.onlyTopLevelDefault`
   - Audits: `audits.enabled`, `audits.defaultModel`
   - Logs: `logs.enabled`
7. **Integrationen** (`order: 7`):
   - JIRA: `jiraBaseUrl`
   - Jenkins: `jenkins.enabled`, `jenkins.baseUrl`, `jenkins.user`, `jenkins.jobFilter`

### 2. Test-Anpassung (`test/check-show-last-prompt.js`)
- Unterstützung sowohl für Objekt- als auch Array-Struktur von `contributes.configuration` bei der Extraktion von `properties`.

### 3. VSIX-Paketierung & Installation
- `npm run check` zur Validierung aller Module und Tests.
- `npm run package` zur Erstellung von `vsix/ai-sessions-0.70.0.vsix`.
- Automatische Installation via `code --install-extension vsix/ai-sessions-0.70.0.vsix`.
