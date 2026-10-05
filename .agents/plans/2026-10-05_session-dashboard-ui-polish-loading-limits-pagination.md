# Implementierungsplan: Session-Dashboard UI-Polish (Statusleiste, Ladeanimation, Limit-Anzeige, Projekt-Filter & Spalten-Pagination)

Datum: 05.10.2026  
Status: Bereit zur Umsetzung  
Betroffenes Projekt: session-dashboard

---

## 1. Übersicht & Zielsetzung

Dieser Plan adressiert 5 spezifische Verbesserungen im Session-Dashboard:
1. Status Bar Usage-Boxen: Farbgebung für Werte unter 80% (mit technischer Klärung der VS Code Statusleisten-Restriktionen).
2. Dashboard Ladeanimation: Eleganter Ladezustand / Spinner beim Starten und Laden des Dashboards.
3. Limit-Text auf Kacheln: Dynamische Zeitanzeige (Limit bis HH:MM Uhr bei <= 24h vs. Limit bis Wochentag HH:MM Uhr bei > 24h).
4. Projekt-Filter: Reduzierung auf die Top 4–5 Projekte (nach Session-Anzahl) mit ausklappbarem "mehr"-Button.
5. Spaltenweises Lazy-Loading / Pagination: Maximal 20 Sessions pro Spalte initial laden, alle weiteren per Klick auf einen Button nachladen.

---

## 2. Technische Prüfung & Detailliertes Vorgehen

### Punkt 1: Status Bar – Grün bei Werten unter 80%
* Prüfung / Technische Einschränkung der VS Code API:
  In Visual Studio Code erlaubt die API für StatusBarItem.backgroundColor ausschließlich zwei feste Theme-Farben:
  - statusBarItem.errorBackground (Rot)
  - statusBarItem.warningBackground (Gelb/Orange)
  
  In der internen Implementierung von VS Code (extensionHostProcess.js) ist dies hart verdrahtet:
  `javascript
  ALLOWED_BACKGROUND_COLORS = new Map([
    ["statusBarItem.errorBackground", ...],
    ["statusBarItem.warningBackground", ...]
  ]);
  set backgroundColor(t) {
    t && !ALLOWED_BACKGROUND_COLORS.has(t.id) && (t = void 0);
    this._backgroundColor = t;
  }
  `
  Wird ein anderer ThemeColor an item.backgroundColor übergeben, setzt VS Code den Hintergrund stillschweigend auf undefined (transparent). Ein echter Hintergrund in Grün ist im VS Code Status Bar API architektonisch nicht vorgesehen.
* Lösung:
  - Die Vordergrund-/Schrift- und Icon-Farbe (statusBarItem.color) unterliegt dieser Einschränkung nicht und unterstützt beliebige Theme-Farben.
  - Für Werte < 80% wird item.color = new vscode.ThemeColor("charts.green") gesetzt (bei Default-Hintergrund).
  - Ergebnis:
    - < 80%: Grüner Text & grünes Icon auf gewohntem Statusleisten-Hintergrund.
    - 80% – 94%: Gelbe Box (statusBarItem.warningBackground + statusBarItem.warningForeground).
    - >= 95% / Limit: Rote Box (statusBarItem.errorBackground + statusBarItem.errorForeground).

### Punkt 2: Dashboard Ladeanimation beim Starten/Laden des Dashboards
* Ist-Zustand:
  Beim Öffnen des Dashboard-Webviews (lib/boardPanel.js) wird der HTML-Rahmen angezeigt, bevor die Daten per IPC (ready -> render) ankommen. Während dieser kurzen Latenz waren Zähler mit "0" und leere Spalten zu sehen.
* Lösung:
  - Ein modernes Lade-Overlay #dashboard-loader direkt im HTML zentriert im Viewport mit animiertem Spinner (SVG / CSS-Keyframes) und Hinweistext: "Lade Sessions & Quotas...".
  - Sobald das erste type: "render"-Event im Webview verarbeitet ist, blendet sich der Loader sanft aus (opacity: 0, transition: opacity 0.25s ease, danach display: none).
  - Einbindung so, dass nachfolgende Render-Zyklen (z. B. nach Spalten-Pagination oder Suchbegriff) nicht den Vollbild-Loader triggern, sondern nahtlos aktualisieren.

### Punkt 3: Limit-Text auf Kacheln ("Limit bis XX Uhr" / Wochentag bei > 24h)
* Ist-Zustand:
  In lib/format.js formatiert describe(session) bei aktivem Limit:
  "⏳ Limit bis " + formatTime(session.rateLimit.resetsAt)
  wobei formatTime() immer starr nur HH:MM Uhr ausgibt (selbst wenn der Reset erst in mehreren Tagen stattfindet).
* Lösung:
  - Neue Funktion formatLimitReset(resetsAt, now = Date.now()) in lib/format.js:
    - Zeitdifferenz berechnen: diffMs = resetsAt - now.
    - Ist diffMs <= 24 * 60 * 60 * 1000: Ausgabe HH:MM Uhr (z. B. 14:30 Uhr).
    - Ist diffMs > 24 * 60 * 60 * 1000: Ausgabe mit Wochentagskürzel, z. B. Do. 14:30 Uhr (['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']).
  - describe(session, now) nutzt formatLimitReset(session.rateLimit.resetsAt, now).
  - Karten zeigen dann:
    - Innerhalb 24h: ⏳ Limit bis 14:30 Uhr
    - Mehr als 24h: ⏳ Limit bis Do. 14:30 Uhr

### Punkt 4: Filter nach Projekt (Top 5 nach Häufigkeit, durchgängig alphabetische Sortierung)
* Ist-Zustand:
  updateProjectChipsUI() in lib/boardPanel.js sortierte alle Projekte alphabetisch und renderte ausnahmslos jeden Chip nebeneinander.
* Lösung:
  - Top 5 Projekte werden anhand der höchsten Session-Anzahl ermittelt.
  - Im eingeklappten Zustand: Diese Top 5 (plus ein evtl. aktives Projekt außerhalb der Top 5) werden **durchgängig alphabetisch sortiert** angezeigt.
  - Wenn mehr als 5 Projekte existieren:
    - Button "+X mehr ▾" anzeigen.
    - Klick klappt alle Projekte auf (Button wird zu "weniger ▴").
    - Im ausgeklappten Zustand: **Alle Projekte werden vollständig alphabetisch A–Z sortiert** (die Top 5 stehen dann nicht mehr isoliert vorne).

### Punkt 5: Max. 20 Sessions pro Spalte laden (Sofort-Nachladen aller restlichen)
* Ist-Zustand:
  render() in lib/boardPanel.js iterierte für jede Spalte (waiting, busy, bookmarked, idle, done) über ausnahmslos alle Sessions und erzeugte sofort DOM-Knoten. In Spalten mit vielen Sessions (insbesondere "Erledigt") führte dies zu spürbarem DOM-Overhead.
* Lösung:
  - Anzeigelimit pro Spalte: initial 20 Sessions.
  - In render():
    - Pro Spalte werden initial nur die ersten 20 Sessions gerendert.
    - Sind mehr Sessions vorhanden:
      - Am Spaltenende ein Nachlade-Button: "Alle restlichen X Sessions laden".
      - Klick schaltet die Spalte auf unbegrenzt (expandedColumns) und lädt **sofort alle restlichen Sessions** nach.
    - Spalten-Header:
      - Zeigt stets die Gesamtanzahl der Spalte an.
  - Suche & Filter:
    - Volltextsuche und Provider-/Projekt-Filter filtern weiterhin über die gesamte Session-Menge im Speicher.

---

## 3. Betroffene Dateien & Änderungen

| Datei | Art | Vorgesehene Änderungen |
|---|---|---|
| session-dashboard/lib/statusBar.js | MODIFY | applyThresholdBackground: Bei Werten < warnThresh (80%) item.color = new vscode.ThemeColor('charts.green') zuweisen. |
| session-dashboard/lib/format.js | MODIFY | Neue Funktion formatLimitReset(resetsAt, now) einführen; describe() darauf anpassen. |
| session-dashboard/lib/boardPanel.js | MODIFY | Lade-Overlay (#dashboard-loader) mit CSS & Ein-/Ausblendlogik; Projekt-Filter Ranking (Top 5 + Ausklappen); Spalten-Pagination (max. 20 initial + Nachlade-Button). |
| session-dashboard/package.json | MODIFY | Versionserhöhung auf 0.28.0. |
| TODO.md | MODIFY | Aufgaben als erledigt markieren und Plan referenzieren (nach Freigabe). |

---

## 4. Verifikationsplan

1. Syntax- & Linter-Prüfung:
   npm run check
2. Paketierung:
   npm run package
3. Funktionale & Visuelle Prüfung:
   - Status Bar Quota: Werte < 80% leuchten grün (Text/Icon).
   - Dashboard: Beim Start ist der Lade-Spinner sichtbar und blendet nach Eintreffen der Sessions weich aus.
   - Limit-Kacheln: Zeigt "Limit bis 14:30 Uhr" bei <= 24h und z. B. "Limit bis Do. 14:30 Uhr" bei > 24h.
   - Projekt-Filter: Zeigt Top 5 Projekte + "+X mehr ▾" / "weniger ▴".
   - Spalten-Pagination: Spalten mit > 20 Sessions zeigen 20 Karten und unten den Button "+ 20 weitere laden".
