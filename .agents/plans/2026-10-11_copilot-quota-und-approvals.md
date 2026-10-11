# Plan: GitHub Copilot Quota, Zusatzbudget und Freigaben-Statistik

Extension: `schueri.session-dashboard` (AI Sessions)
Version: 0.34.0
Betroffene Dateien:
- `lib/quota.js` (Copilot Quota Fetcher & Token Provider)
- `extension.js` (GitHub Auth Resolution, Token Provider, Commands, QuickMenu, Change-Signatur)
- `lib/boardPanel.js` (Quota Card im Board, Freigaben-Statistik-Karte im Analyse-Tab, Tabellenspalte)
- `lib/analytics.js` (ToolConfirmKind Auswertung, ToolCall-Deduplizierung, Command Extraction)
- `package.json` (Version 0.34.0, contributes.commands)
- `TODO.md` (Status & Changelog)

---

## 1. Feature: Copilot-Verbrauch & Zusatzbudget im Dashboard

### Ziel
Analog zu Claude Code (5h/7d) und Google Antigravity zeigt das Board eine Quota-Kachel für GitHub Copilot:
- **Monatskontingent**: Premium-Requests oder Credits (bei tokenbasierter Abrechnung), in %, genutzt/Kontingent und Reset-Datum.
- **Zusatzbudget** („Additional Budget“): genutzt/Budget, Rest und %.
- **Enterprise-Unterstützung**: Erkennt automatisch GHE (`*.ghe.com`, z. B. `ehoide.ghe.com` oder GHE Server) und nutzt den passenden Auth-Provider sowie die korrekte API-Basis.
- **Provider-Settings**: Berücksichtigt `aiSessions.providers.copilot` (aktiviert/deaktiviert).

### Umsetzung Quota
1. **`lib/quota.js`**:
   - `setCopilotTokenProvider(fn)` zum Injizieren des Token-Providers aus `extension.js`.
   - `toCopilotBucket(s)` zum Normalisieren von Snapshots (`premium_interactions` / `premium_models`, `chat`, `completions`). Ignoriert Buckets mit `entitlement === 0` bei begrenzten Kontingenten.
   - `fetchCopilotQuota()` ruft `${apiBaseUrl}/copilot_internal/user` per HTTPS ab.
   - `getQuotaSummary(force, enabledProviders)` ruft Copilot parallel zu Claude und Antigravity ab, sofern `enabledProviders.copilot !== false`.
   - Exportiert `fetchCopilotQuota`, `setCopilotTokenProvider`.

2. **`extension.js`**:
   - `resolveGitHubAuth()` ermittelt Auth-Provider (`github` vs. `github-enterprise`) und API-Basis (`api.github.com`, `api.<name>.ghe.com`, `<origin>/api/v3`).
   - `setCopilotTokenProvider()` liest die Session mit Scope `['user:email']` (`silent: true`).
   - `onDidChangeSessions` lauscht auf Änderungen am ermittelten Provider.
   - Command `sessionDashboard.copilotSignIn` registrieren.
   - `SessionModel.refresh()` nimmt Copilot-Daten in die Change-Signatur auf.
   - `quickMenu` zeigt Copilot-Auslastung an.

3. **`lib/boardPanel.js`**:
   - Webview-Message `copilotSignIn` verarbeiten.
   - CSS-Klasse `.quota-provider.copilot`.
   - In `updateQuotaUI()` Quota-Kachel mit Kontingent, Zusatzbudget und Status-Pills rendern (unter Berücksichtigung von Fehlerzuständen und `needsAuth`).

---

## 2. Feature: Freigaben-Statistik (Approve) & ToolCall-Deduplizierung

### Ziel
In „Analyse & Verbrauch“ sichtbar machen, wie oft Tool-Aufrufe (Terminal, Dateioperationen etc.) manuell bestätigt wurden, und die häufigsten Terminal-Befehle auflisten (Kandidaten für `chat.tools.terminal.autoApprove`).

### Umsetzung Analytics
1. **`lib/analytics.js`**:
   - `ToolConfirmKind`: 0 Denied, 1 ConfirmationNotNeeded, 2 Setting, 3 LmServicePerTool (Gemerkt), 4 UserAction (Manuell), 5 Skipped.
   - `terminalCommandKey(toolSpecificData)` extrahiert das ausführende Programm (z. B. `git`, `node`, `get-childitem`).
   - Deduplizierung per `toolCallId` im JSONL-Mutationslog in `collectRawTurns()`.
   - `aggregateScope()` sammelt `approvals` (manual, remembered, setting, notNeeded, denied, skipped, topTools, topCommands) und berechnet `manualApprovals` für Timeline-Slots und Projekte.

2. **`lib/boardPanel.js`**:
   - Analyse-Tab: Neue Karte `Freigaben (Approve) · GitHub Copilot` mit Anteil-Balken, Legende, Top-Tools, Top-Befehlen und Verlaufsbalken.
   - Projekt-Tabelle: Neue Spalte `Freigaben`.

