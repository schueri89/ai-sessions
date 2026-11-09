# Plan: Differenzierte Sound-Benachrichtigungen bei Fehlschlägen (v0.83.0)

## Kontext & Problemstellung
Bisher spielten alle Hintergrundprozesse bei Abschluss denselben Erfolgs-Ton (`taskCompleted` = standardmäßig `tada` auf Windows bzw. `Hero` auf macOS) ab – selbst wenn ein Prozess fehlschlug:
1. **⚡ Tasks (`lib/projectTasks.js`):** Bei Exit-Code != 0 ertönte dieselbe Siegesfanfare wie bei erfolgreichen Builds.
2. **🚀 Deploys (`lib/jenkinsWatcher.js`):** Rot gelaufene Jenkins-Builds (`FAILURE`), instabile Builds (`UNSTABLE`) oder Abbrüche (`ABORTED`) spielten pauschal `taskCompleted` (`tada`) ab.
3. **🛡️ Audits (`lib/auditManager.js`):** Audits mit kritischen Befunden oder Laufzeitfehlern spielten denselben Sound ab wie fehlerfreie Durchläufe.

---

## Geplante Maßnahmen

### 1. Zentrales Sound-Event `taskFailed` im SoundNotifier (`lib/soundNotifier.js`)
- Neues Event `taskFailed` neben `taskCompleted`, `idleReminder`, `needsInput`, `limitAvailable`.
- Plattform-Standards für `taskFailed`:
  - Windows: `chord` (`C:\Windows\Media\chord.wav`)
  - macOS: `Basso` (`/System/Library/Sounds/Basso.aiff`)
  - Linux: `/usr/share/sounds/freedesktop/stereo/dialog-error.oga` (Fallback: `bell.oga`)
- Aufnahme von `Windows Error` (`C:\Windows\Media\Windows Error.wav`) in `WIN_SOUNDS` und `SOUND_OPTIONS` als moderner Windows-Fehlerton.
- Konfiguration in `getSoundConfig()`:
  - `taskFailed.enabled` (Standard: `true`)
  - `taskFailed.sound` (Standard: `chord` / `Basso`)

### 2. Differenzierte Triggerung in Tasks, Deploys und Audits
- **⚡ Tasks (`lib/projectTasks.js`):**
  - `isSuccess === true`: spielt `sessionDashboard.sound.tasks.sound` (Standard: `tada` / `taskCompleted`).
  - `isSuccess === false`: spielt `sessionDashboard.sound.tasks.soundFailed` (Standard: `chord` / `taskFailed`).
- **🚀 Deploys (`lib/jenkinsWatcher.js`):**
  - `lb.result === 'SUCCESS'`: spielt `sessionDashboard.sound.jenkins.sound` (Standard: `tada` / `taskCompleted`).
  - `lb.result !== 'SUCCESS'` (`FAILURE`, `UNSTABLE`, `ABORTED` etc.): spielt `sessionDashboard.sound.jenkins.soundFailed` (Standard: `chord` / `taskFailed`).
- **🛡️ Audits (`lib/auditManager.js`):**
  - `isSuccess && (status === 'passed' || status === 'success')`: spielt `sessionDashboard.sound.audits.sound` (Standard: `tada`).
  - Bei Befunden oder Fehlern (`!isSuccess || status === 'error' || status === 'warning'`): spielt `sessionDashboard.sound.audits.soundFailed` (Standard: `chord` / `taskFailed`).

### 3. Konfiguration & Settings (`package.json`)
- **Tab: Tasks:**
  - `sessionDashboard.sound.tasks.soundFailed`: Sound bei fehlgeschlagenem Task.
- **Tab: Deploys:**
  - `sessionDashboard.sound.jenkins.sound`: Sound bei erfolgreichem Build.
  - `sessionDashboard.sound.jenkins.soundFailed`: Sound bei fehlgeschlagenem/instabilem Build.
- **Tab: Audits:**
  - `sessionDashboard.sound.audits.soundFailed`: Sound bei Befunden oder Audit-Fehlern.
- **Sounds:**
  - `sessionDashboard.sound.taskFailed.enabled`: Sound für fehlgeschlagene Vorgänge aktivieren.
  - `sessionDashboard.sound.taskFailed.sound`: Standard-Sound bei Fehlschlägen inklusive Vorhör-Link.

### 4. Interaktiver Sound-Assistent (`extension.js`)
- `sessionDashboard.previewSound`:
  - Neuer Menüeintrag `$(error) Ton für „Aufgabe / Deploy fehlgeschlagen“ wählen...`.
  - `taskFailed` als konfigurierbares und zuweisbares Sound-Event im Katalog.

### 5. Tests & Verifikation
- Anpassung und Erweiterung von:
  - `test/check-sound-notifier.js`: Auflösung und Lock-Verhalten für `taskFailed`.
  - `test/check-project-tasks.js`: Prüfung von `taskFailed` bei `isSuccess: false`.
  - `test/check-audit-manager.js`: Prüfung von `taskFailed` bei `isSuccess: false` / Fehlern.
  - `test/check-settings-categories-and-context.js`: Aktualisierung der Eigenschaftsanzahlen und neuen Properties.
- `npm run check`
- Paketierung `npm run package` und Installation im Editor.
