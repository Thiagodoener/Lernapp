# Lernapp PWA

Kostenloser, offline-first Personal Mode für iPhone/iPad und moderne Browser.

## Enthalten

- lokale IndexedDB-Datenbank
- installierbare PWA
- Offline App Shell via Service Worker
- Module / Bibliothek
- PDF-, TXT- und Markdown-Import
- PDF-Textextraktion über PDF.js 4.10.38 (legacy-Build) aus `vendor/`
- quellenbezogene Zusammenfassungen / Highlights
- automatische Lernziele
- automatische und manuelle Karteikarten
- lokale Reviews mit echtem FSRS 6 (ts-fsrs 5.4.1)
- Tesseract.js 7 OCR für Scan-PDF-Seiten
- konservative Evidence-/Mastery-Berechnung in vier Wissensdimensionen
- Stabilität je Lernziel aus den FSRS-Intervallen
- Knowledge Gaps
- Tagesplan
- lokale Prüfungssimulation mit 30-Minuten-Timer
- SpeechRecognition für mündliche Antworten, falls Safari es bereitstellt
- Texteingabe als garantierter Fallback
- Fortschrittsansicht
- Lernstreak
- Multiple-Choice-Quiz aus den vorhandenen Karteikarten
- JSON Backup / Restore
- optionaler Abgleich zwischen Geräten über den eigenen Cloud-Proxy

## Wichtige Grenzen

- Die lokale Antwortbewertung ist konservativer Token-Overlap und keine
  semantische KI.
- SpeechRecognition ist eine Browserfunktion. Wenn sie auf einem Gerät oder
  Browser nicht verfügbar ist, bleibt die Texteingabe vollständig nutzbar.
- PDF.js samt Worker und Standardschriften sowie ts-fsrs liegen in `vendor/`
  und funktionieren ohne Netz. Nur Tesseract.js wird bei der ersten Nutzung
  über eine fest versionierte HTTPS-Quelle geladen und danach gecacht; seine
  Sprachdaten würden den Umfang des Repositorys sprengen.

## Lokal testen

Ein Service Worker funktioniert nur über HTTP(S), nicht zuverlässig über `file://`.

```bash
python3 -m http.server 8080
```

Dann `http://localhost:8080` öffnen.

## iPhone / iPad

Nach HTTPS-Deployment:

1. URL in Safari öffnen
2. Teilen
3. `Zum Home-Bildschirm`
4. `Hinzufügen`
5. Lernapp über das neue Home-Screen-Symbol öffnen

Die PWA benötigt kein Apple-Developer-Abo und keine 7-Tage-Neusignierung.
