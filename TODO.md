# Projekt ToDo-Liste: tools
Hier pflegen wir gemeinsam die anstehenden Aufgaben. Nur Vorhaben – Hintergründe und Entscheidungen stehen in `.agents/plans/` bzw. `.agents/project-context.md`.

## Offene Aufgaben
- [ ] Code-Review aller Commits durch Opus 5.5
- [ ] welche weiteren Infos liefern Claude Code und Antigravity zu den einzelnen Sessions zurück? Tokens, Kosten, Cache?
- [ ] 3.Tab für Historie aller Sessions mit mehr Infos in Form einer Tabelle (analog zum anderen Plugin)
- [ ] Dashboard: Usage Card für Copilot möglich?
- [ ] Dashboard: Copilot Kachel -> Klick darauf öffnet nicht den Chat direkt in Copilot!
- [ ] Bugfix: ich kann auf dem Dashboard die Copilot Session nicht als erledigt markieren
- [ ] Antigravity Sound-Hooks in .agents/hooks.json und .agents/tools/notify-sound.ps1 komplett löschen (aktuell temporär deaktiviert mit "enabled": false)
- [ ] vsix Dateien in einen Unterordner packen
- [ ] Dashboard Erledigt Spalte: bei mehr als 5 Einträgen, "Alles erledigen" Button integrieren

## Erledigt
- [x] session-dashboard: Geister-Zustände & Tool-Freigaben für Copilot korrigiert v0.29.1 (Alte unvollständige Sessions > 30 Min automatisch idle statt dauerhaft "Arbeitet…"; modelState 4 als "Wartet auf dich" / Rückfrage erkannt inkl. Needs-Input-Sound; Frische-Prüfung applyFreshness) — 06.10.2026
- [x] session-dashboard: Sound-Benachrichtigungen v0.29.0 (Akustische Benachrichtigungen bei Session fertig [tada], Rückfrage [chimes] und Limit wieder verfügbar [chimes]; native Windows/macOS/Linux Audioausgabe; Master-Schalter & Provider-Schalter; WAL-Dateiwächter für Subsekunden-Latenz; Mute-Icon in Dashboard-Toolbar; Befehle zum Vorhören und Umschalten) (Plan: `.agents/plans/2026-10-05_session-dashboard-sound-notifications.md`) — 05.10.2026
- [x] session-dashboard: Leere Chats für Copilot, Claude Code & Antigravity filtern v0.28.1 (Leere Idle-Sessions wie "root-3d" ohne Prompts/Turns automatisch ignorieren; saubere Delta-Rekonstruktion für Copilot) — 05.10.2026
- [x] session-dashboard: UI-Polish v0.28.0 (Status Bar: grüne Quota-Schrift < 80%; Dashboard: Ladeanimation beim Starten; Limit-Text: Wochentag bei > 24h; Projekt-Filter: Top 5 Badges + Ausklappen; Spalten-Pagination: max. 20 Sessions initial + Button zum sofortigen Laden aller restlichen) (Plan: `.agents/plans/2026-10-05_session-dashboard-ui-polish-loading-limits-pagination.md`) — 05.10.2026
- [x] session-dashboard: GitHub Copilot Integration v0.27.0 (Chat- & Agent-Sessions aus workspaceStorage & session-store.db, Stufe 1–4 Analytics, Timeline, Tool-Breakdown, Read-Only Transcript Viewer, Status Bar & Filter) (Plan: `.agents/plans/2026-10-04_session-dashboard-copilot-integration.md`) — 05.10.2026
- [x] session-dashboard: Analyse & Verbrauchsübersicht (Stufe 4 v0.26.0: Read-Only Viewer / Session-Detailansicht für Claude Code & Antigravity, Turn-Verlauf mit Prompts, Thinking, Tool-Aufrufen & Antworten, Suche & Filter, Einstieg via Card-Button [👁️ Details] & TreeView-Menü) (Plan: `.agents/plans/2026-10-04_session-dashboard-analyse-stufe-4.md`) — 04.10.2026
- [x] session-dashboard: Analyse & Verbrauchsübersicht (Stufe 3 v0.25.0: Tool- & Content-Breakdown nach Kategorien [Read, Edit, Bash, Search, Web, Tasks], segmentierter Token-Balken [Input, Output/Thinking, Cache Read/Write], responsives 2-Spalten-Layout + Full-Width-Tabelle für Projekte) (Plan: `.agents/plans/2026-10-04_session-dashboard-analyse-stufe-3.md`) — 04.10.2026
- [x] session-dashboard: Analyse & Verbrauchsübersicht (Stufe 2 v0.24.1: 7- & 30-Tage-Historie, Scope-Umschaltung [Heute | 7 Tage | 30 Tage], CSS-Fix für Quota & Analyse-Layout, tägliches Balkendiagramm, aggregierte KPIs & File-Cache-Performance) (Plan: `.agents/plans/2026-10-04_session-dashboard-analyse-stufe-2.md`) — 04.10.2026
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
