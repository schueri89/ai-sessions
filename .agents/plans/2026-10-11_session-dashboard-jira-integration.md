# Implementierungsplan: JIRA-Integration & Ticket-Zuweisung für Session-Historie

Datum: 2026-10-11  
Status: In Bearbeitung  
Betroffenes Projekt: ai-sessions  
Ziel-Version: v0.34.0  

---

## 1. Ausgangslage & Zielsetzung

Im 3. Tab des Dashboards („📋 Historie“) werden alle Sessions aus Claude Code, Antigravity und Copilot tabellarisch aufgelistet.  
Zur Arbeitsorganisation im Projekt- und Sprint-Alltag soll jede Session einem konkreten JIRA-Ticket (z. B. `PROJ-123`) zugewiesen werden können:
- **JIRA-Aktionsbutton in der Tabelle:** Direkter Zugriff auf JIRA pro Zeile.
- **Konfigurierbare JIRA-URL:** Verwaltung der Basis-URL über die VS-Code-Settings (`sessionDashboard.jiraBaseUrl`).
- **Ticket-Zuweisung & -Verwaltung:**
  - Schnelles Zuweisen via Input-Box mit automatischer Ticket-Vorschlagserkennung aus Session-Titel oder Prompts.
  - Öffnen des Tickets im Standardbrowser per 1-Click.
  - Bearbeiten und Entfernen von Tickets sowohl in den Tabellenaktionen als auch im ausgeklappten Detailbereich (Accordion).
  - Anzeige eines JIRA-Badges (`🎫 PROJ-123`) direkt an der Session.
  - Durchsuchbarkeit in der Freitextsuche nach Ticket-Nummern.

---

## 2. Technische Architektur

### 2.1 Datenhaltung (`lib/ticketStore.js`)
- Persistente Speicherung der Ticket-Zuweisungen im `memento` (`context.globalState` mit Schlüssel `sessionDashboard.tickets`).
- Datenstruktur: `{ [sessionId]: { ticket: string, assignedAt: number } }`.
- Hilfsfunktionen:
  - `detectTicket(text)`: Extrahiert Ticket-Muster (`/([a-zA-Z]{2,10}-\d+)/`) als Vorbelegung.
  - `buildJiraUrl(baseUrl, ticket)`: Baut die vollständige Ticket-URL auf (unterstützt Platzhalter `{ticket}` / `${ticket}` oder automatisches Anfügen an `/browse/`).

### 2.2 Einstellungen (`package.json`)
- Neue Einstellung `sessionDashboard.jiraBaseUrl`:
  - Typ: `string`, Standard: `""`
  - Beschreibung: Basis-URL zu JIRA (z. B. `https://firma.atlassian.net/browse/` oder `https://jira.firma.de/browse/{ticket}`).

### 2.3 Session-Modell & Analytics (`extension.js`, `lib/analytics.js`)
- `SessionModel` integriert `this.tickets = new TicketStore(context.globalState);`.
- `refresh()` versieht jedes Session-Objekt mit `ticket: this.tickets.getTicket(s.sessionId) || null`.
- `getSessionHistoryList` in `analytics.js` reicht das `ticket`-Attribut an die Historie-Daten weiter.
- Ticket-Änderungen fließen in die `signature` ein und triggern Webview-Updates.

### 2.4 VS-Code-Befehle (`extension.js`)
- `sessionDashboard.assignTicket`: Öffnet Input-Box zur Eingabe/Änderung/Entfernung eines Tickets.
- `sessionDashboard.openJira`: Öffnet das hinterlegte JIRA-Ticket im Browser. Falls noch kein Ticket zugewiesen ist, startet direkt die Zuweisung. Falls keine JIRA-URL konfiguriert ist, Hinweis mit Direkt-Button zu den Einstellungen.

### 2.5 Webview UI (`lib/boardPanel.js`)
- **Aktionsspalte in Historie-Tabelle:**
  - JIRA-Button mit SVG-Icon (`ICONS.jira`).
  - Wenn Ticket zugewiesen: Hervorgehobener Button (`jira-btn-active`), Klick öffnet JIRA im Browser, Shift-/Alt-Klick bearbeitet Ticket.
  - Wenn kein Ticket zugewiesen: Dezenter Button (`jira-btn-inactive`), Klick öffnet Zuweisung.
- **Titelspalte:**
  - Wenn Ticket zugewiesen: Klickbares Badge `🎫 PROJ-123` direkt neben oder unter dem Titel.
- **Ausgeklappter Detailbereich (Accordion):**
  - Eigene JIRA-Sektion mit Status, Direktlink `[Öffnen ↗]`, `[✏️ Ändern]` und `[🗑️ Löschen]`.
- **Suchfunktion:**
  - Einbindung von `s.ticket` in das Suchfeld, sodass Filterung nach Ticket-Keys unmittelbar funktioniert.

---

## 3. Betroffene Dateien

| Datei | Art | Änderung |
|---|---|---|
| `lib/ticketStore.js` | NEW | Persistente Ticket-Verwaltung, Auto-Erkennung, URL-Builder |
| `package.json` | MODIFY | `sessionDashboard.jiraBaseUrl`, Version auf `0.34.0`, Script `check` aktualisiert |
| `extension.js` | MODIFY | Integration `TicketStore`, Commands `assignTicket` & `openJira`, Signatur-Update |
| `lib/analytics.js` | MODIFY | Weitergabe des `ticket`-Attributs in `getSessionHistoryList` |
| `lib/boardPanel.js` | MODIFY | JIRA-Icon in `ICONS`, JIRA-Button & -Badge in Tabelle, Accordion-Sektion, Actions-Handler |
| `TODO.md` | MODIFY | Aktualisierung der Aufgabenliste |

---

## 4. Verifikation & Qualitätskontrolle

1. Datei-Größenprüfung von `lib/ticketStore.js` (> 0 Bytes).
2. `npm run check` (Syntax-Prüfung aller Module inkl. `lib/ticketStore.js` und Webview-Scripts).
3. VSIX-Paketierung nach `vsix/` und Installation im Editor.
4. Funktionalitätsprüfung:
   - Zuweisen eines Tickets via Button in der Historie-Liste.
   - Prüfen, ob Auto-Detection vorgeschlagen wird.
   - Prüfen des JIRA-Links und Hinweises bei fehlender Einstellung.
   - Bearbeiten und Löschen eines Tickets.
   - Suche nach dem Ticket-Key im Tabellen-Filter.
