# Claude Session Dashboard

VS-Code-Extension, die alle laufenden Claude-Code-Sessions (Panel-Tabs der Claude-Code-Erweiterung)
auf einen Blick zeigt:

| Gruppe | Bedeutung |
|---|---|
| **Wartet auf dich** | Rückfrage, Freigabe oder Dialog offen. Zähler als Badge am Icon. Längste Wartezeit oben. |
| **Arbeitet** | Claude ist mitten in einem Turn. |
| **Fertig** | Turn beendet, die Session wartet auf die nächste Nachricht. |
| **Erledigt** | Von Hand weggelegt. Wird die Session wieder aktiv, fällt die Markierung von selbst weg. |

- **Seitenleiste:** Icon „Claude Sessions" in der Aktivitätsleiste. Klick auf eine Session öffnet
  ihren Chat, das Häkchen markiert sie als erledigt, der Tooltip zeigt den letzten Prompt.
- **Übersicht:** Schaltfläche oben in der Seitenleiste, öffnet ein Kachel-Board als Editor-Tab.

Steuern lässt sich über die Extension nichts — das geschieht weiter im Chat.

## Woher die Daten kommen

Nur lesend, aus dem Konfigurationsordner von Claude Code (`~/.claude`, bzw. `CLAUDE_CONFIG_DIR`):

- `sessions/<pid>.json` — Register der laufenden Sessions mit `status` (`busy`, `waiting`, `idle`)
  und `waitingFor`. Beobachtet per Dateisystem-Watcher, dazu alle 5 Sekunden ein Abgleich.
- `projects/<slug>/<sessionId>.jsonl` — Transkript; daraus Titel (`custom-title` vor `ai-title`)
  und letzter Prompt. Gelesen wird nur, was seit dem letzten Mal angehängt wurde.

Geöffnet wird ein Chat über den Befehl `claude-vscode.editor.open` der Claude-Erweiterung, als
Ausweichweg über ihren URI-Handler `vscode://anthropic.claude-code/open?session=<id>`.

Alle drei Schnittstellen sind **intern und undokumentiert** (Stand Claude Code 2.1.288). Bricht
nach einem Update etwas, zuerst dort nachsehen. Hintergrund und Belege:
`../.agents/plans/2026-10-03_session-dashboard.md`.

## Bauen und installieren

```bash
cd tools/session-dashboard
npm install
npm run check      # Syntaxprüfung
npm run package    # erzeugt session-dashboard-<version>.vsix
code --install-extension session-dashboard-<version>.vsix
```

Danach „Developer: Reload Window". Für ein Update `version` in der `package.json` hochzählen, neu
paketieren und erneut installieren.

## Grenzen

- Mehrere VS-Code-Fenster: Die Liste zeigt die Sessions aller Fenster, ein Klick öffnet den Chat
  aber im aktuellen Fenster.
- Eine Session ohne erste Nachricht hat noch kein Transkript und erscheint unter ihrem
  Registernamen (z. B. `root-43`).
