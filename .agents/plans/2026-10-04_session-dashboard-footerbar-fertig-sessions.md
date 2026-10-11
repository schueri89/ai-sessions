# Implementierungsplan: Anzeige fertiger Sessions im Statusleisten-Widget (Footerbar)
Datum: 04.10.2026
Task-Ziel: Statusleisten-Widget (Footerbar) so erweitern, dass neben den aktiven ("arbeitet") und wartenden ("wartet") auch fertige ("fertig") Sessions angezeigt werden.

Dieses Dokument beschreibt die Konzeption und Umsetzung der erweiterten Statusleisten-Anzeige im VS-Code-Dashboard `session-dashboard`.

## Technische Grundlage (verifiziert)

1. **Statusleisten-Widget (`lib/statusBar.js`)**:
   - `StatusBarWidget.update()` aggregiert bereits `busy`, `waiting`, `bookmarked` und `idle` aus `this.model.sessions`.
   - Bislang erzeugte die Formatierungslogik nur:
     - `🤖 X arbeitet · Y wartet` (wenn busy & waiting > 0)
     - `🤖 X arbeitet` (wenn nur busy > 0)
     - `🤖 Y wartet` (wenn nur waiting > 0)
     - `🤖 Z gemerkt` (wenn nur bookmarked > 0)
     - `🤖 KI bereit` (Fallback)
   - Die gezählten `idle`-Sessions flossen nicht in den sichtbaren Statusleistentext ein, sondern waren nur im Markdown-Hover-Tooltip sichtbar.
   - Der Tooltip hatte zudem die Bedingung `if (busy === 0 && waiting === 0 && bookmarked === 0)`, wodurch bei rein fertigen Sessions fälschlicherweise zusätzlich `*Keine aktiven Aufgaben*` ausgegeben wurde.

2. **QuickMenu (`extension.js`)**:
   - Im Direktzugriff-Menü (`sessionDashboard.quickMenu`) wurden bisher nur `waitingSessions` und `busySessions` gelistet.
   - Eine Ergänzung um die fertigen Sessions (`idleSessions`) erlaubt direktes Anspringen abgeschlossener Tasks.

## Hintergrund & Zielstellung

Entwickler starten KI-Sessions im Hintergrund und arbeiten in anderen Fenstern oder Dateien weiter. Bislang war an der Statusleiste nicht ersichtlich, ob Sessions fertiggestellt wurden, da der Zähler nur `arbeitet` oder `wartet` zeigte. Nach Abschluss sprang die Leiste auf `KI bereit` zurück, sodass unklar war, ob die Arbeit beendet ist oder nie gestartet wurde.
Mit der Einbindung von `Z fertig` sieht man sofort auf einen Blick:
- `🤖 1 arbeitet · 2 fertig`: 1 Task läuft noch, 2 sind bereits abgeschlossen.
- `🤖 3 fertig`: Alle Tasks sind fertig und bereit zur Durchsicht.
- `🤖 1 wartet · 2 fertig`: 1 Task benötigt Eingabe/Freigabe, 2 sind fertig.

## Vorgeschlagene Änderungen

### [Statusleisten-Widget]

#### [MODIFY] [lib/statusBar.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/statusBar.js)
- Text-Generierung dynamisch aufbauen:
  ```javascript
  const parts = [];
  if (busy > 0) parts.push(`${busy} arbeitet`);
  if (waiting > 0) parts.push(`${waiting} wartet`);
  if (idle > 0) parts.push(`${idle} fertig`);

  let text = '';
  if (parts.length > 0) {
    text = `🤖 ${parts.join(' · ')}`;
  } else if (bookmarked > 0) {
    text = `🤖 ${bookmarked} gemerkt`;
  } else {
    text = '🤖 KI bereit';
  }
  ```
- Tooltip-Bedingung bereinigen: `*Keine aktiven Aufgaben*` nur, wenn auch `idle === 0`.

### [QuickMenu-Direktzugriff]

#### [MODIFY] [extension.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/extension.js)
- In `sessionDashboard.quickMenu`: `idleSessions` auflisten mit Status-Icon `$(pass)` und Direktsprung zur fertigen Session.

### [Projekt & Dokumentation]

#### [MODIFY] [package.json](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/package.json)
- Versionssprung von `0.14.0` auf `0.15.0`.

#### [MODIFY] [TODO.md](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/TODO.md)
- Aufgabe als erledigt markieren.

## Verifikationsplan

### Automatisierte Tests
```powershell
npm run check
```
- Eigener Test für alle Zustands-Kombinationen (busy/idle, busy/waiting/idle, nur idle, nur busy, leer).

### Manuelle Prüfung
1. **Extension paketieren & installieren**:
   - `npm run package`
   - `code --install-extension session-dashboard-0.15.0.vsix --force`
2. **Statusleiste prüfen**:
   - Bei fertigen Sessions erscheint `X fertig`.
   - Bei paralleler Aktivität erscheint `X arbeitet · Y fertig`.
   - Klick auf Statusleiste bzw. QuickPick zeigt auch fertige Sessions an.
