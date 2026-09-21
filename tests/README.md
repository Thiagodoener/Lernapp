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
node tests/e2e.mjs
node tests/offline.mjs
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
