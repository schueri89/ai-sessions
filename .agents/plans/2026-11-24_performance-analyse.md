# Performance-Analyse AI Sessions

**Stand:** 24.11.2026 · v0.108.0 (`d8c393c`)
**Status:** Prio 2 + 4 umgesetzt in v0.108.1, Prio 1 + 3 + 5 + 7 umgesetzt in v0.109.2, übrige Punkte in `TODO.md`
**Verlauf:** erste Analyse 11.11., Neufassung 19.11., Aktualisierung 24.11.

---

## Kurzfazit

- Die Extension liest **alle 5 Sekunden** sämtliche Sessions aller Anbieter komplett neu ein. Bei jeder Dateiänderung
  passiert das zusätzlich, nach 300 ms Wartezeit.
- Das läuft **in jedem VS-Code-Fenster separat** und fast immer **synchron**. Solange gelesen wird, steht der
  Extension-Host still, und damit auch Copilot Chat und alle anderen Erweiterungen.
- Die größten Bremsen sind **fehlende oder kaputte Caches** und **synchrone PowerShell-Aufrufe**, nicht das Intervall
  selbst. Wenn die Caches greifen, kann der 5-s-Takt bleiben.
- Mit wenigen, gezielten Änderungen (Stufe A) sinkt die Last je Durchlauf hier auf einen Bruchteil, und das erste Einlesen
  beim Start wird deutlich kürzer.

---

## Die wichtigsten Maßnahmen auf einen Blick

| Prio | Maßnahme | Aufwand | Wirkung |
|---|---|---|---|
| 1 | ✅ *v0.109.2* Claude-Historie: Cache-Fehler beheben (B1) | 1 Zeile | gemessen (Zuhause, 489 Transkripte): 2.146 ms → 16,6 ms |
| 2 | ✅ *v0.108.1* Copilot: leere Sessions mitcachen (B4) | wenige Zeilen | gemessen: Durchlauf 75–120 ms → ~10 ms |
| 3 | ✅ *v0.109.2* Audits: PowerShell-Aufruf asynchron bzw. nur beim Start (B2) | klein | gemessen: Start 16,9 ms, Reconcile 0,1 ms (keine ~1,6-s-Hänger) |
| 4 | ✅ *v0.108.1* Copilot-CLI: beim Start ab dem letzten Prompt lesen (N1) | mittel | gemessen: CLI-Kaltstart 2,5 s → 0,36 s (177 MB) |
| 5 | ✅ *v0.109.2* Antigravity/Codex/Cline + Antigravity-Quota mit Datei-Cache (B4, B5) | mittel | gemessen: Antigravity 203,9 ms → 56,2 ms, Quota 46,5 ms → 4,4 ms |
| 6 | Büro-Ansicht auf 12–15 Bilder/s begrenzen (N2) | klein | Popout auf dem Zweitmonitor rendert nicht mehr dauerhaft mit 60 fps |
| 7 | ✅ *v0.109.2* `curl.exe`-Fallback asynchron (B6) | klein | keine bis zu 5-s-Hänger, wenn die Quota-API nicht erreichbar ist |

---

## 1. Was läuft wann?

| Was | Wie oft | Was passiert dabei |
|---|---|---|
| Haupt-Aktualisierung | **alle 5 s** + bei jeder Dateiänderung | alle Anbieter komplett einlesen, Quota (aus Cache), Änderungsprüfung |
| Quota (Limits) | alle 45 s (10 s, wenn kein Anbieter erreichbar) | HTTP an Claude/Copilot/Codex, Antigravity lokal |
| Dashboard/Büro neu zeichnen | mind. 1× pro Minute (wegen „seit X Min.“), bei aktiven Sessions bis alle 5 s | komplette Session-Liste an Board und Büro-Popout |
| Büro-Ansicht | **~60 Bilder/s**, solange sichtbar | kompletter Canvas wird je Bild neu gezeichnet |
| Jenkins im Hintergrund | 60 s; 15 s, solange irgendein Build läuft/wartet | 2 Abfragen (Jobs + Warteschlange) |
| Deploys: aufgeklappte, laufende Pipeline | alle 5 s | 1 Abfrage je Job, nachgelagerte Jobs mit bis zu 100 Builds |
| Releases im Hintergrund | alle 5 min (wenn aktiviert) | JIRA-Abfragen je Projekt |
| Meine Vorgänge, Logs, Audits, Historie, Analyse | nur beim Öffnen/Aktualisieren | – |
| Update-Prüfung | stündlich, Ergebnis für alle Fenster geteilt | 1 GitHub-Abfrage |

---

## 2. Befunde

### 🔴 B1 – Claude-Historie: Cache wird nach jedem Durchlauf geleert
Der Cache-Schlüssel ist `Datei:Modus`, beim Aufräumen wird aber nur gegen den Dateinamen geprüft. Dadurch fliegen
**alle** Einträge nach jedem Durchlauf raus. Alle 5 s werden von **jedem jemals angelegten** Claude-Transkript 64 KB Anfang
und 256 KB Ende gelesen. Bei 300 Transkripten sind das rund 100 MB pro Durchlauf.
→ [history.js](../../lib/history.js#L138-L154) · Korrektur: `seen.add(cacheKey)`

### 🔴 B2 – Audits: synchroner PowerShell-Aufruf (~1,6 s)
Beim Start (in jedem Fenster) und bei jedem Laden der Audits (Tab öffnen, Quittieren, Daily umschalten …) sucht
`Get-CimInstance` per `execSync` nach laufenden Audit-Prozessen. Das friert den Extension-Host jedes Mal ~1,6 s ein.
→ [auditManager.js](../../lib/auditManager.js#L369-L431)

### 🟠 B4 – Fehlende Datei-Caches bei den Anbietern
| Anbieter | Problem |
|---|---|
| **Copilot** | Leere/ungültige Chat-Dateien werden nie gecacht und alle 5 s neu geöffnet. Hier 103 Dateien mit nur 0,2 MB, aber **60–115 ms** je Durchlauf. Teuer ist das Öffnen der Dateien, nicht die Datenmenge. → [copilot.js](../../lib/providers/copilot.js#L226) |
| **Antigravity** | Liest von **jeder** Konversation (ohne Altersgrenze) die letzten 64 KB, ohne Cache. |
| **Codex** | Liest von jedem Thread die letzten 64 KB, ohne Cache. Fehlt der gespeicherte Pfad, wird je Thread der komplette Ordnerbaum durchsucht, jedes Mal. |
| **Cline** | Liest `messages.json` jeder Session **komplett**, ohne Cache. |
| Claude (laufende Sessions) | ✅ liest nur neu hinzugekommene Bytes – vorbildlich |

### 🟠 B5 – Antigravity-Quota liest komplette Transkripte
Alle 45 s werden die **vollständigen** Transkripte aller Konversationen der letzten 7 Tage gelesen, ohne Cache.
→ [quota.js](../../lib/quota.js#L404-L432)
*(Die frühere PowerShell-Suche nach dem Antigravity-Prozess ist seit v0.93.1 behoben.)*

### 🟠 N1 – Copilot-CLI-Sessions: Start liest alles komplett
Im laufenden Betrieb werden die `events.jsonl` vorbildlich nur ab der letzten Position weitergelesen. Beim **ersten
Durchlauf** nach dem Start liest die Extension aber jede Datei vollständig (hier inzwischen **176 MB**, +80 MB in 5 Tagen).
Das blockiert den Start in jedem Fenster für 2,6–4,2 s und wird mit der Zeit schlimmer.
Zusätzlich wird `agent-host.db` in jedem Durchlauf neu geöffnet (~5 ms, unnötig ohne Änderung).
→ [copilot.js](../../lib/providers/copilot.js#L427), [L122](../../lib/providers/copilot.js#L122)

### 🟠 N2 – Büro-Ansicht zeichnet mit ~60 Bildern/s
Die Animation pausiert korrekt, wenn die Ansicht verdeckt ist. Ein **Popout auf dem Zweitmonitor ist aber dauerhaft
sichtbar** und zeichnet ununterbrochen. Auf 120/144-Hz-Monitoren sind es entsprechend mehr Bilder. Für Pixel-Figuren,
Wolken & Co. reichen 12–15 Bilder/s. Die Last fällt im Renderer an, nicht im Extension-Host.
→ [officeView.js](../../lib/officeView.js#L2862-L2887)

### 🟡 B6 – Synchrone `curl.exe`-Fallbacks
Schlägt der normale Quota-Abruf fehl (offline, Proxy), startet `curl.exe` synchron mit 5 s Timeout. Das sind bis zu 5 s
Stillstand, im Offline-Fall alle 10 s.
→ [quota.js](../../lib/quota.js#L122), [L628](../../lib/quota.js#L628)

### 🟡 B7 – Jede Dateiänderung liest alle Anbieter neu
Eine Änderung z. B. in der Antigravity-Datenbank löst den kompletten Durchlauf inkl. Copilot und Claude-Historie aus.
Während aktiver Sessions passiert das deutlich öfter als alle 5 s. Außerdem werden auch deaktivierte Anbieter beobachtet,
und später entstehende Dateien werden nie beobachtet.

### 🟡 B8 – Jedes Fenster macht alles selbst
Sessions, Quota, Jenkins und JIRA laufen in jedem Fenster eigenständig. Nur Sounds, Toasts und die Update-Prüfung sind
fensterübergreifend abgestimmt. Bei drei Fenstern fällt alles dreimal an, auch der Copilot-Start.

### 🟡 N3 – Deploys: Pipeline-Läufe alle 5 s
Solange eine aufgeklappte Pipeline läuft, wird alle 5 s je Job abgefragt, bei nachgelagerten Jobs mit bis zu 100 Builds.
Das betrifft nur die Zeit, in der man zuschaut, belastet aber auch den Jenkins-Server.
→ [jenkins.js](../../lib/jenkins.js#L523-L535)

### ✅ Erledigt bzw. bewusst so
- **Logs** werden nicht mehr bei jeder Dashboard-Aktualisierung mitgeladen (`schtasks` + Log-Dateien), sondern nur noch
  auf Anforderung. *Nebeneffekt:* Das Fehler-Badge am Logs-Tab erscheint erst nach dem ersten Öffnen des Tabs.
- **Antigravity-Prozesssuche** per PowerShell ersetzt durch Lesen der Daemon-Datei.
- **Jenkins 15-s-Takt bei beliebigen laufenden Builds** (v0.108.0): bewusst so gewollt, weil nur vorübergehend. Kein
  Handlungsbedarf.
- Nach dem Start einer Pipeline wird diese nicht mehr automatisch aufgeklappt und geladen (Entlastung).

---

## 3. Messwerte (dieser Rechner, nur Copilot-Daten vorhanden)

| Messung | 11.11. | 19.11. | 24.11. |
|---|---|---|---|
| Copilot-Chat-Dateien | 310 / 220 MB | 325 / 234 MB | – |
| Copilot-CLI-Sessions | – | 34 / 95,6 MB | **43 / 175,9 MB** |
| Copilot erstes Einlesen | ~2,0 s | ~4,2 s | ~2,6 s¹ |
| Copilot je 5-s-Durchlauf | 80–100 ms | ~190 ms | 75–120 ms |
| davon leere, ungecachte Dateien | – | 90–115 ms | 60–85 ms (~70 %) |
| PowerShell `Get-CimInstance` (Audits) | ~1,6 s | unverändert | unverändert |

¹ Dateien lagen im Datei-Cache von Windows; nach einem Neustart eher höher.
Die Zeiten schwanken mit Systemlast und laufenden Chats. Claude, Antigravity, Codex und Cline sind hier nicht installiert;
deren Last ist aus dem Code abgeschätzt.

---

## 4. Empfehlungen

### Stufe A – Quick Wins ohne sichtbare Verhaltensänderung
1. **B1:** Cache-Schlüssel in `history.js` korrigieren.
2. **B4 Copilot:** Auch leere/ungültige Ergebnisse mit Änderungszeit + Größe cachen.
3. **B2:** `Get-CimInstance` nur einmal beim Start und **asynchron**. Danach reichen `audit-running.json` +
   `process.kill(pid, 0)`.
4. **N1:** Beim ersten Lesen einer `events.jsonl` nur Anfang (Start, Modell, Ordner) und Ende (letzter Prompt, Status,
   Tokens) lesen, danach wie bisher weiterlesen. `agent-host.db` nur bei Änderung neu abfragen.
5. **B4/B5:** Datei-Caches (Änderungszeit + Größe) für Antigravity, Codex (inkl. gefundenem Pfad), Cline und die
   Antigravity-Quota.
6. **B6:** `curl.exe` asynchron aufrufen.
7. **N2:** Büro-Animation auf 12–15 Bilder/s drosseln.

### Stufe B – Intervalle (Verhalten minimal anders, bitte abstimmen)
8. **Alte Sessions seltener prüfen:** Laufende Sessions weiter alle 5 s, abgeschlossene (Claude-Historie, ältere
   Copilot-Chats) nur alle 30–60 s oder bei einer Dateiänderung des Anbieters.
9. **Anpassbarer Takt:** 5 s, solange eine Session arbeitet/wartet oder Dashboard bzw. Büro sichtbar sind, sonst 15–30 s.
   Optional langsamer, wenn das Fenster nicht im Fokus ist.
10. **Dateiänderungen gezielt verarbeiten:** Nur den betroffenen Anbieter neu einlesen; nur aktive Anbieter beobachten.
11. **Quota offline:** Abstand zwischen den Versuchen von 10 s auf 60 s erhöhen.
12. **„seit X Min.“ im Dashboard selbst rechnen,** damit nicht jede Minute alles neu übertragen wird. Verdeckte Panels
    erst beim Sichtbarwerden aktualisieren.
13. **N3:** Pipeline-Läufe alle 10 s statt 5 s abfragen, bei nachgelagerten Jobs weniger alte Builds holen.

### Stufe C – Umbau (optional, größer)
14. **Nur ein Fenster fragt ab, die anderen lesen mit** (Lock-Datei, gemeinsames Ergebnis). Das ist der größte Hebel bei
    mehreren Fenstern.
15. **Dateizugriffe asynchron,** damit lange Scans den Extension-Host nicht blockieren.

---

## 5. Offene Fragen

- Stufe A komplett in einer Version, oder zuerst die zwei Kleinigkeiten (Prio 1 + 2) als Patch?
- Büro: Sind 12–15 Bilder/s okay, oder soll die Rate einstellbar sein?
- Takt im Ruhezustand: 15 s oder 30 s? Darf ein Fenster ohne Fokus langsamer abfragen? Sounds/Toasts kämen dann eventuell
  verzögert, wenn gerade kein VS-Code-Fenster im Fokus ist.
- Logs-Badge: Soll es wieder ohne Tab-Besuch aktuell sein (z. B. alle 5 min im Hintergrund, asynchron)?
- Nur ein Fenster fragt ab (Stufe C): Gewünscht? Wie viele Fenster sind typischerweise offen?
