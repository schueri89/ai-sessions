# tools

Entwicklerwerkzeuge für die eigene Arbeitsumgebung, als VS-Code- und Chrome-Extensions.

- **Art:** keine Lucee-App, wird nie deployt — die Extensions werden lokal installiert
- **Basis:** keine; jedes Werkzeug ist eigenständig und bringt sein eigenes `README.md` mit
- **Auth:** keine

## Struktur
- `session-dashboard/` – VS-Code-Extension „AI Sessions": Sessions von Claude Code, Antigravity und GitHub Copilot nach Zustand
- `cf-debug-chrome/` – Chrome-DevTools-Panel „CF Debug": Lucee-Debug-Daten je Request
- `.agents/plans/` – Implementierungspläne

## Mehr
- Offene Aufgaben: `TODO.md`
- Projektwissen und Konventionen: `.agents/project-context.md`
- Bedienung, Installation und Grenzen: `session-dashboard/README.md`, `cf-debug-chrome/README.md`
- Zentrale Regeln: `../.agents/global-core.md`
