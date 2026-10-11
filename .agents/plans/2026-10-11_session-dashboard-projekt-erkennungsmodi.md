# Implementierungsplan: Konfigurierbare Projekt-Erkennungsmodi (auto, exact, manual)

Datum: 2026-10-11  
Status: Abgeschlossen (11.10.2026)  
Betroffenes Projekt: ai-sessions  
Ziel-Version: v0.37.0  

---

## 1. Ausgangslage & Motivation

Mit Version v0.36.0 wurde die manuelle Zuweisung und Korrektur von Projekten per QuickPick erfolgreich eingeführt.  
Bislang arbeitet die automatische Heuristik in [`resolveProject()`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/project.js#L54-L125) jedoch immer auf Stufe 4 (Wortsuche in Prompts und Session-Titeln), was dazu führt, dass:
- Sessions bei Erwähnung anderer Projektordner im Prompt fälschlicherweise einem fremden Projekt zugeordnet werden.
- Sessions beim Öffnen des Chats durch nachträgliche Titel-Generierung unerwartet die Projektzugehörigkeit wechseln („Hinterherspringen“).
- Viele Sessions pauschal auf `'ROOT'` zurückfallen, obwohl der Nutzer eine saubere Projekt-Organisation bevorzugt.

### Zielsetzung
Einführung einer 3-stufigen Konfiguration `sessionDashboard.projectDetection`:
1. **`"auto"` (Standard / Vollautomatik):**
   - Wie bisher: Direkte Pfade (CWD, Workspaces, Tool-Aufrufe) + Text-Heuristik (Titel & Prompts) mit Fallback auf `'ROOT'`.
2. **`"exact"` (Präzise Automatik ohne Text-Raten):**
   - Nur eindeutige Pfadzuordnungen (CWD-Unterordner, Antigravity Workspace-URIs, Tool-Dateizugriffe).
   - **Keine** unsichere Wortsuche in Prompts oder Titeln.
   - Sessions ohne eindeutigen Pfad erhalten den Status **`'Nicht zugewiesen'`** (kein Fallback auf `'ROOT'`).
3. **`"manual"` (Rein manuell / Inbox-Prinzip):**
   - Die automatische Erkennung ist komplett deaktiviert.
   - Jede neue Session startet mit dem Status **`'Nicht zugewiesen'`**.
   - Sessions werden bewusst per 1-Click auf das Badge manuell zugewiesen.

---

## 2. Technische Architektur

### 2.1 Konfiguration ([`package.json`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/package.json))
Neue Einstellung `sessionDashboard.projectDetection`:
```json
"sessionDashboard.projectDetection": {
  "type": "string",
  "enum": ["auto", "exact", "manual"],
  "default": "auto",
  "enumDescriptions": [
    "Vollständige automatische Erkennung über Workspaces, Transkripte und Textsuche in Prompts/Titeln.",
    "Präzise Erkennung nur über Verzeichnisse und Workspaces (CWD). Keine unsichere Textsuche in Prompts/Titeln.",
    "Keine automatische Zuweisung. Sessions ohne manuellen Eintrag erscheinen als 'Nicht zugewiesen'."
  ],
  "description": "Modus für die Erkennung und Zuweisung von Projekten zu KI-Sessions."
}
```

### 2.2 Heuristik & Logik in [`lib/project.js`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/project.js)
Erweiterung der Funktion [`resolveProject()`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/project.js#L54-L125) um den Parameter `detectionMode = 'auto'`:
```javascript
function resolveProject({ cwd = '', workspaces = [], title = '', lastPrompt = '', rawLines = [], hintProject = '', detectionMode = 'auto' } = {}, rootDir) {
  // Im manuellen Modus entfällt jede automatische Erkennung:
  if (detectionMode === 'manual') {
    return 'Nicht zugewiesen';
  }

  // 0. hintProject
  // 1. Direct match on cwd
  // 2. Direct match on Antigravity workspaces
  // 3. Match from file paths in rawLines / tool inputs
  // ... wenn ein konkreter Pfad matcht, wird er zurückgegeben.

  // 4. Text-Heuristik (Titel & Prompt): NUR im Modus 'auto'
  if (detectionMode === 'auto') {
    const text = (title + ' ' + lastPrompt).toLowerCase();
    for (const [lower, orig] of entries) {
      if (orig === '.agents') continue;
      const re = new RegExp('(?:^|[^a-z0-9_-])' + lower.replace(/[-_.]/g, '[-_.]') + '(?:[^a-z0-9_-]|$)', 'i');
      if (re.test(text)) {
        return orig;
      }
    }
    return 'ROOT';
  }

  // Im Modus 'exact': Wenn keine Pfade matchen -> Nicht zugewiesen
  return 'Nicht zugewiesen';
}
```

### 2.3 Provider- & Modell-Integration ([`lib/registry.js`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/registry.js), [`extension.js`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/extension.js))
- [`SessionModel`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/extension.js#L47):
  - Methode `getProjectDetectionMode()`: Liest `vscode.workspace.getConfiguration('sessionDashboard').get('projectDetection', 'auto')`.
  - Reicht den Modus beim `readSessions(enabled, { detectionMode })` an die Provider weiter bzw. evaluiert ihn im `refresh()`.
  - Manuelle Zuweisungen aus [`ProjectStore`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/projectStore.js) haben in allen Modi stets oberste Priorität (`effectiveProject = manualProject || autoProject`).
  - Wenn kein manueller Override existiert und `autoProject === 'Nicht zugewiesen'`:
    - `isProjectOverridden: false`
    - `project: 'Nicht zugewiesen'`

### 2.4 UI- & Filter-Integration ([`lib/boardPanel.js`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/boardPanel.js))
- **Projektfilter & Filterchips:**
  - `counts()` und Filterchips im Dashboard-Header:
    - Wenn unzugewiesene Sessions existieren, erscheint `Nicht zugewiesen` als wählbarer Filterchip bzw. im Projekt-Dropdown.
- **Kanban-Karten:**
  - Wenn `s.project === 'Nicht zugewiesen'`:
    - Badge: `📁 Nicht zugewiesen` oder `📁 Projekt wählen…` mit dezenter Akzentuierung.
    - Direkter Klick auf das Badge öffnet sofort den QuickPick zur Projektauswahl (ohne Shift-Key).
- **Historie-Tabelle (3. Tab):**
  - In der Projekt-Spalte: `📁 Nicht zugewiesen`. Klick öffnet die Zuweisung.
  - Im Accordion: Sektion **📁 Projekt:** zeigt `Nicht zugewiesen` mit Button `[+ Projekt zuweisen]`.

---

## 3. Betroffene Dateien

| Datei | Art | Änderung |
|---|---|---|
| [`package.json`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/package.json) | ÄNDERUNG | Version `0.37.0`, neue Konfiguration `sessionDashboard.projectDetection` |
| [`lib/project.js`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/project.js) | ÄNDERUNG | `resolveProject` unterstützt `detectionMode` (`auto`, `exact`, `manual`) |
| [`lib/registry.js`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/registry.js) | ÄNDERUNG | Weitergabe von `options.detectionMode` an die Provider |
| [`lib/providers/antigravity.js`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/providers/antigravity.js) | ÄNDERUNG | Übergabe von `detectionMode` an `resolveProject` |
| [`lib/providers/claude.js`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/providers/claude.js) | ÄNDERUNG | Übergabe von `detectionMode` an `resolveProject` |
| [`lib/providers/copilot.js`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/providers/copilot.js) | ÄNDERUNG | Übergabe von `detectionMode` an `resolveProject` |
| [`lib/history.js`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/history.js) | ÄNDERUNG | Übergabe von `detectionMode` an `resolveProject` |
| [`extension.js`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/extension.js) | ÄNDERUNG | Auslesen von `projectDetection` in `SessionModel`, Konfigurations-Watcher |
| [`lib/boardPanel.js`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/boardPanel.js) | ÄNDERUNG | Unterstützung für `Nicht zugewiesen`-Badges, 1-Click Zuweisung, Filter-Chips |
| [`TODO.md`](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/TODO.md) | ÄNDERUNG | Aktualisierung der Aufgabenliste |

---

## 4. Verifikation & Qualitätskontrolle

1. **Datei-Integritätsprüfung:**
   - Synchrones Schreiben aller Änderungen und Überprüfung der Dateigröße (> 0 Bytes).
2. **Syntaxprüfung:**
   - `npm run check` führt syntaktische Validierung aller Module und Webviews aus.
3. **Paketierung & Installation:**
   - `npm run package` generiert `vsix/ai-sessions-0.37.0.vsix`.
   - `code --install-extension vsix/ai-sessions-0.37.0.vsix` installiert die Erweiterung im Editor.
4. **Funktionstests der 3 Modi:**
   - **Test 1 (`auto`):** Standardverhalten unverändert (bestehende Heuristik).
   - **Test 2 (`exact`):** Sessions ohne explizite Workspace-/CWD-Unterordner erhalten `Nicht zugewiesen`. Keine Text-Matches aus Titeln oder Prompts.
   - **Test 3 (`manual`):** Alle neuen Sessions landen in `Nicht zugewiesen`. Klick auf `📁 Nicht zugewiesen` öffnet den QuickPick. Nach manueller Auswahl bleibt die Zuweisung dauerhaft fixiert.
   - **Test 4 (Umschalten im laufenden Betrieb):** Ändern der Einstellung aktualisiert das Board und die Filter sofort.

