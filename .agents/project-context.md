# Projektkontext: ai-sessions

VS-Code-Extension „AI Sessions": zeigt alle Sessions von Claude Code, Antigravity und
GitHub Copilot nach Zustand (wartet / arbeitet / gemerkt / fertig / erledigt), dazu Quota-Limits
in der Statusleiste, Analyse-Ansicht, Transcript-Viewer und Sound-Benachrichtigungen.
Wird als `.vsix` lokal installiert. **Keine Lucee-App** — das Repo liegt im Webroot,
weil dort alle Repos nebeneinanderliegen, und wird nie deployt.

## Architektur & Einstiegspunkte

- **Einstieg** `extension.js`, Logik in `lib/`; je Anbieter ein Modul unter `lib/providers/`
  (`claude.js`, `antigravity.js`, `copilot.js`). Ein neuer Anbieter bekommt dort ein eigenes Modul.
- **Nur lesend.** Die Extension steuert keine Session, sie liest lokale Konfigurations- und
  Datenordner (`~/.claude`, `~/.gemini/antigravity`, VS-Code-`globalStorage`/`workspaceStorage`)
  über interne, undokumentierte Wege. Bricht ein Anbieter sein Format, zuerst dort suchen; die
  Belege stehen in den Plänen unter `.agents/plans/`.
- **Eigener Zustand** („Erledigt", „Gemerkt") liegt in `lib/doneStore.js` / `lib/bookmarkStore.js`. Ein
  Lesefehler darf diese Markierungen nie überschreiben — Plan
  `2026-10-04_session-dashboard-fix-erledigt-verlust-und-limit-250.md`.
- **`npm run check`** prüft die Syntax jedes Moduls einzeln. Wer ein Modul unter `lib/` anlegt,
  trägt es dort nach — sonst bleibt es ungeprüft.
- **Versionierung:** `version` in `package.json` je Änderung hochzählen (Patch für Fixes, Minor für
  Funktionen); die Version gehört in den Erledigt-Eintrag der `TODO.md` und die Commit-Nachricht.
- **VSIX-Paketierung & Automatische Installation:** Nach jeder Änderung (nach erfolgreichem `npm run check`)
  immer automatisch die neue Version paketieren (`npm run package`) und direkt im Editor installieren
  (`code --install-extension vsix/ai-sessions-<version>.vsix`), bevor der Vorgang abgeschlossen gemeldet wird.
  VSIX-Pakete gehören ausnahmslos nach `vsix/`, nie ins Hauptverzeichnis der Extension. In
  `.gitignore` und `.vscodeignore` sind `vsix/` und `**/*.vsix` stets ausgeschlossen.
