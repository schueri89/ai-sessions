# Implementierungsplan: Sound-Benachrichtigungen für Session-Dashboard

Datum: 05.10.2026  
Status: Erledigt (v0.29.0)  
Betroffenes Projekt: session-dashboard

---

## 1. Übersicht & Zielsetzung

Analog zum VS-Code-Plugin **Claude Notifier** (`singularityinc.claude-notifier`) soll das **AI Session Dashboard** akustische Benachrichtigungen (Sounds) abspielen bei:
1. **Session fertig** (Agent beendet Aufgabe / idle)
2. **Rückfrage besteht** (Permission prompt / Frage an den Benutzer / `ask_question`)
3. **Limit wieder verfügbar** (Rate-Limit abgelaufen / 5h- bzw. 7d-Quota wieder frei)

**Entscheidungen des Benutzers aus dem Feedback:**
- **Limit wieder verfügbar**: Nutzt standardmäßig denselben Sound wie **Rückfrage** (`chimes` / `Glass`), da in beiden Fällen der Benutzer wieder aktiv werden muss.
- **Antigravity Hooks**: Werden im Zuge der Dashboard-Integration nicht benötigt bzw. deaktiviert, da das Dashboard den Status zuverlässig und inklusive Limit-Resets überwacht.
- **Claude Notifier**: Wird vom Benutzer deaktiviert, sobald diese Anpassung im Session-Dashboard fertig ist. Daher werden standardmäßig alle 3 Provider (`claude`, `antigravity`, `copilot`) aktiviert, bleiben aber über Konfigurationsschalter individuell steuerbar.

---

## 2. Technische Prüfung & Architektur

### 2.1 Analyse der 3 Event-Typen

| Event | Claude Code | Google Antigravity | GitHub Copilot | Quota / Limits | Standard-Sound (Win / Mac) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **1. Session fertig** | Statuswechsel `busy` → `idle` / `done`. | Statuswechsel `CASCADE_RUN_STATUS_RUNNING` (`busy`) → `idle` in `conversation_summaries.db`. | Statuswechsel `busy` → `idle` in `session-store.db`. | N/A | `tada` / `Hero` |
| **2. Rückfrage besteht** | `status === 'waiting'` mit `waitingFor` (z. B. `permission_prompt`). | `waitingFor === 'Rückfrage'`, erkannt an `ask_question`-Tool in `transcript.jsonl`. | `waitingFor` / confirmation pending. | N/A | `chimes` / `Glass` |
| **3. Limit wieder verfügbar** | Rate-Limit mit `resetsAt` läuft ab (`now >= resetsAt`) oder 5h-Quota sinkt unter 100%. | Rate-Limit (`RESOURCE_EXHAUSTED` / 429) läuft ab oder Live-Hub Quota-Reset erreicht. | N/A | **NUR im Dashboard möglich!** | `chimes` / `Glass` (identisch zu Rückfrage) |

---

### 2.2 Dashboard-State-Monitoring vs. Antigravity Hooks

* **Entscheidung**: Vollständige Übernahme durch das Dashboard.
* Antigravity-Hooks (`hooks.json`) werden nicht benötigt und deaktiviert.
* Das Dashboard beobachtet SQLite-WAL-Dateien (`conversation_summaries.db-wal`), wodurch Statusänderungen innerhalb von ~200–300 ms erkannt werden.
* Nur das Dashboard kann das Event **Limit wieder verfügbar** erfassen.

---

### 2.3 Ablösung von "Claude Notifier"

* Der Benutzer deaktiviert das Plugin `Claude Notifier` nach Fertigstellung.
* Das Session-Dashboard bietet dennoch granulare Schalter in den Einstellungen:
  - `sessionDashboard.sound.providers.claude`: `true` (Standard: Aktiv)
  - `sessionDashboard.sound.providers.antigravity`: `true` (Standard: Aktiv)
  - `sessionDashboard.sound.providers.copilot`: `true` (Standard: Aktiv)
* So kann jeder Provider nach Wunsch einzeln stummgeschaltet werden.

---

### 2.4 Wie wird der Sound technisch abgespielt?

Wie im Claude Notifier bewährt:
* **Windows**: Ausführen eines leisen PowerShell-Befehls mit `[System.Media.SoundPlayer]` über Node.js `child_process.exec` (asynchron, blockiert nicht).
  - Standard-Windows-WAVs in `C:\Windows\Media\`:
    - Session fertig: `tada.wav` oder `notify.wav`
    - Rückfrage: `chimes.wav` oder `Windows Notify.wav`
    - Limit wieder frei: `ringin.wav` oder `chord.wav`
* **macOS / Linux**:
  - macOS: `afplay` mit System-Sounds (`Hero.aiff`, `Glass.aiff`, `Ping.aiff`).
  - Linux: `pw-play` / `paplay` mit Freedesktop-Sounds (`complete.oga`, `bell.oga`).
* **Eigene Sounds**: Optionale Angabe benutzerdefinierter Dateipfade in den VS Code Settings.

---

## 3. Architektur des Sound-Systems im Dashboard

### 3.1 Neues Modul `lib/soundNotifier.js`

Verwaltet den vorherigen Zustand aller Sessions und Quotas:
```javascript
class SoundNotifier {
  constructor(context) {
    this.sessionStates = new Map(); // sessionId -> { state, waitingFor, rateLimitResetsAt }
    this.quotaStates = { claudeLimited: false, antigravityLimited: false };
    this.isInitialRun = true; // Unterdrückt Töne beim ersten Laden von VS Code
  }

  // Wird bei jedem model.refresh() aufgerufen:
  evaluate(sessions, quota) { ... }

  // Spielt Sound für das Event ab (prüft Settings, Cooldown & Provider):
  playSound(eventType, provider) { ... }
}
```

#### Event-Erkennungsregeln:
1. **Session fertig (`taskCompleted`)**:
   - Vorher: `state === 'busy'`
   - Jetzt: `state === 'idle'` ODER `state === 'done'` (oder `state === 'waiting'` ohne offene Rückfrage).
   - Sound: `tada.wav` (konfigurierbar).

2. **Rückfrage besteht (`needsInput`)**:
   - Vorher: beliebiger Zustand (meist `busy`)
   - Jetzt: `state === 'waiting'` UND (`waitingFor === 'Rückfrage'` ODER Claude `status === 'waiting'` / Antigravity `ask_question`).
   - Sound: `chimes.wav` (konfigurierbar).

3. **Limit wieder verfügbar (`limitAvailable`)**:
   - Fall A (Session-Rate-Limit): Vorher hatte Session ein `rateLimit` mit `resetsAt > 0`. Jetzt ist `Date.now() >= resetsAt` (oder das Rate-Limit-Objekt ist verschwunden).
   - Fall B (Globales Quota-Limit): Quota war zuvor rate-limited (oder 100%), jetzt wieder frei (`isRateLimited === false` bzw. < 100%).
   - Sound: `ringin.wav` (konfigurierbar).

4. **Entstörung & Schutz gegen Fehlalarme**:
   - **Initial-Run-Suppression**: Beim Starten von VS Code werden alle existierenden Zustände initial eingelesen, ohne Sounds auszulösen.
   - **Cooldown / Debounce**: Mindestens 3 Sekunden Abstand zwischen zwei Sounds desselben Typs, um Flackern bei schnellen File-Events zu verhindern.
   - **Auto-Mute when Focused (optional)**: Wenn das VS-Code-Fenster bereits aktiv im Vordergrund ist, kann der "Fertig"-Ton optional unterdrückt werden.

---

## 4. Konfiguration & UI (Settings & Dashboard)

### 4.1 Neue VS Code Settings (`package.json`)
```json
{
  "sessionDashboard.sound.enabled": {
    "type": "boolean",
    "default": true,
    "description": "Master-Schalter: Akustische Benachrichtigungen aktivieren."
  },
  "sessionDashboard.sound.providers": {
    "type": "object",
    "properties": {
      "antigravity": { "type": "boolean", "default": true },
      "copilot": { "type": "boolean", "default": true },
      "claude": { "type": "boolean", "default": false }
    },
    "description": "Sound-Benachrichtigungen pro Provider aktivieren (Claude standardmäßig aus, falls Claude Notifier aktiv ist)."
  },
  "sessionDashboard.sound.taskCompleted.enabled": { "type": "boolean", "default": true },
  "sessionDashboard.sound.taskCompleted.sound": { "type": "string", "default": "tada" },
  "sessionDashboard.sound.needsInput.enabled": { "type": "boolean", "default": true },
  "sessionDashboard.sound.needsInput.sound": { "type": "string", "default": "chimes" },
  "sessionDashboard.sound.limitAvailable.enabled": { "type": "boolean", "default": true },
  "sessionDashboard.sound.limitAvailable.sound": { "type": "string", "default": "chimes" }
}
```

### 4.2 Befehle & Dashboard-Steuerung
- Befehl `sessionDashboard.toggleSound`: Schaltet Sounds schnell ein/aus (z. B. via Menü oder Klick in der Statusleiste).
- Befehl `sessionDashboard.previewSound`: Erlaubt das Vorhören der konfigurierten Töne.
- Dashboard-Header: Lautsprecher-Icon (🔊 / 🔇) in der Symbolleiste des Dashboard-Webviews.

---

## 5. Betroffene Dateien & Änderungen

1. **`lib/soundNotifier.js`** (NEU):
   - Zentrale Sound-Engine & State-Transitions-Erkennung.
   - Cross-Platform Audio-Player (`powershell Media.SoundPlayer` für Windows, `afplay` für macOS, `paplay` für Linux).
   - Cooldown- und Deduplizierungslogik.
2. **`extension.js`**:
   - Initialisierung von `SoundNotifier`.
   - Aufruf von `soundNotifier.evaluate(model.sessions, model.quota)` in `update()`.
   - Registrierung der neuen Befehle (`toggleSound`, `previewSound`).
3. **`lib/registry.js`**:
   - Ergänzung der `watchTargets()` um `conversation_summaries.db-wal`, damit Antigravity-Statusänderungen sofort ohne Polling-Verzögerung gefeuert werden.
4. **`package.json`**:
   - Registrierung der neuen Konfigurationsoptionen und Befehle.
5. **`lib/boardPanel.js`**:
   - Lautsprecher-Button (Mute/Unmute) in der Dashboard-Toolbar.

---

## 6. Verifikationsplan

1. **Syntax- & Packaging-Check**:
   - `npm run check`
   - `npm run package`
2. **Funktionstests**:
   - **Antigravity Session fertig**: Eine Aufgabe abschließen → `tada.wav` ertönt.
   - **Antigravity Rückfrage**: Rückfrage via `ask_question` → `chimes.wav` ertönt.
   - **Limit-Reset**: Simulieren eines abgelaufenen Limits (`resetsAt`) → `ringin.wav` ertönt.
   - **Claude-Koexistenz**: Überprüfen, dass bei `claude: false` keine Doppeltöne mit Claude Notifier entstehen.
   - **Mute-Funktion**: Stummschaltung über Dashboard bzw. Settings schaltet alle Töne stumm.
