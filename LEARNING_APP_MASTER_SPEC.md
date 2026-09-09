# LEARNING_APP_MASTER_SPEC

## Version 3.9 — 09.09.2026

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

Die erzeugte Zusammenfassung wird am Dokument lokal gespeichert, inklusive:

- Provider
- Confidence
- gewählter Länge
- Erstellzeitpunkt
- aktivem KI-Modus

Im LOCAL-Modus bleibt die Funktion vollständig kostenfrei. AUTO nutzt aktuell LOCAL als Fallback, bis ein Cloud-Provider sicher angebunden ist. CLOUD meldet transparent, wenn noch kein Backend-Endpunkt konfiguriert ist.

## Architekturregel

Sensible API-Schlüssel dürfen niemals fest im Browser-Code einer öffentlich ausgelieferten PWA hinterlegt werden. Für echte Cloud-KI ist daher ein sicherer Proxy bzw. Backend-Endpunkt vorzusehen.

## Kostenprinzip

Deterministische Funktionen wie Datenhaltung, Coverage, Lernplanung, Fortschritt, FSRS, Statistiken und Statusübergänge bleiben ohne kostenpflichtige Cloud-KI nutzbar. Im AUTO-Modus sollen nur semantisch anspruchsvolle Aufgaben Kosten verursachen.

## Nächste Implementierungsschritte

1. Lernzielgenerierung über `AIService` führen.
2. Karteikartengenerierung über `AIService` führen.
3. Freie Antwortbewertung mit lokalem Vorfilter und optionaler Cloud-Eskalation.
4. Tutor vollständig über `AIService` anbinden.
5. Sichere Cloud-Anbindung über Proxy/Backend.
6. Kosten-/Nutzungslimit pro Monat und transparente Anzeige in der App.

## Changelog 3.9

- KI-Betriebsmodus im Profil als implementiert markiert
- `AUTO`, `LOCAL`, `CLOUD` technisch angebunden
- zentrale `AIService`-Schnittstelle dokumentiert
- Dokument-Zusammenfassungen auf `AIService.summarize()` umgestellt
- Kurz/Standard/Ausführlich ergänzt
- Summary-Metadaten werden am Dokument gespeichert
- PWA-Cache auf v5 angehoben
