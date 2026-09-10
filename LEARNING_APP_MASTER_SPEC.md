# LEARNING_APP_MASTER_SPEC

## Version 3.20 — 10.09.2026

> **Single Source of Truth für das gesamte Projekt Lernapp.**  
> Diese Datei definiert Produktziel, Lernlogik, Funktionsumfang, Architekturregeln, Betriebsmodi, Qualitätsanforderungen, aktuellen Implementierungsstatus und offene Arbeiten. Neue Funktionen oder Architekturentscheidungen müssen hier nachgeführt werden.

## 1. Produktvision

Die Lernapp ist eine persönliche, wissenschaftlich orientierte Lernplattform für Studium und Weiterbildung. Sie soll nicht nur Inhalte anzeigen oder Fragen generieren, sondern ein belastbares Modell darüber aufbauen, **welche Inhalte gelernt werden müssen, was der Nutzer tatsächlich beherrscht, wo Wissenslücken bestehen und was als Nächstes gelernt werden sollte**.

Der Kernzyklus lautet:

**Studienmaterial → strukturierte Wissensbasis → adaptiver Lernplan → Lernaktivität → Prüfung/Assessment → Evidence → Mastery/Wissenslücken → aktualisierter Lernplan → Prüfungsbereitschaft**

Die zentrale Differenzierung gegenüber einem einfachen KI-Chat oder Karteikartenprogramm lautet:

> Die App soll nicht nur wissen, was gelesen oder bearbeitet wurde, sondern anhand von Lern-Evidence abschätzen, was tatsächlich beherrscht wird.

## 2. Primäre Produktziele

### MUST

1. Studienmaterial zuverlässig aufnehmen und strukturiert verarbeiten.
2. Relevanten Lernstoff vollständig erfassen, damit nichts Wesentliches vergessen wird.
3. Inhalte zusammenfassen und wichtige Stellen hervorheben.
4. Lernziele aus den Materialien ableiten und mit Quellen verknüpfen.
5. Karteikarten mit Spaced Repetition bereitstellen.
6. Quizfragen und offene Fragen bereitstellen.
7. Freie Erklärungen des Nutzers bewerten.
8. Wissen nicht binär, sondern differenziert nach mehreren Dimensionen bewerten.
9. Wissenslücken automatisch erkennen.
10. Einen adaptiven Tages- und Prüfungslernplan erzeugen.
11. Fortschritt und Prüfungsbereitschaft verständlich darstellen.
12. Wiederholungen mit FSRS steuern.
13. Prüfungssimulationen durchführen.
14. Einen quellengebundenen Tutor anbieten.
15. Offline-/kostenfreien persönlichen Betrieb ermöglichen.
16. Optional hochwertige Cloud-KI nutzen können, ohne API-Schlüssel in der PWA offenzulegen.
17. Daten lokal sichern, exportieren und wiederherstellen können.
18. Auf iPhone und iPad intuitiv als installierbare PWA nutzbar sein.

### SHOULD

- adaptive Schwierigkeit der Lernaktivitäten
- Streaks und zurückhaltende Gamification
- detaillierte Lernstatistiken und Trends
- Lernzeit-/Workload-Steuerung
- automatische Priorisierung vor Prüfungsterminen
- transparente Quellenanzeige bei generierten Lerninhalten
- AI-Nutzungs-/Kostenmetriken

### OPTIONAL / SPÄTER

- Knowledge Map als visuelle Darstellung von Konzepten und Beziehungen
- weitergehende Gamification wie XP/Levels, sofern sie das Lernen unterstützt und nicht vom Kernziel ablenkt
- zusätzliche Cloud-/Provider-Optionen

## 3. Leitprinzipien

### 3.1 Learning first

Die Hauptinteraktion lautet:

**App öffnen → heutigen Plan sehen → lernen.**

Der Chat/Tutor ist ein Werkzeug und nicht der Startbildschirm.

### 3.2 Evidence first

Der Wissensstand darf nicht daraus abgeleitet werden, dass ein Inhalt geöffnet, gelesen oder von einer KI zusammengefasst wurde.

Verbindliche Kette:

**Quelle → atomare Wissenseinheit → Konzept → Lernziel → Lernaktivität → Lernversuch → Evidence → Mastery → Wissenslücke → Lernplan**

### 3.3 Deterministische Kernlogik

KI interpretiert semantische Inhalte. Deterministische Software verwaltet insbesondere:

- Datenhaltung
- Prüfungstermine
- FSRS
- Lernplanregeln
- Coverage
- Mastery-Aggregation
- Statusübergänge
- Audits
- Statistiken
- Kosten-/Nutzungslimits

Eine KI darf Mastery niemals direkt setzen.

### 3.4 Quellenbindung

Generierte Lernziele, Zusammenfassungen, Highlights, Tutorantworten, Fragen und Bewertungen sollen soweit möglich auf konkrete Quellen zurückführbar sein. Wenn Material eine Aussage nicht trägt, darf die App dies nicht durch erfundene Inhalte kaschieren.

### 3.5 Kostenprinzip

Die Kernapp muss ohne verpflichtende laufende Kosten nutzbar bleiben. Cloud-KI ist optional.

## 4. Unterstützte Lernmaterialien

Zielumfang:

- PDF-Skripte
- Vorlesungsfolien als PDF
- Artikel/Paper
- Buch-/Kapitelmaterial, soweit als unterstützte Datei importiert
- TXT
- Markdown
- textbasierte PDFs
- gescannte PDFs über OCR
- Text in Bildern/gescannten Seiten über OCR-Pipeline
- Bilddateien (JPEG, PNG, WebP, HEIC/HEIF) wie Fotos von Mitschriften, Folien, Tafelbildern und Skizzen

### Importregeln

- Quelldokument bleibt als eigenständige Entität erhalten.
- Seiten-/Quellenbezug soll erhalten bleiben.
- Scan-Seiten verwenden OCR-Fallback.
- Verarbeitung darf keine halbfertigen abhängigen Daten zurücklassen.
- Importiertes Material muss wieder vollständig löschbar sein.

**PWA-Status:** PDF/TXT/Markdown, PDF.js-Textextraktion und Tesseract-OCR-Fallback implementiert. Bildimport implementiert: im CLOUD-Modus über `AIService.analyzeImage()` mit Bildverstehen, im LOCAL-Modus über Tesseract-OCR. Bilder werden vor dem Versand clientseitig auf maximal 1600 px Kantenlänge verkleinert, um Kontingent und Anfragegröße zu begrenzen. Vollständige reale Gerätetests aller Materialtypen stehen aus.

### Bildanalyse

Aus einem Bild wird lernbarer Text erzeugt, der anschließend die normale Lernziel- und Karteikartenpipeline durchläuft. Regeln:

- Lesbarer Text wird wortgetreu übernommen, auch Handschrift.
- Formeln, Diagramme, Tabellen und Skizzen werden inhaltlich beschrieben, damit ihr fachlicher Gehalt lernbar wird.
- Unleserliche Stellen werden als `[unleserlich]` markiert und nicht geraten.
- Es wird nichts ergänzt, was das Bild nicht zeigt.
- Die erzeugte Seite wird als `AI_VISION` (CLOUD) oder `OCR` (LOCAL) gekennzeichnet, damit die Herkunft nachvollziehbar bleibt.

## 5. Wissensmodell

Zentrale fachliche Entitäten:

- Module
- Document
- SourceBlock / Seiten-/Quellabschnitt
- KnowledgeUnit
- Concept
- ConceptRelationship
- LearningGoal
- LearningGoalSource
- LearningGoalPrerequisite / Requirements
- Flashcard
- Question
- AssessmentAttempt
- AssessmentEvidence
- MasteryState
- MasterySnapshot
- KnowledgeGap
- ReviewState
- ReviewLog
- Exam
- ExamScope
- StudyPlan
- StudyPlanTask
- TutorSession / TutorMessage
- ExamSimulation / ExamSimulationItem
- Processing/Audit-Metadaten

Die PWA kann aus technischen Gründen vereinfachte lokale Repräsentationen verwenden; die fachliche Semantik muss erhalten bleiben.

## 6. Wissensdimensionen und Mastery

Jedes Lernziel soll nicht nur mit einem Gesamtwert betrachtet werden, sondern in vier Dimensionen:

1. **RECALL** – Fakten/Inhalte abrufen
2. **UNDERSTANDING** – Zusammenhänge erklären
3. **APPLICATION** – Wissen anwenden
4. **TRANSFER** – Wissen auf neue Situationen übertragen

Mastery-Status:

- NOT_ASSESSED
- WEAK
- DEVELOPING
- PROFICIENT
- MASTERED

Stabilität:

- UNKNOWN
- UNSTABLE
- STABLE
- DECAYING

Grundregel: `MASTERED` darf nur bei ausreichender Evidence und ausreichender Confidence entstehen. Niedrig-konfidente lokale Heuristiken dürfen allein kein MASTERED erzeugen.

## 7. Zusammenfassungen und Highlights

### Anforderungen

- Kurz
- Standard
- Ausführlich
- wissenschaftlich/seriös formuliert
- wichtige Inhalte priorisieren
- Quellen-/Seitenbezug erhalten
- Highlights direkt mit Quelle verbinden
- Zusammenfassungen erzeugen keine Mastery-Evidence

### Umfangreiche Dokumente

Der Proxy begrenzt den Quelltext je Aufruf. Ein vollständiges Skript passt deshalb nicht in einen Durchgang. Statt den Text abzuschneiden, wird das Material abschnittsweise verarbeitet:

1. Das Dokument wird entlang der Seitengrenzen in Abschnitte unterhalb des Serverlimits geteilt.
2. Jeder Abschnitt wird ausführlich zusammengefasst, damit unterwegs nichts verloren geht.
3. Die Teilergebnisse werden gebündelt und verdichtet, bis sie gemeinsam in einen Aufruf passen.
4. Erst der letzte Durchgang wendet die vom Nutzer gewählte Länge an.

Stilles Abschneiden ist nach Kapitel 3.4 unzulässig. Reicht selbst dieses Verfahren nicht aus, wird die Zahl der ausgelassenen Abschnitte im Ergebnis ausgewiesen. Die Anzahl der zusammengeführten Abschnitte wird ebenfalls angezeigt.

**Status:** Zusammenfassungen über `AIService.summarize()` implementiert, abschnittsweise Verarbeitung implementiert. Highlights grundsätzlich vorhanden. Weitere Qualitätsprüfung mit realen Studienunterlagen erforderlich.

## 8. Lernziele

Aus Material werden konkrete, lernbare Ziele erzeugt. Lernziele müssen:

- verständlich formuliert sein
- relevante Quelle besitzen
- nach Möglichkeit Voraussetzungen/Beziehungen berücksichtigen
- für Assessment und Planung verwendbar sein
- Coverage ermöglichen

### Relevanzprüfung und Dubletten

Lernziele werden pro Quellseite erzeugt. Damit daraus kein Wildwuchs entsteht, gelten zwei Regeln:

- **Relevanzprüfung:** Seiten ohne Lernstoff werden übersprungen, bevor ein KI-Aufruf entsteht. Erkannt werden Verzeichnisse und Register, zu dünne Seiten und Seiten mit überwiegend Ziffern. Die Prüfung greift nur bei mehrseitigen Dokumenten; ein einseitiger Import ist eine bewusste Auswahl des Nutzers und wird nie wegen seiner Kürze verworfen.
- **Dublettenprüfung:** Inhaltlich nahezu gleiche Lernziele innerhalb eines Dokuments werden verworfen. Verglichen wird die Überschneidung der Inhaltswörter; Zahlen zählen unabhängig von ihrer Länge mit, damit sich Aufzählungen, Formeln und Jahreszahlen weiterhin unterscheiden.

Die Dublettenprüfung wirkt bewusst nur innerhalb eines Dokuments. Dokumentübergreifendes Zusammenlegen würde die materialbezogene Lösch-Cascade aus Kapitel 22 verletzen.

Beides dient zugleich dem Kostenprinzip: jede übersprungene Seite spart einen vollständigen KI-Aufruf.

**Status:** automatische Generierung über `AIService.generateLearningGoals()` implementiert; lokale Baseline und Cloud-Schnittstelle vorhanden. Relevanz- und Dublettenprüfung implementiert.

## 9. Karteikarten und FSRS

### Anforderungen

- automatisch erzeugte Karten
- manuell erstellbare Karten
- Quelle/Lernziel-Zuordnung
- Again / Hard / Good / Easy
- FSRS bestimmt den Wiederholungszeitpunkt
- Antwort anzeigen und Selbstbewertung dürfen nicht fälschlich als unabhängiger Recall gewertet werden

### Erzeugung in Stapeln

Karteikarten werden in Stapeln von höchstens 20 Lernzielen erzeugt. Vorher gingen alle Lernziele eines Dokuments in einem einzigen Aufruf raus; die Nutzlast wurde serverseitig gekürzt, sodass bei umfangreichem Material ein Teil der Karten stillschweigend verloren ging. Pro Lernziel entsteht höchstens eine Karte.

**Status:** PWA verwendet `ts-fsrs` 5.4.1 mit expliziten 21 FSRS-6-Parametern. Native Implementierung verwendet FSRS-6-kompatible Swift-Abhängigkeit. Manuelle Karten sind vorgesehen/implementiert.

## 10. Fragen, Selbsttests und freie Antworten

Unterstützte Lernaktivitäten:

- Quiz/Multiple Choice
- offene Fragen
- freie Erklärungen
- Verständnis
- Anwendung
- Transfer
- optional Spracheingabe als Progressive Enhancement

Freie Antworten laufen über `AIService.evaluateFreeAnswer()`.

### Evidence-Regeln

Evidence enthält mindestens:

- Lernziel
- Dimension
- Score
- Confidence
- Provider
- Bewertungs-Policy
- Feedback
- Zeit/Quelle
- Independent-Recall-Information

**Status:** gemeinsame AIService-Pipeline für Selbsttests und Prüfungssimulation implementiert. LOCAL verwendet konservative Heuristik; hochwertige semantische CLOUD-Bewertung ist vorbereitet, aber noch nicht live end-to-end getestet.

## 11. Wissenslücken

Die App soll Schwächen automatisch erkennen und nicht darauf warten, dass der Nutzer sie manuell markiert.

Lokale Gap-Typen umfassen:

- CRITICAL_NOT_ASSESSED
- RECALL_FAILURE
- UNDERSTANDING_FAILURE
- APPLICATION_FAILURE
- TRANSFER_FAILURE
- HIGH_UNCERTAINTY

Wissenslücken fließen automatisch zurück in den Lernplan.

**Status:** implementiert.

## 12. Adaptiver Lernplan

Der Lernplan ist Kernfunktion, nicht Zusatzfunktion.

Er berücksichtigt mindestens:

- noch nicht geprüfte Lernziele
- schwache Lernziele
- Knowledge Gaps
- fällige FSRS-Wiederholungen
- neue Inhalte
- Prüfungsrelevanz
- Prüfungstermin
- verfügbare tägliche Lernzeit
- Coverage
- bisherigen Wissensstand

Task-Arten umfassen mindestens:

- LEARN_NEW
- REVIEW_FLASHCARD
- REPAIR_KNOWLEDGE_GAP
- Assessment-/Prüfaktivitäten

Ein `LEARN_NEW`-Task gilt nicht allein durch Lesen als fachlich beherrscht; Assessment muss Evidence liefern.

Der Plan wird nach neuer relevanter Evidence, Importen und Prüfungsergebnissen neu bewertet.

### Prüfungsgewichtung

Steht ein Termin bevor, verschiebt der Plan sich auf den Prüfungsstoff. Die Verschiebung wächst linear über einen Horizont von 30 Tagen: 30 Tage vorher wirkt sie nicht, am Prüfungstag voll. Innerhalb des Scopes werden Lernziele bevorzugt, ungeprüfte Lernziele zusätzlich, weil dort jede Evidence fehlt. Lernziele außerhalb des Scopes werden zurückgestellt, aber nicht entfernt. Ohne Termin bleibt die Reihenfolge unverändert.

**Status:** implementiert, inklusive Kopplung an Prüfungstermin, Scope und fehlende Assessment Coverage. Systematische reale Langzeitprüfung steht aus.

## 13. Coverage – nichts vergessen

Die App muss transparent prüfen, ob der importierte relevante Lernstoff durch Wissenseinheiten/Lernziele und Assessments abgedeckt wird.

Coverage soll mindestens unterscheiden:

- Content Coverage
- Assessment Coverage
- noch nicht abgedeckte Inhalte
- noch nicht geprüfte Lernziele

Das Ziel ist nicht künstlich 100 %, sondern das frühzeitige Erkennen von blinden Flecken.

### Berechnung

- **Content Coverage** = Anteil der lernrelevanten Quellseiten, aus denen mindestens ein Lernziel entstanden ist. Seiten, die der Import als nicht lernrelevant eingestuft hat, zählen weder im Zähler noch im Nenner und erscheinen daher nicht als Lücke.
- **Assessment Coverage** = Anteil der Lernziele mit mindestens einer Evidence.

Importe von vor der Relevanzkennzeichnung gelten als relevant. Coverage fällt dadurch eher zu niedrig als zu hoch aus, was dem Zweck entspricht: blinde Flecken finden statt eine hohe Zahl anzeigen.

**Status:** implementiert. Beide Werte werden im Fortschritt für das Modul und innerhalb der Prüfungsbereitschaft für den jeweiligen Prüfungsstoff ausgewiesen.

## 14. Prüfungen und Exam Scope

Nutzer kann Prüfungen mit Datum anlegen. Ein Exam besitzt einen relevanten Scope. Der Lernplan priorisiert Inhalte abhängig von Prüfungstermin, Scope, Mastery, Stabilität und Coverage.

Ein Exam besitzt Titel, Termin und einen Scope aus ausgewählten Materialien. Ohne Auswahl umfasst der Scope das gesamte Modul. Prüfungen mit Termin sind von den Datensätzen der Prüfungssimulation dadurch unterscheidbar, dass letztere keinen Termin tragen.

**Status:** implementiert. Prüfungen lassen sich im Fortschritt mit Termin und Scope anlegen und entfernen.

## 15. Exam Readiness

Die App soll eine nachvollziehbare Prüfungsbereitschaft anzeigen. V1-Gewichtung:

- 25 % Content Coverage
- 20 % Assessment Coverage
- 40 % Mastery
- 15 % Stability

Readiness ist eine Lernsteuerungsmetrik und **keine Bestehensgarantie**.

Die Stabilität wird aus den FSRS-Intervallen der Karteikarten abgeleitet: eine Karte gilt als verankert, wenn ihr Intervall 30 Tage erreicht. Die vier Anteile werden mit ihren Gewichten einzeln ausgewiesen, damit nachvollziehbar bleibt, woran es liegt.

**Status:** implementiert, inklusive Anzeige im Fortschritt und als Kennzahl auf dem Heute-Bildschirm.

## 16. Prüfungssimulation

### Anforderungen

- realistische Mischung aus Wissensdimensionen
- priorisierte relevante Lernziele
- Timer
- freie Antworten
- unbeantwortete Fragen = 0
- Ergebnisübersicht
- schwache Lernziele erkennen
- Evidence erzeugen
- Mastery/Gaps/Plan aktualisieren
- aktive Simulation fortsetzen können

Aktuelle PWA-Baseline: 30 Minuten, bis zu 12 priorisierte Lernziele, RECALL/UNDERSTANDING/APPLICATION/TRANSFER.

**Status:** implementiert und auf gemeinsame AIService-Bewertung umgestellt.

## 17. Tutor

Jedes Lernziel kann einen Tutorbereich besitzen.

### Tutorregeln

- Tutor läuft über `AIService.tutor()`.
- Quellenkontext des Lernziels wird mitgegeben.
- Quellseite/benachbarte Seiten können einbezogen werden.
- Tutor soll Unsicherheit transparent machen.
- Tutor-Verlauf wird lokal gespeichert.
- Tutorantworten erzeugen keine Mastery-Evidence.
- LOCAL bleibt kostenfrei und quellengebunden.
- CLOUD kann später hochwertigere semantische Erklärungen liefern.

**Status:** implementiert.

### SHOULD

„Prüf mich“ aus dem Tutor heraus soll eine echte Assessment-Aktivität starten, deren Ergebnis über die normale Evidence-Pipeline verarbeitet wird.

## 18. Sprache / mündliches Erklären

Die App soll freie Erklärungen per Text ermöglichen und Spracheingabe nutzen, wenn Browser/Gerät dies unterstützt.

Regeln:

- Spracheingabe ist Progressive Enhancement.
- Texteingabe bleibt immer verfügbar.
- Transkript muss vor Bewertung sichtbar/bearbeitbar sein, wo sinnvoll.
- mündliche Erklärung wird wie andere freie Antworten über Evidence bewertet.

**Status:** SpeechRecognition-Basis in PWA/native vorhanden; echter Geräte-Endtest ausstehend.

## 19. Fortschritt und Analytics

Die Fortschrittsansicht soll mindestens zeigen:

- Mastery insgesamt
- Mastery nach Dimension
- schwache Lernziele
- Knowledge Gaps
- Anzahl/Qualität der Assessments
- fällige Wiederholungen
- Coverage
- Prüfungssimulationen
- Exam Readiness
- Verlauf/Trend
- Streak

SHOULD:

- Lernzeit
- Antwortzeiten
- Performance nach Fragetyp
- Stabilität
- Entwicklung über Zeit
- Planerfüllung

### Verlauf

Pro Modul und Lerntag wird ein Messpunkt mit Mastery, Content Coverage, Assessment Coverage und Prüfungsbereitschaft festgehalten, sobald der Fortschritt geöffnet wird. Mehrfaches Öffnen an einem Tag überschreibt den Messpunkt, statt Duplikate anzulegen. Der Verlauf zeigt je Kennzahl den aktuellen Stand, die Veränderung in Prozentpunkten seit dem ersten Messpunkt und eine Sparkline auf fester Skala von 0 bis 100 Prozent. Eine automatische Skalierung ist ausdrücklich nicht gewollt, weil sie kleine Schwankungen wie große Fortschritte aussehen ließe.

**Status:** mehrere Analytics-Metriken implementiert, Verlauf über die Zeit implementiert. Vollständige PWA-UX-Parität im Endaudit prüfen.

## 20. Gamification

Gamification soll motivieren, aber wissenschaftliche Lernsteuerung nicht verzerren.

MUST/SHOULD:

- Streak
- sichtbarer Fortschritt
- klare Tageserfüllung

OPTIONAL:

- XP
- Levels
- Badges/Meilensteine

Keine Belohnung darf dazu führen, dass bloßes Öffnen/Lesen als Mastery gewertet wird.

## 21. Dashboard / Heute

Der Heute-Bildschirm ist der operative Startpunkt.

Er soll auf einen Blick beantworten:

- Was soll ich heute lernen?
- Was ist fällig?
- Wo habe ich Schwächen?
- Wie weit bin ich?
- Wie bereit bin ich für die nächste Prüfung?

Priorität ist geringe Reibung: möglichst wenige Schritte bis zur nächsten sinnvollen Lernaktivität.

## 22. Bibliothek

Bibliothek verwaltet Module und Materialien.

Funktionen:

- Module anlegen
- Materialien importieren
- Verarbeitungsstatus
- Dokument öffnen
- Zusammenfassungen
- Highlights
- Lernziele/Quellen
- Material vollständig löschen

Beim Löschen eines Materials werden ausschließlich abhängige Daten dieses Materials bereinigt; andere Materialien bleiben erhalten. Wiederherstellung ist nur über vorhandenes Backup möglich.

**Status:** implementiert; Lösch-Cascade auf echtem iPhone noch explizit testen.

## 23. Backup, Restore und Datenportabilität

MUST:

- JSON-Backup der lokalen Lerndaten
- Restore
- Daten bleiben ohne Cloudkonto nutzbar
- keine künstliche Bindung an einen kostenpflichtigen Dienst

Vor destruktiven Aktionen soll Backup empfohlen bzw. ermöglicht werden.

**Status:** PWA JSON Backup/Restore implementiert.

## 24. Betriebsmodi

### LOCAL

- komplett kostenfreier Kernbetrieb
- lokale Datenhaltung
- lokale Heuristiken/OCR/FSRS/Planung
- keine Cloud-KI erforderlich

### AUTO — Standard

- wählt automatisch die sinnvollste verfügbare Verarbeitung
- LOCAL bleibt Fallback
- CLOUD kann für semantisch anspruchsvolle Aufgaben eingesetzt werden
- Ziel: bestmögliche Qualität bei kontrollierten Kosten

### CLOUD

- höchste semantische Qualität
- ausschließlich über sicheren Proxy/Backend-Endpunkt
- kein OpenAI/API-Schlüssel im Browser

**Status:** Moduswahl und zentrale AIService-Schicht implementiert.

## 25. AIService

Zentrale Schnittstellen:

- `summarize`
- `tutor`
- `generateLearningGoals`
- `generateFlashcards`
- `evaluateFreeAnswer`
- `analyzeImage`

Alle semantischen KI-Funktionen müssen über diese Abstraktion laufen, damit LOCAL/AUTO/CLOUD austauschbar bleiben. Das gilt ausdrücklich auch für die Bildanalyse: `analyzeImage` besitzt eine kostenfreie LOCAL-Implementierung über Tesseract-OCR und eine CLOUD-Implementierung mit Bildverstehen.

Implementiert sind außerdem:

- persistierter Cloud-Endpoint
- optionaler persönlicher Proxy-Zugriffsschlüssel
- `testCloud()`
- Cloud-Verfügbarkeitsstatus
- AUTO-Fallback

## 26. Sichere Cloud-Anbindung

**Status: CODESEITIG IMPLEMENTIERT, LIVE-DEPLOYMENT AUSSTEHEND**

Referenz: `cloud-worker/`.

Der Proxy nutzt Gemini. Ausschlaggebend sind zwei Eigenschaften: native Bildverarbeitung im selben Aufruf wie Text, was `analyzeImage` erst möglich macht, und ein kostenloses Kontingent, mit dem der persönliche Einzelbetrieb dem Kostenprinzip aus Kapitel 3.5 entspricht.

Regeln:

- `GEMINI_API_KEY` nur als serverseitiges Secret
- optional `LERNAPP_ACCESS_KEY`
- CORS auf PWA-Origin begrenzbar
- PWA darf keine beliebigen Modelle/Systemprompts bestimmen
- Proxy akzeptiert nur freigegebene Lernapp-Tasks
- Eingabe-/Textlimits
- Bilder nur in freigegebenen MIME-Typen und begrenzter Größe
- strukturierte JSON-Ausgaben über `responseSchema`
- Healthcheck

Unterstützte Tasks:

- summarize
- tutor
- generateLearningGoals
- generateFlashcards
- evaluateFreeAnswer
- analyzeImage
- health

### Kontingent und Kosten

Textaufgaben sind im kostenlosen Kontingent für den Einzelbetrieb in der Regel ausreichend abgedeckt. `analyzeImage` verbraucht pro Bild deutlich mehr Kontingent als eine Textanfrage. Werden Minuten- oder Tagesgrenzen erreicht, bleibt LOCAL der kostenfreie Fallback.

Gedrosselte Anfragen dürfen einen laufenden Import nicht abbrechen. Der Proxy reicht die Statuscodes 429 und 503 samt `Retry-After` an die PWA durch, statt sie als endgültigen Fehler zu verpacken. Die PWA wiederholt solche Anfragen bis zu viermal mit wachsendem Abstand und meldet die Wartezeit sichtbar, damit die Pause nicht wie ein hängender Import wirkt. Alle übrigen Fehler bleiben endgültig und werden nicht wiederholt. Videoanalyse ist bewusst nicht Teil dieser Version, weil sie mit kostenfreiem Betrieb nicht verlässlich vereinbar ist.

## 27. UI/UX-Anforderungen

Zielgeräte: iPhone und iPad, primär PWA.

Navigation:

- Heute
- Bibliothek
- Lernen
- Fortschritt
- Profil

Anforderungen:

- touchfreundlich
- klare Lade-/Leer-/Fehlerzustände
- keine unnötige technische Komplexität für den Nutzer
- gute Lesbarkeit
- konsistente Terminologie
- sinnvolle Accessibility Labels/Hints
- Offline-Zustand transparent
- Modus LOCAL/AUTO/CLOUD transparent
- Provider-/Confidence-Information dort anzeigen, wo sie für Vertrauen relevant ist

## 28. Offline/PWA

Die persönliche Hauptversion ist als installierbare PWA ausgelegt:

- GitHub Pages Hosting
- Home-Screen-Installation
- Standalone-Modus
- IndexedDB
- Service Worker/App Shell
- offline-first

Externe Browserbibliotheken können beim ersten Abruf Internet benötigen und werden danach soweit möglich gecacht. Vollständige Offline-Fähigkeit insbesondere von OCR/PDF/FSRS muss auf realem Gerät geprüft werden.

**Status:** PWA auf echtem iPhone bereits installiert und grundsätzlich standalone gestartet. Aktueller Service-Worker-Cache: v10.

## 29. PWA-Datenmodell

IndexedDB `lernapp-pwa`, aktuell DB-Version 2.

Die DB-Version ist in allen Modulen einzeln festgeschrieben, und nur `app.js` legt fehlende Stores an. Eine Versionserhöhung müsste deshalb in allen Modulen gleichzeitig erfolgen, sonst scheitert jedes Modul, das die Datenbank noch mit der alten Version öffnet. Neue Persistenz wird daher bevorzugt als eigener Datensatz in einem bestehenden Store eingeführt, solange die fachliche Semantik erhalten bleibt. Der Fortschrittsverlauf nutzt dieses Verfahren und liegt als Datensatz `mastery-history` im Store `settings`.

Stores umfassen:

- modules
- documents
- goals
- flashcards
- reviews
- evidence
- mastery
- gaps
- plans
- settings
- exams
- examSessions

Neue Persistenzanforderungen sollen migrationssicher eingeführt werden.

## 30. Cloud-/Backend-Architektur

Für skalierbaren Betrieb ist folgende Architektur festgelegt:

- FastAPI / Python
- Pydantic v2
- SQLAlchemy 2.x
- Alembic
- PostgreSQL
- pgvector geplant
- Celery
- Redis
- S3-kompatibler Object Storage
- REST JSON / OpenAPI
- strukturierte Logs
- modularer Monolith + Worker-Prozesse

Diese Cloudarchitektur ist optional für die persönliche PWA; der persönliche Kern darf davon nicht abhängig werden.

## 31. Native iOS/iPadOS

Es existiert zusätzlich ein SwiftUI-/SwiftData-Quellcodepfad mit XcodeGen-Definition.

Native Statusbezeichnung:

**RC1 Source Candidate / quellcode-seitig RC1-ready pending external Apple runtime verification.**

Nicht als installationsgeprüfter RC1 bezeichnen, solange folgende externe Tests fehlen:

- XcodeGen/Xcode Build auf macOS
- Swift Package Resolution
- Simulator
- echtes iPhone/iPad Build/Signing
- Vision OCR
- Speech/Mikrofon
- große PDFs
- Persistence nach Neustart
- LOCAL/API-Moduswechsel

Die PWA ist für die persönliche Nutzung aktuell der praktischere Hauptpfad.

## 32. Qualitäts- und Sicherheitsregeln

- keine API-Schlüssel im PWA-Code
- generierter Inhalt setzt Mastery nicht direkt
- Evidence muss Herkunft/Confidence nachvollziehbar machen
- Antwort anzeigen ≠ unabhängiger Recall
- unbeantwortete Prüfungsfrage = 0
- Löschvorgänge dürfen keine fremden Materialien beschädigen
- Importfehler dürfen keine inkonsistenten Teilimporte hinterlassen
- Quellenreferenzen dürfen nicht erfunden werden
- Cloud-Ausfall darf LOCAL-Kernbetrieb nicht zerstören
- AUTO benötigt robusten Fallback
- Änderungen an Lernregeln müssen testbar und dokumentiert sein

## 33. Qualitätskontrolle / Audits

Die App bzw. Entwicklung soll regelmäßig prüfen:

- Source Coverage
- Learning Goal Coverage
- Assessment Coverage
- verwaiste Daten
- ungültige Quellenreferenzen
- doppelte Lernziele/Karten
- Mastery-Invarianten
- FSRS-Verträge
- Import-/Lösch-Cascades
- Offline-Cache
- Backup/Restore
- LOCAL/AUTO/CLOUD-Parität

Nach größeren Projektphasen: Master Spec aktualisieren, Changelog ergänzen, Selbstchecks ausführen, Fehler beheben und erneut testen.

## 34. Feature-Status Gesamtübersicht

| Bereich | Zielstatus |
|---|---|
| PWA Installation / Standalone | IMPLEMENTIERT + Basis-Gerätetest |
| Lokale Datenhaltung | IMPLEMENTIERT |
| Module/Bibliothek | IMPLEMENTIERT |
| PDF/TXT/MD Import | IMPLEMENTIERT |
| PDF-Textextraktion | IMPLEMENTIERT |
| OCR-Fallback | IMPLEMENTIERT, Geräte-Endtest offen |
| Bildimport (Foto, Mitschrift, Folie, Skizze) | IMPLEMENTIERT, Geräte-Endtest offen |
| Bildverstehen im CLOUD-Modus | IMPLEMENTIERT, Live-Test nach Deployment offen |
| Material löschen | IMPLEMENTIERT, Geräte-Endtest offen |
| Zusammenfassungen | IMPLEMENTIERT |
| Highlights | IMPLEMENTIERT / Qualitätsaudit offen |
| Lernziele | IMPLEMENTIERT |
| automatische Karteikarten | IMPLEMENTIERT |
| Relevanzprüfung beim Import | IMPLEMENTIERT |
| Dublettenprüfung für Lernziele | IMPLEMENTIERT |
| Karteikartenerzeugung in Stapeln | IMPLEMENTIERT |
| manuelle Karteikarten | IMPLEMENTIERT |
| FSRS | IMPLEMENTIERT |
| Quiz/offene Fragen | IMPLEMENTIERT |
| freie Antwortbewertung | IMPLEMENTIERT; Cloud-E2E offen |
| Mastery 4 Dimensionen | IMPLEMENTIERT |
| Knowledge Gaps | IMPLEMENTIERT |
| adaptiver Tagesplan | IMPLEMENTIERT |
| Coverage | IMPLEMENTIERT |
| Exam / Exam Scope | IMPLEMENTIERT |
| Exam Readiness | IMPLEMENTIERT |
| Prüfungstermin steuert den Lernplan | IMPLEMENTIERT |
| Wiederholung bei Kontingent-Drosselung | IMPLEMENTIERT |
| Prüfungssimulation | IMPLEMENTIERT |
| Tutor | IMPLEMENTIERT |
| Tutor „Prüf mich“ | OFFEN/SHOULD |
| Speech | IMPLEMENTIERT als Progressive Enhancement, Gerätetest offen |
| Analytics | IMPLEMENTIERT, Vollständigkeitsaudit offen |
| Fortschrittsverlauf über die Zeit | IMPLEMENTIERT |
| Zusammenfassung umfangreicher Dokumente | IMPLEMENTIERT |
| Streak | IMPLEMENTIERT |
| erweiterte Gamification | OPTIONAL/OFFEN |
| JSON Backup/Restore | IMPLEMENTIERT |
| LOCAL/AUTO/CLOUD | IMPLEMENTIERT |
| Cloud-Proxy-Code | IMPLEMENTIERT |
| Cloud-Proxy live | OFFEN |
| AI-Kosten-/Nutzungslimit | OFFEN |
| AI-Nutzungsprotokoll | OFFEN |
| Knowledge Map | OPTIONAL/OFFEN |
| vollständiger iPhone/iPad Endtest | OFFEN |

## 35. Abnahmekriterien für die persönliche PWA

Die PWA gilt erst dann als vollständig abgenommen, wenn auf realem iPhone/iPad mindestens folgender End-to-End-Flow funktioniert:

1. App installieren/öffnen.
2. Modul anlegen.
3. Text-PDF importieren.
4. Scan-PDF importieren und OCR prüfen.
5. Zusammenfassung und Highlights prüfen.
6. Lernziele und Quellen prüfen.
7. automatische und manuelle Karteikarten prüfen.
8. FSRS-Review durchführen und Persistenz nach Neustart prüfen.
9. Selbsttest/offene Antwort durchführen.
10. Mastery/Gaps-Veränderung nachvollziehen.
11. Tagesplan neu erzeugen und Anpassung prüfen.
12. Prüfung anlegen, Scope/Readiness prüfen.
13. Prüfungssimulation abschließen, inklusive unbeantworteter Frage.
14. Tutor nutzen.
15. Spracheingabe testen und Textfallback prüfen.
16. Backup erstellen und Restore testen.
17. Material löschen und Cascade prüfen.
18. Offline neu öffnen und Kernfunktionen prüfen.
19. LOCAL/AUTO/CLOUD-Modi testen.
20. CLOUD nach Proxy-Deployment für alle fünf AIService-Aufgaben testen.

## 36. Offene Prioritäten ab Version 3.20

1. Cloudflare Worker tatsächlich deployen, `GEMINI_API_KEY`/`GEMINI_MODEL`/Origin setzen.
2. Cloud-Verbindung auf echtem iPhone testen.
3. Alle sechs CLOUD-AIService-Funktionen E2E testen, insbesondere `analyzeImage` mit einer echten handschriftlichen Mitschrift.
4. Tutor „Prüf mich“ an die Evidence-Pipeline anbinden.
5. AI-Kosten-/Nutzungslimit und Nutzungsprotokoll ergänzen.
6. Highlights inhaltlich gegen reale Studienunterlagen prüfen.
7. Erweiterte Gamification bewerten, soweit sie das Lernen stützt.
8. vollständigen iPhone/iPad-Abnahmetest durchführen.
9. danach Release Candidate der persönlichen PWA erstellen.

## 37. Änderungsregel

Diese Datei ist ab Version 3.15 verbindlich die **Single Source of Truth**. Frühere Phase-Dokumente und Changelogs sind historische/technische Detailquellen. Bei Widersprüchen muss entweder diese Master Specification aktualisiert oder der Widerspruch ausdrücklich als offene Entscheidung dokumentiert werden.

## Changelog 3.20

- Zusammenfassungen werden abschnittsweise erzeugt und verdichtet, statt den Quelltext bei 60.000 Zeichen abzuschneiden
- Zahl der zusammengefuehrten Abschnitte wird angezeigt, ausgelassene Abschnitte werden ausdruecklich benannt
- Fortschrittsverlauf ergaenzt: ein Messpunkt pro Modul und Lerntag mit Mastery, Coverage und Readiness
- Verlauf zeigt Veraenderung in Prozentpunkten und Sparklines auf fester Skala
- Verlauf liegt als Datensatz im settings-Store, um eine risikobehaftete Versionserhoehung ueber alle Module zu vermeiden
- Hinweis zur Migrationsfalle der modulweise festgeschriebenen DB-Version im Datenmodell ergaenzt

## Changelog 3.19

- Content Coverage und Assessment Coverage berechnet und im Fortschritt ausgewiesen
- Seiten-Relevanz wird beim Import mitgespeichert, damit Verzeichnisse nicht als Abdeckungsluecke erscheinen
- Pruefungen mit Titel, Termin und Scope aus ausgewaehlten Materialien anlegbar und entfernbar
- Exam Readiness nach der Spec-Gewichtung 25/20/40/15 berechnet, die vier Anteile werden einzeln ausgewiesen
- Stabilitaet aus den FSRS-Intervallen abgeleitet
- Lernplan gewichtet Pruefungsstoff nach Naehe zum Termin und bevorzugt ungeprueften Stoff im Scope
- Heute-Bildschirm zeigt Pruefungsbereitschaft und Countdown
- Statusangaben zu Coverage, Exam Scope und Exam Readiness von "nicht implementiert" auf implementiert korrigiert

## Changelog 3.18

- Drosselung durch das kostenlose Kontingent bricht laufende Importe nicht mehr ab
- Proxy reicht 429 und 503 samt `Retry-After` durch, statt sie als 502 zu verpacken
- PWA wiederholt gedrosselte Anfragen bis zu viermal mit wachsendem Abstand
- Wartezeit wird waehrend des Imports sichtbar gemeldet

## Changelog 3.17

- Relevanzprüfung beim Import ergänzt: Verzeichnisse, Register und zu dünne Seiten erzeugen keine Lernziele und keinen KI-Aufruf mehr
- Relevanzprüfung greift bewusst nicht bei einseitigen Importen, damit kurze Mitschriften nicht verworfen werden
- Dublettenprüfung für Lernziele innerhalb eines Dokuments ergänzt
- Karteikartenerzeugung auf Stapel von 20 Lernzielen umgestellt; zuvor gingen bei umfangreichem Material Karten stillschweigend verloren
- Importmeldung nennt jetzt übersprungene Seiten und verworfene Dubletten

## Changelog 3.16

- Bildimport ergänzt: JPEG, PNG, WebP und HEIC/HEIF als Lernmaterial
- `analyzeImage` als sechste AIService-Aufgabe aufgenommen, mit LOCAL-OCR und CLOUD-Bildverstehen
- Cloud-Proxy von OpenAI auf Gemini umgestellt, weil nur damit Bildverstehen und kostenloses Kontingent zusammenkommen
- strukturierte Ausgaben im Proxy auf `responseSchema` umgestellt, Confidence-Werte werden serverseitig begrenzt
- clientseitige Bildverkleinerung auf 1600 px ergänzt, um Kontingent und Anfragegröße zu begrenzen
- doppelten Tesseract-Loader entfernt, OCR wird zentral über den AIService bereitgestellt
- Statusangaben zu Coverage, Exam Scope und Exam Readiness gegen den Code korrigiert: diese Bereiche sind in der PWA nicht implementiert, nicht teilweise
- Kontingent- und Kostenabschnitt für den Cloud-Betrieb ergänzt, Videoanalyse ausdrücklich ausgeklammert

## Changelog 3.15

- Master Specification vollständig konsolidiert statt nur inkrementell erweitert
- ursprüngliche Produktvision und Kernlernzyklus wieder aufgenommen
- vollständige MUST/SHOULD/OPTIONAL-Zielhierarchie ergänzt
- Evidence-first-Wissenskette festgeschrieben
- Materialtypen und Importanforderungen konsolidiert
- Wissensmodell und vier Mastery-Dimensionen aufgenommen
- Zusammenfassungen, Highlights, Lernziele, Karteikarten und FSRS vollständig spezifiziert
- Selbsttests, freie Antworten, Knowledge Gaps und adaptive Planung konsolidiert
- Coverage, Exam Scope und Exam Readiness wieder als verbindliche Kernziele aufgenommen
- Prüfungssimulation, Tutor und Spracheingabe spezifiziert
- Fortschritt, Analytics und Gamification aufgenommen
- Dashboard-/Bibliotheks-/Backup-/UX-Ziele aufgenommen
- LOCAL/AUTO/CLOUD und AIService konsolidiert
- PWA-, Backend- und Native-Architektur dokumentiert
- Qualitäts-/Sicherheitsregeln und Auditpflichten festgelegt
- Gesamtstatusmatrix ergänzt
- verbindliche reale PWA-Abnahmekriterien ergänzt
- offene Prioritäten neu geordnet
