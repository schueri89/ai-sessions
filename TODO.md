# Projekt ToDo-Liste: tools
Hier pflegen wir gemeinsam die anstehenden Aufgaben. Nur Vorhaben – Hintergründe und Entscheidungen stehen in `.agents/plans/` bzw. `.agents/project-context.md`.

## Offene Aufgaben
- [ ] Code-Review aller Commits durch Opus 5.5
- [ ] session-dashboard: Analyse & Verbrauchsübersicht (Stufe 2: 30-Tage-Historie, Stufe 3: Tool-/Content-Breakdown, Stufe 4: Read-Only Viewer)
- [ ] welche weiteren Infos liefern Claude Code und Antigravity zu den einzelnen Sessions zurück? Tokens, Kosten, Cache?

## Erledigt
- [x] session-dashboard: Analyse & Verbrauchsübersicht (Stufe 1 & Visual Fix v0.23.1: SVG-Skalierung/Clipping, integrierte X-Achse, Netto/Cache-Toggle, Wall-Clock-Arbeitszeit, CSP-Fix für Modellbalken) (Plan: `.agents/plans/2026-10-04_session-dashboard-analyse-stufe-1.md`) — 04.10.2026
- [x] session-dashboard: Analyse & Verbrauchsübersicht (Stufe 1 & Visual Polish v0.23.3: Lesbare Badges 12-13px, saubere Flexbox-Uhrzeitenachse ohne CSS-Haufen, Netto/Cache-Toggle, Wall-Clock-Arbeitszeit, Codebase-Bereinigung von Duplikaten) (Plan: `.agents/plans/2026-10-04_session-dashboard-analyse-stufe-1.md`) — 04.10.2026
- [x] session-dashboard: Analyse & Verbrauchsübersicht (Stufe 1 & Visual Polish v0.23.4: Vergrößerte Typografie für Toolbar, Filter-Buttons, Projekt-Chips, Quota-Karten und Board-Karten) (Plan: `.agents/plans/2026-10-04_session-dashboard-analyse-stufe-1.md`) — 04.10.2026
- [x] session-dashboard: Schutz von „Erledigt“- und „Gemerkt“-Markierungen gegen Datenverlust bei Lesefehlern & Entfernen von Antigravity LIMIT 250 (Plan: `.agents/plans/2026-10-04_session-dashboard-fix-erledigt-verlust-und-limit-250.md`) — 04.10.2026
- [x] session-dashboard: Filter für Projekte im Dashboard (Chips) & QuickPick nach Alphabet sortieren (Plan: `.agents/plans/2026-10-04_session-dashboard-projekt-filter-alphabetisch.md`) — 04.10.2026
- [x] session-dashboard: "Erledigt" ausschließlich durch manuelles Abhaken vergeben (kein automatisches Timeout/Schließen) (Plan: `.agents/plans/2026-10-04_session-dashboard-manuell-erledigt.md`) — 04.10.2026
- [x] session-dashboard: Status Bar trennt Usage-Infos für Claude Code & Antigravity mit gelb/rotem Hintergrund bei Limits (Plan: `.agents/plans/2026-10-04_session-dashboard-statusbar-separate-usage.md`) — 04.10.2026
- [x] session-dashboard: Usage von Claude Code und Antigravity in der Footerbar immer anzeigen (Plan: `.agents/plans/2026-10-04_session-dashboard-footerbar-usage.md`) — 04.10.2026
- [x] session-dashboard: Dashboard-Tab dauerhaft angepinnt laden (WebviewPanelSerializer, autoPinTab & openOnStartup) (Plan: `.agents/plans/2026-10-04_session-dashboard-pinned-tab.md`) — 04.10.2026
- [x] session-dashboard: Antigravity Live-Quota & Limit-Tracking via Language Server Hub (Plan: `.agents/plans/2026-10-04_session-dashboard-antigravity-usage-tracking.md`) — 04.10.2026
- [x] session-dashboard: Footerbar zeigt neben den aktiven ("arbeitet") auch fertige ("fertig") Sessions an (Plan: `.agents/plans/2026-10-04_session-dashboard-footerbar-fertig-sessions.md`) — 04.10.2026
- [x] session-dashboard: Context-Window pro Modell dynamisch auflösen (1M für Opus 5.5 etc.) (Plan: `.agents/plans/2026-10-04_session-dashboard-model-context-window.md`) — 04.10.2026
- [x] session-dashboard: 5-Stunden- und 7-Tage-Limits von Claude Code & Antigravity anzeigen (Plan: `.agents/plans/2026-10-04_session-dashboard-quota-limits.md`) — 04.10.2026
- [x] session-dashboard: `@vscode/vsce` 3.9.2 → 4.0.0 (Major, Paketier-Werkzeug aktualisiert und verifiziert) — 04.10.2026
- [x] session-dashboard: Context-Window- & Token-Auslastung auf den Session-Karten anzeigen (Plan: `.agents/plans/2026-10-04_session-dashboard-token-context-auslastung.md`)
- [x] session-dashboard: Statusleisten-Widget (`🤖 X arbeitet · Y wartet`) mit Direktzugriff (Plan: `.agents/plans/2026-10-03_session-dashboard-statusleiste.md`)
- [x] session-dashboard: Projekt-Badges & Filter-Chips nach Workspace/Unterordner (`tools`, `tvw-hub`, `status-portal` etc.) (Plan: `.agents/plans/2026-10-03_session-dashboard-projekt-filter.md`)
- [x] session-dashboard: Live-Aktivität auf Karten anzeigen („Was macht der Agent gerade?", letzter Tool-Call / Denkprozess) (Plan: `.agents/plans/2026-10-03_session-dashboard-live-activity.md`)
- [x] Freitextsuche für das Dashboard zum Suchen nach einzelnen Sessions (Plan: `.agents/plans/2026-10-03_session-dashboard-freitextsuche.md`)
- [x] Datum von Claude-Code-Sessions unveränderlich aus Transkript lesen (Plan: `.agents/plans/2026-10-03_session-dashboard-transcript-timestamps.md`)
- [x] Ältere Claude-Code-Sessions wiederhergestellt (62 Sessions aus Juli/August aus Papierkorb wiederhergestellt, cleanupPeriodDays: 0 in settings.json)
- [x] Spalte "Geschlossen, nicht erledigt" entfernen (beendete Sessions nach "Erledigt" führen) (Plan: `.agents/plans/2026-10-03_session-dashboard-remove-closed-column.md`)
- [x] Rate-Limit-Erkennung für Claude-Code-Sessions (Limit bis Reset in "Arbeitet", danach "Wartet auf dich") (Plan: `.agents/plans/2026-10-03_session-dashboard-rate-limit-handling.md`)
- [x] Sessions pinnen/merken ("Gemerkt"-Spalte und 📌-Icon in Sidebar & Dashboard) (Plan: `.agents/plans/2026-10-03_session-dashboard-gemerkt-spalte.md`)
- [x] Provider-Filter (Claude Code / Antigravity / Alle) in Sidebar und Dashboard (Plan: `.agents/plans/2026-10-03_session-dashboard-provider-filter.md`)
- [x] Antigravity-Sessions im Session-Dashboard unterstützen (Plan: `.agents/plans/2026-10-03_session-dashboard-antigravity.md`)
