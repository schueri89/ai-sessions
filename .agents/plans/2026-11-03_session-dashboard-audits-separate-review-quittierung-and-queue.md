# Plan: Audits: Getrenntes Quittieren von Code-Review & Security-Audit sowie serielle Warteschlange (v0.71.0)

## Kontext & Problemstellung
Im Tab `🛡️ Audits` gab es bisher drei Einschränkungen im Prüf- und Quittierungs-Workflow:
1. **Keine getrennte Quittierung:** Bisher gab es nur eine einzige, globale Quittierung für das gesamte Projekt („Geprüft quittieren“ / `✓`). Hatte ein Entwickler beispielsweise das Code-Review fachlich geprüft und freigegeben, das Security-Audit aber noch offen gelassen, konnte dieser Zwischenstand nicht differenziert festgehalten werden.
2. **Redundanter globaler Quittieren-Button bei ausgeklapptem Projekt:** War eine Projektzeile ausgeklappt, wurde unten in den Detail-Aktionen weiterhin ein großer grüner Button `✓ Als geprüft quittieren` eingeblendet. Stattdessen ist es übersichtlicher, wenn bei geöffneten Details direkt auf den jeweiligen Karten (Code-Review bzw. Security-Audit) ein separater grüner `✓ Quittieren`-Button angeboten wird und der globale Button verschwindet.
3. **Parallele Ausführung statt serieller Warteschlange:** Wurden mehrere Audits (z. B. auf mehreren Projekten oder Review + Security für dasselbe Projekt) oder zusätzlich die Workspace-Guards angestoßen, wurden Prozesse parallel gestartet oder wegen bereits laufender Projekte abgelehnt, was auf lokalen Maschinen zu Ressourcen-Konflikten und Ollama-Timeouts führte.

---

## Umgesetzte Maßnahmen

### 1. Differenzierte Quittierung (`lib/auditManager.js` & `lib/boardPanel.js`)
- **Statusverwaltung in `audit-state.json`:**
  - Unter jedem Projekt werden `cr_status`, `cr_reviewed_at`, `cr_reviewed_commit` sowie `sec_status`, `sec_reviewed_at` und `sec_reviewed_commit` getrennt erfasst.
  - Der übergeordnete Projektstatus `status` wird automatisch synchronisiert: Sind alle vorhandenen Berichte quittiert, gilt das Projekt als `reviewed`. Ist mindestens ein Bericht noch unquittiert, bleibt der Status `pending`.
- **Methode `markProjectReviewed(projectName, reviewType = 'all')`:**
  - Parameter `reviewType` akzeptiert `'cr'`, `'sec'` oder `'all'`.
  - Gezielte Aktualisierung des jeweiligen Prüfstands mit Commit-SHA und Zeitstempel.
  - KI-Übergabe (`dispatchAuditPrompt`) quittiert bei Einzelberichten automatisch nur den übergebenen Berichtstyp.
- **Berichts-Löschung (`deleteReport`):**
  - Beim Löschen eines einzelnen Berichts (`_review.md` oder `_security.md`) wird nur der entsprechende Review-Status im State bereinigt; der verbleibende Bericht bleibt unberührt.

### 2. UI-Optimierung bei ausgeklappten Projekten (`lib/boardPanel.js`)
- **Entfernung des globalen Quittieren-Buttons bei ausgeklappter Zeile:**
  - Sobald ein Projekt per Klick ausgeklappt ist (`isExpanded`), wird der globale grüne Quittieren-Button in der Zeile sowie am Fuß der Detail-Aktionen ausgeblendet.
- **Kartenbezogene Quittieren-Buttons:**
  - In der Code-Review-Karte (`crCard`) erscheint bei ausstehender Prüfung ein grüner Button `✓ Quittieren` (`.btn-ack.btn-ack-cr`), der gezielt nur das Code-Review quittiert.
  - In der Security-Karte (`secCard`) erscheint bei ausstehender Prüfung ein grüner Button `✓ Quittieren` (`.btn-ack.btn-ack-sec`), der gezielt nur das Security-Audit quittiert.
  - Bei bereits quittierten Prüfungen zeigen beide Karten ein klares `✓ Quittiert`-Badge samt Tooltip des Prüfzeitpunkts.
- **Tabellenspalte Prüfstand (`col-review`):**
  - Zeigt differenzierte Badges: `✓ Quittiert` (beide geprüft), `⚠️ Sec offen` (CR quittiert, Security offen), `⚠️ CR offen` (Security quittiert, CR offen) und `⚠️ Offen` (beide offen).
- **Kompakter globaler Quittieren-Button nur im eingeklappten Zustand:**
  - Im eingeklappten Zustand (`!isExpanded`) bleibt der Schnellquittieren-Button `✓` in den Zeilenaktionen erhalten und quittiert alle noch offenen Prüfungen des Projekts auf einen Klick.
- **Aufgeräumte Zeilen-Aktionen & gezieltes Abbrechen nur im ausgeklappten Zustand:**
  - Der rote Button `⏹ Abbrechen` bzw. `✕ Warteschlange` wurde aus den Zeilen-Aktionen der Tabelle entfernt.
  - Das Abbrechen eines laufenden Audits sowie das vorzeitige Entfernen aus der Warteschlange erfolgt ausschließlich in der ausgeklappten Detailansicht gezielt pro Review-Typ (`crCard` bzw. `secCard`).

### 3. Durchgängige serielle Warteschlange (`lib/auditManager.js` & `lib/boardPanel.js`)
- **Serielle Queue für alle Prüfungen:**
  - `runAudit` blockiert keine unterschiedlichen Review-Typen mehr, sondern reiht z. B. `security` automatisch in die Warteschlange ein, wenn für dasselbe Projekt bereits `review` läuft.
  - `runWorkspaceGuards` prüft ebenfalls auf aktive Läufe und reiht die Guards seriell ein, statt parallel zu starten.
  - Queue-Persistenz in `audit-running.json` stellt sicher, dass eingereihte Prüfungen auch bei Reloads oder Neustarts des Editors erhalten bleiben.
  - Sobald ein Lauf (oder Prozess-Watcher) endet, startet `processNextInQueue()` automatisch den nächsten anstehenden Auftrag.
- **Live-Status & Dequeueing in der UI:**
  - Buttons (`▶ Review`, `🛡️ Sec`, `▶ Jetzt prüfen`) sind nur noch gesperrt, wenn die konkrete Prüfung bereits läuft oder eingereiht ist.
  - In den Tabellenspalten und Accordion-Karten zeigen dynamische Badges `⏳ Warteschlange (#Position)` den genauen Platz in der Queue an.
  - Jeder eingereihte Auftrag kann über `✕ Warteschlange` jederzeit vorzeitig aus der Warteschlange entfernt werden.

---

## Verifikation & Tests
1. Erweiterung der Testsuite in `test/check-audit-manager.js`:
   - Getrenntes Quittieren von Code-Review und Security-Audit samt Statuswechsel.
   - Serielle Warteschlange über mehrere Projekte, unterschiedliche Modi und Workspace-Guards hinweg.
   - Entfernen/Abbrechen von Einträgen aus der Warteschlange.
2. Syntax- und Webview-Prüfung via `node test/check-webviews.js`.
3. Vollständige Testausführung mit `npm run check`.
4. Paketierung mit `npm run package` und Installation im Editor (`code --install-extension vsix/ai-sessions-0.71.0.vsix`).
