# Lernapp Cloud AI Proxy

Dieser Worker ist die optionale sichere CLOUD-Schicht der Lernapp. Die PWA bleibt ohne ihn vollständig im LOCAL-Modus nutzbar.

## Zweck

Der Worker nimmt nur die sechs freigegebenen semantischen Aufgaben entgegen:

- `summarize`
- `tutor`
- `generateLearningGoals`
- `generateFlashcards`
- `evaluateFreeAnswer`
- `analyzeImage`

Der Gemini-API-Key liegt ausschließlich als Worker-Secret vor und wird niemals an die PWA ausgeliefert.

## Warum Gemini

Gemini verarbeitet Bilder nativ im selben Aufruf wie Text. Das ist die Voraussetzung für `analyzeImage`, mit dem Fotos von Mitschriften, Folien, Skizzen und Tafelbildern zu lernbarem Text werden. Zusätzlich existiert ein kostenloses Kontingent, mit dem der persönliche Einzelbetrieb ohne laufende Kosten möglich bleibt.

## Erforderliche Konfiguration

Im Worker müssen gesetzt werden:

- `GEMINI_API_KEY` als Secret
- `LERNAPP_ACCESS_KEY` als Secret, frei gewählter persönlicher Zugriffsschlüssel
- `ALLOWED_ORIGIN` als Variable, exakt die Origin der GitHub-Pages-PWA
- `GEMINI_MODEL` als Variable mit einem aktuell unterstützten Gemini-Modell

Beispiel mit Wrangler:

```bash
cd cloud-worker
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put LERNAPP_ACCESS_KEY
```

Danach `ALLOWED_ORIGIN` und `GEMINI_MODEL` in `wrangler.toml` setzen und deployen:

```bash
npx wrangler deploy
```

Die ausgegebene `https://...workers.dev`-Adresse wird anschließend in der Lernapp unter **Profil → Cloud-Verbindung** eingetragen. Als persönlichen Zugriffsschlüssel dort denselben Wert eintragen, der als `LERNAPP_ACCESS_KEY` im Worker gespeichert wurde.

## Sicherheitsregeln

- Kein Gemini-Key im Browser.
- CORS ist auf die konfigurierte PWA-Origin begrenzt.
- Optionaler persönlicher Zugriffsschlüssel schützt den Proxy vor fremder Nutzung.
- Der Worker akzeptiert keine beliebigen Prompts oder Modellparameter vom Browser, sondern nur die fest definierten Lernapp-Aufgaben.
- Quelltexte werden serverseitig begrenzt, um Kosten und Missbrauch zu begrenzen.
- Bilder werden auf freigegebene MIME-Typen und auf eine maximale Größe begrenzt.

## Kosten

GitHub Pages bleibt kostenlos. Der Proxy läuft auf einem Cloudflare Worker im Free-Tier ohne laufende Hostingkosten.

Für die KI-Aufrufe gilt: Text-Aufgaben sind im kostenlosen Gemini-Kontingent für den persönlichen Einzelbetrieb in der Regel ausreichend abgedeckt. `analyzeImage` verbraucht pro Bild deutlich mehr Kontingent als eine Textanfrage. Die PWA verkleinert Bilder deshalb vor dem Versand. Wer sehr viele Bilder importiert, kann die Tages- oder Minutengrenzen des kostenlosen Kontingents erreichen; in diesem Fall greift der LOCAL-Modus als kostenfreier Fallback.

Die Lernapp funktioniert jederzeit auch ohne diesen Proxy im LOCAL-Modus.
