# Deploys: Pipeline-Ansicht & Deploy starten (v0.86.0)

Vorbild: Jenkins **Build Pipeline View** (z. B. `/view/e-hoi.rating/`): oben der Aufbau als Kette mit
Verzweigungen, darunter je Lauf eine Zeile farbiger Kacheln.

## Daten (`lib/jenkins.js`)

- `layoutPipeline(jobUrls, byUrl)`: Baum ab dem/den Job(s) ohne Upstream innerhalb der Pipeline. Erstes
  Kind setzt die Zeile fort, weitere Kinder öffnen eine neue Zeile (wie `killapps_stage` unter `deploy_stage`).
- `fetchPipelineRuns()`: je Job ein Request `job/X/api/json?tree=inQueue,builds[...]{0,N}`
  (Start-Job N = 5 Läufe, übrige Jobs N = 100, weil geteilte Jobs wie `killapps_*` auch für andere Pipelines laufen).
- `matchPipelineRuns()`: Läufe = letzte Builds des Start-Jobs; nachgelagerte Builds über
  `UpstreamCause` (`upstreamProject` = `fullName` des Vorgängers, `upstreamBuild`) zugeordnet.
  Zustände ohne eigenen Build: `pending` (Vorgänger läuft), `queued` (Job in Queue, nur neuester Lauf),
  `skipped` (Vorgänger nicht SUCCESS/UNSTABLE), `unknown` (Build-Historie reicht nicht so weit zurück),
  `manual` (Vorgänger erfolgreich, Schritt nie gelaufen → manueller Trigger).
- Requests mit Token nur an URLs derselben Origin wie `baseUrl` (`itemApiUrl`).

## Auslösen

- **Pipeline starten**: Parameter-Definitionen des Start-Jobs lesen, Bestätigungs-Modal mit Werten,
  optional „Parameter anpassen…“ (QuickPick für Boolean/Choice, InputBox sonst, Passwort leer = Standardwert),
  dann `POST job/X/buildWithParameters` bzw. `job/X/build`.
- **Manueller Schritt**: `POST {viewUrl}triggerManualBuild` mit
  `Content-Type: application/x-stapler-method-invocation`, Body `[upstreamBuildNumber, triggerProjectName, upstreamProjectName]`
  (= `@JavaScriptMethod BuildPipelineView#triggerManualBuild`, derselbe Weg wie der ▷-Button in Jenkins).
  Nur für Pipelines aus Jenkins-Views; Ketten ohne View zeigen „Nicht ausgelöst“ ohne Button.
- CSRF: Stapler prüft bei `@JavaScriptMethod` den Header `Crumb` unabhängig vom API-Token, daher vor jedem POST
  `crumbIssuer/api/json` holen und Session-Cookie mitsenden (Crumb ist an die Session gebunden).
- Nach dem Auslösen: Watcher-Poll vorziehen (`JenkinsWatcher#nudge`), Webview klappt die Pipeline auf und lädt die Läufe.

## Webview

- Aufgeklappte Pipeline = eine Detailzeile mit CSS-Grid (Spalte 1 Lauf-Label mit Parametern, je Baumtiefe eine Spalte).
- Kacheln: Status-Farbe über Theme-Variablen (`--vscode-testing-iconPassed` …), Laufzeit live, Fortschritt aus `estimatedDuration`.
- Polling alle 5 s, solange ein Schritt läuft oder in der Queue steht; zusätzlich bei jedem Jobliste-Refresh.
- Suche klappt nur noch bei ≤ 3 Treffern automatisch auf (jede Pipeline kostet mehrere Requests).

## Offen / nicht verifiziert

- `triggerManualBuild` gegen den Live-Jenkins (2.580.1) noch nicht getestet (kein Token in der Agent-Shell).
