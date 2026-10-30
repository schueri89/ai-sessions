# Projekt-Kontext: ai-sessions

VS-Code-Extension „AI Sessions". Keine Lucee-App, wird nie deployt.

## Verbindliches Regelwerk & Projektkontext

Vor allen Aufgaben und Dateiänderungen ist das globale Regelwerk verbindlich zu beachten:

@c:\lucee\tomcat\webapps\ROOT\.agents\global-core.md

Alle fachlichen Regeln, Datenstrukturen und Architekturvorgaben stehen in
`.agents/project-context.md`. Die Datei ist vor jeder Änderung zu lesen; Werkzeuge, die
`@`-Verweise auflösen, binden sie hier direkt ein:

@.agents/project-context.md

## Vorgaben & Arbeitsweise

- **TODO.md**: vor jeder Aufgabe konsultieren. Aufgaben daraus nie eigenständig umsetzen, nur auf
  ausdrückliche Anweisung.
- **FEEDBACK.md**: Postfach für kleine Rückmeldungen zur laufenden Umsetzung; wird dabei
  abgearbeitet und ist am Ende wieder leer.
- **Commit, Version & Changelog**: Niemals eigenmächtig committen oder pushen! Vor jedem `git commit`
  zwingend die explizite Freigabe des Benutzers einholen; mit jeder Bitte um Commit-Freigabe Version
  (`versionierung.md`) und Changelog-Eintrag (`changelog.md`) vorschlagen. Gepusht wird nur auf
  ausdrückliche Ansage, im Chat wird nie danach gefragt. Änderungen ausschließlich in diesem
  Projektverzeichnis ausführen und pro Projekt separat committen.
- **Fail Fast statt vorsichtiger Programmierung**: Keine defensiven `try/catch`-Kapselungen
  um Schnittstellen, Datenbankabfragen oder Services („damit nichts abstürzt“) und keine stillen
  Fallbacks auf Altdaten oder leere Defaults. Fehler müssen direkt sichtbar werden. Fallbacks
  immer vorab abstimmen.
