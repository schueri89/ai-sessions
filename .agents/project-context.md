# Projektkontext: tools

Entwicklerwerkzeuge für die eigene Arbeitsumgebung. **Keine Lucee-App** — das Repo liegt nur im
Webroot, weil dort alle Repos nebeneinanderliegen, und wird nie deployt. Jedes Werkzeug liegt in
einem eigenen Unterordner mit eigenem `README.md` (Bedienung, Installation, Grenzen).

## Struktur

- `session-dashboard/` — VS-Code-Extension „AI Sessions": zeigt alle Sessions von Claude Code,
  Antigravity und GitHub Copilot nach Zustand (wartet / arbeitet / gemerkt / fertig / erledigt),
  dazu Quota-Limits in der Statusleiste, Analyse-Ansicht, Transcript-Viewer und
  Sound-Benachrichtigungen. Wird als `.vsix` lokal installiert.
- `cf-debug-chrome/` — Chrome-DevTools-Panel „CF Debug" (MV3), zeigt die Lucee-Debug-Daten je
  Request. Wird unpacked geladen.
- `.agents/plans/` — Implementierungspläne, fast ausschließlich zum `session-dashboard`.

## session-dashboard

- **Einstieg** `extension.js`, Logik in `lib/`; je Anbieter ein Modul unter `lib/providers/`
  (`claude.js`, `antigravity.js`, `copilot.js`). Ein neuer Anbieter bekommt dort ein eigenes Modul.
- **Nur lesend.** Die Extension steuert keine Session, sie liest lokale Konfigurations- und
  Datenordner (`~/.claude`, `~/.gemini/antigravity`, VS-Code-`globalStorage`/`workspaceStorage`)
  über interne, undokumentierte Wege. Bricht ein Anbieter sein Format, zuerst dort suchen; die
  Belege stehen in den Plänen.
- **Eigener Zustand** („Erledigt", „Gemerkt") liegt in `doneStore.js` / `bookmarkStore.js`. Ein
  Lesefehler darf diese Markierungen nie überschreiben — Plan
  `2026-10-04_session-dashboard-fix-erledigt-verlust-und-limit-250.md`.
- **`npm run check`** prüft die Syntax jedes Moduls einzeln. Wer ein Modul unter `lib/` anlegt,
  trägt es dort nach — sonst bleibt es ungeprüft.
- **Versionierung:** `version` in `package.json` je Änderung hochzählen (Patch für Fixes, Minor für
  Funktionen); die Version gehört in den Erledigt-Eintrag der `TODO.md` und die Commit-Nachricht.
- **VSIX-Pakete gehören ausnahmslos nach `vsix/`**, nie ins Hauptverzeichnis der Extension.
  Paketiert wird über `npm run package` (legt `vsix/` an und ruft `vsce package … --out vsix/`),
  installiert über `code --install-extension vsix/session-dashboard-<version>.vsix`. In
  `.gitignore` und `.vscodeignore` sind `vsix/` und `**/*.vsix` stets ausgeschlossen.

## cf-debug-chrome

- **Gegenstück auf dem Server:** `cf-shared/core/baseApplication.cfc` setzt bei aktivem
  Admin-Debugging den Header `X-CF-Debug`; die Details liefert `cf-admin/api.cfc`
  (`getDebugRequest`). Wer das Header-Format ändert, ändert beide Seiten.
- **Versionsquelle** ist die `manifest.json` im Webroot: `getExtensionVersion` liest sie und meldet
  sie als Sollversion. Release heißt `version` hochzählen und die Kopie auf dem Netzlaufwerk
  **und** im Webroot ausrollen — beide müssen gleich sein.
