# Plan: Tasks-Favoriten mit Schnellzugriffstabelle & Quota-Kacheln nur im Board-Tab (v0.59.0)

## Kontext & Problemstellung
Im Rahmen des neuen Tasks-Tabs (v0.58.0) ergaben sich drei Optimierungsbedarfe aus dem Praxisbetrieb:
1. **Quota-Kacheln der AI-Provider**: Die Kontingent- und Limit-Karten (Claude Code, Google Antigravity, Copilot, Codex) wurden bisher global im Dashboard-Header gerendert und waren auch in den Tabs *Analyse*, *Historie*, *Deploys* und *Tasks* sichtbar, wo sie wertvollen vertikalen Platz belegten.
2. **Favoriten-Markierung für Tasks**: Entwickler führen im Alltag meist nur 2–4 Kern-Tasks wiederholt aus (z. B. `APK bauen (WLAN)`, `APK bauen (PROD)`, `Sync`). Diese sollen dauerhaft als Favoriten markiert werden können.
3. **Tasks-Startseite mit Favoriten-Schnellzugriff**: Auf der Startseite des Tasks-Tabs (und bei gefilterten Projekten mit Favoriten) sollen gemerkte Tasks ganz oben in einer kompakten Tabelle mit 1-Klick-Start bereitstehen. Die Spalte `Task` soll die volle verbleibende Breite einnehmen und Status/Aktion bündig rechts abschließen.

---

## Architektur & Umsetzung

### 1. Quota-Kacheln nur im Board-Tab
- Der Container `#quota-strip` wurde aus der globalen Toolbar in `#board-controls-wrap` verschoben.
- Da `#board-controls-wrap` über `setViewMode(mode)` ausschließlich im `board`-Modus eingeblendet wird (`display: block` vs. `display: none`), sind die Quota-Karten in allen anderen Tabs automatisch unsichtbar.

### 2. Favoriten-Verwaltung in `lib/projectTasks.js`
- `ProjectTasksManager`:
  - Verwaltung eines `Set<string>` für `favoriteTaskIds`, synchronisiert mit `context.globalState` unter dem Schlüssel `sessionDashboard.favoriteTasks`.
  - Methoden `isFavorite(taskId)`, `toggleFavorite(taskId)` und `setFavorite(taskId, isFav)`.
  - `getAllTasks()` und `getTask(id)` liefern `isFavorite: boolean` an das Webview und Menü.
- **Webview-Messaging**:
  - Webview sendet `{ action: 'toggleTaskFavorite', taskId }`.
  - UI toggelt den Stern optimistisch (`☆` / `★`), der Manager speichert persistent und benachrichtigt Listener.
- **Statusleisten-Priorisierung** in `extension.js`:
  - Im QuickPick-Menü (`⚡ Projekt-Task ausführen...`) werden Favoriten ganz oben unter der Trennzeile `⭐ Favoriten` mit `$(star-full)` einsortiert.

### 3. Favoriten-Schnellzugriffstabelle in `lib/boardPanel.js`
- **Tabellenaufbau**:
  - `★` (`.col-star`): Kompakte 36 px Breite mit Stern-Button zum schnellen An-/Abwählen.
  - `Projekt` (`.col-project`): 130 px mit Projekt-Badge (`📁 <project>`).
  - `Task` (`.col-task`): `width: 100%` – nimmt den gesamten restlichen horizontalen Platz ein und zeigt nur den Tasknamen (`title` als Tooltip für Details).
  - `Status` (`.col-status`): `width: 1%; white-space: nowrap; text-align: right;` – schrumpft exakt auf den Status-Inhalt (`justify-content: flex-end`).
  - `Aktion` (`.col-action`): `width: 1%; white-space: nowrap; text-align: right;` – 1-Klick `▶ Ausführen` Button mit Live-Spinner bei laufendem Task.
- **Filter-Chip `⭐ Favoriten`**:
  - Sobald mindestens ein Favorit existiert, erscheint in der Projekt-Filterleiste neben `Alle` der Chip `⭐ Favoriten (n)`.
- **Tipp-Banner**:
  - Wenn noch keine Favoriten gewählt wurden, erscheint ein dezenter Hinweis zur Nutzung des Stern-Icons.

---

## Verifikation & Tests
- **Headless-Layout-Test (Microsoft Edge)**:
  - Automatisierte Vermessung der berechneten Spaltenbreiten in einem 1200 px & 1600 px breiten Webview: Task belegt 61 % (bzw. 65 %) der Gesamtbreite, Status und Aktion docken bündig am rechten Rand an.
- **Unit-Tests in `test/check-project-tasks.js`**:
  - Validierung von `isFavorite`, `toggleFavorite`, `getAllTasks` und der `globalState`-Persistenz.
- **Syntaxprüfung**: `npm run check` erfolgreich durchgelaufen.
