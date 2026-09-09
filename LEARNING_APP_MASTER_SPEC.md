# LEARNING_APP_MASTER_SPEC

## Version 3.8 — 09.09.2026

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

**Status: FIX auf Architekturebene**

Die App unterstützt langfristig drei Modi:

### LOCAL
- keine laufenden KI-API-Kosten
- Datenhaltung, FSRS, Coverage, Planung, Fortschritt, Statistiken und Statuslogik lokal
- lokale Heuristiken bzw. lokale Modelle, soweit verfügbar

### AUTO
- Standardmodus
- lokale Verarbeitung zuerst
- Cloud-KI nur dort, wo semantisches Sprachverständnis einen klaren Qualitätsvorteil bringt
- Ziel: hohe Qualität bei sehr niedrigen laufenden Kosten

### CLOUD
- hochwertige Cloud-KI für semantische Aufgaben
- vorgesehen für Zusammenfassungen, Lernzielgenerierung, Karteikarten, Quizfragen, Tutor-Erklärungen und Bewertung freier Antworten

## Architekturregel

Cloud-KI wird hinter einer austauschbaren `AIProvider`-/`AIService`-Schnittstelle gekapselt. Die Lernlogik darf nicht direkt an einen einzelnen Anbieter gekoppelt sein.

Sensible API-Schlüssel dürfen niemals fest im Browser-Code einer öffentlich ausgelieferten PWA hinterlegt werden. Für echte Cloud-KI ist daher ein sicherer Proxy bzw. Backend-Endpunkt vorzusehen.

## Kostenprinzip

Deterministische Funktionen wie Datenhaltung, Coverage, Lernplanung, Fortschritt, FSRS, Statistiken und Statusübergänge bleiben ohne kostenpflichtige Cloud-KI nutzbar. Im AUTO-Modus sollen nur semantisch anspruchsvolle Aufgaben Kosten verursachen.

## Nächste Implementierungsschritte

1. AI-Modus in den Einstellungen (`LOCAL`, `AUTO`, `CLOUD`).
2. Einheitliche `AIService`-Schnittstelle.
3. Lokaler Fallback für Zusammenfassung, Lernziele und Fragen.
4. Sichere Cloud-Anbindung über Proxy/Backend.
5. Kosten-/Nutzungslimit pro Monat und transparente Anzeige in der App.
6. Freie Antwortbewertung mit lokalem Vorfilter und optionaler Cloud-Eskalation.

## Changelog 3.8

- vollständige Materiallöschung verbindlich definiert
- Bereinigung abhängiger Lerndaten festgelegt
- Schutz nicht betroffener Lernpläne und Prüfungssitzungen festgelegt
- Hybrid-KI-Architektur mit `LOCAL`, `AUTO`, `CLOUD` festgelegt
- `AUTO` als Standardmodus vorgesehen
- Cloud-KI von deterministischer Lernlogik entkoppelt
- sichere Schlüsselverwaltung als Architekturvorgabe ergänzt
