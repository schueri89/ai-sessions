# Implementierungsplan: Akustischer Leerlauf-Reminder (idleReminder) & Bereinigung „Geprüft"-Button

Datum: 11.10.2026  
Status: Erledigt (v0.38.0)  
Betroffenes Projekt: ai-sessions

---

## 1. Übersicht & Zielsetzung

1. **Akustischer Leerlauf-Reminder (idleReminder)**:
   - Claude Code löst nach ca. 60 Sekunden Leerlauf im Terminal / Chat einen Hinweis aus (`idle_prompt`: *Claude is waiting for your input*). Bisher blieb dies stumm, da der SoundNotifier nur Töne für `taskCompleted`, `needsInput` und `limitAvailable` vorsah.
   - Ein neuer diskreter Reminder-Sound (`idleReminder`, Standard Windows: `ding`, macOS: `Ping`, Linux: `message.oga`) erinnert nach konfigurierbarer Leerlaufzeit (Standard: 60s) daran, dass eine Session auf die nächste Benutzereingabe wartet.
   - Vorhören über den Befehl `sessionDashboard.previewSound` und Steuerung über VS Code Settings (`sessionDashboard.sound.idleReminder.*`).

2. **Entfernung des redundanten „Geprüft"-Buttons**:
   - In der Kanban-Spalte „Gemerkt" besaß jede Karte in den Card-Actions einen Button „☑️ Geprüft", der `unbookmark` ausführte.
   - Da jede Karte im Header bereits über ein Pin-Icon verfügt, das im gemerkten Zustand mit gelbem Akzent aktiv ist und bei Klick die Session entpinnt (`unbookmark`), war dieser Button doppelt vorhanden und nahm Platz weg.
   - Der Button „☑️ Geprüft" in den Card-Actions wurde entfernt. Der Sammel-Aktionsbutton „☑️ Alle geprüft" im Spaltenkopf bleibt für Massenfreigaben unverändert erhalten.

---

## 2. Technische Umsetzung

### 2.1 SoundNotifier Erweiterung (`lib/soundNotifier.js`)
- **Soundauflösung (`resolveSoundPath`)**:
  - `idleReminder` wird auf `ding` (Windows: `C:\Windows\Media\ding.wav`), `Ping` (macOS: `/System/Library/Sounds/Ping.aiff`) bzw. `message.oga` (Linux) gemappt.
- **Konfiguration (`getSoundConfig`)**:
  - `idleReminder`: `enabled` (boolean, default: true), `sound` (string, default: `ding` / `Ping`), `delaySeconds` (number, default: 60).
- **Zustandsüberwachung & Timer**:
  - `becameIdleAt` und `idleReminderSent` werden pro Session verfolgt.
  - Beim Wechsel von `busy` nach `idle` (`taskCompleted`) wird `becameIdleAt = Date.now()` gesetzt und ein Timer via `setTimeout` für die konfigurierte Zeit gestartet.
  - Sobald der Timer abläuft oder in `evaluate()` festgestellt wird, dass `now - becameIdleAt >= delayMs`, ertönt `idleReminder` einmalig.
  - Wechselt die Session wieder nach `busy`, `done` oder wird geschlossen, wird der Timer abgebrochen.
  - Initial existierende Sessions (`isInitialRun = true`) lösen beim VS-Code-Start keinen Ton aus (`becameIdleAt = 0`, `idleReminderSent = true`).
  - Neue Methoden `scheduleIdleReminder()`, `cancelIdleTimer()` und `dispose()`.

### 2.2 BoardPanel Bereinigung (`lib/boardPanel.js`)
- Entfernung des Blocks `if (col.state === 'bookmarked') { const unpinBtn = el('button', ''); ... }` aus der Aktionsleiste der Karten.
- Pin-Icon (`pin-btn`) im Kartenkopf übernimmt weiterhin das Entpinnen der einzelnen Karte.
- Spaltenkopf-Button „☑️ Alle geprüft" bleibt unverändert erhalten.

### 2.3 Konfiguration & Befehle (`package.json`, `extension.js`)
- `sessionDashboard.previewSound` enthält nun den Eintrag `$(bell) Leerlauf-Reminder / idle_prompt (idleReminder)`.
- `soundNotifier` ist in `context.subscriptions` registriert, um Timer bei Deaktivierung sauber freizugeben.
- `package.json` deklariert die neuen Settings unter `sessionDashboard.sound.idleReminder.*`.
- Version bump auf `v0.38.0`.

---

## 3. Verifikation

- `npm run check`: Alle Module syntaktisch geprüft, Webview-Scripts erfolgreich validiert.
- Unit-Tests:
  - `SoundNotifier`: Korrekte Unterdrückung bei `isInitialRun`, Auslösen von `taskCompleted` bei Fertigstellung, Auslösen von `idleReminder` nach 60s, Abbruch bei neuem Prompt (`busy`), Timer-Bereinigung via `dispose()`.
  - `BoardPanel`: Überprüfung, dass „☑️ Geprüft" auf Karten entfernt ist, Spaltenkopf „Alle geprüft" und `pin-btn` aber erhalten bleiben.
- Paketierung & Installation via `npm run package` und `code --install-extension`.

