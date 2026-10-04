# Implementierungsplan: Behebung von Markierungsverlusten (Erledigt & Gemerkt) und Entfernen des Antigravity LIMIT 250

Datum: 04.10.2026
Task-Ziel: Schutz von „Erledigt“- und „Gemerkt“-Markierungen gegen Verlust bei I/O- oder Lesefehlern sowie Entfernen des harten 250-Session-Limits für Antigravity.

## Hintergrund & Problemstellung

1. **Markierungsverlust bei Lesefehlern / temporären Aussetzern:**
   In `extension.js` wurde `knownIds` als Set aller im aktuellen Durchlauf eingelesenen Sessions erzeugt (`new Set(live.map(s => s.sessionId))`) und an `DoneStore.reconcile(live, knownIds)` sowie `BookmarkStore.reconcile(live, knownIds)` übergeben.
   In `DoneStore.reconcile` (und analog `BookmarkStore.reconcile`) führte die Prüfung:
   ```javascript
   const vanished = !s && knownIds && !knownIds.has(id);
   if (reactivated || vanished) {
     delete marks[id];
   }
   ```
   dazu, dass jede Session, die in einem Durchlauf fehlte (z. B. Claude-Ordner kurz nicht lesbar, Transkriptdatei gesperrt/gelockt, Antigravity SQLite-DB kurz blockiert), sofort unwiderruflich aus `globalState` gelöscht wurde. Beim nächsten erfolgreichen Poll 5 Sekunden später tauchten alle mühsam abgehakten Sessions wieder als „Fertig“ (`idle`) auf. Lesezeichen („Gemerkt“) wurden auf dieselbe Weise gelöscht.
2. **Entfernen des `LIMIT 250` bei Antigravity:**
   In `lib/providers/antigravity.js` war die SQL-Abfrage auf 250 Einträge beschränkt (`LIMIT 250`). Bei mehr als 250 Sessions fielen ältere Sessions heraus und verloren dadurch ebenfalls sofort ihre Markierungen.

## Umgesetzte Änderungen

### [session-dashboard]

#### [MODIFY] [lib/doneStore.js](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/lib/doneStore.js)
- `reconcile(live)`: Das automatische Löschen von Markierungen bei `vanished` entfernt.
- `reconcile` entfernt eine Markierung **nur und ausschließlich**, wenn die Session nachweislich reaktiviert wurde (`reactivated`: `s.state === 'busy'` oder `s.state === 'waiting'` oder `s.startedAt > mark.markedAt`).
- Dadurch sind Markierungen absolut resistent gegen I/O-Fehler, gesperrte Dateien oder unvollständige Scans. Sessions, die nicht mehr existieren, werden im Dashboard ohnehin nicht angezeigt (da das Board nur `live` darstellt).

#### [MODIFY] [lib/bookmarkStore.js](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/lib/bookmarkStore.js)
- `reconcile(live)`: Entfernen des `vanished`-Prunings. Pinned-Sessions dürfen niemals automatisch entpinnt werden, nur weil ein Scan die Datei temporär nicht erfassen konnte.
- Lesezeichen werden nur manuell gelöst (über Pin-Button, `unbookmarkAll` oder beim Markieren als `done`).

#### [MODIFY] [lib/providers/antigravity.js](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/lib/providers/antigravity.js)
- SQL-Query in `readSessions()`: `LIMIT 250` entfernt, sodass alle aktiven und historischen Sessions (wo `killed = 0`) vollständig geladen werden.

#### [MODIFY] [extension.js](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/extension.js)
- Aufrufe von `reconcile`: Vereinfacht auf `await this.done.reconcile(live)` und `await this.bookmarks.reconcile(live)`.

#### [MODIFY] [package.json](file:///c:/lucee/tomcat/webapps/ROOT/tools/session-dashboard/package.json)
- Versions-Bump auf `0.22.0`.

#### [MODIFY] [TODO.md](file:///c:/lucee/tomcat/webapps/ROOT/tools/TODO.md)
- Bug-Eintrag aus „Bug“ entfernt und unter „Erledigt“ dokumentiert.

## Verifikation
1. `npm run check`: Alle 14 JavaScript-Dateien fehlerfrei validiert (Exit Code 0).
2. Automatisierte Unit-Tests für `DoneStore` und `BookmarkStore`:
   - Simulation eines kompletten Scan-Ausfalls (`live = []`): Alle Markierungen bleiben erhalten.
   - Simulation einer Reaktivierung (`state = 'busy'`): Reaktivierte Session wird sauber freigegeben.
3. Antigravity-Provider: `LIMIT 250` entfernt, 127 Sessions in 97ms performant geladen.
4. `npm run package`: `session-dashboard-0.22.0.vsix` erfolgreich gebaut.
5. `code --install-extension session-dashboard-0.22.0.vsix --force`: Erfolgreich installiert.
