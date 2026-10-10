# Projekt-Kontext: ai-sessions

VS-Code-Extension „AI Sessions". Keine Lucee-App, wird nie deployt.

## Verbindlicher Projektkontext

Alle fachlichen Regeln, Datenstrukturen und Architekturvorgaben stehen in
`.agents/project-context.md`. Die Datei ist vor jeder Änderung zu lesen; Werkzeuge, die
`@`-Verweise auflösen, binden sie hier direkt ein:

@.agents/project-context.md

## Vorgaben & Arbeitsweise

- **TODO.md**: vor jeder Aufgabe konsultieren. Aufgaben daraus nie eigenständig umsetzen, nur auf
  ausdrückliche Anweisung.
- **Automatische Installation**: Nach jeder Umsetzung (nach erfolgreichem `npm run check`) immer
  automatisch die neue Version paketieren (`npm run package`) und direkt im Editor installieren
  (`code --install-extension vsix/ai-sessions-<version>.vsix`), bevor die Aufgabe als fertig gemeldet wird.
- **Commit & Push**: Niemals eigenmächtig committen oder pushen! Vor jedem `git commit` und vor
  jedem `git push` zwingend die explizite Freigabe des Benutzers einholen. Änderungen
  ausschließlich in diesem Projektverzeichnis ausführen und pro Projekt separat committen.
