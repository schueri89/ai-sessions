# Implementierungsplan: Gemerkt-Spalte für Sessions (Pin-Funktion)
Datum: 2026-10-03
Task-Ziel: Sessions per Pin merken können; fertige gemerkte Sessions wandern in eine eigene Spalte "Gemerkt".

Das Dokument beschreibt die Erweiterung der VS-Code-Extension `session-dashboard` unter `tools/session-dashboard`,
um eine Pin-/Bookmark-Funktion mit separater Spalte „Gemerkt".

## Hintergrund & Zielstellung

Beim parallelen Arbeiten mit mehreren KI-Assistenten (Claude Code und Google Antigravity) will man
oft bestimmte Arbeitsaufträge im Nachgang gezielt prüfen. Bislang landen alle fertigen Sessions
im allgemeinen Bereich „Fertig" und gehen dort leicht unter.

Mit der Pin-Funktion kann eine Session jederzeit (auch während sie noch arbeitet) als „gemerkt"
markiert werden:
- Solange sie **arbeitet** (`busy`) oder auf **Input wartet** (`waiting`), bleibt sie in ihrer aktiven
  Spalte, zeigt jedoch ein sichtbares Pin-Icon (📌).
- Sobald sie **fertig** ist (`idle`) oder geschlossen wird (`closed`), wandert sie **automatisch
  in die eigene Spalte „Gemerkt"** (direkt zwischen *„Arbeitet"* und *„Fertig"*).
- Bereits fertige oder geschlossene Sessions können ebenfalls angepinnt werden und wandern sofort
  in die Spalte „Gemerkt".
- In der Spalte „Gemerkt" kann die Markierung per Klick auf den Pin oder über den Button „Geprüft"
  entfernt werden; wird die Session als „Erledigt" markiert, wandert sie wie gewohnt nach „Erledigt".

## Vorgeschlagene Änderungen

### [session-dashboard]

#### [ADD] [lib/bookmarkStore.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/bookmarkStore.js)
- Verwaltet persistente Markierungen im `context.globalState` unter dem Schlüssel `sessionDashboard.bookmarks`.
- Methoden: `isBookmarked(sessionId)`, `toggle(sessionId)`, `mark(sessionId)`, `unmark(sessionId)`, `unmarkMany(sessionIds)`, `all()`, `reconcile(live, knownIds)`.

#### [MODIFY] [lib/format.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/format.js)
- `STATES`: Neuer Eintrag `bookmarked: { label: 'Gemerkt', icon: 'pinned', color: 'charts.yellow' }`.
- `STATE_ORDER`: Anordnung auf `['waiting', 'busy', 'bookmarked', 'idle', 'closed', 'done']`.

#### [MODIFY] [extension.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/extension.js)
- `SessionModel`:
  - `this.bookmarks = new BookmarkStore(context.globalState)`.
  - Bei `refresh()`: Für jede Session `s.isBookmarked` prüfen.
    Wenn `isBookmarked === true` und `s.state === 'idle' || s.state === 'closed'`, dann `displayState = 'bookmarked'`.
  - Wenn Session `done` markiert wird, Lesezeichen automatisch auflösen.
- Befehle registrieren:
  - `sessionDashboard.toggleBookmark(sessionId)`
  - `sessionDashboard.bookmark(sessionId)`
  - `sessionDashboard.unbookmark(sessionId)`
  - `sessionDashboard.unbookmarkAll()`

#### [MODIFY] [lib/treeView.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/treeView.js)
- Session-Items in der Sidebar:
  - Wenn `s.isBookmarked` und nicht in Gruppe `bookmarked`: Pin-Kennzeichnung im Tooltip und Description (`📌`).
  - Eigene Gruppe `Gemerkt (n)` mit gelbem Pin-Icon.

#### [MODIFY] [lib/boardPanel.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/boardPanel.js)
- Card-Header:
  - Pin-Button links neben dem Provider-Icon (`.pin-btn`).
  - Klick sendet `{ action: 'toggleBookmark', sessionId: s.sessionId }`.
  - Wenn gemerkt: Pin ist goldgelb gefüllt/hervorgehoben.
- Spalte „Gemerkt":
  - Styling für `.bookmarked .dot` (gelb) und `.bookmarked .card` (gelber linker Rand).
  - Button „Alle geprüft" im Spaltenkopf zum gemeinsamen Entfernen.
  - Card-Button: Statt nur „Erledigt" zusätzlich Button „Geprüft" (entfernt Pin).

#### [MODIFY] [package.json](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/package.json)
- Befehle `sessionDashboard.bookmark`, `sessionDashboard.unbookmark` und `sessionDashboard.toggleBookmark` registrieren.
- Inline-Menü in `view/item/context` für schnelles Pinnen/Entpinnen per Hover in der Sidebar.
- Version auf `0.4.0` anheben.

#### [MODIFY] [README.md](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/README.md)
- Neue Gruppe/Spalte „Gemerkt" und Pin-Funktion dokumentieren.

## Verifikation
1. `npm run check` (Syntaxprüfung aller JS-Dateien).
2. `npm run package` (VSIX bauen).
3. `code --install-extension session-dashboard-0.4.0.vsix --force`.
4. Manuelle Prüfung:
   - Session während der Arbeit pinnen → bleibt in „Arbeitet" mit 📌.
   - Sobald Session fertig wird → wandert automatisch nach „Gemerkt".
   - Fertige/geschlossene Session pinnen → wandert sofort nach „Gemerkt".
   - Klick auf Pin / „Geprüft" → wandert zurück nach „Fertig" bzw. „Geschlossen".
   - Klick auf „Erledigt" → wandert nach „Erledigt" und Pin wird gelöst.
   - Provider-Filter prüfen: Gemerkte Sessions bleiben nach Provider filterbar.
