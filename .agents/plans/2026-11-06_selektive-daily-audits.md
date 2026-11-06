# Implementierungsplan: Selektive Daily Audits (Projekt-Aktivierung via AI Sessions)

**Datum:** 2026-11-06  
**Projekt:** `ai-sessions` (Session Dashboard v0.75.0) & `.agents` (Audit Tools)  
**Status:** In Umsetzung  

---

## 1. Kontext & Problemstellung

Der nächtliche Audit-Job ([`DevBox-Nightly-Audit`](file:///c:/lucee/tomcat/webapps/ROOT/.agents/tools/run-nightly-audit.ps1)) prüft bisher pauschal alle 27 Repositories im Workspace mit `--project all`. Laut `nightly-audit.log` dauerte dieser Durchlauf zuletzt über **32 Minuten** (z. B. `auto-hub` 7 Min., `steuer-fritze` 6 Min.).
Dadurch entstehen jede Nacht Dutzende Berichte auch für Projekte, an denen aktuell gar nicht aktiv gearbeitet wird.

Der Entwickler wünscht sich Flexibilität:
Projekte sollen vorher gezielt (z. B. im AI Session Plugin) für den täglichen Audit-Lauf „aktiviert" werden können, um den Review- und Security-Audit-Prozess schrittweise Projekt für Projekt („nach und nach") durchführen zu können.

---

## 2. Zielsetzung & Architektur

1. **Persistente Speicherung in `audit-state.json`:**
   In [`.agents/reports/audit-state.json`](file:///c:/lucee/tomcat/webapps/ROOT/.agents/reports/audit-state.json) erhält jedes Projekt ein Flag `daily_active: true/false`.
   Dadurch kann sowohl das Python-CLI als auch die VS Code Extension ohne zusätzliche Abhängigkeiten direkt auf den gleichen Stand zugreifen.

2. **CLI-Erweiterung in `project-audit.py`:**
   - Neuer Zielmodus `--project active` (oder Flag `--active-only`): Prüft nur Projekte, bei denen `daily_active == true` ist.
   - Falls keine Projekte aktiv sind: Warnhinweis ausgeben und nur Workspace-Guards prüfen (kein unnötiger Fehlerabbruch).
   - CLI-Befehl `--status` zeigt eine Spalte `Daily` (`[x]` oder `[ ]`).
   - `--project all` bleibt unverändert für Ad-hoc-Gesamtläufe erhalten.

3. **Anpassung des Windows Scheduled Task / PowerShell-Wrappers:**
   In [`run-nightly-audit.ps1`](file:///c:/lucee/tomcat/webapps/ROOT/.agents/tools/run-nightly-audit.ps1) wird `--project all` durch `--project active` ersetzt.

4. **UI-Integration in `ai-sessions` (Tab 🛡️ Audits):**
   - **Tabelle:** Ein Toggle-Button / Icon `📅 Daily` in der Projektzeile (Aktiv = grün hervorgehoben, Inaktiv = dezent/grau). Tooltip informiert über Zustand.
   - **Accordion (Details):** Ein Checkbox-/Schalter-Element zur Aktivierung des nächtlichen Daily-Audits.
   - **Toolbar:**
     - Neuer Schnellfilter-Chip: `📅 Daily (<anzahl>)` neben `Alle`, `Befunde`, etc.
     - Dropdown / Aktionen für `Alle aktivieren` / `Alle deaktivieren`.
   - **Backend (`auditManager.js`):**
     - Methoden `toggleDailyAudit(project, enabled)` und `setAllDailyAudits(enabled)`.
     - `getAuditOverview()` liefert `dailyActive` pro Projekt sowie `dailyActiveCount`.

5. **Release & Packaging:**
   - Version `0.75.0` im `ai-sessions/package.json`.
   - Aktualisierung von `CHANGELOG.md` und `TODO.md`.
   - Unit-Tests in `test/check-audit-manager.js` erweitern und ausführen.
   - Neues VSIX paketieren: `vsix/session-dashboard-0.75.0.vsix`.

---

## 3. Umsetzungs-Schritte

### Phase 1: Python CLI ([`project-audit.py`](file:///c:/lucee/tomcat/webapps/ROOT/.agents/tools/project-audit.py))
- `--project active` & `--active-only` Logik implementieren.
- Auslesen der `daily_active`-Flags aus `load_audit_state()`.
- `--status`-Tabelle um Daily-Status erweitern.

### Phase 2: PowerShell Runner ([`run-nightly-audit.ps1`](file:///c:/lucee/tomcat/webapps/ROOT/.agents/tools/run-nightly-audit.ps1))
- Aufruf auf `--project active` umstellen.

### Phase 3: AI Sessions Extension ([`lib/auditManager.js`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/auditManager.js))
- Methoden für Daily-Audit-Toggle und State-Verwaltung.
- Anreicherung von `getAuditOverview()`.
- Tests in `test/check-audit-manager.js` ergänzen.

### Phase 4: UI & Webview ([`lib/boardPanel.js`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/boardPanel.js))
- HTML/CSS für Daily-Toggle in Tabellenzeile & Accordion.
- Schnellfilter-Chip `📅 Daily` & Zähler in Toolbar.
- IPC Message-Handler für `toggleDailyAudit` & `setAllDailyAudits`.

### Phase 5: Testen, VSIX Build & Dokumentation
- `npm run check` erfolgreich durchführen.
- `vsce package` ausführen.
- `CHANGELOG.md` und `TODO.md` pflegen.
