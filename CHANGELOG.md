# Changelog: AI Sessions

Alle sichtbaren Änderungen an der VS-Code-Extension, neueste Version oben.

## [0.86.0] – 10.11.2026

- **Deploys als Pipeline-Ansicht:** Eine aufgeklappte Pipeline zeigt jetzt wie die Jenkins-Build-Pipeline-Ansicht ihren Aufbau mit Pfeilen und Verzweigungen sowie die letzten 5 Läufe als farbige Kacheln je Job (Build-Nummer, Startzeit, Dauer mit Fortschritt, gestartet von, Parameter des Laufs); laufende Pipelines aktualisieren sich alle 5 Sekunden.
- **Deploys starten:** „▶ Starten“ startet eine Pipeline direkt aus dem Dashboard – mit Bestätigung und der Möglichkeit, die Build-Parameter vorher anzupassen.
- **Manuelle Schritte auslösen:** Wartet ein Schritt auf manuellen Start (z. B. Deploy LIVE nach erfolgreichem STAGE), lässt er sich über „▷ Auslösen“ in der Kachel wie in Jenkins starten.

## [0.85.0] – 10.11.2026

- **Benachrichtigung bei grünem Release:** Sobald alle Vorgänge eines kommenden Releases fertig sind, erscheint eine Benachrichtigung mit Sound und Button „In JIRA öffnen“; der Tab Releases bleibt dabei automatisch aktuell (Abfrage alle 5 Minuten, abschaltbar unter Tab: Releases).

## [0.84.1] – 10.11.2026

- **Lade-Kringel in allen Tabs:** Historie, Deploys und Releases sowie Windows-Aufgaben und Log-Ansicht im Tab Logs zeigen beim Laden jetzt wie die übrigen Tabs eine Lade-Animation.

## [0.84.0] – 09.11.2026

- **Fortschritts-Benachrichtigungen für KI-Audits:** Laufende Code-Reviews, Security-Scans und Workspace-Guards zeigen ab sofort eine dezente Fortschritts-Benachrichtigung mit Statusphasen und nativer Abbruch-Schaltfläche (`✕`), mit der sich der Prüflauf direkt ohne Öffnen des Dashboards abbrechen lässt (konfigurierbar über `sessionDashboard.audits.showProgressNotification`).
- **Update-Download mit Live-Fortschritt & Abbruch:** Beim Herunterladen einer neuen Version von GitHub zeigt die Benachrichtigung den exakten Download-Fortschritt (MB und Prozent) und kann bei Bedarf jederzeit abgebrochen werden.
- **Fortschrittsanzeige für Projekt-Tasks:** Langlaufende Builds und Tasks zeigen während der Ausführung eine begleitende Benachrichtigung mit Live-Laufzeit und 1-Klick-Abbruchfunktion (`sessionDashboard.tasks.showProgressNotification`).

## [0.83.0] – 09.11.2026

- **Differenzierte Töne bei Fehlschlägen:** Fehlgeschlagene Projekt-Tasks, rot gelaufene Jenkins-Deploys sowie KI-Audits mit Befunden oder Fehlern spielen ab sofort standardmäßig einen prägnanten Warnton (Chord) statt der Erfolgsfanfare ab.
- **Konfigurierbare Sounds je Dashboard-Tab:** Für Tasks (`sessionDashboard.sound.tasks.soundFailed`), Jenkins-Deploys (`sessionDashboard.sound.jenkins.sound` und `.soundFailed`) sowie Audits (`sessionDashboard.sound.audits.soundFailed`) lassen sich die Töne für Erfolg und Misserfolg getrennt einstellen.
- **Neuer Sound „Windows Error“ & erweiterter Vorhör-Assistent:** Der moderne Windows-Fehlerton steht nun in allen Sound-Dropdowns zur Verfügung, und der interaktive Assistent (`sessionDashboard.previewSound`) erlaubt das direkte Probehören und Zuweisen des neuen Fehler-Ereignisses (`taskFailed`).

## [0.82.0] – 09.11.2026

- **Update-Hinweis:** Die Extension prüft stündlich im Hintergrund, ob auf GitHub (`schueri89/ai-sessions`) eine neue Version veröffentlicht ist, und bietet sie mit 1-Klick zur direkten Installation, zum Ansehen der Release-Notes oder zum Überspringen an.
- **Befehl „Nach Updates suchen“:** Neuer VS-Code-Befehl (`sessionDashboard.checkForUpdates`) für die sofortige Prüfung auf Knopfdruck; die automatische Prüfung lässt sich in den Einstellungen unter „Allgemein“ (`sessionDashboard.updateCheck.enabled`) anpassen.
- **Automatisierter GitHub-Release-Workflow:** Neue GitHub Action (`.github/workflows/release.yml`) baut bei Versions-Tags (`vX.Y.Z`) automatisch das VSIX-Paket und veröffentlicht den GitHub Release samt Release-Notes aus dem Changelog.

## [0.81.0] – 09.11.2026

- **Neuer Tab „🏷️ Releases“:** Zeigt die JIRA-Lösungsversionen als übersichtliche Zeitachse – kommende Releases oben, bereits veröffentlichte Versionen darunter (beim Öffnen eingeklappt) – mit Status, Projekt, Start- und Release-Datum, Vorgangs-Fortschrittsbalken und 1-Klick-Button zum Öffnen in JIRA.
- **Releases: Gruppierung nach Kalenderwoche:** Versionen mit Release in derselben Kalenderwoche werden unter einer gemeinsamen Zwischenzeile (z. B. „KW 45/2026 · 02.11.–08.11.2026“) gebündelt, wobei die aktuelle Woche optisch hervorgehoben wird.
- **Releases: Fortschrittsbalken mit anpassbaren Status:** Im Fortschrittsbalken kommender Releases zählen neben erledigten Vorgängen auch Tickets in den Status „Ready for Live“ und „Live“ zum grünen Teil; die zählenden Status sowie Projekte und Zugangsdaten können in den Einstellungen unter „Tab: Releases“ (`sessionDashboard.releases.*`) konfiguriert werden.

## [0.80.0] – 09.11.2026

- **Deploys: Pipeline-Favoriten & Einklappen:** Häufig genutzte Pipelines lassen sich im Tab „🚀 Deploys“ mit einem Klick auf das Sternchen als Favoriten markieren und werden oben angeheftet; der Block aller weiteren Pipelines kann platzsparend ein- und ausgeklappt werden.
- **Deploys: Gesamtdauer & Live-Dauer:** Pipelines zeigen die summierte Dauer der letzten Builds aller enthaltenen Jobs in Minuten und Sekunden an; aktuell laufende Builds zählen ihre Dauer live hoch.
- **Deploys: Hintergrund-Überwachung & Benachrichtigungen:** Selbst gestartete Jenkins-Builds (inklusive nachgelagerter Pipeline-Jobs) werden im Hintergrund überwacht und melden ihre Fertigstellung per VS-Code-Benachrichtigung (`[🚀 Jenkins]`) samt Erfolgs- oder Fehler-Status und Direktlink zum Job.

## [0.79.0] – 08.11.2026

- **Dynamische Einstellungen & vollständige Pfad-Entkopplung:** Sämtliche hart codierten Pfade auf das lokale `webapps/ROOT`-Verzeichnis wurden eliminiert; die Projekt- und Root-Erkennung erfolgt ab sofort dynamisch über die geöffnete VS-Code-Arbeitsumgebung bzw. das aktuelle Arbeitsverzeichnis (mit Prüfung auf `.agents` bzw. `.git`) und kann bei Bedarf flexibel über die neue Einstellung `sessionDashboard.rootDirectory` konfiguriert werden.
- **Harmonisierte Quota-Schwellenwerte:** Die Warn- und Fehler-Schwellenwerte auf den Quota-Karten im Dashboard (Claude, Antigravity, Copilot, Codex und Kontext-Tokenleiste) wurden mit der Statusleiste synchronisiert und reagieren ab sofort dynamisch auf die Einstellungen `sessionDashboard.quotaWarningThreshold` und `sessionDashboard.quotaErrorThreshold`.
- **Flexible UI- & Board-Konfiguration:** Neue Einstellungen für das Dashboard: `sessionDashboard.board.columnCardLimit` (konfigurierbares Kachellimit pro Kanban-Spalte vor dem Aufklappen), `sessionDashboard.history.pageSize` (wählbare Standard-Seitengröße für die Historie-Tabelle, synchronisiert mit der Dropdown-Auswahl im Dashboard) sowie `sessionDashboard.defaultTab` (wählbarer Start-Tab beim Öffnen des Dashboards oder beim Editor-Start: Sessions, Analyse, Historie, Tasks, Audits, Logs oder Deploys).
- **Sound- & Benachrichtigungsauswahl für Tasks & Audits:** Für abgeschlossene Projekt-Tasks und lokale KI-Audits kann über `sessionDashboard.sound.tasks.sound` und `sessionDashboard.sound.audits.sound` der Signalton ab sofort frei aus den verfügbaren Sounds (Tada, Ding, Chimes) gewählt werden.
- **Anpassbare Task-Logs & Scheduled-Task-Namen:** Über `sessionDashboard.audits.scheduledTaskName` lässt sich der Name des Windows Tasks für das nächtliche Audit anpassen; `sessionDashboard.logs.tasks` und `sessionDashboard.logs.maxCharacters` erlauben die freie Definition der überwachten Tasks sowie die Begrenzung der geladenen Log-Zeichen.

## [0.78.0] – 08.11.2026

- **Rubriken-Differenzierung & Aktions-Buttons in Benachrichtigungen:** Alle Benachrichtigungen (Toasts) zeigen im Projekt-Tag ab sofort das Icon des zugehörigen Tabs (`[💬 <Projekt>]` für Sessions, `[⚡ <Projekt>]` für Tasks, `[🛡️ <Projekt>]` für Audits und `[📜 Logs]` für Task-Logs); Tasks bieten neu einen 1-Klick-Button „Terminal anzeigen“ zum direkten Fokus des Task-Terminals und Audits einen Button „Bericht öffnen“ für die sofortige Berichtsvorschau im Editor.

## [0.77.0] – 06.11.2026

- **Prüfstand-Ermittlung & Automatische Quittierungs-Reconciliation:** Im Tab „🛡️ Audits“ wird der Prüfstand nach neu abgeschlossenen Code-Reviews oder Security-Audits ab sofort automatisch und zuverlässig auf „⚠️ Offen“ zurückgesetzt, selbst wenn das Projekt zuvor quittiert war; die Statusermittlung gleicht Berichtszeitstempel und Git-Commit-Stände dynamisch mit dem letzten Quittierungszeitpunkt ab, und sowohl das CLI-Skript `project-audit.py` als auch Ad-hoc-Läufe über das Dashboard synchronisieren die Teilzustände (`cr_status` und `sec_status`) nun durchgängig.

## [0.76.0] – 06.11.2026

- **Dynamisches KI-Modell für nächtliche Audits:** Neue Einstellung `sessionDashboard.audits.nightlyModel` in der Kategorie „Tab: Audits“ zur freien Wahl des Modells für den automatisierten Gesamtlauf (z. B. `gemma4:e4b` vs. `gemma4:26b`); das gewählte Modell wird synchron in `audit-state.json` hinterlegt und vom nächtlichen Scheduled Task (`run-nightly-audit.ps1`) dynamisch ausgewertet.
- **Transparente Anzeige im Dashboard:** Im Workspace-Guards-Banner des Tabs „🛡️ Audits“ wird neben dem nächsten Ausführungszeitpunkt des Nightly Audits ab sofort auch das scharfgeschaltete Modell transparent angezeigt.

## [0.75.0] – 06.11.2026

- **Selektive Daily Audits (Projekt-Aktivierung):** Im Tab „🛡️ Audits“ können Projekte für den automatisierten nächtlichen Gesamtlauf (04:30 Uhr) gezielt aktiviert oder deaktiviert werden; in der Tabelle erlaubt eine neue Spalte „Daily“ mit 1-Klick-Toggle (📅) sowie ein Schalter im Accordion-Detailbereich die flexible Steuerung pro Projekt.
- **Daily-Filter & Toolbar-Zähler:** Ein neuer Schnellfilter-Chip „📅 Daily“ in der Toolbar filtert die Tabelle sofort auf alle aktuell aktivierten Projekte, und die Statistik-Zeile zeigt stets die Anzahl aktiver Vorhaben an.
- **CLI & Scheduled Task Integration:** Das Skript `project-audit.py` unterstützt ab sofort `--project active` (sowie `--set-daily <projekt> on|off`), und der nächtliche Task `DevBox-Nightly-Audit` (`run-nightly-audit.ps1`) prüft künftig nur noch die scharfgeschalteten Projekte anstelle des gesamten 27-Repository-Bestands.

## [0.74.0] – 06.11.2026

- **Kombinierte Audits & überarbeitete Aktionsbuttons:** In der Tabelle des Tabs „🛡️ Audits“ startet ein neuer Button „⚡ Code+Sec“ beide Prüfungen (Code-Review und Security-Scan) in einem gemeinsamen, schnellen Single-Pass-Durchlauf analog zum nächtlichen Daily Audit; die bisherigen Schaltflächen wurden in „💻 Code“, „🛡️ Sec“ und „⚡ Code+Sec“ umbenannt.
- **Schnelleres Standard-KI-Modell:** Als Standard-Modell für lokale Code-Reviews und Security-Audits ist in den Einstellungen und in der Modellauswahl der Toolbar ab sofort das reaktionsschnellere `gemma4:e4b` voreingestellt.

## [0.73.0] – 04.11.2026

- **Tab-basierte Einstellungen & kontextuelle Tab-Navigation:** Alle Einstellungen der Extension sind ab sofort exakt nach den Reitern des Dashboards gegliedert (Tab: Sessions, Tab: Tasks, Tab: Audits, Tab: Logs, Tab: Deploys, Statusleiste & Limits, Sounds, Benachrichtigungen, Allgemein); ein Klick auf das globale Zahnrad ⚙️ oben rechts öffnet automatisch die Einstellungen des aktuell aktiven Tabs, und in den Toolbars von Tasks, Audits, Logs und Deploys erlaubt jeweils ein eigener ⚙️-Button den direkten Sprung in die passenden Einstellungen.

## [0.72.1] – 04.11.2026

- **Harmonisierte Toolbar in Historie & Analyse:** Die Filter- und Navigationsleisten in den Unteransichten „Historie“ und „Analyse“ wurden optisch und strukturell exakt an das Sessions-Board angeglichen; die drei Sub-Navigationsbuttons und Provider-Filter sitzen ab sofort in allen Ansichten stabil an derselben horizontalen Position ohne vertikales Springen und ohne abweichenden Kasten-Hintergrund.

## [0.72.0] – 03.11.2026

- **Sessions-Tab Restrukturierung & selektive JIRA-Anzeige:** Der bisherige Tab „Board“ heißt ab sofort „Sessions“, die Tabs „Analyse“ und „Historie“ wurden als direkte Unteransichten rechts in die Sessions-Leiste integriert und die Freitextsuche linksbündig unter die Filter verlegt; auf den Kacheln werden JIRA-Buttons und Ticketnummern ab sofort nur noch angezeigt, wenn auch eine JIRA-Basis-URL in den Einstellungen hinterlegt und damit JIRA aktiviert wurde.

## [0.71.0] – 03.11.2026

- **Audits: Getrenntes Quittieren von Code-Review & Security-Audit, serielle Warteschlange & aufgeräumte Zeilen-Aktionen:** Im Tab „🛡️ Audits“ können Code-Reviews und Security-Audits nun unabhängig voneinander geprüft und quittiert werden; bei ausgeklappten Projekten ersetzt jeweils ein direkter grüner Quittieren-Button in der entsprechenden Review-Karte den bisherigen globalen Button, das Abbrechen bzw. Entfernen aus der Warteschlange ist gezielt im ausgeklappten Zustand pro Review-Typ erreichbar, und mehrere gestartete Audits oder Workspace-Guards reihen sich automatisch in eine serielle Warteschlange ein, anstatt parallel ausgeführt zu werden.

## [0.70.0] – 03.11.2026

- **Kategorisierte Einstellungen:** Die Einstellungen der Extension sind ab sofort in sieben übersichtliche Themenbereiche gegliedert (Allgemein, Statusleiste & Limits, KI-Provider, Sounds, Benachrichtigungen, Dashboard-Tabs und Integrationen) und lassen sich im VS-Code-Einstellungseditor über das Inhaltsverzeichnis links sowie über formatierte Abschnittsüberschriften gezielt ansteuern.

## [0.69.2] – 03.11.2026

- **Sessions: Kalendertaggenaue Zeitanzeige bei Limits auf Kacheln:** Wenn ein Session-Limit aktiv ist, wird auf den Kacheln und in den Details rein die Uhrzeit nur noch dann angezeigt, wenn das Limit am selben Tag abläuft; die irritierende 24-Stunden-Regel wurde entfernt, sodass Limits mit Ablauf am Folgetag oder an späteren Tagen immer unmissverständlich inklusive Wochentag (z. B. „Mi 02:30 Uhr“) dargestellt werden.

## [0.69.1] – 03.11.2026

- **Audits: Waiter-Icon-Zentrierung & echte Reload-Persistenz bei Fenster-Neuladen:** Das rotierende Waiter-Icon (Lade-Spinner) in den Status-Badges des Audits-Tabs ist dank `box-sizing: border-box`, Pixel-Ausrichtung und Inline-Flex-Box vertikal exakt mit Text und Live-Timer zentriert; laufende Audit-Prozesse werden ab sofort mit `detached: true` gestartet und bei Window-Reloads (F1) nicht mehr durch die Extension-Bereinigung (`dispose()`) abgebrochen, sondern schreiben ihre Ausgaben in Logdateien und werden beim Neuladen der Benutzeroberfläche nahtlos weitergeführt.

## [0.69.0] – 02.11.2026

- **Audits: Lade-Animation, Fortschrittsbalken mit Live-Dauer, Reload-Persistenz, Abbrechen-Button & UI-Polish:** Im Tab „🛡️ Audits“ zeigt ein animierter Lade-Spinner beim ersten Laden und bei Aktualisierungen den Ladezustand an; während ein Review läuft, visualisieren ein blauer Shimmer-Fortschrittsbalken und ein sekündlich mitlaufender Live-Timer den Fortschritt in Zeile, Kachel und Banner; aktive Audits werden über VS-Code-Neustarts und Window-Reloads hinweg anhand persistenter Metadaten und OS-Prozesserkennung nahtlos weiterverfolgt; laufende Audits oder Aufgaben in der Warteschlange können per Klick auf `⏹ Abbrechen` unverzüglich beendet werden; im Accordion wurden doppelte Start-Buttons unter den Kacheln entfernt und im Workspace-Banner die Buttons präzise mit `📄 Bericht öffnen` und `🗑️ Bericht löschen` beschriftet.

## [0.68.0] – 02.11.2026

- **Audits: Getrennte Spalten für Code-Review & Security-Audit, separate Berichtsdateien & Logs-Fix:** Im Tab „🛡️ Audits“ werden Code-Review und Security-Audit ab sofort in zwei dedizierten Ergebnis-Spalten mit individuellem Status, Scan-Zeitpunkt und direktem Bericht-Link dargestellt; Reviews und Security-Audits schreiben getrennte Berichte (`_review.md` und `_security.md`), sodass manuelle Läufe keine Vorab-Ergebnisse mehr überschreiben; ein smarter `🚀 KI`-Button übergibt bei beiden vorhandenen Berichten standardmäßig beide Prüfungen gemeinsam oder bietet gezielte Einzelauswahl; im Tab „📜 Logs“ bleibt das ausgewählte zweite Log auch bei periodischen Hintergrund-Updates stabil geöffnet.

## [0.67.2] – 02.11.2026

- **Tasks: Feste Fußzeilen-Ausrichtung am unteren Kachelrand:** Auf den Task-Kacheln im Tab „⚡ Tasks“ ist die Fußzeile (Trennlinie, Status, letzter Ausführungszeitpunkt und Ausführen-Button) ab sofort dauerhaft an der Unterkante der Karte verankert, sodass alle Kacheln einer Reihe unabhängig von Textlänge oder Badges eine einheitliche, bündige Grundlinie aufweisen.

## [0.67.1] – 02.11.2026

- **Tasks: Datumsanzeige inkl. Uhrzeit für letzten Lauf & Standard-Build-Badges:** Im Tab „⚡ Tasks“ wird der letzte Ausführungszeitpunkt in der Favoriten-Tabelle sowie auf den Task-Kacheln ab sofort als Datum und Uhrzeit (`DD.MM.YYYY, HH:mm`) in der regulären Editor-Oberflächenschrift statt relativer Zeitangabe in Monospace dargestellt; Standard-Build-Tasks tragen nun ein klares kombiniertes Badge `[Standard-Build]`, während sekundäre Build-Tasks (`APK bauen (PROD)`, `Web-Build (DEV)`, `AAB bauen (Play)`) über eine optimierte Erkennung zuverlässig das `[Build]`-Badge erhalten.

## [0.67.0] – 02.11.2026

- **Audits: Vollständige Scans ohne Datei-Beschränkung & KI-Modellauswahl:** Im Tab „🛡️ Audits“ scannen Komplett-Reviews und Security-Audits nun ausnahmslos alle Quellcode-Dateien des Projekts in automatischen Batches statt nach 2 Abschnitten abzubrechen; auch große Git-Diffs werden bei Bedarf intelligent in Abschnitte aufgeteilt, sodass keine geänderten Zeilen mehr gekürzt werden; über ein neues Modell-Dropdown in der Toolbar kann neben dem Standardmodell `gemma4:26b` auch das leichtere `gemma4:e4b` ausgewählt werden, wobei die Voreinstellung auch über die neue Konfiguration `sessionDashboard.audits.defaultModel` steuerbar ist.

## [0.66.1] – 02.11.2026

- **Audits: Unterstützung für deutschsprachige Gesamtbewertungen:** Die Statuserkennung im Tab „🛡️ Audits“ erkennt ab sofort auch deutschsprachige Beurteilungen wie „ÄNDERUNGEN ERFORDERLICH“ zuverlässig als Prüfbedarf und Warnung.

## [0.66.0] – 01.11.2026

- **Audits: Löschen-Button für Berichte, Fertigstellungs-Benachrichtigungen, bereinigte Befund-Erkennung & serielle Queue gegen Timeouts:** Im Tab „🛡️ Audits“ können Berichtsdateien über einen neuen Löschen-Button (`🗑️`) in der Tabelle, im Detail-Accordion und im Guards-Banner direkt von der Festplatte gelöscht werden; bei Abschluss eines Audits informieren nun schlanke Toast- und Sound-Benachrichtigungen analog zu Sessions und Projekt-Tasks über das Ergebnis (Bestanden, Prüfbedarf oder Befunde); die Status-Erkennung filtert den Prompt-Footer heraus, sodass fehlerfreie Projekte nicht mehr fälschlich als Befunde markiert werden; gleichzeitige Audit-Starts werden in einer seriellen Warteschlange (`⏳ Warteschlange`) abgearbeitet und API-Anfragen an Ollama streamen Tokens live, wodurch Überlastungen und Socket-Timeouts zuverlässig verhindert werden.

## [0.65.0] – 01.11.2026

- **Tabellarische Ansicht & Status-Filter für lokale KI-Audits:** Der Tab „🛡️ Audits“ wurde von der unübersichtlichen Kachelansicht auf eine kompakte, scannbare Datentabelle umgestellt; Schnellfilter-Chips in der Toolbar (`Alle`, `🚨 Befunde`, `⏳ Läuft`, `⚠️ Offen`, `✓ Quittiert`, `✅ Bestanden`, `⚪ Noch kein Audit`) bündeln den aktuellen Handlungsbedarf auf einen Klick, Tabellenköpfe unterstützen flexible Spaltensortierung (Standard: Befunde und aktive Läufe ganz oben) und ein Klick auf eine beliebige Zeile öffnet ein interaktives Accordion mit ausführlicher Befund-Zusammenfassung und Direkt-Aktionen.

## [0.64.0] – 01.11.2026

- **Vollständiger Projekt-Scan (Komplett) für Code-Reviews und Security-Audits:** Im Tab „🛡️ Audits“ kann neben der bisherigen Diff-Prüfung ungesicherter Änderungen nun per 1-Klick-Umschalter (sowohl global in der Toolbar als auch individuell auf jeder Projekt-Karte) ein vollständiger Scan (`🌐 Komplett`) ausgelöst werden; das zugrundeliegende Audit-Skript priorisiert architektur- und sicherheitskritische Kern-Dateien (`Application.cfc`, Authentifizierung, APIs, Controller, Services) und analysiert den gesamten Projektcode über lokales Ollama (`gemma4:26b`), wodurch auch unberührte Bestandsprojekte turnusmäßig und vollautomatisch auditiert werden können.

## [0.63.1] – 01.11.2026

- **Kumulative Audits & Quittierungs-Workflow bei ungeprüften Reviews:** Wenn ein nächtlicher Review an Vortagen nicht geprüft wurde, kumuliert der Audit-Job automatisch alle Code-Änderungen seit dem letzten bestätigten Commit (`last_reviewed_commit..HEAD`) in einen einzigen, zusammenhängenden Tagesbericht pro Projekt; im Tab „🛡️ Audits“ signalisiert ein Badge (`⚠️ Offen (kumulativ)`) unquittierte Reviews; über den neuen Button `✓ Geprüft` können Audits manuell als geprüft quittiert werden, während die 1-Klick-Übergabe `🚀 An KI übergeben` den Prüfstand nun automatisch aktualisiert.

## [0.62.0] – 01.11.2026

- **Tab 📜 Logs für Windows-Tasks & Backup-Logs:** Neuer Dashboard-Reiter bündelt die nächtlichen Windows Scheduled Tasks (`DevBox-Nightly-BackupSync`, `DevBox-Nightly-Audit`) samt Zeitplan, Status und 1-Klick-Ausführung; der integrierte Log-Viewer visualisiert Logdateien (`backup-sync.log`, `nightly-audit.log`) mit automatischer Farbcodierung für Fehler und Warnungen; bei fehlgeschlagenen Tasks signalisiert ein roter Fehler-Badge direkt am Tab-Button die Anzahl der betroffenen Aufgaben; Zeitstempel werden einheitlich ohne Sekunden (nur Stunden und Minuten) formatiert und Umlaute aus Windows-CLI-Ausgaben robust dekodiert.

## [0.61.1] – 01.11.2026

- **1-Klick-Übergabe an KI-Assistenten:** Aus dem Tab „🛡️ Audits“ und aus den generierten Audit-Berichten können Befunde per 1-Klick-Button `🚀 An KI übergeben` direkt an Google Antigravity, Claude Code, GitHub Copilot, OpenAI Codex oder Cline übergeben werden; bei Google Antigravity (`antigravity.startNewConversation` + `antigravity.addContext`) und Claude Code (`claude-vscode.editor.open` mit `initialPrompt`) wird der dynamische Fix-Prompt direkt ins Eingabefeld übermittelt, bei GitHub Copilot via `workbench.action.chat.open` befüllt.

## [0.61.0] – 01.11.2026

- **Tab 🛡️ Audits für lokale KI-Reviews:** Code-Reviews und Security-Audits lassen sich im neuen Dashboard-Reiter „🛡️ Audits“ für jedes Teilprojekt mit einem einzigen Klick über lokales Ollama (`gemma4:26b`) starten; Workspace-Guards laufen entkoppelt in einem prominenten Kopf-Banner; Status der Windows-Aufgabenplanung (`DevBox-Nightly-Audit`) wird live eingeblendet; alle Zeitstempel werden im deutschen Format samt Uhrzeit angezeigt.

## [0.60.0] – 29.10.2026

- **Tasks-Verbesserungen & Benachrichtigungen:** Favoriten stehen im Tasks-Tab ab sofort immer an oberster Stelle und lassen sich per Klick platzsparend ein- und ausklappen, beendete Task-Läufe melden sich automatisch per schlanker Benachrichtigung und Sound, die Zeit des letzten Laufs wird bei jedem Task dauerhaft angezeigt und die doppelte Trennlinie auf den Unter-Tabs wurde bereinigt.

## [0.59.1] – 28.10.2026

- **Kompaktere Benachrichtigungen:** VS-Code-Toasts bei fertigen Sessions oder Rückfragen wurden verschlankt und zeigen das Status-Icon (✅ fertig, ❓ Rückfrage, ⚠️ Freigabe) direkt am Anfang, gefolgt vom Projekt und der Aufgabe auf einer einzelnen Zeile ohne redundante Statustexte.

## [0.59.0] – 27.10.2026

- **Tasks-Favoriten & Quota-Fokussierung:** Wichtige Tasks können mit einem Klick auf den Stern als Favorit markiert werden und stehen auf der Startseite des Tasks-Tabs in einer kompakten Schnellzugriffstabelle mit Direkt-Start und Live-Status bereit; außerdem werden die Quota- und Limit-Kacheln der KI-Anbieter nur noch im Board-Tab angezeigt.

## [0.58.0] – 27.10.2026

- **Projekt-Tasks Tab & 1-Klick-Ausführung:** Build-, Sync- und Deployment-Abläufe aller Projekte (wie `APK bauen`, `App-Icons neu zeichnen` etc.) sind im neuen Dashboard-Reiter „⚡ Tasks“ und über das Statusleisten-Menü zentral gebündelt, lassen sich mit einem einzigen Klick starten und zeigen ihren Ausführungsstatus live im Dashboard an.

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
