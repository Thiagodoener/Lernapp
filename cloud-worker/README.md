# Lernapp Cloud AI Proxy

Dieser Worker ist die optionale sichere CLOUD-Schicht der Lernapp. Die PWA bleibt ohne ihn vollständig im LOCAL-Modus nutzbar.

## Zweck

Der Worker nimmt nur die fünf freigegebenen semantischen Aufgaben entgegen:

- `summarize`
- `tutor`
- `generateLearningGoals`
- `generateFlashcards`
- `evaluateFreeAnswer`

Der OpenAI-API-Key liegt ausschließlich als Worker-Secret vor und wird niemals an die PWA ausgeliefert.

## Erforderliche Konfiguration

Im Worker müssen gesetzt werden:

- `OPENAI_API_KEY` als Secret
- `LERNAPP_ACCESS_KEY` als Secret, frei gewählter persönlicher Zugriffsschlüssel
- `ALLOWED_ORIGIN` als Variable, exakt die Origin der GitHub-Pages-PWA
- `OPENAI_MODEL` als Variable mit einem aktuell unterstützten OpenAI-Modell

Beispiel mit Wrangler:

```bash
cd cloud-worker
npx wrangler secret put OPENAI_API_KEY
npx wrangler secret put LERNAPP_ACCESS_KEY
```

Danach `ALLOWED_ORIGIN` und `OPENAI_MODEL` in `wrangler.toml` setzen und deployen:

```bash
npx wrangler deploy
```

Die ausgegebene `https://...workers.dev`-Adresse wird anschließend in der Lernapp unter **Profil → Cloud-Verbindung** eingetragen. Als persönlichen Zugriffsschlüssel dort denselben Wert eintragen, der als `LERNAPP_ACCESS_KEY` im Worker gespeichert wurde.

## Sicherheitsregeln

- Kein OpenAI-Key im Browser.
- CORS ist auf die konfigurierte PWA-Origin begrenzt.
- Optionaler persönlicher Zugriffsschlüssel schützt den Proxy vor fremder Nutzung.
- `store:false` wird bei OpenAI-Anfragen verwendet.
- Der Worker akzeptiert keine beliebigen Prompts oder Modellparameter vom Browser, sondern nur die fest definierten Lernapp-Aufgaben.
- Quelltexte werden serverseitig begrenzt, um Kosten und Missbrauch zu begrenzen.

## Kosten

GitHub Pages bleibt kostenlos. Der Proxy kann auf einem Cloudflare Worker betrieben werden. Der Worker selbst kann innerhalb des jeweils geltenden Free-Tiers ohne laufende Hostingkosten bleiben; Kosten können jedoch durch die verwendete externe KI-API entstehen. Die Lernapp funktioniert deshalb jederzeit auch ohne diesen Proxy im LOCAL-Modus.
