# Implementierungsplan: Kombinierter Single-Pass Audit-Durchlauf (Code-Review & Security)

**Datum:** 2026-11-04  
**Projekt:** `.agents` (Tools) & `ai-sessions` (Session Dashboard)  
**Status:** In Vorbereitung  
**Referenz:** [audit-review-varianten-vergleich.md](file:///C:/Users/rapha/.gemini/antigravity/brain/341306ae-545b-4efe-a303-9de271d78d34/audit-review-varianten-vergleich.md)

---

## 1. Kontext & Problemstellung

Im nächtlichen Gesamtlauf ([`run-nightly-audit.ps1`](file:///c:/lucee/tomcat/webapps/ROOT/.agents/tools/run-nightly-audit.ps1)) und bei vollständigen Projekt-Audits ([`project-audit.py --mode all`](file:///c:/lucee/tomcat/webapps/ROOT/.agents/tools/project-audit.py)) über alle 27 Repositories dauerte der Durchlauf zuletzt **3 Stunden 06 Minuten**.

Die Codebasis und das Git-Diff werden zwar nur 1-mal gelesen (< 0,2s), jedoch wurde jeder Code-Batch **zwei Mal nacheinander an das lokale LLM (`gemma4:26b` auf CPU)** übergeben:
1. Erster Call: Code Review System Prompt
2. Zweiter Call: Security Audit System Prompt

In jedem analysierten Projekt entfielen exakt 50 % der Rechenzeit auf das Code-Review und 50 % auf das Security-Review. Ein empirischer Benchmark auf der Dev-Box (Minisforum UM880 Plus mit Ryzen 7 8845HS) zeigte, dass ein kombinierter Single-Pass Prompt die Laufzeit von **426 s auf 144 s (-66,2 %)** reduziert und alle Kern-Schwachstellen (SQLi, IDOR, stilles Try-Catch, Query-Indexing) präzise und redundanzfrei erfasst.

---

## 2. Zielsetzung

1. **Laufzeitreduktion um ~50–65 %:** Nächtliche Audits von ~3h 07m auf ca. 1h 10m – 1h 25m verkürzen (Einsparung von 1,5 bis 2 Stunden CPU-Dauerlast).
2. **100 % Kompatibilität mit `ai-sessions`:** Die in v0.68.0 und v0.71.0 eingeführte UI (getrennte Spalten `Code-Review` und `Security`, differenzierte Quittierung via `cr_status` und `sec_status`, getrennte Berichtsdateien `_review.md` und `_security.md`) bleibt vollständig erhalten.
3. **Selektive Ausführung für Ad-hoc Klicks:** Die Dashboard-Buttons `▶ Review` (`--mode review`) und `🛡️ Sec` (`--mode security`) bleiben als schlanke, gezielte Einzelläufe bestehen.

---

## 3. Geplante Änderungen

### Phase 1: Neue kombinierte System-Prompts in `audit_prompts.py`
Datei: [.agents/tools/audit_prompts.py](file:///c:/lucee/tomcat/webapps/ROOT/.agents/tools/audit_prompts.py)

- **Definition von `COMBINED_AUDIT_SYSTEM_PROMPT_CFML`:**
  - Bündelt die CFML- und Lucee-Architekturregeln (Clean Code, `local.`-Scoping, Fail-Fast) mit den AppSec-Regeln (SQL-Injection, XSS, CSRF, IDOR, Component Injection, Fail-Closed).
  - Verpflichtet das Modell zu eindeutigen Begrenzern:
    ```markdown
    <<<CODE_REVIEW>>>
    ### Zusammenfassung der Änderungen
    ...
    ### Befunde
    ...
    ### Gesamtbewertung
    FREIGEGEBEN (APPROVED) / ÄNDERUNGEN ERFORDERLICH (CHANGES_REQUESTED) / NEUTRAL
    <<<END_CODE_REVIEW>>>

    <<<SECURITY_AUDIT>>>
    - Schweregrad: KRITISCH / HOCH / MITTEL / NIEDRIG / HINWEIS
    - Fundstelle: ...
    - Angriffsszenario / Risiko: ...
    - Konkrete Behebung: ...
    <<<END_SECURITY_AUDIT>>>
    ```
- **Definition von `COMBINED_AUDIT_SYSTEM_PROMPT_FRONTEND`:**
  - Analoge Bündelung für reine Frontend-/TypeScript-/Angular-Projekte.
- Bestehende Einzellauf-Prompts (`CODE_REVIEW_SYSTEM_PROMPT`, `SECURITY_SYSTEM_PROMPT_CFML`, `SECURITY_SYSTEM_PROMPT_FRONTEND`) bleiben für `--mode review` und `--mode security` unverändert bestehen.

### Phase 2: Single-Pass Orchestrierung & Parsing in `project-audit.py`
Datei: [.agents/tools/project-audit.py](file:///c:/lucee/tomcat/webapps/ROOT/.agents/tools/project-audit.py)

1. **Parser-Hilfsfunktion `parse_combined_audit_output(raw_output: str) -> tuple[str, str]`:**
   - Extrahiert mithilfe von Regex den Inhalt zwischen `<<<CODE_REVIEW>>> ... <<<END_CODE_REVIEW>>>` und `<<<SECURITY_AUDIT>>> ... <<<END_SECURITY_AUDIT>>>`.
   - **Defensiver Fallback:** Falls das Modell die Tags ausnahmsweise weglässt oder leicht abwandelt, teilt ein intelligenter Heuristik-Parser anhand typischer Überschriften (`## 🔍 Code Review`, `## 🛡️ Security Audit`, `Sicherheitsaudit-Bericht`) auf, sodass keine Daten verloren gehen.
2. **Anpassung von `run_audit_for_project`:**
   - Wenn `mode == "all"`:
     - Es wird **nur noch 1 Schleife** über `batches` (bzw. `diff_batches`) ausgeführt.
     - Jeder Batch wird genau 1x an Ollama übergeben (unter Verwendung des kombinierten System-Prompts).
     - Die beiden Abschnitte werden nach jedem Batch extrahiert und akkumuliert.
     - Die Messungen `durations["code_review"]` und `durations["security_review"]` erfassen die anteilige bzw. gemeinsame Inferenzzeit.
   - Wenn `mode == "review"` oder `mode == "security"`:
     - Bleibt unverändert der bisherige Einzellauf mit fokussiertem System-Prompt.
3. **Berichts-Generierung & State-Tracking:**
   - `project-audit.py` erzeugt weiterhin:
     - `YYYY-MM-DD_<project>_review.md`
     - `YYYY-MM-DD_<project>_security.md`
   - `audit-state.json` protokolliert unverändert `last_review_commit` und `last_security_commit`.

### Phase 3: Unit- & Regressionstests
Datei: [.agents/tools/test_project_audit.py](file:///c:/lucee/tomcat/webapps/ROOT/.agents/tools/test_project_audit.py)

- Unit-Test für `parse_combined_audit_output`:
  - Standard-Format mit Tags.
  - Fehlende Tags mit Heuristik-Fallback.
  - Nur ein Abschnitt vorhanden.
  - Leere / fehlerhafte Eingabe.
- Regressionstests für Argument-Parsing (`--mode all`, `--mode review`, `--mode security`).

### Phase 4: Verifikation & Zusammenspiel mit `ai-sessions`
- Ausführen der bestehenden Test-Suite in `ai-sessions`:
  - `node test/check-audit-manager.js`
  - `npm test`
- Verifikation, dass Berichtsdateien, Status-Badges, Spalten und Quittierung im Dashboard unverändert synchronisiert werden.
- Testlauf auf einem Test-Projekt (z. B. `cf-devtools` oder `ai-sessions`).

---

## 4. Verifikationsplan

### Automatisierte Tests
```powershell
# 1. Tests in .agents/tools
python -m unittest .agents/tools/test_project_audit.py

# 2. Tests in ai-sessions
cd c:\lucee\tomcat\webapps\ROOT\ai-sessions
node test/check-audit-manager.js
npm test
```

### Manueller Funktionstest
1. **Ad-hoc Einzellauf:**
   `python .agents/tools/project-audit.py --project cf-devtools --mode review --diff HEAD~1`
   -> Prüft, dass der Einzellauf weiterhin schlank funktioniert.
2. **Kombinierter Lauf:**
   `python .agents/tools/project-audit.py --project cf-devtools --mode all --diff HEAD~1`
   -> Prüft, dass nur 1 LLM-Aufruf stattfindet und beide Berichte (`_review.md` und `_security.md`) korrekt befüllt werden.
3. **Dashboard-Prüfung:**
   Öffnen von AI Sessions in VS Code, Prüfen der Spaltenanzeige im Tab `🛡️ Audits`.

---

## 5. Risikominimierung & Rollback

- **Keine Breaking Changes:** Da die CLI-Schnittstelle (`--mode all`) und die Ausgabedateien (`_review.md`, `_security.md`) identisch bleiben, erfordert die Änderung keinerlei Schema- oder UI-Migration in `ai-sessions`.
- **Schnelles Rollback:** Sollte unerwartet ein Problem mit dem Modell auftreten, kann über ein internes Flag oder ein Git-Revert in `.agents` sofort auf die 2-Pass-Schleife zurückgeschaltet werden.
