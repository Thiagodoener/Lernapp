# Lernapp Cloud AI Proxy

Dieser Worker ist die optionale sichere CLOUD-Schicht der Lernapp. Die PWA bleibt ohne ihn vollständig im LOCAL-Modus nutzbar.

## Zweck

Der Worker nimmt nur die sieben freigegebenen semantischen Aufgaben entgegen:

- `summarize`
- `tutor`
- `generateLearningGoals`
- `generateFlashcards`
- `evaluateFreeAnswer`
- `analyzeImage`
- `generateChoiceOptions`

Der Gemini-API-Key liegt ausschließlich als Worker-Secret vor und wird niemals an die PWA ausgeliefert.

Zusätzlich beantwortet der Worker `syncPull` und `syncPush` für den optionalen Abgleich zwischen Geräten. Das sind keine Modellaufrufe: sie verbrauchen kein Gemini-Kontingent.

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

`ALLOWED_ORIGIN` und `GEMINI_MODEL` stehen in `wrangler.toml`. Sie gehören dorthin und nicht nur ins Dashboard: ein Deploy aus dem Repository setzt die Variablen des Workers auf genau den Stand dieser Datei und würde im Dashboard gesetzte Werte sonst entfernen.

`ALLOWED_ORIGIN` ist die Origin der PWA, also Schema und Host **ohne Pfad und ohne abschließenden Schrägstrich**. Der Browser sendet den `Origin`-Header genau so; ein zusätzlicher Schrägstrich führt zu `Origin nicht erlaubt`.

Danach deployen:

```bash
npx wrangler deploy
```

Die ausgegebene `https://...workers.dev`-Adresse wird anschließend in der Lernapp unter **Profil → Cloud-Verbindung** eingetragen. Als persönlichen Zugriffsschlüssel dort denselben Wert eintragen, der als `LERNAPP_ACCESS_KEY` im Worker gespeichert wurde.

Wird der Worker über das Dashboard angelegt, muss die `workers.dev`-Adresse unter **Domains** zusätzlich aktiviert werden. Solange dort „No URLs enabled“ steht, ist der Worker nicht erreichbar.

## Abgleich zwischen Geräten

Der Abgleich ist optional. Ohne ihn läuft die App unverändert, der Lernstand bleibt dann nur auf dem jeweiligen Gerät.

Dafür braucht der Worker einen KV-Namespace:

```bash
cd cloud-worker
npx wrangler kv namespace create LERNAPP_SYNC
```

Die ausgegebene ID in `wrangler.toml` im auskommentierten Block `[[kv_namespaces]]` eintragen, den Block aktivieren und erneut deployen. Danach erscheint der Abgleich in der Lernapp unter **Profil → Abgleich zwischen Geräten**.

Eigenschaften:

- Der Lernstand liegt unter einem Schlüssel, der aus dem SHA-256 des Zugriffsschlüssels abgeleitet wird. Ohne `LERNAPP_ACCESS_KEY` verweigert der Worker den Abgleich.
- Der Worker speichert den Stand unverändert und wertet ihn nicht aus. Zusammengeführt wird ausschließlich in der PWA.
- Eine Revisionsnummer verhindert, dass ein Gerät einen Stand überschreibt, den es nicht gesehen hat.
- Ein Stand darf höchstens 20 MB groß sein.

Fehlt die KV-Bindung, laufen alle KI-Aufgaben normal weiter und nur der Abgleich meldet, dass er nicht eingerichtet ist.

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
