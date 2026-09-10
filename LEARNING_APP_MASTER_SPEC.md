# LEARNING_APP_MASTER_SPEC

## Version 3.11 — 10.09.2026

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

**Status: IMPLEMENTIERT FÜR SELBSTTESTS**

Selbsttests an Lernzielen laufen jetzt über `AIService.evaluateFreeAnswer()`.

Bewertungslogik:
- `LOCAL`: vollständig lokale Token-/Inhaltsüberschneidungs-Baseline, Confidence 0.35.
- `CLOUD`: semantische Bewertung über den konfigurierten Cloud-Endpunkt; wenn kein Endpoint verfügbar ist, wird transparent abgebrochen.
- `AUTO`: lokale Vorbewertung zuerst. Wenn CLOUD nicht verfügbar ist, bleibt das Ergebnis lokal. Wenn CLOUD verfügbar ist und das lokale Ergebnis in einem unsicheren mittleren Bereich liegt, wird an CLOUD eskaliert. Falls die Cloud-Auswertung fehlschlägt, fällt AUTO kontrolliert auf LOCAL zurück.

Jede Auswertung erzeugt Assessment-Evidence mit:
- Score
- Confidence
- Provider
- Evaluations-Policy
- Feedback
- `independentRecall=true`

Danach werden Mastery und Knowledge Gap deterministisch neu berechnet. `MASTERED` bleibt an die bestehende Mindest-Confidence und Evidenzanzahl gebunden. Der Tagesplan wird nach neuer Evidenz invalidiert und anschließend neu geplant.

Die bestehende alte direkte Selbsttest-Bewertung wird durch einen Capture-Handler überschrieben, sodass keine doppelte Evidenz entsteht.

## Architekturregel

Sensible API-Schlüssel dürfen niemals fest im Browser-Code einer öffentlich ausgelieferten PWA hinterlegt werden. Für echte Cloud-KI ist ein sicherer Proxy bzw. Backend-Endpunkt erforderlich.

## Kostenprinzip

Datenhaltung, Coverage, Lernplanung, Fortschritt, FSRS, Statistiken und Statusübergänge bleiben ohne kostenpflichtige Cloud-KI nutzbar. Im AUTO-Modus sollen Cloud-Kosten nur bei semantisch unsicheren Aufgaben entstehen.

## Nächste Implementierungsschritte

1. Prüfungssimulation auf dieselbe `AIService.evaluateFreeAnswer()`-Logik umstellen.
2. Tutor vollständig über `AIService.tutor()` anbinden.
3. Sichere Cloud-Anbindung über Proxy/Backend.
4. Kosten-/Nutzungslimit pro Monat und transparente Anzeige in der App.
5. Import-, Zusammenfassungs- und Bewertungs-Pipeline auf echtem iPhone/iPad testen.

## Changelog 3.11

- freie Selbsttest-Antworten auf `AIService.evaluateFreeAnswer()` umgestellt
- AUTO nutzt lokale Vorbewertung und optionale Cloud-Eskalation
- kontrollierter LOCAL-Fallback bei Cloud-Ausfall ergänzt
- Assessment-Evidence speichert Provider, Policy und Feedback
- Mastery-/Gap-Neuberechnung nach AI-Auswertung eingebaut
- Tagesplan wird nach neuer Evidenz invalidiert
- alte direkte Selbsttest-Bewertung wird ohne Doppelerfassung überschrieben
- neue Datei `free-answer-ai.js` ergänzt
- PWA-Cache auf v7 angehoben
