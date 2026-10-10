# Implementierungsplan: Provider-Settings, Footer mit tools@schüri & Freitextsuche Kbd-Hint (v0.31.0)
Datum: 2026-10-10
Task-Ziel: 
1. Antigravity Sound-Hooks (.agents/hooks.json & notify-sound.ps1) komplett bereinigt (obsolet durch v0.29.0).
2. Settings: Provider-Aktivierung/Deaktivierung für Claude Code, Antigravity und Copilot (sessionDashboard.providers.*).
3. Dashboard: Freitextsuche Placeholder von "[/]" auf sauberen Text bereinigen + modernes Kbd-Badge (Taste /).
4. Webview- & Statusbar-Footer mit Hinweis auf tools@schüri und dynamischer Versionsnummer aus package.json.

## Technische Details

### 1. Sound-Hooks Bereinigung
- Entfernen von C:\lucee\tomcat\webapps\ROOT\.agents\tools\notify-sound.ps1 und C:\lucee\tomcat\webapps\ROOT\.agents\hooks.json.
- Sound-Events werden seit v0.29.0 direkt nativ in VS Code via lib/soundNotifier.js verarbeitet.

### 2. Provider-Settings (sessionDashboard.providers.*)
- package.json:
  - sessionDashboard.providers.claude (boolean, default: true)
  - sessionDashboard.providers.antigravity (boolean, default: true)
  - sessionDashboard.providers.copilot (boolean, default: true)
- lib/registry.js:
  - readSessions(enabledProviders) fragt nur aktive Provider ab.
  - watchTargets(enabledProviders) registriert nur Targets aktiver Provider.
- lib/quota.js:
  - getQuotaSummary(force, enabledProviders) überspringt Quota-Abfragen inaktiver Provider.
- lib/statusBar.js:
  - claudeItem und antigravityItem werden ausgeblendet, wenn der Provider deaktiviert ist.
  - Widget-Tooltip filtert inaktive Provider heraus.
- lib/boardPanel.js:
  - Filter-Buttons (btn-claude, btn-antigravity, btn-copilot) und Analyse-Buttons (af-claude, af-antigravity, af-copilot) werden ausgeblendet, wenn der Provider deaktiviert ist.
  - Quota-Cards inaktiver Provider werden nicht gerendert.
  - Ist der aktuelle Filter auf einen deaktivierten Provider gesetzt, erfolgt automatischer Fallback auf 'all'.
- extension.js:
  - model.getEnabledProviders() liest VS Code Konfiguration aus.
  - sessionDashboard.filter QuickPick filtert deaktivierte Provider heraus.
  - onDidChangeConfiguration reagiert auf Änderungen an sessionDashboard.providers.

### 3. Freitextsuche (Option A)
- Placeholder in lib/boardPanel.js: "Sessions suchen (Titel, Prompt, ID, Projekt)..."
- Ergänzung eines dezenten <kbd class="search-kbd">/</kbd> im Suchfeld, das bei Fokus oder Texteingabe ausgeblendet wird.
- Shortcut-Listener für / und Strg+F bleibt unverändert aktiv.

### 4. Footer mit tools@schüri & Versionsnummer
- lib/boardPanel.js:
  - Dynamisches Auslesen der Versionsnummer aus package.json.
  - Neuer <footer class="dashboard-footer">: "AI Sessions v{version} · Ein Tool von tools@schüri".
- lib/statusBar.js:
  - Tooltip am Ende mit dezenter Versionszeile: "AI Sessions v{version} · tools@schüri".
