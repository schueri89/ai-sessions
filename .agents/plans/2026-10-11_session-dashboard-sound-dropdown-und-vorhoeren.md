# Plan: Sound-Auswahl Dropdown & Vorhören

- **Datum:** 11.10.2026
- **Status:** In Umsetzung
- **Version:** v0.39.0

## Ziel
In den VS Code Einstellungen (`sessionDashboard.sound.*`) soll die Sound-Auswahl nicht mehr über fehleranfälligen Freitext erfolgen, sondern über ein strukturiertes Dropdown-Menü (`enum`). Zusätzlich soll das Vorhören der Sounds direkt aus den Einstellungen per 1-Klick (`markdownDescription` mit Command-Link) sowie über einen interaktiven Sound-Katalog (QuickPick-Player mit Sofort-Wiedergabe und Zuweisung) ermöglicht werden.

## Hintergrund & Analyse
1. Bisher waren die 4 Sound-Eigenschaften (`taskCompleted.sound`, `idleReminder.sound`, `needsInput.sound`, `limitAvailable.sound`) als reiner `type: "string"` definiert. Benutzer mussten Soundnamen wie `tada`, `ding`, `chimes` erraten oder aus der Beschreibung abtippen.
2. In `lib/soundNotifier.js` verwies `ringin` auf `C:\Windows\Media\ringin.wav`, was auf modernen Windows-Systemen nicht existiert (heißt `Windows Ringin.wav`) und zu einem Fallback-Piepton führte.
3. VS Code erlaubt keine Audio-Buttons im nativen Settings-UI, unterstützt jedoch Markdown-Links mit `command:`-URIs in `markdownDescription`. Dadurch lässt sich ein Vorhör-Link direkt unter dem Dropdown platzieren.
4. Plattformunterschiede zwischen Windows und macOS/Linux werden über ein wechselseitiges Sound-Mapping in `lib/soundNotifier.js` aufgelöst, sodass jedes Dropdown-Item auf allen Plattformen funktioniert.

## Umsetzungsschritte
1. **`lib/soundNotifier.js`**:
   - Korrektur des Pfads für `Windows Ringin.wav`.
   - Unterstützung für `none` (stumm).
   - Cross-Platform-Mapping für alle kuratierten Sounds (`tada`, `ding`, `chimes`, `notify`, `chord`, `ringin`, `Windows Notify`, `Windows Background`, `Hero`, `Glass`, `Ping`, `Pop`, `none`).
   - Bereitstellung einer Liste aller auswählbaren Sounds mit Metadaten.
   - Direkte Wiedergabe einzelner Soundnamen in `previewSound(soundOrEvent)`.
2. **`package.json`**:
   - `enum` und `enumDescriptions` für alle 4 Sound-Settings hinterlegen.
   - `markdownDescription` mit klickbarem Vorhör-Link einfügen (`[▶ Sound jetzt vorhören](command:sessionDashboard.previewSound?...)`).
   - Version auf `0.39.0` anheben.
3. **`extension.js`**:
   - `sessionDashboard.previewSound` aufwerten:
     - Bei Übergabe eines Event-Parameters: Direktes Abspielen des aktuell konfigurierten Sounds mit Bestätigungsmeldung.
     - Ohne Parameter: Interaktiver QuickPick-Katalog aller Sounds mit sofortigem Vorhören und Zuweisungs-Option.
4. **Validierung & Installation**:
   - `npm run check`
   - `npm run package` (vsix/ai-sessions-0.39.0.vsix)
   - `code --install-extension vsix/ai-sessions-0.39.0.vsix`
   - Eintrag in `TODO.md` aktualisieren.
