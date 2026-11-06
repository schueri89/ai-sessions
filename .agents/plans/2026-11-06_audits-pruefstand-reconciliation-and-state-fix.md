# Plan: Audits: Prüfstand-Ermittlung & Automatische Quittierungs-Reconciliation (v0.77.0)

## Kontext & Problemstellung
Im Tab `🛡️ Audits` des Session-Dashboards blieb für ein Projekt (z. B. `cf-shared`) der Prüfstand dauerhaft auf `✓ Quittiert` stehen, obwohl neue Code-Reviews und Security-Audits erfolgreich abgeschlossen wurden und neue Berichtsdateien mit Befunden vorlagen.

Die Ursachenanalyse zeigte folgende Diskrepanzen:
1. **Unvollständige Status-Aktualisierung in `project-audit.py`:**
   In Version `0.71.0` wurde das getrennte Quittieren via `cr_status` und `sec_status` eingeführt. Das Python-Skript `project-audit.py` setzte bei neuen Läufen zwar `p_state["status"] = "pending"`, berührte aber die Felder `cr_status` und `sec_status` nicht.
2. **Logik-Bypass in `AuditManager.getAuditOverview()`:**
   Dort wurde `crReviewStatus = pState.cr_status || (pState.status === 'reviewed' ? 'reviewed' : 'pending')` ausgewertet. Da `pState.cr_status` durch eine frühere Quittierung noch auf `"reviewed"` stand, griff der Fallback auf `pState.status` niemals.
3. **Fehlender Zeitstempel- und Commit-Abgleich:**
   Wurde ein neuer Bericht erzeugt (dessen Dateizeitstempel `cr.mtimeMs` nach dem Quittierungszeitpunkt `cr_reviewed_at` lag) oder auf einem neueren Commit ausgeführt, wurde dieser Unterschied nicht berücksichtigt.
4. **Keine Statusaktualisierung bei Ad-hoc Dashboard-Läufen:**
   Wenn im Dashboard manuell „💻 Code“, „🛡️ Sec“ oder „⚡ Code+Sec“ gestartet wurde, aktualisierte `auditManager.runAudit()` die Quittierungsfelder im State nach dem Lauf nicht auf `"pending"`.

---

## Geplante Maßnahmen

### 1. `project-audit.py` (`.agents/tools/project-audit.py`)
- In `main()` beim Durchlauf über analysierte Projekte (`if res.get("scanned_files")`):
  - Wenn `mode in ("all", "review")`: `p_state["cr_status"] = "pending"`.
  - Wenn `mode in ("all", "security")`: `p_state["sec_status"] = "pending"`.
  - `p_state["status"] = "pending"`.
- In `mark_project_reviewed()`:
  - Auch `cr_status = "reviewed"`, `sec_status = "reviewed"`, `cr_reviewed_at`, `sec_reviewed_at`, `cr_reviewed_commit` und `sec_reviewed_commit` pflegen.

### 2. `AuditManager` (`lib/auditManager.js`)
- Neue Hilfsfunktion `parseGermanDateToMs(str)`: Konvertiert `DD.MM.YYYY HH:mm[:ss]` in Millisekunden.
- In `markProjectReviewed()`:
  - Neben `cr_reviewed_at` auch den Epochen-Zeitstempel `cr_reviewed_time = Date.now()` (bzw. `sec_reviewed_time`) speichern.
- In `runAudit()` (`proc.on('close')`):
  - Nach erfolgreichem Durchlauf (Code 0) den entsprechenden Review-Typ im `audit-state.json` auf `"pending"` setzen (`cr_status` bei review/all, `sec_status` bei security/all, `status = "pending"`).
- In `getAuditOverview()`:
  - Robuste Ermittlung von `crReviewStatus` und `secReviewStatus`:
    Ein Review gilt nur dann als `"reviewed"`, wenn:
    1. `pState.cr_status === 'reviewed'` (oder Fallback auf `pState.status === 'reviewed'`),
    2. UND `pState.status !== 'pending'` (sofern `project-audit.py` den Gesamtstatus auf `pending` gesetzt hat),
    3. UND der Bericht auf der Festplatte nicht neuer als der Quittierungszeitpunkt ist (`cr.mtimeMs <= reviewedTime + 60000`),
    4. UND falls `last_review_commit` und `cr_reviewed_commit` vorliegen, diese übereinstimmen.
    Andernfalls wird der Status korrekt als `"pending"` (`⚠️ Offen`) ausgewertet.

### 3. Bereinigung von `audit-state.json`
- Korrektur der Alt-Einträge für `cf-shared` und synchroner Abgleich.

### 4. Tests & Verifikation
- Erweiterung von `test/check-audit-manager.js`:
  - Test: Erkennung neuerer Berichtsdateien nach Quittierung schaltet Prüfstand auf `pending`.
  - Test: `runAudit()`-Abschluss setzt Review-Status auf `pending`.
  - Test: `parseGermanDateToMs()`-Validierung.
- Python-Tests in `.agents/tools/test_project_audit.py` erweitern und ausführen.
- `npm run check` in `ai-sessions`.
- Versionierung auf `0.77.0`, Changelog-Eintrag und automatische Paketierung (`npm run package`) samt lokaler Installation (`code --install-extension vsix/ai-sessions-0.77.0.vsix`).
