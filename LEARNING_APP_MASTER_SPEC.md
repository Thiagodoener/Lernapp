# LEARNING_APP_MASTER_SPEC

## Version 3.14 — 10.09.2026

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
- für höchste semantische Qualität vorbereitet
- nutzt ausschließlich einen sicheren Backend-/Proxy-Endpunkt
- der eigentliche KI-API-Schlüssel bleibt serverseitig und wird niemals im Browser gespeichert

## AIService

**Status: IMPLEMENTIERT**

Zentrale Schnittstellen:
- `summarize`
- `tutor`
- `generateLearningGoals`
- `generateFlashcards`
- `evaluateFreeAnswer`

Cloud- und Local-Verarbeitung bleiben vollständig hinter dieser Schnittstelle gekapselt.

Zusätzlich implementiert:
- persistierter Cloud-Endpoint in den lokalen App-Einstellungen
- optionaler persönlicher Zugriffsschlüssel für den Proxy
- `testCloud()`-Verbindungstest
- transparente Cloud-Verfügbarkeitsanzeige
- AUTO fällt bei fehlender Cloud-Verbindung weiterhin auf LOCAL zurück

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

Gemeinsame Evidence-Pipeline speichert Score, Confidence, Provider, Evaluations-Policy, Feedback, Wissensdimension, Quelle sowie bei Prüfungen Exam-/Session-/Item-Referenzen. Danach werden Mastery und Knowledge Gap deterministisch neu berechnet und der Tagesplan invalidiert.

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
- konservative Confidence

Tutor-Verlauf wird lokal pro Lernziel gespeichert. Tutor-Antworten verändern Mastery nicht automatisch.

## Sichere Cloud-Anbindung

**Status: CODESEITIG IMPLEMENTIERT, DEPLOYMENT NOCH AUSSTEHEND**

Als Referenzimplementierung ist ein Cloudflare-Worker-Proxy unter `cloud-worker/` enthalten.

Sicherheitsregeln:
- OpenAI-API-Key nur als `OPENAI_API_KEY` Worker-Secret
- optionaler persönlicher `LERNAPP_ACCESS_KEY` als separates Worker-Secret
- PWA speichert nur Proxy-URL und optional den persönlichen Proxy-Zugriffsschlüssel lokal
- kein API-Key im öffentlich ausgelieferten GitHub-Pages-Code
- CORS kann mit `ALLOWED_ORIGIN` auf die PWA-Origin begrenzt werden
- Browser darf keine beliebigen Prompts oder Modellparameter an den Proxy schicken; nur die fest definierten Lernapp-Aufgaben sind zulässig
- OpenAI-Anfragen verwenden `store:false`
- serverseitige Textlimits begrenzen Kosten und Missbrauch
- strukturierte JSON-Ausgaben werden per JSON-Schema angefordert und serverseitig geparst

Unterstützte Proxy-Aufgaben:
- `summarize`
- `tutor`
- `generateLearningGoals`
- `generateFlashcards`
- `evaluateFreeAnswer`
- `health` für den Verbindungstest

### Cloud-Konfiguration in der PWA

Im Profil existiert nun eine eigene Karte **Cloud-Verbindung** mit:
- Proxy-Endpunkt
- persönlichem Zugriffsschlüssel
- Speichern
- Verbindung testen
- Cloud-Verbindung entfernen

Der Zugriffsschlüssel ist nicht der OpenAI-Key. Er schützt lediglich den persönlichen Proxy vor fremder Nutzung und wird nur lokal im Browser gespeichert.

## Architekturregel

Tutor-Antworten, Zusammenfassungen und generierte Inhalte dürfen den deterministischen Mastery-Zustand nicht direkt setzen. Mastery wird nur aus Evidence abgeleitet.

## Kostenprinzip

Datenhaltung, Coverage, Lernplanung, Fortschritt, FSRS, Statistiken und Statusübergänge bleiben ohne kostenpflichtige Cloud-KI nutzbar. GitHub Pages verursacht in der aktuellen persönlichen Nutzung keine laufenden App-Kosten. Der optionale Proxy kann innerhalb eines geeigneten Free-Tiers betrieben werden; externe KI-API-Nutzung kann trotzdem verbrauchsabhängige Kosten verursachen.

## Nächste Implementierungsschritte

1. Cloudflare Worker tatsächlich deployen und Secrets/Variablen setzen.
2. Cloud-Endpunkt in der PWA hinterlegen und `health`-Test auf echtem iPhone durchführen.
3. Einen echten CLOUD-Test pro Funktion durchführen: Summary, Tutor, Lernziele, Karteikarten, freie Antwort.
4. Kosten-/Nutzungslimit pro Monat und transparente Anzeige ergänzen.
5. AI-Nutzungsprotokoll und Qualitäts-/Kostenmetriken ergänzen.
6. Danach systematischer iPhone/iPad-Endtest des gesamten PWA-Flows.

## Changelog 3.14

- persistente Cloud-Proxy-Konfiguration in `AIService` ergänzt
- persönlicher Proxy-Zugriffsschlüssel unterstützt
- HTTPS-Endpoint-Validierung ergänzt
- `testCloud()`-Healthcheck ergänzt
- neue Profilkarte `Cloud-Verbindung` ergänzt
- neue Datei `cloud-settings.js`
- Cloudflare-Worker-Referenzimplementierung unter `cloud-worker/src/index.js` ergänzt
- Worker akzeptiert nur fünf freigegebene Lernapp-KI-Aufgaben plus Healthcheck
- OpenAI-Key bleibt ausschließlich im Worker-Secret
- CORS-Origin und persönlicher Zugriffsschlüssel als Schutzmechanismen ergänzt
- strukturierte JSON-Schemas für alle Cloud-Aufgaben ergänzt
- OpenAI-Aufrufe verwenden `store:false`
- Deployment-Anleitung unter `cloud-worker/README.md` ergänzt
- PWA-Cache auf v10 angehoben
