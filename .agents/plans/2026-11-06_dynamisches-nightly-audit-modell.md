# Implementierungsplan: Dynamisches KI-Modell für nächtliche Audits (Session Dashboard v0.76.0)

**Datum:** 2026-11-06  
**Projekt:** `ai-sessions` & `.agents`  
**Status:** In Umsetzung  

---

## 1. Kontext & Motivation

Der nächtliche Audit-Job ([`DevBox-Nightly-Audit`](file:///c:/lucee/tomcat/webapps/ROOT/.agents/tools/run-nightly-audit.ps1)) führt täglich um 04:30 Uhr Code-Reviews und Security-Audits für aktivierte Projekte durch.
Bisher war das Modell im Skript `run-nightly-audit.ps1` fest vorgegeben (zunächst `gemma4:26b`, später hart auf `gemma4:e4b` geändert).

Auf einem Entwicklungssystem mit begrenzter VRAM-Größe (z. B. AMD Radeon 780M mit ~4 GB geteiltem Speicher) verhalten sich die Modelle stark unterschiedlich:
- **`gemma4:e4b`** (~6,5 GB): Passt in VRAM, wird per GPU/APU beschleunigt, benötigt ca. 50–60 Sekunden pro Review.
- **`gemma4:26b`** (~18,7 GB): Läuft rein auf der CPU/RAM, benötigt 5–7 Minuten pro Review, liefert dafür tiefere Begründungen.

Der Entwickler wünscht sich die Möglichkeit, das Modell für den nächtlichen Scan **dynamisch als Einstellung im Session Dashboard (`ai-sessions`)** festzulegen, ohne dafür Skripte manuell editieren zu müssen.

---

## 2. Architektur & Bridge-Konzept

Da der nächtliche Windows Scheduled Task unabhängig von VS Code läuft (VS Code ist nachts typischerweise geschlossen), nutzen wir die ohnehin existierende Status- und Konfigurationsdatei [`audit-state.json`](file:///c:/lucee/tomcat/webapps/ROOT/.agents/reports/audit-state.json) als Brücke:

```
[VS Code Settings: sessionDashboard.audits.nightlyModel]
                       │
                       ▼ (ai-sessions / auditManager.js)
        .agents/reports/audit-state.json
              {"config": {"nightly_model": "gemma4:e4b"}}
                       │
                       ▼ (run-nightly-audit.ps1 / project-audit.py)
[Windows Scheduled Task: DevBox-Nightly-Audit um 04:30 Uhr]
```

1. **Einstellung in `ai-sessions/package.json`:**
   - Neuer Konfigurationsschlüssel: `sessionDashboard.audits.nightlyModel`.
   - Voreinstellung: `"gemma4:e4b"`.
   - Kategorie: `Tab: Audits`.
   - Beschreibung & Auswahl im VS-Code-Settings-Editor.

2. **Synchronisation in `lib/auditManager.js`:**
   - Methode `getNightlyModel()`: Liest `sessionDashboard.audits.nightlyModel` aus der Konfiguration.
   - Methode `syncAuditConfig()`: Speichert das Modell synchron in `audit-state.json` unter `config.nightly_model`.
   - Automatische Aktualisierung beim Start der Extension, beim Abfragen des Scheduled-Task-Status und bei Konfigurationsänderungen (`onDidChangeConfiguration`).

3. **Anzeige im Dashboard (`lib/boardPanel.js`):**
   - Im Banner des Tabs **🛡️ Audits** wird neben dem Scheduled-Task-Status und der Anzahl aktiver Daily-Projekte auch das aktuell scharfgeschaltete Modell angezeigt (z. B. `04:30 Uhr (aktiv: 3 Projekte | Modell: gemma4:e4b)`).
   - Ein Klick auf das Zahnrad ⚙️ der Audits-Toolbar leitet direkt in die Einstellungen des Tabs weiter.

4. **PowerShell Runner (`run-nightly-audit.ps1`):**
   - Liest vor dem Start aus `audit-state.json` das Feld `config.nightly_model` aus.
   - Falls nicht vorhanden oder Fehler: Robuster Fallback auf `gemma4:e4b`.
   - Übergibt `--model <nightlyModel>` an `project-audit.py` und protokolliert das gewählte Modell im Logfile `nightly-audit.log`.

5. **Python CLI (`project-audit.py`):**
   - Stellt sicher, dass das `config`-Objekt beim Lesen und Schreiben von `audit-state.json` erhalten bleibt.

---

## 3. Umsetzungs-Schritte

### Phase 1: PowerShell Runner & Python CLI (`.agents`)
- [`run-nightly-audit.ps1`](file:///c:/lucee/tomcat/webapps/ROOT/.agents/tools/run-nightly-audit.ps1): Dynamisches Auslesen von `config.nightly_model` aus `audit-state.json` mit Fallback.
- [`project-audit.py`](file:///c:/lucee/tomcat/webapps/ROOT/.agents/tools/project-audit.py): Erhalt des `config`-Blocks in `load_audit_state` und `save_audit_state`.

### Phase 2: AI Sessions Extension Backend (`ai-sessions`)
- [`package.json`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/package.json): Definition von `sessionDashboard.audits.nightlyModel`. Version auf `0.76.0`.
- [`lib/auditManager.js`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/auditManager.js): `getNightlyModel()`, `syncAuditConfig()` und Einbindung in den Lebenszyklus.

### Phase 3: AI Sessions UI (`lib/boardPanel.js`)
- Anzeige des konfigurierten nächtlichen Modells im Workspace Guards / Scheduled Task Banner.

### Phase 4: Tests, Packaging & Doku
- [`test/check-audit-manager.js`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/test/check-audit-manager.js) um Testfälle für `getNightlyModel()` und `syncAuditConfig()` erweitern.
- `npm run check` ausführen.
- `CHANGELOG.md` und `TODO.md` aktualisieren.
- Neues VSIX paketieren (`vsix/session-dashboard-0.76.0.vsix`).
