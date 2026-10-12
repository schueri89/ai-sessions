# AI Sessions: Copilot-Budget-Anzeige in der Statusleiste

**Stand:** Extension `schueri.ai-sessions` v0.42.0 · 2026-10-12

## Ausgangslage / Ursache

Claude, Antigravity und Codex haben in der Statusleiste je ein eigenes Element mit ihren Quota-Infos. Für GitHub Copilot fehlt dieses Element.

Abruf und Daten funktionieren bereits. Es fehlt ausschließlich die Anzeige in `lib/statusBar.js`.

| Schicht | Claude / Antigravity / Codex | Copilot |
|---|---|---|
| Datenabruf (`lib/quota.js`) | `fetch*Quota()` | `fetchCopilotQuota()` ist vorhanden, inkl. `premium` und `budget` |
| Board-Panel (`lib/boardPanel.js`) | Quota-Karte | Quota-Karte vorhanden, inkl. Zusatzbudget |
| QuickPick (`extension.js` ~L1210) | ja | ja (`$(copilot) X% (Monat) + Budget Y%`) |
| **Statusleiste (`lib/statusBar.js`)** | `claudeItem`, `antigravityItem`, `codexItem` mit `update*()` | **fehlt: kein `copilotItem`, kein `updateCopilot()`** |
| Klick-Befehl | `sessionDashboard.*StatusClick` | **fehlt: kein `copilotStatusClick`** |
| Hover-Tooltip bei `statusBarUsage = off` (`updateSession`) | Abschnitte für alle drei | **fehlt** |

### Nebenbefunde

- In `getQuotaSummary()` (`lib/quota.js`) richtet sich die Cache-Dauer nur nach Claude/Codex (`claude?.available || codex?.available`). Ist nur Copilot verfügbar, wird alle 10 s statt alle 45 s neu abgefragt.
- Die `enumDescriptions` von `sessionDashboard.statusBarUsage` in `package.json` erwähnen Copilot nicht.

### Datenmodell `quota.copilot` (bereits vorhanden)

```js
{
  available, needsAuth, error,
  account, apiBaseUrl, plan, tokenBasedBilling,
  premium:     { entitlement, remaining, used, creditsUsed, percent, unlimited, resetsAt,
                 overageCount, overagePermitted, overageEntitlement } | null,
  budget:      { entitlement, used, remaining, percent } | null,   // nur wenn overageEntitlement > 0
  chat, completions,                                               // gleiche Struktur wie premium
  resetsAt, resetLabel                                             // resetLabel = "TT.MM."
}
```

## Umsetzungsplan

### 1. `lib/statusBar.js`: neues Element `copilotItem`

- Im Konstruktor anlegen:
  ```js
  this.copilotItem = vscode.window.createStatusBarItem(
    'sessionDashboard.copilot', vscode.StatusBarAlignment.Right, -1004);
  this.copilotItem.name = 'GitHub Copilot Quota';
  this.copilotItem.command = 'sessionDashboard.copilotStatusClick';
  ```
- In `dispose()` aufräumen.
- Als Icon das eingebaute Codicon `$(copilot)` verwenden. Ein eigenes Icon im `icons.woff` ist nicht nötig.

### 2. `formatCopilotText(format, cp)`

Copilot hat ein Monatskontingent statt 5h/7d-Fenster. Deshalb gilt: Fenster 1 = Premium-Kontingent (`premium.percent`), Fenster 2 = Zusatzbudget (`budget.percent`).

| `statusBarUsage` | Normal | Kontingent ≥ 100 % mit Budget | Unbegrenzt |
|---|---|---|---|
| `compact` | `$(copilot) 42%` | `$(copilot) B 30%` | `$(copilot) ∞` |
| `text` | `Copilot: 42%` | `Copilot: Budget 30%` | `Copilot: ∞` |
| `5h` | `$(copilot) 42% (Monat)` | `$(copilot) 30% (Budget)` | `$(copilot) ∞` |
| `both` | `$(copilot) 42%/30%` (nur mit Budget, sonst wie `compact`) | `$(copilot) 100%/30%` | `$(copilot) ∞` |
| `detailed` | `$(copilot) 42% (Monat) · 30% (Budget)` | wie links | `$(copilot) ∞` |

- Ohne `premium.percent` und ohne Budget wird ein leerer String zurückgegeben, das Element wird dann ausgeblendet (wie bei den anderen Anbietern).

### 3. `updateCopilot(format, warnThresh, errThresh, isEnabled = true)`

- **Ausblenden**, wenn `!isEnabled`, `format === 'off'` oder `!q || !q.copilot`.
- **Sonderfall `needsAuth`:**
  - Text `$(copilot) $(key)`, Warnfarbe (`statusBarItem.warningBackground`).
  - Befehl `sessionDashboard.copilotSignIn`, Tooltip „GitHub-Zugriff für Quota-Abfrage freigeben“.
  - Sinnvoll, weil Copilot sonst ohne erkennbaren Grund unsichtbar bleibt, solange keine GitHub-Freigabe vorliegt.
  - Im Normalfall den Befehl wieder auf `sessionDashboard.copilotStatusClick` zurücksetzen.
- **Sonst ausblenden** bei `!q.copilot.available`.
- **Farbe:** Prozentwert für `applyThresholdBackground(item, pct, warnThresh, errThresh)`:
  - Budget-Prozent, wenn Kontingent ≥ 100 % und Budget vorhanden.
  - Sonst Kontingent-Prozent.
  - Kontingent aufgebraucht ohne Budget: Wert 100, also rot.
  - Unbegrenzt: `null`, keine Farbe.
- **Tooltip (`MarkdownString`, `supportThemeIcons`):**
  - Überschrift `$(copilot) **GitHub Copilot Limits**`
  - Plan (`plan`, ggf. „tokenbasiert“) und Konto (`account`)
  - Monatskontingent: `used / entitlement` + Einheit (`Credits` bei `tokenBasedBilling`, sonst `Requests`), Prozent, `Reset <resetLabel>`
  - Zusatzbudget (falls `budget`): `used / entitlement`, Prozent
  - Optional `chat` und `completions`, wenn begrenzt (`!unlimited && percent !== null`)
  - Fußzeile: „Klicken, um Copilot-Sessions anzuzeigen“
  - Zahlen mit `toLocaleString('de-DE')` formatieren (wie im Board-Panel)

### 4. `update()` und `updateSession()` in `lib/statusBar.js`

- `copilotEnabled = pConfig.get('copilot', true)` lesen.
- `this.updateCopilot(format, warnThresh, errThresh, copilotEnabled)` aufrufen.
- `updateSession(...)` um den Parameter `copilotEnabled` erweitern und den Abschnitt „GitHub Copilot“ in den Hover-Tooltip aufnehmen (gilt für den Modus `statusBarUsage = off`). Dabei die gleichen Inhalte wie in Punkt 3 in Kurzform verwenden.

### 5. `extension.js`

- `sessionDashboard.copilotStatusClick` registrieren. Das Muster ist identisch zu `codexStatusClick` (~L1172):
  ```js
  vscode.commands.registerCommand('sessionDashboard.copilotStatusClick', async () => {
    const next = model.providerFilter === 'copilot' ? 'all' : 'copilot';
    await model.setFilter(next);
    await update(true);
    const action = vscode.workspace.getConfiguration('sessionDashboard').get('statusBarClickAction', 'board');
    if (action === 'quickpick') {
      return vscode.commands.executeCommand('sessionDashboard.quickMenu');
    }
    return vscode.commands.executeCommand('sessionDashboard.showBoard');
  }),
  ```
- Im Befehl `sessionDashboard.copilotSignIn` (~L809) prüfen, ob nach `getQuotaSummary(true, ...)` auch `update(true)` aufgerufen wird, damit das Element nach der Freigabe sofort erscheint.

### 6. `package.json`

- Befehl `sessionDashboard.copilotStatusClick` unter `contributes.commands` eintragen (analog zu `codexStatusClick`, inkl. gleicher Ausblendung in der Befehlspalette, falls dort vorhanden).
- Die `enumDescriptions` von `sessionDashboard.statusBarUsage` um das Copilot-Format ergänzen, z. B.:
  - `compact`: `… · $(copilot) M%`
  - `5h`: `… · $(copilot) M% (Monat)`
  - `both`: `… · $(copilot) M%/B%`
  - `detailed`: `… · $(copilot) M% (Monat) · B% (Budget)`

### 7. `lib/quota.js` (Nebenbefund)

Cache-Dauer korrigieren:

```js
const ttl = (cachedSummary && (cachedSummary.claude?.available || cachedSummary.codex?.available || cachedSummary.copilot?.available)) ? CACHE_TTL_MS : 10000;
```

## Test / Abnahme

| # | Fall | Erwartung |
|---|---|---|
| 1 | Kontingent < 75 % | `$(copilot) X%`, keine Farbe |
| 2 | Kontingent 75–94 % | gelb hinterlegt |
| 3 | Kontingent ≥ 95 % | rot hinterlegt |
| 4 | Kontingent 100 % mit Budget | Budget-Prozent wird angezeigt, Farbe nach Budget-Prozent |
| 5 | Kontingent 100 % ohne Budget | rot |
| 6 | `premium.unlimited` | `$(copilot) ∞`, keine Farbe |
| 7 | `needsAuth` (keine GitHub-Freigabe) | `$(copilot) $(key)`, gelb, Klick startet Anmeldung, danach erscheint die Quota sofort |
| 8 | API-Fehler ohne vorherigen Erfolg | Element ausgeblendet |
| 9 | `sessionDashboard.providers.copilot = false` | Element ausgeblendet, auch nicht im Hover-Tooltip |
| 10 | Alle sechs `statusBarUsage`-Formate | Text gemäß Tabelle in Punkt 2, bei `off` nur im Hover-Tooltip des Session-Elements |
| 11 | Klick auf Element | Filter `copilot` umschalten, Board bzw. QuickPick öffnen |
| 12 | Tooltip | Plan, Konto, Kontingent mit Reset-Datum, Zusatzbudget korrekt |

- `npm run check` laufen lassen (Syntaxprüfung).
- Paket mit neuer Version bauen (z. B. 0.43.0).

## Betroffene Dateien

| Datei | Umfang |
|---|---|
| `lib/statusBar.js` | Hauptteil: neues Element, Formatierung, Update, Tooltip |
| `extension.js` | 1 neuer Befehl, ggf. `update(true)` nach Sign-In |
| `package.json` | 1 Befehl, angepasste `enumDescriptions` |
| `lib/quota.js` | 1 Zeile (Cache-Dauer) |
