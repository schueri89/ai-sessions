# Implementierungsplan: JIRA auf Dashboard, Deploy-Tab steuern & Quota-Status „Voll“

Datum: 2026-10-16  
Version: v0.51.0  

## Ausgangslage & Anforderungen

1. **JIRA auf dem Dashboard:**
   - Auf den Kanban-Karten des Dashboards fehlte eine Möglichkeit, ohne Umweg über die Historie ein JIRA-Ticket zuzuweisen.
   - War ein Ticket vorhanden, öffnete der Klick lediglich den Browser, ohne Option zum Bearbeiten oder Löschen.
   - Es fehlte eine klare Anleitung/Hinweis, wie ein zugewiesenes Ticket wieder entfernt werden kann (Eingabe leeren).

2. **Deploy-Tab steuerbar machen:**
   - Der Jenkins-Deploy-Tab war seit v0.46.1 mit einem inaktiven „Coming Soon“-Badge belegt und fest im Header verankert.
   - Der Tab soll über die Einstellungen (`sessionDashboard.jenkins.enabled`) ein- und ausschaltbar sein.

3. **Quota-Status-Badge bei 100%:**
   - Erreichte ein Kontingent oder Budget (z. B. Gemini 4 Argon) 100%, zeigte der Status-Pill im Kopf der Quota-Kachel weiterhin „Fast voll“ an, da die Bedingung lediglich `maxPct >= 85` prüfte.
   - Bei 100% soll die Badge präzise „Voll“ bzw. „Budget aufgebraucht“ signalisieren.

---

## Umgesetzte Änderungen

### 1. JIRA-Button & Löschhinweis auf dem Dashboard (`lib/boardPanel.js`, `extension.js`)
- **Dashboard-Karten:**
  - `card-meta` wird auf jeder Karte gerendert.
  - Wenn kein Ticket vorhanden: Anzeige eines dezenten Buttons `.card-jira-add-btn` mit JIRA-Icon und Beschriftung `+ JIRA` (Klick ruft `assignTicket` auf).
  - Wenn Ticket zugewiesen: Anzeige der `.card-jira-pill` (Klick = Browserlink, Shift-/Alt-Klick = Bearbeiten) sowie zweier Aktions-Icons:
    - `✏️` zum Bearbeiten/Ändern (`assignTicket`).
    - `🗑️` zum direkten Entfernen/Löschen (`removeTicket`).
- **Suchfunktion:** `matchesSession` bezieht `s.ticket` in den Such-Haystack ein.
- **Löschhinweis in Dialog & Tooltips:**
  - `extension.js` (`sessionDashboard.assignTicket`): InputBox zeigt bei bestehendem Ticket den Titel `JIRA-Ticket für „...“ ändern / löschen` und den klaren Prompt `Ticket-Key eingeben (z. B. PROJ-123). Um das Ticket „...“ zu entfernen, Text komplett leeren und Enter drücken.`.
  - Tooltips auf Dashboard-Karten und in der Historientabelle weisen auf Shift-Klick und das Leeren des Felds hin.

### 2. Deploy-Tab steuerbar machen (`package.json`, `lib/boardPanel.js`, `extension.js`)
- **Einstellung:** `sessionDashboard.jenkins.enabled` (Boolean, Standard: `false`).
- **Sichtbarkeit:**
  - `BoardPanel.html()` und `BoardPanel.render()` prüfen die Einstellung.
  - `#btn-mode-jenkins` wird bei `false` ausgeblendet (`display: none;`), bei `true` als aktiver Tab gerendert.
  - `getViewModes()` liefert `jenkins` nur bei aktivierter Einstellung zurück.
  - Reaktive Umschaltung über `onJenkinsConfigChanged` und `onDidChangeConfiguration`.
- **Command `sessionDashboard.showJenkins`:**
  - Informiert bei deaktivierter Einstellung und bietet an, den Tab mit 1 Klick zu aktivieren oder die Settings zu öffnen.

### 3. Quota-Badge bei 100% (`lib/boardPanel.js`)
- Anpassung der Schwellenwert-Logik aller 4 Provider:
  - **Claude Code:** `maxPct >= 100 ? 'Voll' : (maxPct >= 85 ? 'Fast voll' : ...)`
  - **Google Antigravity:** Berücksichtigt Argon- und Gemini-Limits; `maxPct >= 100 ? 'Voll' : ...`
  - **GitHub Copilot:** Bei vollem Kontingent ohne Zusatzbudget `Aufgebraucht`, bei Zusatzbudget `Budget aufgebraucht` (wenn `pBud >= 100`) bzw. `Voll`.
  - **OpenAI Codex:** `maxPct >= 100 ? 'Voll' : ...` samt Tooltip-Aktualisierung.
