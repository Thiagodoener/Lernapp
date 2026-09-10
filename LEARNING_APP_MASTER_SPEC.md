# LEARNING_APP_MASTER_SPEC

## Version 3.13 — 10.09.2026

### Leitprinzip

Die Lernapp bleibt offline-first. Deterministische Kernfunktionen dürfen nicht von einer kostenpflichtigen KI-API abhängen. KI wird für semantische Aufgaben eingesetzt, wenn sie einen echten Qualitätsvorteil bietet.

## Materiallöschung

**Status: FIX**

Ein importiertes Lernmaterial kann vollständig gelöscht werden. Beim Löschen eines `Document` werden die ausschließlich daraus abgeleiteten Lernziele, Karteikarten, Reviews, Evidenzen, Mastery-Zustände und Wissenslücken bereinigt. Andere Materialien und deren Fortschritt bleiben erhalten.

## KI-Betriebsmodi

**Status: IMPLEMENTIERT**

### LOCAL
- keine laufenden KI-API-Kosten
- lokale Heuristiken/Fallbacks
- Datenhaltung, FSRS, Planung, Fortschritt und Statuslogik bleiben lokal

### AUTO
- Standardmodus
- nutzt lokale Verarbeitung als Vorfilter/Fallback
- kann semantisch anspruchsvolle Aufgaben an CLOUD geben, sobald ein sicherer Cloud-Endpunkt konfiguriert ist
- Ziel: hohe Qualität bei niedrigen laufenden Kosten

### CLOUD
- vorgesehen für höchste semantische Qualität
- benötigt einen sicheren Backend-/Proxy-Endpunkt
- API-Schlüssel dürfen niemals im öffentlich ausgelieferten Browser-Code gespeichert werden

## AIService

**Status: IMPLEMENTIERT**

Zentrale Schnittstellen:
- `summarize`
- `tutor`
- `generateLearningGoals`
- `generateFlashcards`
- `evaluateFreeAnswer`

Cloud- und Local-Verarbeitung bleiben vollständig hinter dieser Schnittstelle gekapselt.

## Zusammenfassungen über AIService

**Status: IMPLEMENTIERT**

Dokument-Zusammenfassungen laufen über `AIService.summarize()` und unterstützen Kurz, Standard und Ausführlich. Ergebnisse werden lokal am Dokument mit Provider, Confidence, Länge, Erstellzeitpunkt und AI-Modus gespeichert.

## Lernziel- und Karteikartengenerierung über AIService

**Status: IMPLEMENTIERT**

Der Materialimport läuft über die AI-Import-Pipeline:

1. PDF/TXT/Markdown wird lokal extrahiert; Scan-PDF-Seiten nutzen OCR-Fallback.
2. Lernziele werden über `AIService.generateLearningGoals()` erzeugt.
3. Quellen-, Provider-, Modus- und Confidence-Provenienz bleibt erhalten.
4. Karteikarten werden über `AIService.generateFlashcards()` erzeugt.
5. Jede Karte erhält einen echten FSRS-Ausgangszustand.
6. Mastery startet konservativ bei `NOT_ASSESSED`.
7. Nach Import wird der Tagesplan invalidiert und aus dem neuen Wissensstand neu aufgebaut.
8. Bei Fehlern werden bereits angelegte Importdaten wieder bereinigt.

## Freie Antwortbewertung über AIService

**Status: IMPLEMENTIERT FÜR SELBSTTESTS UND PRÜFUNGSSIMULATION**

Selbsttests und freie Antworten in der Prüfungssimulation laufen über dieselbe zentrale `AIService.evaluateFreeAnswer()`-Pipeline.

Bewertungslogik:
- `LOCAL`: vollständig lokale Baseline, kostenfrei.
- `CLOUD`: semantische Bewertung über den konfigurierten sicheren Cloud-Endpunkt.
- `AUTO`: lokale Vorbewertung/Fallback und optionale Cloud-Eskalation bei unsicheren Fällen, sobald CLOUD verfügbar ist.

Gemeinsame Evidence-Pipeline:
- Score
- Confidence
- Provider
- Evaluations-Policy
- Feedback
- Dimension (`RECALL`, `UNDERSTANDING`, `APPLICATION`, `TRANSFER`)
- `independentRecall=true`
- Quelle (`SELF_TEST` oder `EXAM_SIMULATION`)
- bei Prüfungen zusätzlich Exam-, Session- und Item-Referenz

Nach jeder bewerteten Antwort werden Mastery und Knowledge Gap deterministisch neu berechnet. Der Tagesplan wird invalidiert, damit neue Schwächen in die Planung zurückfließen.

## Prüfungssimulation

**Status: IMPLEMENTIERT ÜBER AIService**

Die Prüfungssimulation behält ihre 30-Minuten-Logik, priorisierten Lernziele und vier Wissensdimensionen. Unbeantwortete Fragen zählen als 0. Bewertete Antworten speichern Provider, Confidence, Policy und Feedback. Schwache Lernziele unter 60 % fließen in Mastery, Knowledge Gaps und Tagesplanung zurück.

## Tutor über AIService

**Status: IMPLEMENTIERT**

Jedes Lernziel erhält einen quellengebundenen Tutorbereich. Tutor-Antworten laufen ausschließlich über `AIService.tutor()`.

Kontextregel:
- Lernzielstatement wird immer mitgegeben.
- `sourceSnippet` und `sourcePage` werden mitgegeben.
- Wenn das Ursprungsdokument vorhanden ist, werden die Quellseite und höchstens die direkt benachbarten Seiten als Kontext ergänzt.
- Der Kontext wird begrenzt und mit Material-/Seitenangaben versehen.
- Die Tutor-Instruktion verlangt ausdrücklich, nur auf Basis dieses Quellenkontexts zu antworten und Wissenslücken transparent zu benennen.

LOCAL-Tutor:
- vollständig kostenfrei
- extraktiv und quellengebunden
- priorisiert Sätze aus dem Material anhand textlicher Überschneidung mit der Nutzerfrage
- ergänzt kein externes Wissen
- Provider-Policy `LOCAL_SOURCE_EXTRACTIVE`
- konservative Confidence 0.30

AUTO/CLOUD:
- nutzen die zentrale Provider-Auswahl des `AIService`
- sobald ein sicherer Cloud-Endpunkt verfügbar ist, kann AUTO für Tutorfragen CLOUD verwenden
- CLOUD erhält denselben strukturierten Quellenkontext und die letzten Gesprächsnachrichten

Tutor-Verlauf:
- wird lokal im bestehenden `settings`-Store pro Lernziel gespeichert
- bleibt damit im JSON-Backup enthalten, ohne eine Datenbankmigration auszulösen
- letzte Nachrichten werden als Gesprächskontext an den Provider übergeben
- Nutzer kann den Tutor-Verlauf pro Lernziel löschen

Die UI zeigt Provider, Confidence und Policy an. Die Tutorhistorie verändert Mastery nicht automatisch; Wissensstand darf weiterhin nur aus Assessment-Evidence abgeleitet werden.

## Architekturregel

Sensible API-Schlüssel dürfen niemals fest im Browser-Code einer öffentlich ausgelieferten PWA hinterlegt werden. Für echte Cloud-KI ist ein sicherer Proxy bzw. Backend-Endpunkt erforderlich.

Tutor-Antworten, Zusammenfassungen und generierte Inhalte dürfen den deterministischen Mastery-Zustand nicht direkt setzen. Mastery wird nur aus Evidence abgeleitet.

## Kostenprinzip

Datenhaltung, Coverage, Lernplanung, Fortschritt, FSRS, Statistiken und Statusübergänge bleiben ohne kostenpflichtige Cloud-KI nutzbar. Im AUTO-Modus sollen Cloud-Kosten nur bei semantisch anspruchsvollen Aufgaben entstehen.

## Nächste Implementierungsschritte

1. Sichere Cloud-Anbindung über Proxy/Backend.
2. Kosten-/Nutzungslimit pro Monat und transparente Anzeige in der App.
3. AI-Nutzungsprotokoll und Qualitäts-/Kostenmetriken ergänzen.
4. Import-, Zusammenfassungs-, Selbsttest-, Prüfungs- und Tutor-Pipeline auf echtem iPhone/iPad testen.
5. Danach optional Tutor-Funktion „Prüf mich“ an die bestehende Assessment-Pipeline anbinden.

## Changelog 3.13

- quellengebundenen Tutor pro Lernziel ergänzt
- Tutor vollständig auf `AIService.tutor()` gelegt
- Source-Context aus Lernziel, Quellsnippet und benachbarten Dokumentseiten aufgebaut
- LOCAL-Tutor auf extraktive quellenbasierte Antworten verbessert
- Tutor-Historie lokal im `settings`-Store gespeichert und damit Backup-kompatibel gehalten
- Provider, Confidence und Policy in der Tutor-UI sichtbar gemacht
- Verlauf-löschen-Funktion ergänzt
- Mastery bleibt strikt von Tutorantworten entkoppelt
- neue Datei `tutor-ai.js` ergänzt
- PWA-Cache auf v9 angehoben
