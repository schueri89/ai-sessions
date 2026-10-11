# Implementierungsplan: Manuelle Projekt-Zuweisung & Korrektur für Sessions

Datum: 2026-10-11  
Status: Bereit zur Umsetzung  
Betroffenes Projekt: ai-sessions  
Ziel-Version: v0.36.0  

---

## 1. Ausgangslage & Motivation

Die Extension ordnet KI-Sessions von Claude Code, Google Antigravity und GitHub Copilot über die Heuristik in [`resolveProject()`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/project.js#L54-L125) automatisch Unterordnern von `c:\lucee\tomcat\webapps\ROOT` zu:
1. `hintProject` (aus Transkript-Dateipfaden)
2. `cwd` (Arbeitsverzeichnis)
3. `workspaces` (Antigravity Workspace-URIs)
4. `rawLines` (Dateipfade in Tool-Calls wie `/webapps/ROOT/<projekt>/...`)
5. `title` & `lastPrompt` (Wortgrenzen-Regex über Session-Titel und Prompt)
6. Fallback: `'ROOT'`

### Problemstellung & Analyse des „Hinterherspringens“ beim Öffnen
In der Praxis aktualisiert oder ändert sich das zugewiesene Projekt häufig erst beim Öffnen des Chats im Editor:
- **Google Antigravity:** Neue Sessions besitzen in `conversation_summaries.db` anfangs oft einen leeren Titel (`title: ""`). Sobald der Chat im Panel geöffnet wird, erzeugt Antigravity asynchron eine Zusammenfassung/Titel und aktualisiert `last_modified_time`. Der SQLite-Watcher triggert ein Update, und Stufe 4 erkennt plötzlich das Projekt im Titel (z. B. wechselt von `ROOT` auf `smartwatch-app`).
- **Claude Code:** Transkripte werden inkrementell gelesen. Sobald der Chat geöffnet wird oder neue Tool-Calls ausführt, tauchen Pfade wie `/webapps/ROOT/<projekt>/...` auf, woraufhin `info.project` gesetzt wird und das Projekt wechselt.
- **GitHub Copilot:** Im Multi-Root-Workspace `lucee.code-workspace` ist `cwd` die Workspace-Datei, wodurch Stufe 1 fehlschlägt. Der Chat-Titel (`customTitle`) wird oft erst beim Öffnen in die JSONL-Datei geschrieben, wodurch die Erkennung erst nachträglich greift.
- **Falsch-Positive:** Wird im Prompt eines Projekts ein anderes Projekt erwähnt (z. B. *„Kopiere die Funktion aus cf-shared in tvw-hub“*), matcht Stufe 4 fälschlicherweise das erwähnte fremde Projekt.

### Zielsetzung
Einführung einer dauerhaften, manuellen Projekt-Zuweisung und Korrekturmöglichkeit:
- **Manuelle Übersteuerung (Project Override):** Nutzer können jeder Session direkt ein Projekt zuweisen oder ein falsch erkanntes Projekt korrigieren.
- **Persistierung:** Manuelle Zuweisungen überstehen Reloads und Neustarts ([`context.globalState`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/projectStore.js)).
- **Visuelle Kennzeichnung:** Manuell überschriebene Projekte werden mit einem Pin-Symbol (`📌`) am Projekt-Badge markiert.
- **Einfaches Zurücksetzen:** Über das Zuweisungsmenü kann jederzeit wieder auf die automatische Heuristik zurückgesetzt werden.
- **Direktzugriff im UI:**
  - Auf den **Kanban-Karten** (Board-Tab) per Klick auf das Projekt-Badge.
  - In der **Historie-Tabelle** (3. Tab) per Klick auf die Projekt-Pill und im ausgeklappten Accordion-Detailbereich.
  - In der **Sidebar-Treeview** über ein Kontextmenü / QuickPick.

---

## 2. Technische Architektur

### 2.1 Neues Speichermodul [`lib/projectStore.js`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/projectStore.js)
Analog zu [`lib/ticketStore.js`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/ticketStore.js) und [`lib/bookmarkStore.js`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/bookmarkStore.js):
- **Speicherort:** `context.globalState` mit Schlüssel `sessionDashboard.projectOverrides`.
- **Datenstruktur:**
  ```json
  {
    "dd28cce3-9e4d-4cb2-ad38-0ba58c82806e": {
      "project": "ai-sessions",
      "assignedAt": 1728638000000
    }
  }
  ```
- **Klasse [`ProjectStore`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/projectStore.js):**
  - `all()`: Gibt alle gespeicherten Overrides zurück.
  - `getOverride(sessionId)`: Gibt den manuellen Projektnamen als String zurück (oder `null`).
  - `setOverride(sessionId, project)`: Speichert das Projekt (bereinigt und normalisiert).
  - `removeOverride(sessionId)`: Entfernt den Override, sodass die automatische Erkennung wieder greift.
  - `reconcile()`: Bereinigt verwaiste Einträge bei Bedarf.

### 2.2 Integration in [`SessionModel`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/extension.js#L47)
- Instanziierung: `this.projects = new ProjectStore(context.globalState);` in [`SessionModel.constructor()`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/extension.js#L48-L60).
- In [`SessionModel.refresh()`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/extension.js#L109-L178):
  - Für jede Session:
    ```javascript
    const manualProject = this.projects.getOverride(s.sessionId);
    const effectiveProject = manualProject || s.project;
    const isProjectOverridden = Boolean(manualProject);
    ```
  - Das Session-Objekt erhält `project: effectiveProject`, `autoProject: s.project`, `isProjectOverridden`.
  - In die `signature` fließen `s.project` und `s.isProjectOverridden` ein, damit Änderungen sofortige UI-Rerenders auslösen.

### 2.3 Neuer VS-Code-Befehl `sessionDashboard.assignProject` ([`extension.js`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/extension.js))
- **Trigger:** Klick auf Projekt-Badge auf Karte oder in Tabelle, Accordion-Aktion oder Sidebar.
- **Ablauf:**
  1. Ermittelt aktuelle Session und vorhandenen Override via [`ProjectStore`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/projectStore.js).
  2. Holt die Liste bekannter Ordner via [`getKnownSubfolders()`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/project.js#L29-L52), sortiert alphabetisch.
  3. Baut QuickPick-Items auf:
     - Falls aktuell manuell überschrieben:
       `🔄 Automatische Erkennung wiederherstellen (wäre: <autoProject>)`
     - Liste aller Projekte (z. B. `ai-sessions`, `auto-hub`, `cf-shared`, `ROOT`, `tvw-hub`, ...). Das aktuell gewählte Projekt wird hervorgehoben (`(aktuell)` oder Häkchen).
     - Option `✏️ Anderen Projektnamen eingeben…` für manuelle Texteingabe.
  4. Nach Auswahl:
     - Bei „Auto-Reset“: `this.projects.removeOverride(sessionId)`.
     - Bei Projektauswahl: `this.projects.setOverride(sessionId, pickedProject)`.
     - `update(true)` zur sofortigen Aktualisierung von Tree, Board, Historie und Statusbar.

### 2.4 UI-Erweiterungen in [`lib/boardPanel.js`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/boardPanel.js)
- **Kanban-Board (Kartenansicht):**
  - Klick auf das Projekt-Badge (oder ein Stift-Icon `✏️` am Badge) sendet Nachricht `assignProject` an die Extension.
  - Wenn `isProjectOverridden === true`: Badge erhält dezentes Pin-Symbol (`📌`) und Tooltip: *„Projekt manuell zugewiesen (Klick zum Ändern oder Zurücksetzen)“*.
- **Historie-Tabelle (3. Tab):**
  - Klickbare Projekt-Pill mit Stift-Icon `✏️`.
  - Ausgeklapptes Detail-Accordion:
    - Eigener Bereich „Projekt-Zuweisung“:
      - Status: *„Manuell zugewiesen: <Projekt>“* oder *„Automatisch erkannt: <Projekt>“*.
      - Buttons: `[✏️ Projekt ändern]` und falls manuell zugewiesen `[🔄 Auf Auto-Erkennung zurücksetzen]`.
- **Historien- und Analysedaten ([`lib/analytics.js`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/analytics.js)):**
  - Weitergabe von `isProjectOverridden` und `autoProject` in `getSessionHistoryList()`.

---

## 3. Betroffene Dateien

| Datei | Art | Änderung |
|---|---|---|
| [`lib/projectStore.js`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/projectStore.js) | NEU | Persistente Speicherung von manuellen Projekt-Zuweisungen (`globalState`) |
| [`package.json`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/package.json) | ÄNDERUNG | Version auf `0.36.0`, Registrierung Command `sessionDashboard.assignProject`, `npm run check` Skript |
| [`extension.js`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/extension.js) | ÄNDERUNG | Einbindung `ProjectStore` in `SessionModel`, Command `sessionDashboard.assignProject` mit QuickPick, Signatur-Update |
| [`lib/boardPanel.js`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/boardPanel.js) | ÄNDERUNG | Klick auf Projekt-Badge auf Karten, Projekt-Pill in Historie-Tabelle, Accordion-Sektion mit Ändern-/Reset-Buttons, Message-Handler |
| [`lib/analytics.js`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/analytics.js) | ÄNDERUNG | Weitergabe von `isProjectOverridden` und `autoProject` an Historie |
| [`lib/treeView.js`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/treeView.js) | ÄNDERUNG | Tooltip-Erweiterung für manuell überschriebene Projekte |
| [`TODO.md`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/TODO.md) | ÄNDERUNG | Aktualisierung der Aufgabenliste |

---

## 4. Verifikation & Qualitätskontrolle

1. **Datei-Integritätsprüfung:**
   - Synchrones Schreiben von [`lib/projectStore.js`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/projectStore.js) und Überprüfung der Dateigröße (> 0 Bytes).
2. **Syntaxprüfung:**
   - `npm run check` führt syntaktische Validierung aller Module aus.
3. **Paketierung & Installation:**
   - `npm run package` generiert `vsix/ai-sessions-0.36.0.vsix`.
   - `code --install-extension vsix/ai-sessions-0.36.0.vsix` installiert die Erweiterung direkt im Editor.
4. **Funktionstests:**
   - Zuweisen eines neuen Projekts über Kanban-Karten-Badge.
   - Prüfen, ob das Badge `📌` anzeigt und die Filterung nach dem neuen Projekt greift.
   - Zuweisen und Ändern über die Historie-Tabelle und das Accordion.
   - Zurücksetzen auf die automatische Erkennung prüfen.
   - Verifikation, dass ein Editor-Reload die manuelle Zuweisung beibehält.
