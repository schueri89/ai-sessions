# Changelog: AI Sessions

Alle sichtbaren Änderungen an der VS-Code-Extension, neueste Version oben.

## [0.57.2] – 27.10.2026

- **Kompakte Tab-Leiste im Dashboard:** Die oberen Navigationsreiter wurden verschlankt, die redundanten Zähler-Badges auf den Tabs entfernt und der zweite Reiter auf das prägnante „Analyse“ gekürzt, wodurch die Kopfzeile auch in schmaleren Fenstern deutlich mehr Platz bietet.

## [0.57.1] – 26.10.2026

- **Kompakte Kartentitel und präzise Zeitstempel für Cline:** Titel von Cline-Sessions werden intelligent bereinigt (Pfadangaben und XML-Tags werden entfernt, Frage- und Absichtssätze bevorzugt und sauber auf 65 Zeichen gekürzt). Falsche `failed`-Statusanzeigen durch Clines Hintergrund-Prozessüberwachung beim VS-Code-Neustart werden unterdrückt und die Zeitstempel richten sich exakt nach der tatsächlichen letzten Nachricht.

## [0.57.0] – 26.10.2026

- **Cline Provider-Integration für lokale KIs:** Das Session-Dashboard erfasst ab sofort alle Sessions von Cline (inklusive lokaler Modelle wie Ollama und Gemma 4) mit Kanban-Kacheln, Live-Aktivitäten, Tokens, Filter-Buttons, Projekt-Erkennung, Historie sowie detaillierter Transkript-Ansicht und fokussiert die Cline-Sidebar mit einem Klick.

## [0.56.0] – 26.10.2026

- **Kompaktere Kacheln durch einstellbare Prompt-Anzeige:** Die Anzeige des letzten Prompts auf den Dashboard-Karten kann über die neue Einstellung `sessionDashboard.showLastPrompt` gesteuert werden (standardmäßig deaktiviert für schlankere Kacheln), bleibt bei Suchtreffern hervorgehoben und ist weiterhin per Mauszeiger als Schnellansicht-Tooltip abrufbar.

## [0.55.1] – 26.10.2026

- **Korrektur der Rate-Limit-Reset-Erkennung bei Antigravity (Argon):** Google-Antigravity-Sessions mit nahezu erschöpftem Kontingent (z. B. 99% verbrauchtes Argon-Wochenlimit) werden zuverlässig erkannt und zeigen bis zum tatsächlichen Reset-Zeitpunkt die korrekte Wartezeit an, statt vorzeitig als abgelaufen gemeldet zu werden.

## [0.55.0] – 23.10.2026

- **Blätterfunktion und Diff-Statistik in der Historie:** Die Historie-Tabelle bietet eine vollständige Seitennavigation samt Seitengrößen-Auswahl (25, 50, 100 pro Seite) und zeigt für Claude Code, Google Antigravity und OpenAI Codex eine neue sortierbare Diff-Spalte (`+Zeilen / -Zeilen`) samt Detail-Chip im Accordion sowie Diff-Badges auf Claude-Karten an.

## [0.54.0] – 23.10.2026

- **Cache-Effizienz-Anzeige:** Session-Karten und die Historie-Tabelle zeigen für unterstützte Anbieter (Claude Code, Google Antigravity, OpenAI Codex) die prozentuale Cache-Hit-Rate mit Detail-Tooltip an; nicht unterstützte Anbieter (GitHub Copilot) werden dezent als N/A markiert.

## [0.53.0] – 23.10.2026

- **Echte Claude-Kosten:** Claude-Code-Sessions zeigen die tatsächlichen Kosten aus den Transkripten (`cost-state`) auf den Kanban-Karten und in der Historie (mit `✓`-Markierung und Detail-Chip im Accordion). Im Analyse-Tab werden die Turns proportional skaliert, sodass die Gesamtkosten centgenau der tatsächlichen Abrechnung entsprechen.

## [0.52.0] – 23.10.2026

- **Visuelle Benachrichtigungen bei Aufgabenfertigstellung & Rückfragen:** Fertige Sessions und offene Rückfragen melden sich mit Projektname und Chat-Titel als VS-Code-Benachrichtigung und lassen sich mit einem Klick auf „Chat öffnen“ direkt ansteuern.

## [0.51.1] – 17.10.2026

- **Kein doppelter Benachrichtigungston bei mehreren Fenstern:** Wenn mehrere VS-Code-Fenster gleichzeitig geöffnet sind, ertönen Benachrichtigungstöne beim Fertigstellen einer Aufgabe nur noch einmal statt in jedem Fenster parallel.

## [0.51.0] – 16.10.2026

- **JIRA auf dem Dashboard:** Karten auf dem Board haben einen Button zum Zuweisen eines JIRA-Tickets; bestehende Tickets lassen sich per Stift bearbeiten und per Mülleimer-Icon oder Leeren der Eingabe entfernen.
- **Deploy-Tab:** Der Reiter „Deploys“ (Jenkins) lässt sich über die Einstellung `sessionDashboard.jenkins.enabled` nach Bedarf ein- oder ausblenden.
- **Quota-Badge bei 100%:** Ist ein Kontingent oder Budget zu 100% ausgeschöpft, wechselt die Status-Badge von „Fast voll“ auf „Voll“ bzw. „Budget aufgebraucht“.

## [0.50.0] – 16.10.2026

- **Sticky Spaltenüberschriften im Dashboard:** Die Spaltenköpfe mit Status-Dot, Titel und Zähler bleiben beim Herunterscrollen über lange Listen oben angeheftet und erreichbar.
- **Harmonisierte Statusleiste:** Tooltip-Aufbau (Plan-Information oben) und Quota-Anzeigen über alle vier Anbieter (Claude Code, Google Antigravity, OpenAI Codex und GitHub Copilot) angeglichen.

## [0.48.0] – 16.10.2026

- **Freigaben-Export:** Manuell freigegebene Terminal-Befehle von GitHub Copilot lassen sich im Analyse-Tab als CSV, Markdown oder JSON für die Whitelist-Prüfung exportieren.

## [0.47.0] – 16.10.2026

- **Gemini 4 Argon:** Google Antigravity zeigt das separate wöchentliche Budget-Fenster für Gemini 4 Argon auf dem Dashboard und in der Statusleiste an.

## [0.46.3] – 12.10.2026

- **Changelog:** Die Extension-Ansicht in VS Code zeigt im Reiter „Changelog“, was sich mit jeder Version geändert hat.

## [0.46.2] – 12.10.2026

- Das „Coming Soon“-Badge am Reiter „Deploys“ sieht jetzt aus wie die übrigen Badges im Kopf.

## [0.46.1] – 12.10.2026

- Der Reiter „Deploys“ ist vorerst deaktiviert und als „Coming Soon“ gekennzeichnet.

## [0.46.0] – 12.10.2026

- **Neuer Reiter „Deploys“:** zeigt Jenkins-Jobs und ihre Pipelines, mit Filter „Nur Deploy / Alle“ und Suche. Die Zugangsdaten werden sicher in VS Code hinterlegt.

## [0.45.2] – 12.10.2026

- GitHub-Copilot-Sessions werden nach einem erneut gesendeten oder wiederholten Prompt wieder zuverlässig als „Fertig“ erkannt.

## [0.45.1] – 12.10.2026

- Anbieter- und Projektfilter auf dem Dashboard schalten sofort um, ohne Wartezeit.

## [0.45.0] – 12.10.2026

- **Freigaben für GitHub Copilot:** Terminal-Befehle werden in ihre Teilbefehle zerlegt (etwa `git status`, `npm`); aus der Auswahl entsteht mit einem Klick eine Regel zur automatischen Freigabe. Unbedenkliche Befehle sind vorausgewählt.

## [0.44.0] – 12.10.2026

- **GitHub Copilot in der Statusleiste:** Monatskontingent und Zusatzbudget, mit Farbstufen, Tooltip und Filter per Klick. Das Anzeigeformat ist wählbar.

## [0.43.1] – 12.10.2026

- Die Analyse berücksichtigt jetzt auch OpenAI Codex, mit eigener Kostenzeile; Kosten und Token werden korrekt berechnet.

## [0.42.0] – 11.10.2026

- „Alles erledigt markieren“ fragt vorher nach und nennt die Zahl der betroffenen Sessions.
- Wird eine Session fertig, leuchtet ihre Karte passend zum Ton kurz auf.

## [0.41.0] – 11.10.2026

- **Limits von OpenAI Codex:** Verbrauch im 5-Stunden- und 7-Tage-Fenster, Plan und Guthaben — als Kachel im Dashboard, in der Statusleiste und im Schnellmenü.

## [0.40.2] – 11.10.2026

- OpenAI-Codex-Sessions zeigen die tatsächliche letzte Aktivität; ein bloßes Öffnen der Session verfälscht die Zeit nicht mehr. Der Transcript-Viewer erkennt mehr Turns.

## [0.40.1] – 11.10.2026

- OpenAI-Codex-Sessions öffnen sich wieder direkt im richtigen Chat statt in einer leeren Ansicht; die Filter berücksichtigen Codex vollständig.

## [0.40.0] – 11.10.2026

- **OpenAI Codex als vierter Anbieter:** Sessions mit Live-Status, Tools und Token, Transcript-Viewer, Sprung in den Chat sowie eigene Einstellungen für Anbieter und Töne.

## [0.39.0] – 11.10.2026

- Die Töne für alle vier Ereignisse werden in den Einstellungen aus einer Liste gewählt und lassen sich dort mit einem Klick vorhören.
- Neuer Befehl zum Durchhören aller verfügbaren Töne und zum Zuweisen.

## [0.38.1] – 11.10.2026

- Die Schaltfläche „Alle geprüft“ im Kopf der Spalte „Gemerkt“ ist entfallen.

## [0.38.0] – 11.10.2026

- **Erinnerung bei Leerlauf:** Wartet eine Session rund eine Minute auf dich, erklingt ein Hinweiston.
- Die Schaltfläche „Geprüft“ auf gemerkten Karten ist entfallen — das Pin-Symbol übernimmt das.

## [0.37.0] – 11.10.2026

- **Projekterkennung einstellbar** (automatisch, exakt, manuell), damit Sessions nicht mehr zwischen Projekten springen.
- Neues Postfach „Nicht zugewiesen“ mit Filter und Zuweisung per Klick.

## [0.36.0] – 11.10.2026

- Das Projekt einer Session lässt sich von Hand zuweisen oder korrigieren — auf den Karten, in der Historie und in der Detailansicht, samt Rücksetzen auf die Automatik.

## [0.35.0] – 11.10.2026

- **GitHub Copilot:** Kachel mit Kontingent und Zusatzbudget im Dashboard und im Schnellmenü, auch für GitHub Enterprise.
- **Freigaben-Statistik** in der Analyse: welche Werkzeuge wie oft freigegeben wurden, mit Kandidaten für automatische Freigaben.

## [0.34.0] – 11.10.2026

- **JIRA:** Sessions lassen sich Tickets zuweisen — in der Historie und auf den Karten, mit Link direkt ins Ticket. Die JIRA-Adresse ist einstellbar.

## [0.33.0] – 10.10.2026

- **Neuer Reiter „Historie“:** alle Sessions als Tabelle mit Filtern, Sortierung und aufklappbaren Details.

## [0.32.1] – 10.10.2026

- Die Symbole im Kopf der Seitenleiste (Filter, Projekt, Suche, Aktualisieren) sind zurück.

## [0.32.0] – 10.10.2026

- Die Ladeanimation beim Öffnen läuft ruhig durch, bis alle Daten da sind.
- Zahnrad oben rechts im Dashboard öffnet die Einstellungen.
- Die Analyse lädt erst, wenn ihr Reiter geöffnet wird.

## [0.31.2] – 10.10.2026

- Der Sprung in einen Antigravity-Chat klappt jetzt auch, wenn Antigravity bereits eine Session geöffnet hat.

## [0.31.1] – 10.10.2026

- GitHub-Copilot-Chats öffnen sofort in der zweiten Seitenleiste, ohne Zwischenschritt über einen Editor-Tab.

## [0.31.0] – 10.10.2026

- Jeder Anbieter lässt sich in den Einstellungen ein- und ausschalten.
- Fußzeile im Dashboard mit Versionsnummer.
- Die Suche ist mit der Taste `/` erreichbar.

## [0.30.7] – 10.10.2026

- Chats von Claude Code und GitHub Copilot öffnen in der zweiten Seitenleiste statt als Editor-Tab.
- Sicherer Sprung in Antigravity-Chats, auch aus einem anderen Workspace.
- Diagnoseausgabe „AI Sessions“ per Klick aus der Werkzeugleiste.

## [0.30.6] – 10.10.2026

- Ein Klick auf eine Session wechselt zum vorhandenen Tab, statt ein neues Fenster zu öffnen; GitHub-Copilot-Chats öffnen direkt.
- Neue Symbole für die Aktionen auf den Karten.
- Ab zehn Einträgen bietet die Spalte „Fertig“ „Alles erledigt markieren“ an.

## [0.30.5] – 10.10.2026

- Das Übersichts-Symbol der Seitenleiste springt direkt auf das Board.
- Das „Neu“-Badge am Analyse-Reiter ist entfallen.

## [0.30.4] – 10.10.2026

- Statusleiste: Farbe erst ab 75 % Auslastung, kein Grün mehr.
- Die Anmeldung für die Claude-Code-Limits erneuert sich selbstständig.
- Nach einem Neustart erscheint das Dashboard nur noch einmal.

## [0.30.3] – 10.10.2026

- Antigravity-Sessions mit offener Tool-Freigabe stehen jetzt unter „Wartet auf dich“.
- Antigravity- und GitHub-Copilot-Sessions aktualisieren sich zuverlässiger.

## [0.30.0] – 09.10.2026

- Die Extension heißt jetzt „AI Sessions“.
- **Limits bei Antigravity:** Sessions mit erschöpftem Kontingent bleiben bis zum Reset unter „Arbeitet“ und wechseln danach nach „Wartet auf dich“.

## [0.29.1] – 06.10.2026

- GitHub-Copilot-Sessions bleiben nicht mehr dauerhaft unter „Arbeitet“ hängen; offene Tool-Freigaben erscheinen unter „Wartet auf dich“, mit Ton.

## [0.29.0] – 05.10.2026

- **Töne:** wenn eine Session fertig ist, eine Rückfrage stellt oder ein Limit wieder frei ist — je Anbieter und Ereignis einstellbar, mit Stummschalter im Dashboard.

## [0.28.1] – 05.10.2026

- Leere Chats ohne Prompt werden bei allen Anbietern ausgeblendet.

## [0.28.0] – 05.10.2026

- Ladeanimation beim Öffnen des Dashboards.
- Limit-Resets innerhalb von 24 Stunden zeigen nur die Uhrzeit, danach mit Wochentag.
- Der Projektfilter zeigt die fünf aktivsten Projekte, der Rest klappt auf Klick aus.
- Lange Spalten zeigen zunächst 20 Sessions, der Rest lädt per Klick nach.

## [0.27.0] – 05.10.2026

- **GitHub Copilot als dritter Anbieter:** Chat- und Agent-Sessions auf dem Board, in der Analyse und im Transcript-Viewer.

## [0.26.3] – 04.10.2026

- **Transcript-Viewer:** jede Session im Detail lesen — Prompts, Antworten, Tools, Token und Kosten je Turn, mit Suche und einklappbaren Turns.

## [0.25.0] – 04.10.2026

- Die Analyse zeigt, welche Tools wie oft genutzt wurden, und teilt den Token-Verbrauch nach Art auf.

## [0.24.1] – 04.10.2026

- Die Analyse kennt neben dem Tag auch die letzten 7 und 30 Tage, mit Verlaufsdiagramm.

## [0.23.4] – 04.10.2026

- **Neuer Reiter „Analyse“:** Token, Kosten, aktive Zeit, Modelle und Projekte des Tages.

## [0.22.0] – 04.10.2026

- Die Markierungen „Erledigt“ und „Gemerkt“ gehen nicht mehr verloren.
- Antigravity zeigt alle Sessions, nicht nur die letzten 250.

## [0.21.2] – 04.10.2026

- Projektfilter und Auswahllisten sind alphabetisch sortiert.

## [0.21.1] – 04.10.2026

- Die Anzeigen in der Statusleiste stehen ganz rechts beieinander.

## [0.21.0] – 04.10.2026

- Die Statusleiste zeigt Claude Code und Antigravity getrennt, gelb oder rot hinterlegt, sobald ein Limit naht.

## [0.20.0] – 04.10.2026

- „Erledigt“ wird eine Session nur noch durch Abhaken von Hand.

## [0.19.1] – 04.10.2026

- Die Anbieter-Symbole in der Statusleiste werden korrekt dargestellt.

## [0.19.0] – 04.10.2026

- Auslastung von Claude Code und Antigravity steht immer in der Statusleiste.

## [0.17.0] – 04.10.2026

- Das Dashboard öffnet als dauerhaft angepinnter Tab.

## [0.16.0] – 04.10.2026

- **Antigravity-Limits live:** Auslastung und Reset-Zeiten der Gemini-Modelle im Dashboard und im Tooltip der Statusleiste.

## [0.15.0] – 04.10.2026

- Die Statusleiste zählt auch fertige Sessions.

## [0.14.0] – 04.10.2026

- Die Kontext-Auslastung richtet sich nach dem tatsächlichen Kontextfenster des jeweiligen Modells.

## [0.13.0] – 04.10.2026

- 5-Stunden- und 7-Tage-Limits von Claude Code und Antigravity im Dashboard.

## [0.12.0] – 04.10.2026

- Die Karten zeigen, wie weit Kontext und Token ausgeschöpft sind.

## [0.11.0] – 04.10.2026

- **Statusleiste:** zeigt, wie viele Sessions arbeiten oder warten, und öffnet per Klick ein Schnellmenü.

## [0.10.0] – 03.10.2026

- Projekt-Badges auf den Karten und Filter nach Projekt.

## [0.9.0] – 03.10.2026

- Karten und Seitenleiste zeigen live, was eine Session gerade tut.

## [0.8.1] – 03.10.2026

- Das Suchfeld fügt sich optisch ins Dashboard ein.

## [0.8.0] – 03.10.2026

- **Freitextsuche** im Dashboard und in der Schnellauswahl.

## [0.7.0] – 03.10.2026

- Claude-Code-Sessions zeigen ihr tatsächliches Datum.

## [0.6.0] – 03.10.2026

- Die Spalte „Geschlossen“ ist in „Erledigt“ aufgegangen.

## [0.5.0] – 03.10.2026

- Erreicht eine Claude-Code-Session ihr Limit, warnt die Karte bis zum Reset und meldet danach, dass es weitergehen kann.

## [0.4.0] – 03.10.2026

- **Gemerkt:** Sessions lassen sich zum späteren Anschauen anpinnen.

## [0.3.0] – 03.10.2026

- Filter nach Anbieter in Seitenleiste und Dashboard.

## [0.2.1] – 03.10.2026

- Das Anbieter-Logo steht oben rechts auf der Karte, der Titel ganz oben.

## [0.2.0] – 03.10.2026

- **Antigravity** als zweiter Anbieter.

## [0.1.0] – 03.10.2026

- **Erste Version:** alle Claude-Code-Sessions nach Zustand — wartet, arbeitet, fertig, erledigt — in der Seitenleiste und als Übersicht.
