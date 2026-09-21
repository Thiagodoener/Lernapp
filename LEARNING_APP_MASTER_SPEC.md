# LEARNING_APP_MASTER_SPEC

## Version 3.31 — 21.09.2026

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

- Knowledge Map als visuelle Darstellung von Konzepten und Beziehungen — **umgesetzt**, siehe Kapitel 19.1
- weitergehende Gamification wie XP/Levels, sofern sie das Lernen unterstützt und nicht vom Kernziel ablenkt — **umgesetzt**, siehe Kapitel 20
- zusätzliche Cloud-/Provider-Optionen — offen, siehe die Providerentscheidung in Kapitel 26

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
- Das Verarbeitungsergebnis bleibt am Dokument gespeichert: gelesene und nicht lesbare Seiten samt Seitenzahlen, Leseart je Seite, übersprungene Seiten, verworfene Dubletten sowie erzeugte Lernziele und Karteikarten. Ein Hinweis, der nach zwei Sekunden verschwindet, ist kein Verarbeitungsstatus.
- Seiten-/Quellenbezug soll erhalten bleiben.
- Scan-Seiten verwenden OCR-Fallback.
- Verarbeitung darf keine halbfertigen abhängigen Daten zurücklassen.
- Importiertes Material muss wieder vollständig löschbar sein.
- Eine einzelne unlesbare Seite darf einen mehrseitigen Import nicht verwerfen. Gescheiterte Seiten werden gezählt und gemeldet, der Rest wird verarbeitet.

### Wann eine PDF-Seite als Bild gelesen wird

Eine Textebene wird nur verwendet, wenn sie tatsächlich brauchbar ist. Zwei Fälle führen sonst zur Bildauswertung über `AIService.analyzeImage()`:

- Die Seite trägt praktisch keinen Text, ist also Scan oder reine Grafik.
- Die Textebene ist verklebt. PDFs aus iOS Notizen legen zu Handschrift eine Textebene ohne Leerzeichen ab („KörperunterteiltindreigroßenWelten"). Als Merkmal dient die Zeichenzahl pro Wort: echter Fließtext liegt bei etwa sieben, eine verklebte Ebene bei über zwanzig. Ab 15 gilt die Ebene als unbrauchbar.

Damit landen Folien, Tafelbilder und handschriftliche Mitschriften im Bildverstehen statt in einer Textebene, aus der sich keine sinnvollen Lernziele bilden lassen.

### Bibliotheken liegen im Repository

PDF.js samt Worker und Standardschriften sowie ts-fsrs werden aus `vendor/` ausgeliefert statt von einem CDN. Gruende:

- Ein Web Worker darf nur von derselben Herkunft geladen werden. Vom CDN faellt PDF.js auf die Abarbeitung im Hauptstrang zurueck, was den Import spuerbar verlangsamt.
- Ohne Netz war bisher kein PDF-Import moeglich, obwohl die App ansonsten offline arbeitet.
- Der Stand ist damit reproduzierbar und pruefbar, statt von der Verfuegbarkeit eines fremden Dienstes abzuhaengen.

Verwendet wird der `legacy`-Build von pdfjs-dist 4.10.38. Neuere Fassungen setzen `Map.prototype.getOrInsertComputed` voraus, eine Funktion, die aeltere Browser-Engines nicht kennen; das Rendern einer Seite scheiterte dort mit `getOrInsertComputed is not a function`. Tesseract bleibt als reiner LOCAL-Rueckfallweg am CDN, weil seine Sprachdaten den Umfang des Repositorys sprengen wuerden.

### Aktualisierungen muessen ankommen

Der Service Worker lieferte jede Datei zuerst aus dem Cache. Eine einmal installierte Fassung blieb dadurch dauerhaft auf dem Geraet stehen, und keine Korrektur erreichte den Nutzer. Seit Fassung v22 gilt:

- App-Dateien: zuerst aus dem Netz, mit Zeitgrenze und Rueckfall auf den Cache. Damit ist die App offline weiter benutzbar, bekommt aber jede Korrektur beim naechsten Start mit Netz.
- Bibliotheken unter `vendor/`: zuerst aus dem Cache, da sie an ihre Version gebunden sind.
- Fremde Herkunft wird nicht abgefangen, damit ein zwischengespeicherter Fehlschlag nicht dauerhaft wie eine gueltige Antwort wirkt.
- Das Profil zeigt die installierte Fassung und bietet eine Schaltflaeche, die gezielt nach einer neuen sucht.
- `index.html` fordert Stylesheet und Skripte mit einer Fassungskennung an (`?v=23`). Ein bereits installierter alter Service Worker liefert nur exakt passende Adressen aus seinem Speicher; mit Kennung trifft die Anfrage dort auf nichts und geht ins Netz. Das ist der Rettungsweg fuer Geraete, die noch auf einer Fassung mit reiner Cache-Auslieferung stehen. Die Kennung wird zusammen mit `VERSION` in `sw.js` erhoeht.
- Der Offline-Rueckfall sucht mit `ignoreSearch`, weil die Dateien ohne Kennung abgelegt, aber mit Kennung angefordert werden.

### Wahl der Leseart beim PDF-Import

Eine Textebene kann vorhanden und trotzdem schlecht sein. Bei Handschrift aus iOS Notizen ist sie ueberwiegend richtig, enthaelt aber Muellstellen. Messbar von sauberem Text unterscheiden laesst sich das nicht: geprueft wurden Vokalanteil, Wiederholungen, Grossschreibung im Wortinneren und Wortlaenge, keine dieser Kennzahlen trennt die Faelle. Statt zu raten fragt die App beim PDF-Import einmal nach und merkt sich die Wahl:

- **Text verwenden:** schnell und genau bei getippten Skripten.
- **Seiten als Bild lesen:** erfasst bei Handschrift, Folien und Skizzen deutlich mehr, weil auch Zeichnungen und Tabellen beschrieben werden.

Seiten ohne Textebene laufen unabhaengig von dieser Wahl immer ueber das Bildverstehen.

### Safari und ReadableStream

Safari unterstützt bis heute keine asynchrone Iteration über einen `ReadableStream`. PDF.js liest die Textebene einer Seite genau so aus, weshalb der PDF-Import auf iPhone und iPad mit `undefined is not a function` abbrach, bevor eine einzige Seite ausgewertet war. `compat.js` ergänzt die fehlende Iteration auf Basis von `getReader()` und wird vor allen anderen Skripten geladen.

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

Die Stabilität ist eine eigene Größe neben dem Status und wird je Lernziel aus den FSRS-Intervallen seiner Karteikarten abgeleitet, nicht aus der Bewertung einzelner Antworten:

- **UNKNOWN** – zu diesem Lernziel wurde noch keine Karte wiederholt.
- **DECAYING** – eine Wiederholung ist mehr als 7 Tage überfällig, oder eine Karte ist zurückgefallen und steht wieder unter 7 Tagen Intervall. Sieben Tage, damit ein verpasstes Wochenende nicht sofort einen Zerfall meldet.
- **STABLE** – das mittlere Intervall erreicht die 30 Tage aus Kapitel 15.
- **UNSTABLE** – alles dazwischen.

Ein zerfallender Stand wird im Tagesplan höher gewichtet als ein nie geprüftes Lernziel, weil dort bereits Erarbeitetes wieder verloren geht.

Grundregel: `MASTERED` darf nur bei ausreichender Evidence und ausreichender Confidence entstehen. Niedrig-konfidente lokale Heuristiken dürfen allein kein MASTERED erzeugen.

Mastery, Stabilität und Wissenslücken werden an genau einer Stelle berechnet (`mastery.js`). Zwei Fassungen derselben Lernregel in verschiedenen Modulen laufen unweigerlich auseinander; Kapitel 3.3 und Kapitel 32 verlangen das Gegenteil.

## 7. Zusammenfassungen und Highlights

### Anforderungen

- Kurz
- Standard
- Ausführlich
- wissenschaftlich/seriös formuliert
- wichtige Inhalte priorisieren
- Quellen-/Seitenbezug erhalten
- Highlights direkt mit Quelle verbinden

Die Auswahl ist deterministisch und kostet keinen KI-Aufruf. Gewichtet wird, was in Studienmaterial den Lernstoff trägt: Definitions- und Funktionsaussagen, seltene Fachbegriffe gemessen an ihrer Häufigkeit im Dokument selbst, konkrete Zahlenangaben und eine frühe Stelle auf der Seite. Verweise und Überleitungen — „Abbildung 3 zeigt", „Im Folgenden", „vgl." — fallen ganz heraus statt nur niedriger bewertet zu werden, weil sie sonst bei wenigen Sätzen trotzdem als Highlight dastünden. Nahezu gleiche Sätze werden wie in Kapitel 8 über die Überschneidung der Inhaltswörter zusammengefasst. An der Quelle steht, warum eine Stelle hervorgehoben wurde.
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

**Offene Entscheidung nach Kapitel 37:** Voraussetzungen und Beziehungen zwischen Lernzielen (`LearningGoalPrerequisite`, `ConceptRelationship`) sind bewusst nicht modelliert. Kapitel 8 fordert sie nur „nach Möglichkeit“, und verlässliche Voraussetzungsketten ließen sich aus seitenweise erzeugten Lernzielen nicht ohne Raten bilden. Falsche Voraussetzungen würden den Lernplan schlechter steuern als gar keine. Der Punkt gehört zur Knowledge Map aus Kapitel 2 und wird mit ihr entschieden.

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

**Status:** PWA verwendet `ts-fsrs` 5.4.1 aus `vendor/` mit expliziten 21 FSRS-6-Parametern. Manuelle Karten sind implementiert. Die native Implementierung ist nicht Teil dieses Repositorys, siehe Kapitel 31.

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

Das gilt für jede Herkunft, auch für die Selbsteinschätzung im Review (`SELF_RATING`), das Multiple-Choice-Ergebnis (`OBJECTIVE`) und die lokale Prüfungsauswertung. Ohne diese Felder ließe sich ein Wissensstand später nicht mehr beurteilen; der Selbstcheck meldet unvollständige Evidenzen.

### Multiple Choice

Das Quiz entsteht aus den vorhandenen Karteikarten und fragt zuerst die schwächsten Lernziele ab. Die falschen Antwortmöglichkeiten liefert `AIService.generateChoiceOptions()`; im LOCAL-Modus und bei jedem Cloud-Fehler entstehen sie aus den Antworten der übrigen Karten desselben Moduls. Optionen, die der richtigen Antwort zu ähnlich sind, werden verworfen, damit keine zweite richtige Antwort entsteht.

Eine ausgewählte Antwort ist Wiedererkennung, kein freier Abruf. Die Evidence trägt deshalb `independentRecall: false` und wird in der Mastery nur halb gewichtet; die Confidence bleibt niedrig, weil eine richtige Antwort geraten sein kann. Das Quiz verschiebt bewusst keine FSRS-Intervalle, weil dafür die Selbsteinschätzung aus dem Review maßgeblich ist.

**Status:** gemeinsame AIService-Pipeline für Selbsttests und Prüfungssimulation implementiert. LOCAL verwendet konservative Heuristik. Die CLOUD-Bewertung ist über den echten Worker-Code end-to-end geprüft (`tests/cloud.mjs`); offen bleibt allein die Antwortqualität des tatsächlichen Modells unter realem Kontingent. Multiple Choice ist implementiert.

## 11. Wissenslücken

Die App soll Schwächen automatisch erkennen und nicht darauf warten, dass der Nutzer sie manuell markiert.

Lokale Gap-Typen umfassen:

- CRITICAL_NOT_ASSESSED
- RECALL_FAILURE
- UNDERSTANDING_FAILURE
- APPLICATION_FAILURE
- TRANSFER_FAILURE
- HIGH_UNCERTAINTY

Es gilt genau der erste zutreffende Typ dieser Reihenfolge; der Selbstcheck meldet jede offene Wissenslücke, die einen anderen Typ trägt. Eine Dimension ohne jede Evidence gilt nicht als Fehlschlag, sondern wird über die Aufgabenart `ASSESS` des Lernplans geprüft.

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

- `LEARN_NEW`
- `REVIEW_FLASHCARD`
- `REPAIR_KNOWLEDGE_GAP`
- `ASSESS` als Assessment-/Prüfaktivität

Ein `LEARN_NEW`-Task gilt nicht allein durch Lesen als fachlich beherrscht; Assessment muss Evidence liefern. Deshalb erhält jedes Lernziel, zu dem zwar Evidence vorliegt, aber nicht in allen vier Dimensionen, eine eigene `ASSESS`-Aufgabe. Ohne sie bliebe die Assessment Coverage aus Kapitel 13 dauerhaft unvollständig, weil ein einmal geprüftes Lernziel sonst nie wieder im Plan erscheint. Beherrschte Lernziele erzeugen keine Prüfaufgabe.

Je Lernziel steht höchstens eine Aufgabe im Tagesplan; die höchstbewertete gewinnt. Die Typbezeichnungen stehen im Datensatz, die Oberfläche zeigt deutsche Bezeichnungen.

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
- Tutor soll Unsicherheit transparent machen: Provider und Confidence stehen an jeder Antwort, und eine nicht vollständig quellengedeckte Antwort wird ausdrücklich als solche gekennzeichnet.
- Tutor-Verlauf wird lokal gespeichert.
- Tutorantworten erzeugen keine Mastery-Evidence.
- LOCAL bleibt kostenfrei und quellengebunden.
- CLOUD kann später hochwertigere semantische Erklärungen liefern.

**Status:** implementiert.

### Prüf mich

Aus dem Tutor heraus lässt sich eine echte Lernkontrolle starten. Sie läuft über dieselbe Bewertungspipeline wie Selbsttest und Prüfungssimulation und aktualisiert Mastery, Wissenslücken und Tagesplan.

- Die Wissensdimension ist wählbar; die Frage wird deterministisch aus dem Lernziel gebildet, damit kein zusätzlicher KI-Aufruf nur zum Formulieren nötig wird.
- Hat der Tutor zu diesem Lernziel im laufenden Verlauf bereits geantwortet, ist der Abruf nach Kapitel 32 nicht mehr unabhängig. Die Evidence wird dann mit halbem Gewicht verrechnet, statt Mastery zu überschätzen, und die App weist das im Ergebnis ausdrücklich aus.
- Spracheingabe ist als Progressive Enhancement verfügbar, Texteingabe bleibt immer nutzbar.

**Status:** implementiert.

## 18. Sprache / mündliches Erklären

Die App soll freie Erklärungen per Text ermöglichen und Spracheingabe nutzen, wenn Browser/Gerät dies unterstützt.

Regeln:

- Spracheingabe ist Progressive Enhancement.
- Texteingabe bleibt immer verfügbar.
- Transkript muss vor Bewertung sichtbar/bearbeitbar sein, wo sinnvoll.
- mündliche Erklärung wird wie andere freie Antworten über Evidence bewertet.

**Status:** SpeechRecognition in Selbsttest, Tutor-Lernkontrolle und Prüfungssimulation vorhanden, Texteingabe überall als garantierter Weg. Echter Geräte-Endtest ausstehend, weil die Erkennung eine Browserfunktion ist und sich nur am Gerät beurteilen lässt.

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

Der Fortschritt weist zusätzlich aus, wie viele Nachweise erfasst wurden, mit welcher mittleren Confidence und welcher Anteil davon unabhängiger Abruf war, wie viele Wiederholungen fällig sind, wie sich die Lernziele auf die vier Stabilitätszustände verteilen und wie die abgeschlossenen Prüfungssimulationen ausgegangen sind.

### Lernzeit, Antwortzeit und Planerfüllung

Jede Lernaktivität misst ihre eigene Antwortzeit und legt sie in der Evidence ab: Karteikarte und Quiz ab dem Anzeigen der Frage, Selbsttest und „Prüf mich“ ab der ersten Eingabe, die Prüfungssimulation ab dem Anzeigen der Frage bis zum Absenden, jeweils ohne die Wartezeit auf die Bewertung. Gemessen wird damit die reine Lernzeit, nicht die Zeit mit geöffneter App; eine Aktivität ohne gemessene Zeit wird nicht geschätzt, sondern ausgelassen.

Daraus entstehen Lernzeit heute und über sieben Tage, die mittlere Antwortzeit als Median, die Trefferquote und das Tempo je Aufgabenart sowie die Planerfüllung als Anteil erledigter Aufgaben an den Tagen, an denen überhaupt ein Plan bestand. Tage ohne Plan zählen nicht mit, weil sie die Quote sonst künstlich drücken würden.

**Status:** implementiert, MUST und SHOULD vollständig.

### 19.1 Wissenslandkarte

Die Karte zeigt, welche Fachbegriffe die Lernziele eines Moduls verbinden. Sie wird aus den vorhandenen Lernzielen abgeleitet und nicht zusätzlich gespeichert: Kapitel 29 rät von neuen Stores ab, Kapitel 5 lässt vereinfachte lokale Repräsentationen ausdrücklich zu, und eine Ableitung kostet nach Kapitel 3.5 keinen KI-Aufruf.

- **Concept** = ein Fachbegriff, der in mindestens zwei Lernzielen desselben Moduls vorkommt. Aufgabenwörter wie „erkläre" oder „beschreibe" sind ausgeschlossen.
- **ConceptRelationship** = zwei Begriffe, die sich mindestens ein Lernziel teilen.
- Die Größe eines Knotens zeigt, in wie vielen Lernzielen der Begriff vorkommt, die Farbe den Wissensstand dieser Lernziele.
- Ein angetippter Begriff führt zu seinen Lernzielen; die Karte ist damit ein Einstieg ins Lernen und keine Schauseite.

Die Zuordnung ist bewusst deterministisch. Eine von der KI geratene Begriffshierarchie wäre schlechter als gar keine, weil falsche Voraussetzungen den Lernplan in eine falsche Richtung lenken würden; siehe die offene Entscheidung in Kapitel 8.

**Status:** implementiert.

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

### Punkte, Stufen und Meilensteine

Umgesetzt unter vier Bedingungen, die sich aus dem Satz oben ergeben:

1. **Punkte entstehen ausschließlich aus Evidence.** Ein geöffneter Bildschirm, eine gelesene Zusammenfassung und eine Tutorantwort erzeugen nichts.
2. **Punkte werden abgeleitet, nicht gezählt.** Ein gespeicherter Zähler ließe sich durch wiederholtes Öffnen hochtreiben; eine Ableitung aus den vorhandenen Nachweisen nicht.
3. **Gewichtet wird wie in der Mastery.** Ergebnis und Confidence gehen ein, Wiedererkennung zählt halb, eine falsche Antwort bringt kaum etwas. Der kleine Sockel hält den Versuch selbst etwas wert, ohne dass sich mit falschen Antworten Punkte sammeln ließen.
4. **Punkte steuern nichts.** Sie verändern weder Mastery noch Wissenslücken noch den Lernplan.

Die Stufen wachsen quadratisch, damit späte Stufen etwas bedeuten. Meilensteine markieren Lernereignisse — erster Nachweis, erstes beherrschtes Lernziel, Lernserien, abgeschlossene Prüfungssimulation, erschlossener Stoff, überwiegend freier Abruf — und keine Nutzungsdauer.

**Status:** implementiert.

## 21. Dashboard / Heute

Der Heute-Bildschirm ist der operative Startpunkt.

Er soll auf einen Blick beantworten:

- Was soll ich heute lernen?
- Was ist fällig?
- Wo habe ich Schwächen?
- Wie weit bin ich?
- Wie bereit bin ich für die nächste Prüfung?

Priorität ist geringe Reibung: möglichst wenige Schritte bis zur nächsten sinnvollen Lernaktivität.

Die vier Fragen werden als Kennzahlen beantwortet: Tageserfüllung, Lernserie, Mastery, offene Schwächen mit der dringendsten Lückenart, fällige Karten und – sobald ein Termin eingetragen ist – die Prüfungsbereitschaft.

**Status:** implementiert.

## 22. Bibliothek

Bibliothek verwaltet Module und Materialien.

Funktionen:

- Module anlegen
- Materialien importieren
- Verarbeitungsstatus je Material, in der Liste verdichtet und im Material vollständig
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

Vor destruktiven Aktionen soll Backup empfohlen bzw. ermöglicht werden. Das Wiederherstellen ersetzt den gesamten lokalen Lernstand und fragt deshalb vorher nach; aus derselben Rückfrage heraus lässt sich der jetzige Stand zuerst sichern.

Proxy-Endpunkt und Zugriffsschlüssel gehören zum Gerät und stehen deshalb weder im Backup noch im Abgleich. Sonst läge der persönliche Schlüssel im Klartext in einer Datei, und ein Restore vom anderen Gerät würde die eigene Verbindung überschreiben. Beim Wiedereinlesen behält das Gerät seine eigene Verbindung.

### Abgleich zwischen Geräten

Der Abgleich ist optional und läuft über denselben eigenen Cloud-Proxy wie die KI-Aufgaben. Er verbraucht kein KI-Kontingent und wird von dessen Tageslimit auch nicht blockiert. Ohne eingerichteten Proxy bleibt die App unverändert nutzbar; der Lernstand liegt dann wie bisher nur auf dem jeweiligen Gerät.

Regeln:

- Der Proxy legt den Lernstand unter einem Schlüssel ab, der aus dem persönlichen Zugriffsschlüssel abgeleitet wird. Ohne gesetzten `LERNAPP_ACCESS_KEY` verweigert er den Abgleich, weil es sonst nur einen gemeinsamen Ablageplatz gäbe.
- Zusammengeführt wird je Datensatz, nicht als Ganzes: Datensätze beider Geräte bleiben erhalten, und nur bei demselben Datensatz gewinnt die neuere Fassung. Dafür trägt jeder Schreibvorgang ein `updatedAt`.
- Löschungen hinterlassen eine Löschmarke. Ohne sie käme ein gelöschter Datensatz beim nächsten Abgleich vom anderen Gerät zurück. Wurde ein Datensatz nach seiner Löschung noch bearbeitet, gewinnt die Bearbeitung.
- Eine Revisionsnummer verhindert, dass ein Gerät einen Stand überschreibt, den es nicht gesehen hat. Bei Konflikt führt der Client erneut zusammen, statt zu überschreiben.
- Proxy-Endpunkt und Zugriffsschlüssel werden nie übertragen. Sie gehören zum Gerät, sonst könnte ein Abgleich die eigene Verbindung kappen.
- Das leere Standardmodul eines frisch installierten Geräts weicht beim ersten Abgleich dem bereits vorhandenen Modul, damit nicht zwei Module nebeneinander stehen.
- Nutzungsprotokoll und Fortschrittsverlauf werden vereinigt statt überschrieben, weil beide Geräte eigene Einträge sammeln.

**Status:** PWA JSON Backup/Restore implementiert. Geräteabgleich implementiert; der KV-Namespace ist angelegt und in `wrangler.toml` als `LERNAPP_SYNC` gebunden. Offen bleibt der Durchlauf mit zwei echten Geräten.

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
- `generateChoiceOptions`

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
- generateChoiceOptions
- health

Daneben bedient derselbe Worker die Aufgaben `syncPull` und `syncPush` des Geräteabgleichs. Sie sind kein Modellaufruf, verbrauchen kein KI-Kontingent und liegen deshalb außerhalb der Tasktabelle.

### Kontingent und Kosten

Textaufgaben sind im kostenlosen Kontingent für den Einzelbetrieb in der Regel ausreichend abgedeckt. `analyzeImage` verbraucht pro Bild deutlich mehr Kontingent als eine Textanfrage. Werden Minuten- oder Tagesgrenzen erreicht, bleibt LOCAL der kostenfreie Fallback.

### Providerentscheidung

Geprüft wurden Anthropic (Claude), OpenAI (GPT) und Google (Gemini) als CLOUD-Provider. Ausschlaggebend war nicht der Preis pro Token — bei dem tatsächlichen Nutzungsvolumen einer Einzelperson liegen alle drei im Cent- bis niedrigen einstelligen Euro-Bereich pro Monat und der Unterschied ist praktisch irrelevant. Ausschlaggebend war, dass **nur Google ein dauerhaftes, kostenloses API-Kontingent anbietet**; Anthropic und OpenAI verlangen ab dem ersten Token Zahlung. Nur Gemini erfüllt damit das Kostenprinzip aus Kapitel 3.5 ohne jede Zahlungspflicht. Deshalb bleibt Gemini der Provider hinter dem Proxy, solange der kostenlose Betrieb Priorität hat.

Sollte künftig für einzelne Aufgaben höhere Qualität gewünscht sein — am ehesten für `evaluateFreeAnswer`, die anspruchsvollste Bewertungsaufgabe —, ist ein Wechsel kein reiner Konfigurationsschalter: Anthropic, OpenAI und Google verwenden jeweils ein anderes Anfrageformat, der Worker müsste die Aufgabe für den jeweiligen Provider neu formulieren. Eine spätere Option wäre eine Aufgaben-zu-Provider-Zuordnung, damit einzelne Aufgaben gezielt auf einen bezahlten Provider zeigen können, während der Rest kostenfrei über Gemini läuft. Bis dahin gilt: Kernbetrieb bleibt vollständig auf der kostenfreien Variante.

### Nutzungsprotokoll und Tageslimit

Jede an den Proxy gesendete Anfrage wird lokal protokolliert: Datum, Aufgabe und ob sie erfolgreich war. Gezählt werden Anfragen, nicht Aufgaben, weil eine Wiederholung nach Drosselung ebenfalls Kontingent verbraucht. LOCAL-Verarbeitung erscheint nicht im Protokoll, weil sie nichts verbraucht.

Ein optionales Tageslimit begrenzt die Cloud-Anfragen. Ist es erreicht, wechselt AUTO auf LOCAL, statt einen Fehler zu erzeugen; im Modus CLOUD nennt die App das Limit als Grund. Das Protokoll bleibt lokal und wird nicht übertragen.

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
- Offline-Zustand transparent: unterhalb der Navigation erscheint ohne Netz eine ruhige Statuszeile, die sagt, was weiterläuft und was pausiert. Sie verschwindet, sobald die Verbindung zurück ist.
- Modus LOCAL/AUTO/CLOUD transparent
- Provider-/Confidence-Information dort anzeigen, wo sie für Vertrauen relevant ist

### Gestaltung nach den Human Interface Guidelines

Die Oberfläche folgt den iOS-Gestaltungsregeln, damit sich die PWA auf dem Home-Bildschirm wie eine native App anfühlt:

- **Farben** aus der iOS-Systempalette mit vollständigem Dark Mode. `color-scheme` ist deklariert, damit auch native Bedienelemente wie Datumsauswahl und Ankreuzfelder im dunklen Erscheinungsbild korrekt dargestellt werden. `theme-color` ist für hell und dunkel getrennt gesetzt.
- **Typografie** nach der HIG-Skala: großer Titel 34 pt, Überschriften 20 bis 22 pt, Fließtext 17 pt, Fußnoten 13 pt, mit den zugehörigen Laufweiten.
- **Navigationsleiste** mit großem Titel, der beim Scrollen dem kompakten Titel weicht, auf durchscheinendem Material.
- **Listen** im Stil gruppierter Einschübe: abgerundete Gruppen, links eingerückte Haarlinien als Trenner, Chevron bei navigierenden Zeilen.
- **Tab-Bar** mit Symbolen statt Textglyphen, eingefärbtem aktivem Eintrag und durchscheinendem Material.
- **Sheets** statt zentrierter Dialoge: von unten einfahrend, mit Griff und abgerundeten oberen Ecken; ab Tablet-Breite wieder zentriert.
- **Touchziele** mindestens 44 px, mit Druckrückmeldung statt Hover.
- **Safe Areas** oben und unten werden überall berücksichtigt, ebenso `prefers-reduced-motion`.

### Erscheinungsbild

Im Profil lässt sich zwischen **Automatisch**, **Hell** und **Dunkel** wählen, wie unter iOS. Automatisch folgt der Systemeinstellung und reagiert sofort auf einen Wechsel, ohne Neuladen.

Die Wahl liegt im `localStorage` und nicht in der IndexedDB, weil sie eine Einstellung dieses Geräts ist und nicht zu den Lerndaten gehört: ein Backup soll das Erscheinungsbild eines anderen Geräts nicht überschreiben. Ein kurzes Skript im `head` setzt das wirksame Erscheinungsbild als `data-theme`, bevor gezeichnet wird; sonst blitzt beim Start kurz das falsche auf. Weil dieses Skript die Systemvorgabe bereits auflöst, existiert die Farbpalette genau einmal im Stylesheet statt doppelt gepflegt in einer Media Query. Die Farbe der Statusleiste wird mitgeführt.

Die Gestaltung liegt vollständig in `styles.css`. Module dürfen keine eigenen `style`-Blöcke einhängen, weil diese später in der Kaskade landen und das Design-System stillschweigend überschreiben würden.

## 28. Offline/PWA

Die persönliche Hauptversion ist als installierbare PWA ausgelegt:

- GitHub Pages Hosting
- Home-Screen-Installation
- Standalone-Modus
- IndexedDB
- Service Worker/App Shell
- offline-first

Externe Browserbibliotheken können beim ersten Abruf Internet benötigen und werden danach soweit möglich gecacht. Vollständige Offline-Fähigkeit insbesondere von OCR/PDF/FSRS muss auf realem Gerät geprüft werden.

Die Standardschriften von PDF.js liegen mit im Vorabspeicher, sonst scheitert das Rendern von PDFs ohne eingebettete Schriften beim ersten Gebrauch ohne Netz.

**Status:** PWA auf echtem iPhone bereits installiert und grundsätzlich standalone gestartet. Aktueller Service-Worker-Cache: v28, Fassungskennung der Skripte `?v=28`.

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

Der Mastery-Datensatz trägt neben den vier Dimensionswerten den Status, die Confidence, die Evidenzzahl sowie `stability` und `stabilityDays` nach Kapitel 6. Beides sind Felder eines bestehenden Stores und brauchten daher keine Versionserhöhung; ältere Datensätze bekommen sie bei der nächsten Neuberechnung.

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

**Widerspruch nach Kapitel 37, ausdrücklich festgehalten:** In diesem Repository existiert kein nativer Quellcodepfad. Weder SwiftUI-Quellen noch eine XcodeGen-Definition sind je Teil dieses Repositorys gewesen; die Aussagen dieses Kapitels und der Verweis in Kapitel 9 auf eine native FSRS-Abhängigkeit beschreiben einen Stand außerhalb davon. Solange das so bleibt, gilt der native Pfad hier als nicht vorhanden und nicht als offene Arbeit dieses Projekts. Die folgenden Angaben bleiben als Zielbild stehen, falls der Pfad später hinzukommt.

Zielbild: ein SwiftUI-/SwiftData-Quellcodepfad mit XcodeGen-Definition.

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

Zusätzlich liegen in `tests/` zwei Browsertests, die die Spezifikation gegen die ausgelieferte App prüfen. Kapitel 32 verlangt, dass Änderungen an Lernregeln testbar sind; ein Test, der nur in einer Arbeitssitzung existiert hat, erfüllt das nicht.

### Selbstcheck in der App

Der Selbstcheck ist im Profil ausführbar und deckt alle oben genannten Punkte ab:

| Prüfung | Inhalt |
|---|---|
| Coverage | Quellenabdeckung, Anteil der Lernziele mit Karteikarte, Anteil der geprüften Lernziele |
| Verwaiste Daten | Karten, Evidence, Mastery, Wissenslücken und Reviews ohne zugehöriges Lernziel oder Material |
| Quellenreferenzen | Lernziele, deren Seitenverweis im Material nicht existiert, sowie fehlende Quellenausschnitte |
| Dubletten | inhaltlich nahezu gleiche Lernziele je Material und mehrfach automatisch erzeugte Karten je Lernziel |
| Mastery-Invarianten | fehlende Mastery-Datensätze, falsche Evidenzzahlen, Werte außerhalb von 0 bis 1, Status ohne Evidence, `MASTERED` ohne die in Kapitel 6 geforderten Belege, unbekannter Stabilitätszustand, Evidence ohne Herkunft/Policy/Quelle nach Kapitel 10, Wissenslücken mit einem Typ außerhalb von Kapitel 11 |
| FSRS-Verträge | fehlender FSRS-Zustand, Abweichung zwischen Fälligkeit und FSRS-Zustand, unzulässige Werte |
| Import- und Lösch-Cascades | Material ohne Lernziele, Lernziele ohne Karte, Pläne und Prüfungssitzungen mit Verweisen auf gelöschte Lernziele |
| Offline-Cache | ob die tatsächlich geladenen Dateien im Cache liegen |
| Backup und Restore | zerstörungsfreier Probelauf von Serialisierung und Wiedereinlesen mit Abgleich der Datensatzzahlen |
| LOCAL/AUTO/CLOUD-Parität | ob alle sieben Aufgaben über die AIService-Abstraktion laufen, samt aktuellem Modus und Cloud-Verfügbarkeit |

Der Selbstcheck meldet ausschließlich Befunde und verändert niemals Daten. Automatisches Aufräumen ist bewusst ausgeschlossen, weil das Löschen von Lerndaten nach Kapitel 22 nur über ein Backup umkehrbar wäre.

**Status:** implementiert.

## 34. Feature-Status Gesamtübersicht

| Bereich | Zielstatus |
|---|---|
| PWA Installation / Standalone | IMPLEMENTIERT + Basis-Gerätetest |
| Offline-Zustand sichtbar | IMPLEMENTIERT |
| Verarbeitungsstatus je Material | IMPLEMENTIERT |
| Lokale Datenhaltung | IMPLEMENTIERT |
| Module/Bibliothek | IMPLEMENTIERT |
| PDF/TXT/MD Import | IMPLEMENTIERT |
| PDF-Textextraktion | IMPLEMENTIERT, im Browsertest geprüft |
| Bildverstehen für PDF-Seiten ohne brauchbare Textebene | IMPLEMENTIERT |
| Wahl der Leseart beim PDF-Import | IMPLEMENTIERT |
| Bibliotheken ohne CDN im Repository | IMPLEMENTIERT |
| Aktualisierungen erreichen installierte Geräte | IMPLEMENTIERT |
| OCR-Fallback | IMPLEMENTIERT, Geräte-Endtest offen |
| Bildimport (Foto, Mitschrift, Folie, Skizze) | IMPLEMENTIERT, Geräte-Endtest offen |
| Bildverstehen im CLOUD-Modus | IMPLEMENTIERT, Pfad im Worker-Test geprüft, Modellqualität nach Deployment offen |
| Material löschen | IMPLEMENTIERT, Cascade im Browsertest geprüft, Geräte-Endtest offen |
| Zusammenfassungen | IMPLEMENTIERT |
| Highlights | IMPLEMENTIERT mit priorisierender Auswahl, im Browsertest geprüft |
| Lernziele | IMPLEMENTIERT |
| automatische Karteikarten | IMPLEMENTIERT |
| Relevanzprüfung beim Import | IMPLEMENTIERT |
| Dublettenprüfung für Lernziele | IMPLEMENTIERT |
| Karteikartenerzeugung in Stapeln | IMPLEMENTIERT |
| manuelle Karteikarten | IMPLEMENTIERT |
| FSRS | IMPLEMENTIERT, im Browsertest geprüft |
| Quiz/offene Fragen | IMPLEMENTIERT |
| freie Antwortbewertung | IMPLEMENTIERT, Cloud-Pfad im Worker-Test geprüft |
| Mastery 4 Dimensionen | IMPLEMENTIERT |
| Stabilität je Lernziel | IMPLEMENTIERT |
| Assessment-Aufgabe im Tagesplan | IMPLEMENTIERT |
| Knowledge Gaps | IMPLEMENTIERT |
| adaptiver Tagesplan | IMPLEMENTIERT |
| Coverage | IMPLEMENTIERT |
| Exam / Exam Scope | IMPLEMENTIERT |
| Exam Readiness | IMPLEMENTIERT |
| Prüfungstermin steuert den Lernplan | IMPLEMENTIERT |
| Wiederholung bei Kontingent-Drosselung | IMPLEMENTIERT |
| Prüfungssimulation | IMPLEMENTIERT |
| Tutor | IMPLEMENTIERT |
| Tutor „Prüf mich“ | IMPLEMENTIERT |
| Speech | IMPLEMENTIERT als Progressive Enhancement, Gerätetest offen |
| Analytics | IMPLEMENTIERT inklusive Lernzeit, Antwortzeit, Fragetyp und Planerfüllung |
| Fortschrittsverlauf über die Zeit | IMPLEMENTIERT |
| Zusammenfassung umfangreicher Dokumente | IMPLEMENTIERT |
| Streak | IMPLEMENTIERT |
| erweiterte Gamification | IMPLEMENTIERT nach den Grenzen aus Kapitel 20 |
| JSON Backup/Restore | IMPLEMENTIERT |
| Multiple Choice / Quiz | IMPLEMENTIERT |
| Abgleich zwischen Geräten | IMPLEMENTIERT, mit zwei unabhängigen Clients gegen den Worker-Code geprüft |
| LOCAL/AUTO/CLOUD | IMPLEMENTIERT |
| Cloud-Proxy-Code | IMPLEMENTIERT |
| Cloud-Proxy live | IMPLEMENTIERT, Verbindung aus der PWA bestätigt |
| AI-Kosten-/Nutzungslimit | IMPLEMENTIERT |
| AI-Nutzungsprotokoll | IMPLEMENTIERT |
| Selbstcheck nach Kapitel 33 | IMPLEMENTIERT |
| iOS-Gestaltung nach HIG | IMPLEMENTIERT |
| Erscheinungsbild umschaltbar | IMPLEMENTIERT |
| Knowledge Map | IMPLEMENTIERT als abgeleitete Wissenslandkarte |
| iPhone-/iPad-Geometrie und Safari-Rückfall | IM BROWSERTEST GEPRÜFT |
| vollständiger iPhone/iPad Endtest auf echter Hardware | OFFEN, nur am Gerät möglich |

## 35. Abnahmekriterien für die persönliche PWA

Die Kriterien 1 bis 14 und 16 bis 19 sind als automatischer Browsertest in `tests/` hinterlegt und laufen bei jeder Änderung durch: `tests/e2e.mjs` fährt Import, Lernziele, Karteikarten, FSRS-Review, Evidence, Mastery, Stabilität, freie Antwort, Prüfung, Simulation, Selbstcheck und Lösch-Cascade gegen die ausgelieferte PWA, `tests/offline.mjs` den Neustart ohne Netz. Das ersetzt den Gerätetest nicht, fängt aber jede Regression vor ihm ab.

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
20. CLOUD nach Proxy-Deployment für alle sieben AIService-Aufgaben testen.

## 36. Offene Prioritäten ab Version 3.31

MUST, SHOULD und OPTIONAL dieser Spezifikation sind umgesetzt und in `tests/` gegen die ausgelieferte App geprüft. Was offen bleibt, lässt sich ausschließlich mit eigener Hardware und eigenen Konten abschließen; niemand kann es an ihrer Stelle erledigen:

1. **Abnahmetest auf echtem iPhone und iPad** nach Kapitel 35. Die Geometrie, die Touchziele und der Safari-Rückfall sind im Browsertest geprüft, die Safari-Engine selbst nicht.
2. **Cloud-Proxy deployen und mit eigenem Google-Schlüssel fahren.** Der Worker-Code ist mit allen sieben Aufgaben geprüft; offen ist die Antwortqualität des echten Modells, insbesondere `analyzeImage` an einer echten handschriftlichen Mitschrift.
3. **Geräteabgleich zwischen zwei physischen Geräten.** Die Zusammenführung ist mit zwei unabhängigen Clients gegen den Worker-Code geprüft; offen ist der Betrieb über zwei echte Installationen.
4. **Highlights an eigenen Studienunterlagen beurteilen.** Die Auswahlregel ist geprüft, ihre fachliche Treffsicherheit hängt am Material.
5. Danach Release Candidate der persönlichen PWA erstellen.

## 37. Änderungsregel

Diese Datei ist ab Version 3.15 verbindlich die **Single Source of Truth**. Frühere Phase-Dokumente und Changelogs sind historische/technische Detailquellen. Bei Widersprüchen muss entweder diese Master Specification aktualisiert oder der Widerspruch ausdrücklich als offene Entscheidung dokumentiert werden.

## Changelog 3.31

- Wissenslandkarte nach Kapitel 2 und 5: Begriffe und ihre Beziehungen werden aus den Lernzielen abgeleitet, nicht zusätzlich gespeichert, und führen per Antippen zum Lernziel
- Fortschrittspunkte, Stufen und Meilensteine nach Kapitel 20, ausschließlich aus Evidence abgeleitet und gewichtet wie die Mastery; Durchklicken bringt nichts und verändert den Wissensstand nicht
- Highlights priorisieren nach Definitionen, Fachbegriffen, Zahlenangaben und Stellung auf der Seite; Verweise und Überleitungen fallen heraus, der Grund der Hervorhebung steht an der Quelle
- Fehler behoben: der Geräteabgleich übertrug Proxy-Endpunkt und Zugriffsschlüssel doch. Die Zusammenführung hielt sie lokal fest, schrieb sie aber in den hochgeladenen Stand; der persönliche Schlüssel lag damit im Klartext beim Proxy, was Kapitel 23 ausschließt. Nebenwirkung war ein Upload bei jedem Abgleich
- Fehler behoben: drei Bedienelemente blieben unter den 44 px aus Kapitel 27; sie sehen weiterhin zierlich aus, ihr Touchziel erreicht jetzt die geforderte Größe
- sechs Testreihen in `tests/`: Abnahmekriterien, Offline-Start, alle sieben CLOUD-Aufgaben gegen den echten Worker-Code, Geräteabgleich mit zwei Clients, iPhone-/iPad-Geometrie samt Safari-Rückfall und die optionalen Teile
- Kapitel 36 nennt nur noch, was ohne eigene Hardware und eigene Konten nicht abschließbar ist

## Changelog 3.30

- Stabilität nach Kapitel 6 ist implementiert: je Lernziel UNKNOWN/UNSTABLE/STABLE/DECAYING aus den FSRS-Intervallen, sichtbar im Lernziel und im Fortschritt, und im Tagesplan höher gewichtet als ein nie geprüftes Lernziel
- Mastery-, Stabilitäts- und Lückenregel liegen jetzt einmal in `mastery.js` statt doppelt in `app.js` und `free-answer-ai.js`
- Wissenslücken tragen die Typnamen aus Kapitel 11 und werden in der Oberfläche deutsch benannt
- Tagesplan kennt die Aufgabenart `ASSESS` aus Kapitel 12: ein Lernziel mit unvollständig geprüften Dimensionen bekommt eine eigene Prüfaufgabe, statt aus dem Plan zu verschwinden
- jede Evidence trägt Herkunft, Bewertungs-Policy und Quelle nach Kapitel 10, auch aus Review, Quiz und lokaler Prüfungsauswertung
- Heute zeigt offene Schwächen und fällige Karten, Fortschritt zusätzlich Stabilitätsverteilung, Zahl und Qualität der Nachweise sowie die abgeschlossenen Prüfungssimulationen
- Backup enthält Proxy-Endpunkt und Zugriffsschlüssel nicht mehr, und ein Restore behält die Verbindung dieses Geräts
- Selbstcheck prüft Stabilitätszustand, Evidenzherkunft und zulässige Lückentypen
- `package.json` pinnt wieder pdfjs-dist 4.10.38; der Eintrag 6.3.289 hätte beim nächsten Neu-Vendorn die in 3.28 behobene Regression zurückgeholt
- Standardschriften von PDF.js liegen im Vorabspeicher des Service Workers
- Lernzeit, mittlere Antwortzeit, Trefferquote und Tempo je Aufgabenart sowie Planerfüllung ergänzen den Fortschritt; damit sind die SHOULD-Kennzahlen aus Kapitel 19 vollständig
- Offline-Zustand ist nach Kapitel 27 sichtbar, statt sich nur in fehlschlagenden Cloud-Aufrufen zu zeigen
- Verarbeitungsstatus bleibt am Material gespeichert und ist in Bibliothek und Materialansicht einsehbar
- Tutorantworten ohne vollständige Quellendeckung sind als solche gekennzeichnet
- Kapitel 31 hält fest, dass der native Quellcodepfad nicht Teil dieses Repositorys ist; die Spezifikation behauptete bisher seine Existenz
- zwei Browsertests in `tests/` prüfen die Abnahmekriterien aus Kapitel 35, soweit sie ohne Gerät und ohne deployten Proxy prüfbar sind, samt echtem PDF-Import über das vendorierte PDF.js
- Wiederherstellen eines Backups fragt vorher nach und bietet an, den jetzigen Stand zuerst zu sichern
- Gestaltung liegt wieder vollständig im Stylesheet; die letzten festen Abstände im Markup sind verschwunden
- geprüft im Browser: Lernzyklus von Evidence bis Mastery, Stabilitätsregel in allen vier Zuständen, Tagesplan mit allen Aufgabenarten, alle zehn Selbstchecks ohne Konsolenfehler

## Changelog 3.29

- Fassungskennung an Stylesheet und Skripten, damit Geraete mit altem Service Worker die Korrekturen ueberhaupt laden koennen
- Offline-Rueckfall und Selbstcheck suchen mit ignoreSearch, sodass der Start ohne Netz weiter funktioniert
- geprueft: Start mit Kennung, Anzeige der Fassung im Profil und vollstaendiger Offline-Start

## Changelog 3.28

- PDF.js, dessen Worker, Standardschriften und ts-fsrs liegen als vendor/ im Repository statt am CDN
- pdfjs-dist auf den legacy-Build 4.10.38 gesetzt: neuere Fassungen brauchen Map.prototype.getOrInsertComputed und scheiterten beim Rendern
- Service Worker liefert App-Dateien network-first, damit Korrekturen installierte Geraete ueberhaupt erreichen
- Profil zeigt die installierte Fassung und sucht auf Wunsch nach einer neuen
- PDF-Import fragt einmal nach der Leseart und merkt sich die Wahl
- geprueft mit den echten Dateien: 12-seitiges PDF ergibt 7 Seiten aus der Textebene und 5 ueber das Bildverstehen

## Changelog 3.27

- PDF-Import auf iPhone und iPad repariert: Safari kennt keine asynchrone Iteration ueber ReadableStream, worauf PDF.js beim Lesen der Textebene sofort abbrach
- Seiten ohne brauchbare Textebene laufen jetzt ueber AIService.analyzeImage statt ueber eine zweite OCR-Implementierung im Import
- verklebte Textebenen aus iOS Notizen werden an der Zeichenzahl pro Wort erkannt und als Bild ausgewertet
- Relevanzpruefung von 40 auf 12 Woerter gesenkt und Ziffernanteil auf 30 Prozent angehoben, weil Folien und Mitschriften sonst komplett verworfen wurden
- verwirft die Relevanzpruefung jede Seite eines Dokuments, wird sie fuer dieses Dokument verworfen statt ein leeres Ergebnis zu liefern
- eine gescheiterte Seite kostet nicht mehr den ganzen Import
- Tesseract-Worker bleibt zwischen den Seiten eines Dokuments bestehen
- Selbstcheck prueft jetzt auch nicht-modulare Skripte im Offline-Cache

## Changelog 3.26

- Multiple-Choice-Quiz aus den vorhandenen Karteikarten, Distraktoren aus der Cloud mit lokalem Rueckfallweg
- Quizergebnis zaehlt als Wiedererkennung und wird in der Mastery halb gewichtet, FSRS-Intervalle bleiben unberuehrt
- optionaler Abgleich zwischen Geraeten ueber den eigenen Cloud-Proxy, datensatzweise zusammengefuehrt statt ueberschrieben
- Loeschmarken, damit geloeschte Inhalte nicht vom anderen Geraet zurueckkommen
- Verbindungsdaten des Proxys bleiben geraeteeigen und werden nie mit abgeglichen
- ALLOWED_ORIGIN und GEMINI_MODEL liegen in der wrangler.toml, damit ein Deploy aus dem Repository die Worker-Variablen nicht loescht

## Changelog 3.25

- Providerentscheidung dokumentiert: Anthropic, OpenAI und Google verglichen, Ausschlag gab das dauerhafte kostenlose Kontingent von Google, nicht der Preis pro Token
- festgehalten: Kernbetrieb bleibt vollstaendig auf der kostenfreien Gemini-Variante, solange keine bewusste Entscheidung fuer bezahlte Zusatzqualitaet einzelner Aufgaben getroffen wird
- als spaetere Option vermerkt: Aufgaben-zu-Provider-Zuordnung, falls einzelne Aufgaben wie evaluateFreeAnswer spaeter gezielt einen bezahlten Provider nutzen sollen

## Changelog 3.24

- Erscheinungsbild im Profil umschaltbar: Automatisch, Hell, Dunkel
- Automatisch folgt der Systemeinstellung und reagiert ohne Neuladen auf einen Wechsel
- Wahl greift vor dem ersten Zeichnen, dadurch blitzt beim Start kein falsches Erscheinungsbild auf
- Farbe der Statusleiste folgt der Wahl
- Farbpalette liegt nur noch einmal im Stylesheet statt doppelt in einer Media Query

## Changelog 3.23

- Oberflaeche vollstaendig auf die iOS-Gestaltungsregeln umgestellt: Systemfarben, HIG-Typografie, gruppierte Listen, grosser Titel mit Einklappen beim Scrollen, Tab-Bar mit Symbolen, Sheets statt zentrierter Dialoge
- schwerer Dark-Mode-Fehler behoben: der Dialog behielt den weissen Standardhintergrund, wodurch dunkle Inhalte unlesbar wurden
- color-scheme deklariert, damit native Bedienelemente im dunklen Erscheinungsbild stimmen; theme-color fuer hell und dunkel getrennt
- doppelte Zusammenfassungs-Oberflaeche im Material-Sheet entfernt; die Zusammenfassung liefert allein summaries-ai.js
- Dialog nutzt kein form method=dialog mehr, dadurch schliesst die Eingabetaste in Textfeldern nicht mehr das Sheet und verwirft die Eingabe
- 189 Zeilen toter Importcode aus app.js entfernt, der die Pipeline aus import-ai.js duplizierte
- toter lokaler Selbsttest-Pfad in openGoal entfernt; die Auswertung laeuft ausschliesslich ueber die AIService-Pipeline
- style-Bloecke aus sechs Modulen entfernt, die das zentrale Design-System ueberschrieben haben
- Abstand unter der Tab-Bar beruecksichtigt jetzt die Safe Area

## Changelog 3.22

- Selbstcheck aus Kapitel 33 als ausfuehrbare Pruefung im Profil ergaenzt
- geprueft werden Coverage, verwaiste Daten, Quellenreferenzen, Dubletten, Mastery-Invarianten, FSRS-Vertraege, Cascades, Offline-Cache, Backup und Provider-Paritaet
- Backup-Pruefung laeuft als zerstoerungsfreier Probelauf ohne Datenaenderung
- Offline-Cache wird gegen die tatsaechlich geladenen Dateien geprueft statt gegen eine zweite Liste neben dem Service Worker
- Selbstcheck repariert bewusst nichts automatisch, weil Loeschen von Lerndaten nur ueber ein Backup umkehrbar ist

## Changelog 3.21

- Tutor-„Pruef mich" ergaenzt: echte Lernkontrolle ueber die gemeinsame Bewertungspipeline
- Evidence aus dem Tutor zaehlt nur halb, wenn der Tutor zuvor bereits erklaert hat, und die App weist das aus
- evaluateAndPersist nimmt independentRecall jetzt als ausdruecklichen Parameter statt es fest auf true zu setzen
- KI-Nutzungsprotokoll ergaenzt: Anfragen pro Tag und Aufgabe, im Profil einsehbar
- optionales Tageslimit fuer Cloud-Anfragen; bei Erreichen faellt AUTO auf LOCAL zurueck
- CLOUD nennt bei Nichtverfuegbarkeit den tatsaechlichen Grund statt einer pauschalen Meldung
- Mehrfacheinfuegung der Profilkarten behoben: Karten werden vor dem ersten await eingehaengt

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
