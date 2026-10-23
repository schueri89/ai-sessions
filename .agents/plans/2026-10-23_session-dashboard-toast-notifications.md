# Implementierungsplan: Kontextreiche VS-Code-Benachrichtigungen (Toasts) mit Click-to-Focus

Datum: 2026-10-23  
Status: Bereit zur Abstimmung & Freigabe  
Betroffenes Projekt: `ai-sessions`  
Referenz: Claude Notifier (`singularityinc.claude-notifier`), Antigravity Notification-Handler, VS Code Notification API  

---

## 1. Ausgangslage & Motivation

Aktuell informiert **AI Sessions** bei Statuswechseln (`taskCompleted`, `needsInput`, `limitAvailable`, `idleReminder`) ausschließlich über akustische Töne (`lib/soundNotifier.js`). 

### Problemstellung
- **Kein visuelles Feedback:** Bei stummgeschaltetem Rechner, Kopfhörerbetrieb oder wenn der Ton verpasst wird, ist unklar, ob und welche AI-Session fertig ist oder auf Eingaben wartet.
- **Fehlender Kontext:** Ein Signalton verrät nicht, in welchem Projekt (`auto-hub`, `ai-sessions`, etc.) und in welchem Chat gearbeitet wurde.
- **Doppel-Benachrichtigungen vermeiden:** Andere Erweiterungen wie *Claude Notifier* oder *Antigravity* erzeugen teilweise eigene native Popups oder Windows-Toasts. Nutzer müssen die Möglichkeit haben, diese Provider individuell in `ai-sessions` zu steuern und externe Toasts gezielt zu deaktivieren, damit keine Doppel-Benachrichtigungen entstehen.

### Ziel
1. **Kontextreiche VS-Code-Toasts** bei Aufgabenfertigstellung (`taskCompleted`) und Rückfragen / Freigaben (`needsInput`).
2. **Click-to-Focus (`[Chat öffnen]`):** Ein direkter Button in der Benachrichtigung öffnet sofort den betreffenden Chat (Secondary Sidebar für Claude/Copilot, Antigravity-Panel, Codex-Deep-Link).
3. **Multi-Window & Workspace-Routing:** Die Benachrichtigung erscheint im passenden VS-Code-Fenster des jeweiligen Projekts (`cwd`-Matching) und wird fensterübergreifend entprellt.
4. **Provider-Schalter:** Feingranulares Ein-/Ausschalten pro Anbieter (`claude`, `antigravity`, `copilot`, `codex`) und Ereignistyp.

---

## 2. Benachrichtigungs-Layout & Verhalten

### 2.1 Toast-Format

Die Benachrichtigung wird über `vscode.window.showInformationMessage` mit Aktionsbuttons ausgegeben:

#### A. Fertigstellung (`taskCompleted`)
> **`[<Projekt>]` <Session-Titel>**  
> ✅ Aufgabe abgeschlossen *(bzw. Schlusssatz / Tool-Zusammenfassung falls verfügbar)*  
> Buttons: `[Chat öffnen]` · `[Schließen]`

#### B. Rückfrage / Freigabe (`needsInput`)
> **`[<Projekt>]` <Session-Titel>**  
> ❓ <Rückfragetext oder „Wartet auf deine Antwort / Freigabe“>  
> Buttons: `[Chat öffnen]` · `[Schließen]`

### 2.2 Click-to-Focus Interaktion
Klickt der Benutzer auf `[Chat öffnen]`, wird die bewährte Funktion `openSession(session)` in `extension.js` aufgerufen:
- **Claude Code:** Öffnet die Session in der Secondary Sidebar (`claude-vscode.editor.open` mit `honor-preferred-location`).
- **Antigravity:** Fokussiert das Antigravity-Panel und navigiert via `antigravity.openConversation` (inkl. Cache-Bust & Canonical Retry).
- **GitHub Copilot:** Fokussiert Secondary Sidebar und öffnet die Session-URI via `workbench.action.chat.openInSidebar`.
- **OpenAI Codex:** Fokussiert Codex-Sidebar und ruft den Deep-Link `vscode://openai.chatgpt/local/${sessionId}` auf.

---

## 3. Multi-Window-Architektur & Koexistenz

### 3.1 Workspace-Routing (Fenster-Zuordnung)
Da typischerweise mehrere VS-Code-Fenster für unterschiedliche Repositories geöffnet sind:
1. **Passendes Fenster feuert vorrangig:** Jedes Fenster prüft bei einem Zustandswechsel, ob das `cwd` bzw. der Workspace der Session zu einem seiner geöffneten Ordner (`vscode.workspace.workspaceFolders`) passt.
   - Wenn JA: Das Fenster zeigt den Toast an.
   - Wenn NEIN: Das Fenster ignoriert das Event zunächst.
2. **Fallback für fensterlose / externe Sessions:** Liegt die Session in keinem der aktuell geöffneten Fenster, übernimmt ein Fenster als Fallback die Anzeige.
3. **Shared Lockfile Entprellung:** Analog zu `SHARED_SOUND_LOCK_FILE` verhindert ein temporäres Lockfile (`SHARED_TOAST_LOCK_FILE`), dass zwei Fenster für denselben Event-Wechsel denselben Toast gleichzeitig feuern (Cooldown: 3000 ms).

### 3.2 Koexistenz & Deaktivierung fremder Toasts
Damit keine doppelten Benachrichtigungen durch Dritt-Erweiterungen entstehen:

| Anbieter / Tool | Herkunft der bisherigen Toasts | Wie deaktivieren? |
| :--- | :--- | :--- |
| **Claude Notifier** (`singularityinc.claude-notifier`) | Hook-gesteuerte Desktop-Toasts | In VS Code `claudeNotifier.*.level` auf `"sound"` oder `"off"` stellen (in `settings.json` ist `"sound"` bereits aktiv), oder Extension vollständig deaktivieren/deinstallieren. |
| **Antigravity** (`google.google-antigravity`) | Native Windows-Toasts via PowerShell / `showOpenChatToast` | In VS Code über das Glocken-Symbol (Notification Center) oder Einstellungen Benachrichtigungen für `Google Antigravity` stummschalten. |
| **Claude Code CLI** | Native OS-Push-Benachrichtigungen | In `~/.claude/settings.json`: `"agentPushNotifEnabled": false` und `"inputNeededNotifEnabled": false`. |
| **ai-sessions** | Eigene Toasts | Master-Schalter `sessionDashboard.notifications.enabled` und feingranulare Provider-Toggles `sessionDashboard.notifications.providers.*`. |

---

## 4. Konfiguration in VS Code (`package.json`)

```json
{
  "sessionDashboard.notifications.enabled": {
    "type": "boolean",
    "default": true,
    "description": "Visuelle Benachrichtigungen (Toasts) bei Fertigstellung und Rückfragen anzeigen."
  },
  "sessionDashboard.notifications.taskCompleted": {
    "type": "boolean",
    "default": true,
    "description": "Benachrichtigung anzeigen, wenn eine Session eine Aufgabe abschließt."
  },
  "sessionDashboard.notifications.needsInput": {
    "type": "boolean",
    "default": true,
    "description": "Benachrichtigung anzeigen, wenn eine Session auf Eingabe oder Freigabe wartet."
  },
  "sessionDashboard.notifications.providers": {
    "type": "object",
    "properties": {
      "claude": { "type": "boolean", "default": true },
      "antigravity": { "type": "boolean", "default": true },
      "copilot": { "type": "boolean", "default": true },
      "codex": { "type": "boolean", "default": true }
    },
    "description": "Visuelle Benachrichtigungen pro Anbieter aktivieren/deaktivieren."
  }
}
```

---

## 5. Betroffene Dateien & Modifikationen

1. **`lib/toastNotifier.js` (NEU):**
   - Erkennt Zustandswechsel (`taskCompleted`, `needsInput`) parallel zu `soundNotifier.js`.
   - Führt Workspace-Matching und Shared-Lockfile-Entprellung durch.
   - Formatiert Titel, Projekt und Textzeile.
   - Ruft `vscode.window.showInformationMessage` mit `[Chat öffnen]` auf.
2. **`extension.js`:**
   - Instanziiert `ToastNotifier`.
   - Übergibt den `openSession`-Handler als Callback.
   - Ruft `toastNotifier.evaluate(model.sessions)` im Update-Zyklus auf.
   - Registriert das Modul in `context.subscriptions` (sauberes `dispose()`).
3. **`package.json`:**
   - Neue Konfigurationseinträge unter `sessionDashboard.notifications.*`.
4. **`package.json` (Scripts):**
   - `npm run check` um `node -c lib/toastNotifier.js` erweitern.
5. **`TODO.md` & `CHANGELOG.md`:**
   - Dokumentation und Versionierung (Minor `v0.52.0`).

---

## 6. Verifikationsplan

1. **Syntax & Packaging:**
   - `npm run check`
   - `npm run package`
2. **Funktionstests:**
   - **Antigravity-Fertigstellung:** Toast erscheint mit Projektname und Chat-Titel; Klick auf `[Chat öffnen]` navigiert zum Chat.
   - **Claude-Code-Rückfrage:** Toast erscheint mit Fragehinweis; Klick auf `[Chat öffnen]` fokussiert Secondary Sidebar.
   - **Multi-Window-Test:** Zwei VS-Code-Fenster mit unterschiedlichen Workspaces geöffnet: Toast erscheint nur in dem Fenster, zu dem das Session-Projekt gehört.
   - **Provider-Toggle:** Deaktivieren eines Providers in `sessionDashboard.notifications.providers` unterdrückt dessen Toasts zuverlässig.

