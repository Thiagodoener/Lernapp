# Browsertests

Die Tests fahren die ausgelieferte PWA in einem echten Browser, nicht einzelne
Funktionen. Sie decken die Abnahmekriterien aus Kapitel 35 der
Masterspezifikation ab, soweit sie ohne iPhone, iPad und ohne deployten
Cloud-Proxy prüfbar sind.

## Voraussetzungen

```bash
npm install --no-save playwright
npx playwright install chromium   # entfällt, wenn ein Chromium bereits vorhanden ist
```

## Ausführen

```bash
npx http-server -p 8099 -s .      # in einem zweiten Terminal laufen lassen
node tests/all.mjs                # alle Reihen nacheinander
```

Einzeln:

```bash
node tests/e2e.mjs        # Abnahmekriterien aus Kapitel 35
node tests/offline.mjs    # Offline-Zustand und Neustart ohne Netz
node tests/cloud.mjs      # alle sieben CLOUD-Aufgaben gegen den echten Worker
node tests/sync.mjs       # Geräteabgleich mit zwei unabhängigen Clients
node tests/import.mjs     # Import eines 24-seitigen Skriptes über den Proxy
node tests/mobile.mjs     # iPhone-/iPad-Geometrie und Safari-Rückfall
node tests/optional.mjs   # Wissenslandkarte und Gamification
```

Beide Tests beenden sich mit Rückgabewert 1, sobald eine Prüfung fehlschlägt
oder die Seite einen Konsolenfehler meldet.

## Was `e2e.mjs` prüft

Start, Standardmodul, PDF-Import über das vendorierte PDF.js samt Textebene,
Lernziele mit Quellenbezug, Karteikarten, Verarbeitungsstatus, FSRS-Review mit
neuer Fälligkeit, Evidence mit Herkunft, Policy, Quelle und gemessener
Antwortzeit, Mastery und Stabilität, freie Antwort über die AIService-Pipeline,
Prüfung mit Termin und Bereitschaft samt ihrer vier Anteile,
Prüfungssimulation mit unbeantworteter Frage als 0, Tagesplan, den Selbstcheck
nach Kapitel 33 und die vollständige Lösch-Cascade.

Der Durchlauf läuft im Modus LOCAL, also ohne Cloud-Kontingent. Die
CLOUD-Aufgaben nach Kapitel 26 brauchen einen deployten Proxy und werden hier
nicht abgedeckt.

## Was `offline.mjs` prüft

Sichtbarkeit des Offline-Zustands nach Kapitel 27 und den Neustart ohne Netz
aus dem Service-Worker-Cache nach Kapitel 28.

## Was `cloud.mjs` und `sync.mjs` prüfen

`worker-harness.mjs` fährt den echten Proxy aus `cloud-worker/src/index.js` in
Node. Ersetzt sind nur das Modell und der KV-Speicher: die Antwort des
Ersatzmodells wird aus dem `responseSchema` gebildet, das der Worker selbst
mitschickt. Getestet wird damit der Worker-Code, nicht ein Nachbau.

`cloud.mjs` prüft alle sieben AIService-Aufgaben im Modus CLOUD, den
Healthcheck, den Zugriffsschlüssel, das Nutzungsprotokoll, das Tageslimit, den
AUTO-Rückfall auf LOCAL und die Wiederholung nach Drosselung.

`sync.mjs` spielt den Geräteabgleich mit zwei unabhängigen Browserkontexten
durch: leeres Standardmodul, Zusammenführung je Datensatz, Löschmarken,
Revisionskonflikt und die Vereinigung des Fortschrittsverlaufs.

Was diese Reihen **nicht** abdecken: die Antwortqualität des echten Modells und
das Verhalten unter dem tatsächlichen Kontingent. Dafür braucht es ein
Deployment mit eigenem Google-Schlüssel.

## Was `import.mjs` prüft

Import eines 24-seitigen Skriptes im Modus CLOUD gegen den echten Worker-Code:
wie viele KI-Aufrufe er kostet (gebündelt statt Seite für Seite), ob die
Lernziele die richtige Seite tragen, ob der Tokenverbrauch ankommt, und was
passiert, wenn die Cloud mitten im Import ausfällt — Blatt statt Browserdialog,
keine laufende Fortschrittszeile, kein halbfertiges Material.

## Was `mobile.mjs` prüft

iPhone- und iPad-Geometrie, waagerechten Überlauf, Touchziele nach Kapitel 27,
Erscheinungsbild und den Safari-Rückfall aus `compat.js`, indem die asynchrone
Iteration über `ReadableStream` vor dem Laden entfernt wird.

Wichtige Einschränkung: hier läuft Chromium mit iPhone- und iPad-Kennwerten,
nicht WebKit. Das Verhalten der Safari-Engine selbst bleibt am echten Gerät zu
prüfen.

## Was `optional.mjs` prüft

Wissenslandkarte und Fortschrittspunkte samt der Grenze aus Kapitel 20:
Durchklicken durch die App darf keine Punkte bringen und den Wissensstand nicht
verändern.
