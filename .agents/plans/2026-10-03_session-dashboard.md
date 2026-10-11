# Implementierungsplan: Session-Dashboard für Claude Code
Datum: 2026-10-03
Task-Ziel: VS-Code-Extension, die alle laufenden Claude-Code-Sessions mit Zustand zeigt, per Klick den Chat öffnet und Sessions als „erledigt" markieren lässt.

Das Dokument beschreibt die Extension `session-dashboard` unter `tools/`, die neben `cf-debug-chrome`
als zweites Entwicklerwerkzeug im Repo liegt.

## Technische Grundlage (verifiziert)

Am 03.10.2026 an Claude Code 2.1.288 (VS-Code-Erweiterung `anthropic.claude-code`) erhoben:

- **Session-Register:** `~/.claude/sessions/<pid>.json`, eine Datei je laufender Session. Felder u. a.
  `pid`, `sessionId`, `cwd`, `kind` (`interactive`), `entrypoint` (`claude-vscode`), `name`,
  `status`, `waitingFor`, `statusUpdatedAt`, `spare`, `parkedJobId`. Geschrieben vom CLI über
  `TOe({status, waitingFor})`.
- **Status-Werte:** `busy` (arbeitet), `waiting` (wartet auf den Benutzer, Grund in `waitingFor`),
  `idle` (Turn beendet). Belegt per Mitschnitt der eigenen Registerdatei im Sekundentakt: vor einer
  `AskUserQuestion` `busy`, während sie offen war 232 Sekunden lang `waiting` / `"input needed"`.
  Weitere `waitingFor`-Werte laut CLI: `"dialog open"`, `"sandbox request"`.
- **Liveness:** Alle 13 Registerdateien gehörten zu laufenden Prozessen; eine Datei verschwindet mit
  ihrer Session. Geprüft wird trotzdem per `process.kill(pid, 0)`.
- **Titel:** `name` im Register ist oft nur abgeleitet (`root-ef`, `nameSource: "derived"`). Den
  lesbaren Titel liefert das Transkript `~/.claude/projects/<slug>/<sessionId>.jsonl`: Zeilen
  `{"type":"custom-title","customTitle":…}` (Tab umbenannt) vor `{"type":"ai-title","aiTitle":…}`,
  jeweils die letzte gewinnt. `{"type":"last-prompt","lastPrompt":…}` trägt den letzten Prompt. Das
  Transkript entsteht erst mit der ersten Nachricht; der Ordnername kann in der Groß-/Kleinschreibung
  abweichen (`C--lucee…` neben `c--lucee…`).
- **Chat öffnen:** Befehl `claude-vscode.editor.open(sessionId)`; dazu ein URI-Handler
  `vscode://anthropic.claude-code/open?session=<id>`, der `claude-vscode.primaryEditor.open` ruft.
  Beides undokumentiert.

## Hintergrund & Zielstellung

Bei vielen parallelen Panel-Tabs ist nicht zu sehen, welche Session noch arbeitet, welche auf eine
Rückfrage wartet und welche fertig ist. Die Extension zeigt das auf einen Blick, öffnet den Chat per
Klick und erlaubt, abgearbeitete Sessions als „erledigt" wegzusortieren. Steuern ist ausdrücklich
nicht Ziel — das geschieht weiter im Chat.

## Vorgeschlagene Änderungen

### [Extension]

#### [ADD] [package.json](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/package.json)
- Manifest: Aktivitätsleisten-Container mit Baumansicht, Befehle (Öffnen, Erledigt, Zurückholen,
  Übersicht, Aktualisieren), Kontextmenüs. Kein Laufzeit-Paket, nur `@vscode/vsce` zum Paketieren.

#### [ADD] [extension.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/extension.js)
- Verdrahtung: Beobachter auf `~/.claude/sessions/` (entprellt) plus 5-Sekunden-Takt für Liveness und
  relative Zeiten; Badge mit der Zahl wartender Sessions.

#### [ADD] [lib/registry.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/registry.js)
- Liest das Register tolerant ein (unlesbare Datei → übersprungen, unbekanntes Feld → egal), filtert
  tote Prozesse, `spare`, `parkedJobId` und nicht-interaktive Sessions, bildet den Zustand ab.

#### [ADD] [lib/transcripts.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/transcripts.js)
- Titel und letzter Prompt aus dem Transkript, **inkrementell** gelesen (nur die seit dem letzten
  Lauf angehängten Bytes), damit große, laufend wachsende Transkripte nichts kosten.

#### [ADD] [lib/doneStore.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/doneStore.js)
- „Erledigt"-Markierungen im `globalState` der Extension. Wird die Session nach der Markierung
  wieder `busy`, fällt die Markierung weg. Verwaiste Einträge räumt sie nach 14 Tagen ab.

#### [ADD] [lib/treeView.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/treeView.js)
- Seitenleiste mit den Gruppen „Wartet auf dich" (älteste zuerst), „Arbeitet", „Fertig",
  „Erledigt" (eingeklappt). Klick öffnet den Chat, Häkchen markiert als erledigt.

#### [ADD] [lib/boardPanel.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/boardPanel.js)
- Übersicht als Editor-Tab (Webview, Kachelspalten je Zustand), gleiche Aktionen, Farben aus dem
  VS-Code-Theme.

#### [ADD] [lib/format.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/format.js)
- Gemeinsame Texte: Zustandsnamen, `waitingFor`-Übersetzung, relative Zeit, Datum `dd.mm.yyyy`.

#### [ADD] [README.md](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/README.md), `.vscodeignore`, `resources/icon.svg`

### [Repo & Wissensbasis]

#### [MODIFY] [.gitignore](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/.gitignore)
- `node_modules/` und `*.vsix` ausschließen.

#### [MODIFY] [landkarte.md](file:///c:/lucee/tomcat/webapps/ROOT/.agents/landkarte.md)
- `tools`-Eintrag: zweites Werkzeug nennen, Regel „VS-Code- und Chrome-Extensions je in einem
  eigenen Unterordner von `tools`". Eigenes Repo `.agents`, eigener Commit.

## Verifikationsplan

### Automatisiert
- `node --check` auf alle Dateien; `lib/registry.js` und `lib/transcripts.js` per Node-Skript gegen
  das echte Register laufen lassen und die Ausgabe mit `ListAgents` vergleichen.
- `npx vsce package` erzeugt die `.vsix` ohne Fehler.

### Manuell (nach Freigabe der Installation)
- `code --install-extension session-dashboard-<version>.vsix`, Fenster neu laden.
- Seitenleiste zeigt alle Sessions mit lesbarem Titel; eine Session mit offener Rückfrage steht unter
  „Wartet auf dich", Badge zählt sie.
- Klick öffnet den richtigen Chat-Tab; ist er schon offen, wird er nach vorn geholt statt verdoppelt.
- „Erledigt" verschiebt die Session; eine neue Nachricht an sie holt sie zurück.

## Hinweise / Grenzen

- Register, Transkriptformat und Öffnen-Befehl sind interne Schnittstellen der Claude-Erweiterung;
  ein Update kann sie ändern. Die Extension liest tolerant und zeigt im Zweifel „unbekannt".
- Mehrere VS-Code-Fenster: Der Klick öffnet im aktuellen Fenster.
- Die Installation schreibt nach `~/.vscode/extensions` und braucht die Freigabe des Benutzers.
- Zwei Repos betroffen (`tools`, `.agents`), jeweils separat committen.
