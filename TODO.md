# Projekt ToDo-Liste: ai-sessions
Hier pflegen wir gemeinsam die anstehenden Aufgaben. Nur Vorhaben – Hintergründe und Entscheidungen stehen in `.agents/plans/` bzw. `.agents/project-context.md`.

## Offene Aufgaben
- [ ] Code-Review aller Commits durch Opus 5.5
- [ ] Changelog integrieren
- [ ] weitere Features aus Changelog von Claude Notifier Plugin erarbeiten

- [ ] welche weiteren Infos liefern Claude Code und Antigravity zu den einzelnen Sessions zurück? Tokens, Kosten, Cache?
- [ ] wie funktioniert Zuweisung von Session zu Projekt? das aktualisiert sich teilweise durch Öffnen des Chats - manuelle Korrektur wäre gut!

- [ ] 3.Tab für Historie aller Sessions mit mehr Infos in Form einer Tabelle (analog zum anderen Plugin)

- [ ] Codex ergänzen! (inkl. Anpassung in Settings)

- [ ] Fixes für Copilot einspielen (siehe 2 Mails)
- [ ] Dashboard: Usage Card für Copilot möglich?

## Erledigt
- [x] session-dashboard v0.32.0: Ladeanimation beim Tab-Öffnen/VSCode-Start stabilisiert (Initial-Load-Gate), Settings-Button ⚙️ oben rechts auf dem Dashboard, Lazy-Loading für Analyse-Tab (Preload entfällt), Sidebar-Header bereinigt (nur noch Übersicht-Icon) *(10.10.2026, [Plan](.agents/plans/2026-10-10_session-dashboard-loading-settings-lazyloading-sidebar.md))*
- [x] session-dashboard v0.31.2: Antigravity-Navigation gegen statische window.location.pathname-Sperre im Webview-Iframe gehärtet (Cache-Bust-Query & Dual-Ping-Retry) *(10.10.2026)*
- [x] session-dashboard v0.31.1: Copilot-Chat direkt in Secondary Sidebar ohne Verzögerung, optimierte Tab-Erkennung (TabInputChat) und sofortige Bereinigung des Übergangs-Tabs *(10.10.2026)*
- [x] session-dashboard v0.31.0: Provider-Settings zum Aktivieren/Deaktivieren (Claude Code, Antigravity, Copilot), Dashboard-Footer mit tools@schüri & Versionsnummer, Freitextsuche mit bereinigtem Placeholder & Kbd-Badge [Taste /], Antigravity Sound-Hooks (.agents/hooks.json & notify-sound.ps1) komplett gelöscht *(10.10.2026, [Plan](.agents/plans/2026-10-10_session-dashboard-provider-settings-footer-search-polish.md))*
- [x] session-dashboard v0.30.7: Chats in Secondary Sidebar für Claude Code & Copilot (kein Mittel-Tab), Antigravity Deep-Link Fallback & Workspace-Check, AI-Sessions-Debug-Channel mit 1-Click-Toolbar-Button *(10.10.2026)*
- [x] session-dashboard v0.30.6: Tab-Wechsel statt Neufenster für Claude Code, robuster Antigravity-Chatwechsel mit Panel-Focus & URL-Routing, direktes Öffnen von Copilot-Chatsessions via Canonical URI, SVG-Icons für Kachel-Aktionen, Button „Alles erledigt markieren" in Fertig-Spalte ab 10 Einträgen *(10.10.2026)*
- [x] session-dashboard v0.30.5: Sidebar-Übersicht-Icon schaltet auf Board-Tab um, „Neu"-Badge am Analyse-Reiter entfernt *(10.10.2026)*
- [x] session-dashboard v0.30.4: Status-Bar-Farben (kein Grün, Warning ab 75%), Claude-Code-OAuth-Refresh via platform.claude.com mit Client-ID & 401-Retry, Sidebar-Analyse-Icon verknüpft, Tab-Deduplizierung bei Neustart *(10.10.2026)*
- [x] session-dashboard v0.30.0: Antigravity-Sessions mit erschöpftem Kontingent bis zum Reset in „Arbeitet", danach „Wartet auf dich" *(09.10.2026, [Plan](.agents/plans/2026-10-09_session-dashboard-antigravity-rate-limit.md))*
- [x] session-dashboard: VSIX-Pakete in den Unterordner `vsix/`, Paketier-Skript angepasst *(06.10.2026)*
- [x] session-dashboard v0.29.1: Copilot-Geisterzustände und offene Tool-Freigaben korrekt erkannt *(06.10.2026)*
- [x] session-dashboard v0.29.0: Sound-Benachrichtigungen bei Fertig, Rückfrage und Limit-Reset *(05.10.2026, [Plan](.agents/plans/2026-10-05_session-dashboard-sound-notifications.md))*
- [x] session-dashboard v0.28.1: leere Chats aller drei Anbieter ausgeblendet *(05.10.2026)*
- [x] session-dashboard v0.28.0: UI-Polish — Ladeanimation, Limit-Text, Top-5-Projektfilter, Spalten-Pagination *(05.10.2026, [Plan](.agents/plans/2026-10-05_session-dashboard-ui-polish-loading-limits-pagination.md))*
- [x] session-dashboard v0.27.0: GitHub-Copilot-Sessions samt Analyse und Transcript-Viewer *(05.10.2026, [Plan](.agents/plans/2026-10-04_session-dashboard-copilot-integration.md))*
- [x] session-dashboard v0.26.0: Analyse Stufe 4 — Transcript-Viewer für Claude Code und Antigravity *(04.10.2026, [Plan](.agents/plans/2026-10-04_session-dashboard-analyse-stufe-4.md))*
- [x] session-dashboard v0.25.0: Analyse Stufe 3 — Tool-Breakdown und segmentierter Token-Balken *(04.10.2026, [Plan](.agents/plans/2026-10-04_session-dashboard-analyse-stufe-3.md))*
- [x] session-dashboard v0.24.1: Analyse Stufe 2 — 7- und 30-Tage-Historie *(04.10.2026, [Plan](.agents/plans/2026-10-04_session-dashboard-analyse-stufe-2.md))*
- [x] session-dashboard v0.23.1–v0.23.4: Analyse Stufe 1 — Tagesübersicht samt Darstellungs-Feinschliff *(04.10.2026, [Plan](.agents/plans/2026-10-04_session-dashboard-analyse-stufe-1.md))*
- [x] session-dashboard: „Erledigt"- und „Gemerkt"-Markierungen gegen Lesefehler geschützt, Antigravity-Limit von 250 entfernt *(04.10.2026, [Plan](.agents/plans/2026-10-04_session-dashboard-fix-erledigt-verlust-und-limit-250.md))*
- [x] session-dashboard: Projektfilter und QuickPick alphabetisch sortiert *(04.10.2026, [Plan](.agents/plans/2026-10-04_session-dashboard-projekt-filter-alphabetisch.md))*
- [x] session-dashboard: „Erledigt" nur noch durch manuelles Abhaken *(04.10.2026, [Plan](.agents/plans/2026-10-04_session-dashboard-manuell-erledigt.md))*
- [x] session-dashboard: Statusleiste zeigt Usage je Anbieter getrennt, gelb/rot bei Limits *(04.10.2026, [Plan](.agents/plans/2026-10-04_session-dashboard-statusbar-separate-usage.md))*
- [x] session-dashboard: Usage von Claude Code und Antigravity immer in der Statusleiste *(04.10.2026, [Plan](.agents/plans/2026-10-04_session-dashboard-footerbar-usage.md))*
- [x] session-dashboard: Dashboard-Tab dauerhaft angepinnt *(04.10.2026, [Plan](.agents/plans/2026-10-04_session-dashboard-pinned-tab.md))*
- [x] session-dashboard: Antigravity-Quota live über den Language Server *(04.10.2026, [Plan](.agents/plans/2026-10-04_session-dashboard-antigravity-usage-tracking.md))*
- [x] session-dashboard: Statusleiste zählt auch fertige Sessions *(04.10.2026, [Plan](.agents/plans/2026-10-04_session-dashboard-footerbar-fertig-sessions.md))*
- [x] session-dashboard: Context-Window je Modell dynamisch *(04.10.2026, [Plan](.agents/plans/2026-10-04_session-dashboard-model-context-window.md))*
- [x] session-dashboard: 5-Stunden- und 7-Tage-Limits von Claude Code und Antigravity *(04.10.2026, [Plan](.agents/plans/2026-10-04_session-dashboard-quota-limits.md))*
- [x] session-dashboard: `@vscode/vsce` 3.9.2 → 4.0.0 *(04.10.2026)*
- [x] session-dashboard: Context- und Token-Auslastung auf den Karten *(04.10.2026, [Plan](.agents/plans/2026-10-04_session-dashboard-token-context-auslastung.md))*
- [x] session-dashboard: Statusleisten-Widget mit Direktzugriff *(04.10.2026, [Plan](.agents/plans/2026-10-03_session-dashboard-statusleiste.md))*
- [x] session-dashboard: Projekt-Badges und Filter-Chips nach Workspace *(03.10.2026, [Plan](.agents/plans/2026-10-03_session-dashboard-projekt-filter.md))*
- [x] session-dashboard: Live-Aktivität auf den Karten *(03.10.2026, [Plan](.agents/plans/2026-10-03_session-dashboard-live-activity.md))*
- [x] session-dashboard: Freitextsuche *(03.10.2026, [Plan](.agents/plans/2026-10-03_session-dashboard-freitextsuche.md))*
- [x] session-dashboard: Datum von Claude-Code-Sessions aus dem Transkript *(03.10.2026, [Plan](.agents/plans/2026-10-03_session-dashboard-transcript-timestamps.md))*
- [x] 62 ältere Claude-Code-Sessions aus dem Papierkorb wiederhergestellt, `cleanupPeriodDays: 0` *(03.10.2026)*
- [x] session-dashboard: Spalte „Geschlossen, nicht erledigt" entfernt *(03.10.2026, [Plan](.agents/plans/2026-10-03_session-dashboard-remove-closed-column.md))*
- [x] session-dashboard: Rate-Limit-Erkennung für Claude Code *(03.10.2026, [Plan](.agents/plans/2026-10-03_session-dashboard-rate-limit-handling.md))*
- [x] session-dashboard: Sessions merken („Gemerkt"-Spalte) *(03.10.2026, [Plan](.agents/plans/2026-10-03_session-dashboard-gemerkt-spalte.md))*
- [x] session-dashboard: Provider-Filter *(03.10.2026, [Plan](.agents/plans/2026-10-03_session-dashboard-provider-filter.md))*
- [x] session-dashboard: Antigravity-Sessions *(03.10.2026, [Plan](.agents/plans/2026-10-03_session-dashboard-antigravity.md))*
- [x] session-dashboard: Extension angelegt *(03.10.2026, [Plan](.agents/plans/2026-10-03_session-dashboard.md))*
