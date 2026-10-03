# Projekt ToDo-Liste: tools
Hier pflegen wir gemeinsam die anstehenden Aufgaben. Nur Vorhaben – Hintergründe und Entscheidungen stehen in `.agents/plans/` bzw. `.agents/project-context.md`.

## Offene Aufgaben
- [ ] Code-Review aller Commits durch Opus 5.5
- [ ] session-dashboard: `@vscode/vsce` 3.9.2 → 4.0.0 (Major, nur Paketier-Werkzeug) — Stand 03.10.2026
- [ ] 5-Stunden- und Wochen-Limits von Claude Code & Antigravity anzeigen?!

## Erledigt
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
