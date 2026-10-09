# Implementierungsplan: Aufteilung von `tools` in `ai-sessions` und `cf-devtools`
Datum: 2026-10-09
Task-Ziel: Aufteilung des Monorepos `tools` in zwei eigenständige Git-Repositories (`ai-sessions` und `cf-devtools`) unter `C:\lucee\tomcat\webapps\ROOT\`. Die relevante Git-Historie wird pro Projekt extrahiert und bereinigt.

## Ausgangslage
- Aktueller Stand: 52 Commits im Monorepo `tools` (`https://github.com/schueri89/tools.git`).
- `cf-debug-chrome/`: 6 Commits betroffen. Chrome-DevTools-Extension für Lucee-Debugging.
- `session-dashboard/`: ~46 Commits, alle Pläne in `.agents/plans/` und die offene ToDo-Liste betreffen dieses Tool.
- `cf-admin/api.cfc` referenziert aktuell `/tools/cf-debug-chrome/manifest.json` für die Versionsprüfung.

## Zielarchitektur
1. **`C:\lucee\tomcat\webapps\ROOT\cf-devtools`**:
   - Eigenständiges Git-Repository.
   - Enthält nur die Commits und Dateien von `cf-debug-chrome/` (Dateien liegen direkt im Root).
   - `manifest.json`: Name auf "CF DevTools (Lucee Debug Analyzer)" aktualisiert.
   - `README.md`: Pfade und Projektnamen aktualisiert.
   - Frische `TODO.md` und `AGENTS.md` für zukünftige Arbeiten.
   - Gegenstelle: `cf-admin/api.cfc` liest `/cf-devtools/manifest.json`.

2. **`C:\lucee\tomcat\webapps\ROOT\ai-sessions`**:
   - Eigenständiges Git-Repository.
   - Enthält die Commits von `session-dashboard/` sowie `.agents/plans/` und die ToDo-Historie.
   - Dateien aus `session-dashboard/` wandern direkt ins Root (`package.json`, `extension.js`, `lib/`, etc.).
   - `package.json`: `"name": "ai-sessions"`, Skripte und VSIX-Build angepasst.
   - Pläne `.agents/plans/`, `TODO.md`, `FEEDBACK.md`, `AGENTS.md` übernommen und Pfade aktualisiert.
   - Commits, die rein `cf-debug-chrome` betrafen, herausgefiltert.

3. **Altes Monorepo `C:\lucee\tomcat\webapps\ROOT\tools`**:
   - Bleibt zunächst als unverändertes Backup bestehen.

---

## Detaillierte Umsetzungsschritte

### Phase 1: `cf-devtools` erstellen
1. **Git Subtree Split ausführen**:
   Im `tools`-Repo wird via `git subtree split -P cf-debug-chrome -b split-cf-devtools` ein bereinigter Branch erzeugt.
2. **Neues Projektverzeichnis initialisieren**:
   Neuer Ordner `C:\lucee\tomcat\webapps\ROOT\cf-devtools` wird angelegt. Der Branch `split-cf-devtools` wird dorthin ausgecheckt / geklont.
3. **Projektdateien anpassen**:
   - `manifest.json`: Name "CF DevTools (Lucee Debug Analyzer)".
   - `README.md`: Pfade aktualisieren (`cf-devtools` statt `tools/cf-debug-chrome`).
   - Neue `TODO.md` und `AGENTS.md` anlegen.
4. **Server-Referenz anpassen**:
   In `cf-admin/api.cfc` Zeile 311 `expandPath("/tools/cf-debug-chrome/manifest.json")` -> `expandPath("/cf-devtools/manifest.json")`.
5. **Verifikation**:
   - Git-Log prüfen (nur die 6 relevanten Commits vorhanden).
   - Dateistruktur prüfen.

### Phase 2: `ai-sessions` erstellen
1. **Repository klonen / duplizieren**:
   Klon von `tools` nach `C:\lucee\tomcat\webapps\ROOT\ai-sessions`.
2. **Historie bereinigen & Inhalte verschieben**:
   - Inhalt von `session-dashboard/*` ins Root verschieben.
   - `cf-debug-chrome/` entfernen.
   - Reine `cf-debug-chrome`-Commits bereinigen.
3. **Projektdateien anpassen**:
   - `package.json`: `"name": "ai-sessions"`, Pfade in `"scripts"`.
   - `.agents/project-context.md`, `AGENTS.md`, `README.md`, `TODO.md`: Auf `ai-sessions` anpassen.
4. **Verifikation**:
   - `npm run check` ausführen (Syntax aller Module).
   - Git-Log prüfen.

### Phase 3: Abschluss & GitHub Remotes
1. Benutzer gibt Feedback / prüft beide Projekte.
2. Nach expliziter Freigabe: GitHub-Remotes verknüpfen.
