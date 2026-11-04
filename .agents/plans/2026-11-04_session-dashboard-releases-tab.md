# Plan: Neuer Tab „Releases“ (JIRA-Lösungsversionen) (v0.73.0)

## Kontext & Ziel
Im Session-Dashboard sollen die in JIRA angelegten Lösungsversionen (Fix Versions) sichtbar sein –
als Zeitachse nach Release-Datum, kommende Releases oben, veröffentlichte darunter.

## Entscheidungen (Abstimmung 04.11.2026)
1. **Zugang:** vorhandener Service-Account des Codeanalysers (`atlassian.code.review@…`). Der Auth-String
   liegt **außerhalb des Repos** in einer JSON-Datei, z. B. `I:\dev1\app\raphael-schuerholz\global1\env\jira.json`
   (`{ "baseUrl": "https://ehoi.atlassian.net", "authString": "<Base64 von E-Mail:API-Token>" }`).
   Pfad über Setting `sessionDashboard.releases.credentialsFile`. Nur https.
2. **Projekte:** Setting `sessionDashboard.releases.projects` (Liste von Projekt-Keys), leer = alle sichtbaren Projekte.
   Unbekannte Keys führen zu einer Fehlermeldung (Fail Fast).
3. **Versionen:** veröffentlicht + unveröffentlicht, archivierte ausgeblendet.
4. **Anzeige je Version:** Status (Geplant / In Arbeit / Überfällig / Veröffentlicht), Name, Projekt, Start, Release,
   Fortschritt (Erledigt / In Arbeit / Offen) – keine Beschreibung.
5. **Sortierung:** Block „Kommende Releases“ (aufsteigend nach Release-Datum, ohne Datum zuletzt),
   darunter „Veröffentlicht“ (neueste zuerst).
6. **Aktion:** Button „↗ Öffnen“ je Version (Release-Seite in JIRA).
7. **Aktualisierung:** beim ersten Öffnen des Tabs + Button „⟳ Aktualisieren“, kein Polling.
8. **Später:** Verknüpfung Release ↔ Deploy über das aktuell laufende Release.

## Umsetzung
- `lib/jiraReleases.js`: `GET /rest/api/3/project/search` (paginiert, optional `keys=`) und je Projekt
  `GET /rest/api/3/project/{key}/version?expand=issuesstatus&status=released,unreleased` (paginiert,
  max. 6 Projekte parallel). Fortschritt aus `issuesStatusForFixVersion` (ohne Extra-Call je Version).
- `lib/boardPanel.js`: Tab „🏷️ Releases“ (Setting `sessionDashboard.releases.enabled`, Standard aus), Tabelle,
  Suche, Öffnen-Button (URL wird gegen die Origin der Basis-URL geprüft).
- `test/check-jira-releases.js`: Status-Ermittlung, Sortierung, Fortschritt.
