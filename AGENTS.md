# Projekt-Kontext: tools

Sammlung von Tools, z.B. Plugins für Google Chrome oder VSCode

## Verbindlicher Projektkontext

Alle fachlichen Regeln, Datenstrukturen und Architekturvorgaben stehen in
`.agents/project-context.md`. Die Datei ist vor jeder Änderung zu lesen; Werkzeuge, die
`@`-Verweise auflösen, binden sie hier direkt ein:

@.agents/project-context.md

## Vorgaben & Arbeitsweise

- **TODO.md**: vor jeder Aufgabe konsultieren. Aufgaben daraus nie eigenständig umsetzen, nur auf
  ausdrückliche Anweisung.
- **Commit & Push**: Niemals eigenmächtig committen oder pushen! Vor jedem `git commit` und vor
  jedem `git push` zwingend die explizite Freigabe des Benutzers einholen. Änderungen
  ausschließlich in diesem Projektverzeichnis ausführen und pro Projekt separat committen.
- **Dateierstellung & Race-Condition-Schutz**: Neue Dateien immer strikt synchron mit sofortigem
  Dateigrößen-Check schreiben. Tabs/Links erst öffnen, wenn der Dateiinhalt stabil persistiert ist.
- **VSIX-Dateien & Unterordner**: VSIX-Pakete von VS-Code-Extensions (`session-dashboard` etc.)
  gehören ausnahmslos in den Unterordner `vsix/` und niemals in das Hauptverzeichnis der Extension.
  Paketierung erfolgt über `npm run package` (bzw. `vsce package ... --out vsix/`). Bei Installation
  oder Verweisen ist entsprechend der Pfad `vsix/<dateiname>.vsix` zu nutzen. In `.vscodeignore`
  und `.gitignore` sind `vsix/` sowie `**/*.vsix` stets ausgeschlossen.
