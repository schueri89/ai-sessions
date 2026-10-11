# Plan: OpenAI Codex Quota & Limits Integration (v0.41.0)

Extension: `schueri.session-dashboard` (AI Sessions)  
Geplante Version: `0.41.0`  
Datum: `11.10.2026`  

---

## 1. Ausgangslage & Ziel

Nach der erfolgreichen Provider-Integration von OpenAI Codex (v0.40.0) und der Härtung der Session-Zeitstempel (v0.40.2) soll OpenAI Codex nun gleichwertig zu **Claude Code** und **Google Antigravity** in das Quota- & Limit-Tracking aufgenommen werden.

Die Live-Untersuchung der OpenAI Codex Schnittstelle hat ergeben, dass OpenAI über die interne Usage-API (`https://chatgpt.com/backend-api/wham/usage`) mit dem in `~/.codex/auth.json` abgelegten OAuth-Bearer-Token exakte Verbrauchsdaten bereitstellt. Diese entsprechen strukturell verblüffend genau dem Limit-Modell von Anthropic Claude:
- **5-Stunden-Fenster (`primary_window`)**: Limit-Fenster 18.000 s (5 h), `used_percent`, `reset_at` (Unix-Timestamp), `reset_after_seconds`.
- **7-Tage-Fenster (`secondary_window`)**: Limit-Fenster 604.800 s (7 d), `used_percent`, `reset_at` (Unix-Timestamp), `reset_after_seconds`.
- **Abo-Modell (`plan_type`)**: z. B. `"plus"`, `"pro"`, `"team"`, `"enterprise"`.
- **Zusatzguthaben (`credits`)**: `has_credits`, `balance`, `unlimited`.

### Ziele
1. **Quota-Kachel im Dashboard**: Neben Claude Code, Antigravity und Copilot erhält Codex eine eigene Karte im Quota-Strip mit 5h- und 7d-Balken, Reset-Uhrzeiten und Plan-Pill.
2. **Statusleisten-Widget**: Optionales Statusleisten-Element (`compact`, `detailed`, `off`) mit Klick-Kommando `sessionDashboard.codexStatusClick`.
3. **Session-Statusleiste Tooltip & QuickMenu**: Anzeige der aktuellen Codex-Auslastung im Tooltip und Menü.
4. **Reaktive Updates**: Einbindung in die Change-Signatur von `SessionModel.refresh()`, sodass sich Dashboard und Statusleiste bei Quota-Änderungen automatisch aktualisieren.

---

## 2. Betroffene Komponenten & Dateien

| Datei | Geplante Änderungen |
|---|---|
| `lib/quota.js` | `fetchCodexQuota()` implementieren, `lastSuccessfulCodex`-Cache, Einbindung in `getQuotaSummary()`, Export. |
| `lib/boardPanel.js` | `updateQuotaUI()` um `showCodex` und Kachel-Rendering (`quota-card quota-codex`) erweitern. Filter- und Provider-Berücksichtigung. |
| `lib/statusBar.js` | Neues Statusleisten-Widget `sessionDashboard.codex` (Prio -1003), `updateCodex()`, `formatCodexText()`, Tooltip-Erweiterung. |
| `extension.js` | Command `sessionDashboard.codexStatusClick` registrieren, `quickMenu` erweitern, `model.refresh()` Change-Signatur ergänzen. |
| `package.json` | Konfiguration `sessionDashboard.statusBar.codexUsage` (`compact`, `detailed`, `off`), Command `sessionDashboard.codexStatusClick`, Versionserhöhung auf `0.41.0`. |
| `TODO.md` | Eintrag unter Vorhaben für Version 0.41.0 pflegen. |

---

## 3. Detail-Architektur & Ablauf

### 3.1 Quota-Abruf (`lib/quota.js`)

1. **Credentials & Token**:
   - Pfad: `~/.codex/auth.json` (respektiert `CODEX_CONFIG_DIR`).
   - Prüfung auf Vorhandensein und Lesbarkeit.
   - Auslesen von `tokens.access_token`.
   - Prüfung des JWT-Ablaufs (`exp`): Falls abgelaufen oder kurz vor Ablauf (< 60 s), Datei frisch von der Festplatte neu einlesen (da die Codex-Hintergrund-Binary Tokens automatisch erneuert).
2. **API-Request**:
   - Endpoint: `https://chatgpt.com/backend-api/wham/usage`
   - Methode: `GET`
   - Headers:
     - `Authorization: Bearer <tokens.access_token>`
     - `OAI-App-Brand: chatgpt`
     - `x-openai-codex-pricing-chooser: 1`
     - `User-Agent: session-dashboard`
   - Timeout: 5.000 ms via `AbortSignal.timeout(5000)`.
   - Bei Fetch-Fehler: Fallback auf `curl.exe` (analog zu Claude) und bei transienten Netzwerkproblemen auf `lastSuccessfulCodex`.
3. **Daten-Normalisierung**:
   - `plan`: Formatierter Plan-Name (z. B. `"Plus"`, `"Pro"`).
   - `fiveHour`: `{ percent: data.rate_limit.primary_window.used_percent, resetsAt: reset_at * 1000, resetLabel: formatResetTime(...) }`.
   - `sevenDay`: `{ percent: data.rate_limit.secondary_window.used_percent, resetsAt: reset_at * 1000, resetLabel: formatResetTime(...) }`.
   - `credits`: `{ hasCredits: data.credits.has_credits, balance: data.credits.balance }`.
4. **Integration in `getQuotaSummary(force, enabledProviders)`**:
   - `const codexEnabled = enabledProviders.codex !== false;`
   - `fetchCodexQuota()` parallel via `Promise.allSettled()` abrufen.
   - Aufnahme ins Ergebnisobjekt `cachedSummary.codex`.

### 3.2 Dashboard Quota-Strip (`lib/boardPanel.js`)

1. **Bedingung für Anzeige**:
   ```javascript
   const showCodex = (!filter || filter === 'all' || filter === 'codex') &&
     currentEnabledProviders.codex !== false &&
     quota.codex && (quota.codex.available || quota.codex.error);
   ```
2. **Rendering der Kachel**:
   - Container: `quota-card quota-codex`
   - Header:
     - Provider-Icon: `ICONS.codex` + Text `OpenAI Codex`
     - Status-Pill: `Plus` (oder `Pro`) mit Farbklasse (`status-ok`, `status-warn`, `status-danger` je nach Maximalwert von 5h/7d).
   - Meter 1 (`5h-Limit`):
     - Wert in `%` mit Level-Klasse (`level-ok`, `level-warn`, `level-danger`).
     - Fortschrittsbalken (`quota-progress-track` / `quota-progress-fill`).
     - Subtext: `Reset <Uhrzeit>` (z. B. "Reset 20:51 Uhr").
   - Meter 2 (`7d-Woche`):
     - Wert in `%` mit Level-Klasse.
     - Fortschrittsbalken.
     - Subtext: `Reset <Wochentag Uhrzeit>` (z. B. "Reset Sa 20:51 Uhr").
   - Optional Meter 3 (Credits / Zusatzguthaben):
     - Falls `credits.hasCredits` oder `balance !== "0"`, zusätzliche Zeile für verbleibendes Guthaben.

### 3.3 Statusleisten-Widget (`lib/statusBar.js`)

1. **Initialisierung im Konstruktor**:
   - `this.codexItem = vscode.window.createStatusBarItem('sessionDashboard.codex', vscode.StatusBarAlignment.Right, -1003);`
   - Command: `sessionDashboard.codexStatusClick`.
2. **Formatierung & Anzeige (`updateCodex`)**:
   - Formate: `compact` (z. B. `$(dashboard-codex) 1%`), `detailed` (z. B. `$(dashboard-codex) 1% · 0%`), `off`.
   - Hintergrundfarbe bei Überschreiten von `quotaWarningThreshold` (75 %) oder `quotaErrorThreshold` (95 %).
   - Tooltip mit Markdown-Übersicht beider Fenster und Reset-Zeiten.
3. **Session-Statusleiste Tooltip**:
   - Wenn `codexEnabled && q.codex && q.codex.available`, Ergänzung im Haupt-Tooltip:
     - `$(dashboard-codex) **OpenAI Codex Limits:**`
     - `⚡ **5-Std.-Limit:** X% (Reset ...)`
     - `📅 **7-Tage-Limit:** Y% (Reset ...)`

### 3.4 Commands & QuickMenu (`extension.js`)

1. **Command `sessionDashboard.codexStatusClick`**:
   - Schaltet den Provider-Filter zwischen `codex` und `all` um und fokussiert das Board (oder QuickPick je nach `statusBarClickAction`).
2. **QuickMenu**:
   - Ergänzt `qParts` um Codex: `$(dashboard-codex) ${q.codex.fiveHour.percent}% (5h)`.
3. **Change-Signatur in `model.refresh()`**:
   - Ergänzung um `[this.quota.codex.fiveHour?.percent, this.quota.codex.sevenDay?.percent]`.

---

## 4. Test- & Verifikationsplan

1. **Syntax- & Konsistenzprüfung**:
   - `npm run check` über alle Module.
2. **Funktionsprüfung Quota-Fetch**:
   - Node-Aufruf gegen `fetchCodexQuota()` zur Verifikation des HTTP-Calls und JSON-Mappings.
3. **UI-Verifikation**:
   - Paketierung via `npm run package` nach `vsix/ai-sessions-0.41.0.vsix`.
   - Installation via `code --install-extension`.
   - Prüfung im Dashboard: Quota-Strip zeigt alle aktiven Provider inklusive Codex; Klick auf Codex-Filter zeigt nur die Codex-Kachel.
   - Prüfung in der Statusleiste: Eigenes Codex-Widget zeigt Auslastung an und reagiert auf Klicks.

