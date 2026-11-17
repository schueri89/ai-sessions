# Implementierungsplan: Büro-Ansicht Erweiterungen (Zeitzone, Fenster, Nachtmodus & Geist, Langeweile, JIRA, Bar)
Datum: 2026-11-17
Task-Ziel: Alle sechs offenen Büro-Verbesserungen (dynamische Tageszeit per Zeitzone, drei Fenster nach Variante A, Nacht-Abdunklung mit Büro-Geist ab Sonnenuntergang, PlayStation/Diskussion bei Langeweile, JIRA-Nummer am Schreibtisch und Entfernung der blinkenden Bar-Leuchte) in der Büro-Ansicht umsetzen.

Dieses Dokument beschreibt den abgestimmten Umsetzungsplan für die Erweiterungen der virtuellen Büro-Ansicht (`lib/officeView.js`, `lib/officePanel.js`, `lib/boardPanel.js`) samt Tests und Versionierung.

## Hintergrund & Zielstellung
Die bestehende Büro-Ansicht nutzt feste Uhrzeiten (`6`, `18`, `21` Uhr) für den Himmel im einzigen Fenster, kennt noch keine echte Nacht-Atmosphäre ab Sonnenuntergang, lässt fertige Entwickler nach dem Kaffee/Bier nur am Platz sitzen/dösen, zeigt zugewiesene JIRA-Nummern am Schreibtisch nicht an und besitzt eine störend blinkende LED unterhalb der Bar.

## Vorgeschlagene Änderungen

### [Büro-Rendering & Simulation]

#### [MODIFY] [officeView.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/officeView.js)
- **Dynamische Tageszeit aus Zeitzone:** Über `Intl.DateTimeFormat().resolvedOptions().timeZone` und eine kompakte Zeitzonen-Koordinaten-Tabelle (`lat`, `lon` mit UTC-Offset-Fallback) werden per lokalem Sonnenstand-Algorithmus (Meeus/NOAA) `sunrise` und `sunset` für den aktuellen Tag berechnet (`dawn`, `day`, `evening`, `night`).
- **Drei Fenster (Variante A):** Bestehendes Fenster links außen (`x = 32`), ein weiteres links vom Schild (`x ≈ 174`) und eines rechts vom Schild (`x ≈ 575`, relativ zur Breite `w`), mit gemeinsamer Himmelskoordination über `getCelestialWindowIndex()` (genau eine Sonne bzw. ein Mond statt dreifach) sowie gelegentlicher Sternschnuppe bei Nacht.
- **Tageszeit-Simulation per Fenster-Klick:** Klick auf ein beliebiges Fenster schaltet `simulatedTod` zyklisch durch (`null` / Echtzeit → `dawn` → `day` → `evening` → `night` → `null`) inkl. Fenster-Tooltip (aktuelle Phase, Sonnenauf-/-untergang) und Reset-Chip in der Toolbar bei aktiver Simulation.
- **Nachtmodus & Büro-Geist ab Sonnenuntergang:**
  - Abdunklung des Büros ab `sunset` über ein nachtblaues Overlay samt Lichtinseln für Schreibtischlampen (`busy`), Monitore (inkl. Standby-LED / Bildschirmschoner bei `idle`), Kaffeemaschine, Bar/Kühlschrank, Mondlicht-Streifen unter den Fenstern und Scheinwerfer am Staubsauger-Roboter.
  - Pixel-Geist (`ghost`), der zwischen `sunset` und `sunrise` durchs Büro schwebt, per Tooltip inspizierbar ist und gelegentlich Schabernack treibt (Lampen flackern lassen, Akten/Schlafende erschrecken, Kühlschranktür kurz öffnen, Kaffeemaschine dampfen lassen).
  - Sternschnuppe gelegentlich in den Nachtfenstern.
- **Langeweile bei „Fertig“ (PlayStation & Diskussion):**
  - Lounge rechts leicht verbreitern (`loungeWidth = 156`, Mindesthöhe `390`) für eine PlayStation-Ecke (TV mit animiertem Pixel-Spiel, Konsole, 2 Sitzplätze) unterhalb der Bar sowie einen Diskussions-Stehtisch darunter.
  - Entwickler, die längere Zeit `idle` (nicht rate-limited) und nach ihrer Getränke-Pause am Platz sitzen, entscheiden per Zufall (`LEISURE_DEPART_CHANCE = 0.35`, Wartezeit `45–180 Sek.`, globaler Gang-Cooldown `24 Sek.`, längere Verweildauer `60–150 Sek.` an der PS5 bzw. `45–110 Sek.` am Tisch, Partner-Nachrücken mit `0.65`), ob sie spielen oder diskutieren – sodass die Lounge zwischenzeitlich ruhig leer bleibt und bei neuer Arbeit (`busy`/`waiting`) sofort zurückgesprintet wird.
- **JIRA-Nummer am Schreibtisch & Inspector:**
  - Ist `session.ticket` gesetzt, wird unterhalb des Projekt-Badges (`y + 75 .. y + 87`) ein kompaktes JIRA-Ticket-Badge gerendert und im Tooltip sowie Inspector angezeigt (inkl. Aktions-Button `🎫 <ticket>` / `+ JIRA`, wenn `jiraEnabled` aktiv ist).
- **Blinkende Bar-Leuchte entfernen:** Die blinkende `4x4`-LED neben dem `BAR`-Schriftzug entfällt ersatzlos.

### [Panel-Anbindung für JIRA-Aktionen]

#### [MODIFY] [officePanel.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/officePanel.js)
- `jiraEnabled` in `update()` übergeben und Webview-Nachrichten `openJira` / `assignTicket` an die bestehenden Extension-Commands weiterleiten.

#### [MODIFY] [boardPanel.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/lib/boardPanel.js)
- `jiraEnabled: cachedJiraEnabled` beim Aufruf von `window.__aiOffice.update(...)` mitgeben.

### [Tests, Version & Dokumentation]

#### [MODIFY] [check-office-view.js](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/test/check-office-view.js)
- Tests ergänzen für: dynamische Sonnenauf-/-untergangs-Berechnung nach Zeitzone, 3 Fenster, Nacht-Geist nach Sonnenuntergang, PlayStation-/Diskussions-Verhalten bei Langeweile und JIRA-Anzeige am Schreibtisch.

#### [MODIFY] [package.json](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/package.json), [CHANGELOG.md](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/CHANGELOG.md), [TODO.md](file:///c:/lucee/tomcat/webapps/ROOT/ai-sessions/TODO.md)
- Version auf `0.103.0` erhöhen, Changelog-Eintrag ergänzen und die 6 erledigten Büro-Punkte in `TODO.md` nach `Erledigt` verschieben.

## Verifikationsplan

### Automatisierte Tests
```powershell
npm run check
node test/check-office-view.js
npm run package
```

### Manuelle Prüfung
- Büro-Tab und Popout öffnen: 3 Fenster prüfen (1 links außen, 1 links vom Schild, 1 rechts vom Schild), Bar ohne blinkende Leuchte prüfen, JIRA-Ticket am Schreibtisch und im Inspector prüfen, sowie ab Sonnenuntergang (aktuell nach 19:30 Uhr) Abdunklung, Lichtinseln und den spukenden Büro-Geist verifizieren.
