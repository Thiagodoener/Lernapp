# LEARNING_APP_MASTER_SPEC

## Version 3.12 — 10.09.2026

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
- kann semantisch unsichere Fälle an CLOUD eskalieren, sobald ein sicherer Cloud-Endpunkt konfiguriert ist
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

### Prüfungssimulation

**Status: IMPLEMENTIERT ÜBER AIService**

Die bestehende Prüfungssimulation behält ihre 30-Minuten-Logik, priorisierten Lernziele und vier Wissensdimensionen. Die Antwortbewertung wurde jedoch auf die gemeinsame AIService-Pipeline umgestellt.

Regeln:
- unbeantwortete Fragen zählen weiterhin als 0
- jede beantwortete Frage speichert Provider, Confidence, Policy und Feedback am Exam-Item
- schwache Lernziele unter 60 % werden in `weakGoalIds` übernommen
- Prüfungsergebnis basiert auf allen Items, inklusive unbeantworteter Fragen
- Mastery-/Gap-Updates entstehen aus der gleichen Evidence-Logik wie bei Selbsttests
- bei Ablauf des Timers wird die Prüfung automatisch abgeschlossen
- Spracherkennung bleibt progressive enhancement; Texteingabe bleibt der sichere Fallback
- doppelte Evidenz durch den alten lokalen Prüfungs-Submit wird per Capture-Handler verhindert

## Architekturregel

Sensible API-Schlüssel dürfen niemals fest im Browser-Code einer öffentlich ausgelieferten PWA hinterlegt werden. Für echte Cloud-KI ist ein sicherer Proxy bzw. Backend-Endpunkt erforderlich.

## Kostenprinzip

Datenhaltung, Coverage, Lernplanung, Fortschritt, FSRS, Statistiken und Statusübergänge bleiben ohne kostenpflichtige Cloud-KI nutzbar. Im AUTO-Modus sollen Cloud-Kosten nur bei semantisch unsicheren Aufgaben entstehen.

## Nächste Implementierungsschritte

1. Tutor vollständig über `AIService.tutor()` anbinden.
2. Sichere Cloud-Anbindung über Proxy/Backend.
3. Kosten-/Nutzungslimit pro Monat und transparente Anzeige in der App.
4. Import-, Zusammenfassungs-, Selbsttest- und Prüfungs-Pipeline auf echtem iPhone/iPad testen.
5. Danach AI-Nutzungsprotokoll und Qualitäts-/Kostenmetriken ergänzen.

## Changelog 3.12

- gemeinsame freie Antwortpipeline für Selbsttests und Prüfungen eingeführt
- `free-answer-ai.js` um wiederverwendbares `evaluateAndPersist()` erweitert
- Prüfungssimulation auf `AIService.evaluateFreeAnswer()` umgestellt
- Exam-Items speichern Provider, Confidence, Policy und Feedback
- Prüfungs-Evidence speichert Exam-/Session-/Item-Referenzen
- unbeantwortete Fragen bleiben Score 0
- Mastery, Gaps und Tagesplan werden nach Prüfungsantworten aktualisiert
- Timer- und Abschlusslogik in AI-Prüfungsmodul erhalten
- neue Datei `exam-ai.js` ergänzt
- PWA-Cache auf v8 angehoben
