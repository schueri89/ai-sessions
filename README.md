# AI Sessions (Claude Code, Antigravity & GitHub Copilot)

VS-Code-Extension, die alle laufenden Sessions von Claude Code, Antigravity und GitHub Copilot
auf einen Blick zeigt:

| Gruppe | Bedeutung |
|---|---|
| **Wartet auf dich** | Rückfrage, Freigabe oder Dialog offen. Zähler als Badge am Icon. Längste Wartezeit oben. |
| **Arbeitet** | KI ist mitten in einem Turn. (Wird eine arbeitende Session gemerkt, bleibt sie hier mit 📌-Icon bis zum Abschluss.) |
| **Gemerkt** | Pinnen zum späteren Anschauen. Fertige/inaktive Sessions landen automatisch hier statt in „Fertig“. |
| **Fertig** | Turn beendet, die Session wartet auf die nächste Nachricht. |
| **Erledigt** | Beendete/geschlossene Sessions sowie von Hand weggelegte. Wird die Session wieder aktiv, fällt die Markierung von selbst weg. |

- **Seitenleiste:** Icon „AI Sessions" in der Aktivitätsleiste. Klick auf eine Session öffnet
  ihren Chat (in Claude Code oder Antigravity), das Pinnadel-Icon merkt bzw. entmerkt die Session, das Häkchen markiert sie als erledigt, der Tooltip zeigt den letzten Prompt.
- **Rate-Limit-Erkennung (Claude Code und Antigravity):** Erreicht eine Session ihr Kontingentlimit („You've hit your session limit" bzw. `RESOURCE_EXHAUSTED (429)`), bleibt sie bis zum Reset-Zeitpunkt in **„Arbeitet“** (mit gelbem Warn-Badge `⏳ Limit bis HH:MM Uhr`). Nach Ablauf des Limits wechselt sie automatisch nach **„Wartet auf dich“** (`⚠️ Limit vorbei · Bereit zum Fortsetzen`), sodass man über das Sidebar-Badge sofort benachrichtigt wird. Bei Antigravity stammt die Reset-Zeit aus der Live-Quota; läuft Antigravity nicht, zeigt die Karte „Limit erreicht“ ohne Uhrzeit.
- **Provider-Filter:** Schnelle Filterung nach *Alle*, *Claude Code* oder *Antigravity* über das Filter-Icon in der Sidebar (`Filter nach Provider...`) sowie über die Toolbar-Buttons im Board.
- **Übersicht:** Schaltfläche oben in der Seitenleiste, öffnet ein Kachel-Board als Editor-Tab mit Provider-Icons, Filterleiste und Pin-Schaltflächen auf den Karten sowie Massenfreigabe („Alle geprüft“).

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

### GitHub Copilot (VS-Code-Benutzerdaten):
- `globalStorage/github.copilot-chat/session-store.db` — SQLite-Sessionspeicher der Copilot-Chats.
- `workspaceStorage/<hash>/chatSessions/` — Chat- und Agent-Sessions je Workspace, für Live-Zustand
  und Verlauf.
- Hintergrund: `.agents/plans/2026-10-04_session-dashboard-copilot-integration.md`.

Alle drei Schnittstellen nutzen interne, undokumentierte Wege. Hintergrund und Belege:
`.agents/plans/2026-10-03_session-dashboard.md` und `.agents/plans/2026-10-03_session-dashboard-antigravity.md`.

## Bauen und installieren

```bash
npm install
npm run check      # Syntaxprüfung
npm run package    # erzeugt vsix/ai-sessions-<version>.vsix
code --install-extension vsix/ai-sessions-<version>.vsix
```

Danach „Developer: Reload Window". Für ein Update `version` in der `package.json` hochzählen, neu
paketieren und erneut installieren.

## Grenzen

- Mehrere VS-Code-Fenster: Die Liste zeigt die Sessions aller Fenster, ein Klick öffnet den Chat
  aber im aktuellen Fenster.
- Antigravity-Sessions werden auf aktive sowie in den letzten 24 Stunden veränderte Sessions gefiltert,
  um die Ansicht übersichtlich zu halten.
