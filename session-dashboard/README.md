# AI Session Dashboard (Claude Code & Antigravity)

VS-Code-Extension, die alle laufenden Claude-Code- und Antigravity-Sessions
auf einen Blick zeigt:

| Gruppe | Bedeutung |
|---|---|
| **Wartet auf dich** | Rückfrage, Freigabe oder Dialog offen. Zähler als Badge am Icon. Längste Wartezeit oben. |
| **Arbeitet** | KI ist mitten in einem Turn. |
| **Fertig** | Turn beendet, die Session wartet auf die nächste Nachricht. |
| **Erledigt** | Von Hand weggelegt. Wird die Session wieder aktiv, fällt die Markierung von selbst weg. |

- **Seitenleiste:** Icon „AI Sessions" in der Aktivitätsleiste. Klick auf eine Session öffnet
  ihren Chat (in Claude Code oder Antigravity), das Häkchen markiert sie als erledigt, der Tooltip zeigt den letzten Prompt.
- **Übersicht:** Schaltfläche oben in der Seitenleiste, öffnet ein Kachel-Board als Editor-Tab mit Provider-Badges (`Claude` / `Antigravity`).

Steuern lässt sich über die Extension nichts — das geschieht weiter im jeweiligen Chat.

## Woher die Daten kommen

Nur lesend, aus den lokalen Konfigurations- und Datenordnern:

### Claude Code (`~/.claude`, bzw. `CLAUDE_CONFIG_DIR`):
- `sessions/<pid>.json` — Register der laufenden Sessions mit `status` (`busy`, `waiting`, `idle`)
  und `waitingFor`. Beobachtet per Dateisystem-Watcher, dazu alle 5 Sekunden ein Abgleich.
- `projects/<slug>/<sessionId>.jsonl` — Transkript; daraus Titel (`custom-title` vor `ai-title`)
  und letzter Prompt. Gelesen wird nur, was seit dem letzten Mal angehängt wurde.
- Geöffnet wird der Chat über `claude-vscode.editor.open` bzw. URI-Handler `vscode://anthropic.claude-code/open?session=<id>`.

### Google Antigravity (`~/.gemini/antigravity`, bzw. `ANTIGRAVITY_APP_DATA_DIR`):
- `conversation_summaries.db` — SQLite-Datenbank der Unterhaltungen (gelesen über natives `node:sqlite`).
  Ausgewertet werden `title`, `preview`, `status` (`CASCADE_RUN_STATUS_RUNNING` / `CASCADE_RUN_STATUS_IDLE`),
  `not_fully_idle`, `last_modified_time` und `workspace_uris`.
- `brain/<sessionId>/.system_generated/logs/transcript.jsonl` — Transkript-Tail für den letzten Prompt
  und Erkennung offener Rückfragen (`ask_question`).
- Geöffnet wird der Chat über den Befehl `antigravity.openConversation` der Antigravity-Erweiterung.

Beide Schnittstellen nutzen interne, undokumentierte Wege. Hintergrund und Belege:
`../.agents/plans/2026-10-03_session-dashboard.md` und `../.agents/plans/2026-10-03_session-dashboard-antigravity.md`.

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
- Antigravity-Sessions werden auf aktive sowie in den letzten 24 Stunden veränderte Sessions gefiltert,
  um die Ansicht übersichtlich zu halten.
