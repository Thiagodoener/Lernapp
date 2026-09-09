# LEARNING_APP_MASTER_SPEC

## Version 3.10 — 09.09.2026

### Leitprinzip

Die Lernapp bleibt offline-first. Deterministische Kernfunktionen dürfen nicht von einer kostenpflichtigen KI-API abhängen. KI wird für semantische Aufgaben eingesetzt, wenn sie einen echten Qualitätsvorteil bietet.

## Materiallöschung

**Status: FIX**

Ein importiertes Lernmaterial kann vollständig gelöscht werden.

Beim Löschen eines `Document` werden alle ausschließlich daraus abgeleiteten Inhalte entfernt:

- LearningGoals
- Flashcards
- Reviews
- AssessmentEvidence
- MasteryState
- KnowledgeGaps

Lernpläne, Exam-Definitionen und Prüfungssitzungen bleiben bestehen, werden aber um Referenzen auf gelöschte Lernziele bzw. Karteikarten bereinigt. Andere Materialien und deren Lernfortschritt dürfen dadurch nicht verloren gehen.

Vor dem Löschen muss eine eindeutige Bestätigung erscheinen. Nach erfolgreicher Löschung darf kein gelöschtes LearningGoal mehr in Planung, Review, Assessment oder Wissensstand auftauchen.

## KI-Betriebsmodi

**Status: IMPLEMENTIERT**

Die App unterstützt drei Modi:

### LOCAL
- keine laufenden KI-API-Kosten
- Datenhaltung, FSRS, Coverage, Planung, Fortschritt, Statistiken und Statuslogik lokal
- lokale Heuristiken bzw. lokale Modelle, soweit verfügbar

### AUTO
- Standardmodus
- nutzt den besten verfügbaren Provider
- fällt auf LOCAL zurück, solange keine Cloud-KI konfiguriert ist
- Ziel: hohe Qualität bei sehr niedrigen laufenden Kosten

### CLOUD
- hochwertige Cloud-KI für semantische Aufgaben
- vorgesehen für Zusammenfassungen, Lernzielgenerierung, Karteikarten, Quizfragen, Tutor-Erklärungen und Bewertung freier Antworten
- erfordert sicheren Backend-/Proxy-Endpunkt; API-Schlüssel bleiben aus dem Browser heraus

## AIService

**Status: IMPLEMENTIERT**

Cloud- und Local-Verarbeitung werden hinter einer austauschbaren `AIService`-/Provider-Schnittstelle gekapselt. Die Lernlogik darf nicht direkt an einen einzelnen Anbieter gekoppelt sein.

Aktuelle Schnittstellen:

- `summarize`
- `tutor`
- `generateLearningGoals`
- `generateFlashcards`
- `evaluateFreeAnswer`

## Zusammenfassungen über AIService

**Status: IMPLEMENTIERT**

Dokument-Zusammenfassungen laufen über `AIService.summarize()`.

Unterstützte Längen:

- Kurz
- Standard
- Ausführlich

Die erzeugte Zusammenfassung wird am Dokument lokal gespeichert, inklusive Provider, Confidence, gewählter Länge, Erstellzeitpunkt und aktivem KI-Modus.

## Lernziel- und Karteikartengenerierung über AIService

**Status: IMPLEMENTIERT**

Der Materialimport wird vor dem bisherigen Import-Handler durch eine zentrale AI-Import-Pipeline übernommen.

Ablauf:

1. PDF/TXT/Markdown wird lokal extrahiert; Scan-PDF-Seiten nutzen OCR-Fallback.
2. Pro Quellseite werden Lernziele ausschließlich über `AIService.generateLearningGoals()` erzeugt.
3. Die erzeugten Lernziele behalten `documentId`, `sourcePage`, `sourceSnippet`, Provider, AI-Modus und Confidence als Provenienz.
4. Karteikarten werden anschließend ausschließlich über `AIService.generateFlashcards()` erzeugt.
5. Jede Karte erhält einen echten FSRS-Ausgangszustand und behält Provider-/Modus-Metadaten.
6. Mastery startet weiterhin konservativ bei `NOT_ASSESSED`.
7. Der bestehende Tagesplan wird für den aktuellen Tag invalidiert und beim nächsten Aufruf aus den neuen Lernzielen neu erzeugt.
8. Bei einem Importfehler werden bereits angelegte Dokument-, Lernziel-, Mastery- und Karteikartendaten wieder bereinigt.

Im LOCAL-Modus bleibt diese Pipeline vollständig kostenfrei. AUTO nutzt aktuell LOCAL, solange kein Cloud-Provider sicher konfiguriert ist. CLOUD bricht transparent ab, wenn kein sicherer Cloud-Endpunkt verfügbar ist.

## Architekturregel

Sensible API-Schlüssel dürfen niemals fest im Browser-Code einer öffentlich ausgelieferten PWA hinterlegt werden. Für echte Cloud-KI ist daher ein sicherer Proxy bzw. Backend-Endpunkt vorzusehen.

## Kostenprinzip

Deterministische Funktionen wie Datenhaltung, Coverage, Lernplanung, Fortschritt, FSRS, Statistiken und Statusübergänge bleiben ohne kostenpflichtige Cloud-KI nutzbar. Im AUTO-Modus sollen nur semantisch anspruchsvolle Aufgaben Kosten verursachen.

## Nächste Implementierungsschritte

1. Freie Antwortbewertung mit lokalem Vorfilter und optionaler Cloud-Eskalation über `AIService.evaluateFreeAnswer()`.
2. Prüfungssimulation ebenfalls auf dieselbe Bewertungslogik umstellen.
3. Tutor vollständig über `AIService.tutor()` anbinden.
4. Sichere Cloud-Anbindung über Proxy/Backend.
5. Kosten-/Nutzungslimit pro Monat und transparente Anzeige in der App.
6. Import-Pipeline und KI-Funktionen auf echtem iPhone/iPad mit PDF/OCR testen.

## Changelog 3.10

- Materialimport auf zentrale AIService-Pipeline umgestellt
- Lernziele laufen über `AIService.generateLearningGoals()`
- Karteikarten laufen über `AIService.generateFlashcards()`
- Quell- und Provider-Provenienz an generierten Inhalten ergänzt
- FSRS-Ausgangszustand für AI-generierte Karten beibehalten
- Import-Rollback bei Fehlern ergänzt
- bestehender Tagesplan wird nach neuem Import invalidiert
- `ai-service.js` wird vor `app.js` geladen
- neue Datei `import-ai.js` ergänzt
- PWA-Cache auf v6 angehoben
