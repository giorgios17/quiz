# Quiz degli sposi

Quiz in tempo reale per il matrimonio: gli invitati entrano dal telefono tramite QR, tu controlli tutto dallo schermo.

- `host.html`: pagina da proiettare (QR, contatore, domande, classifica). Il tasto in basso a destra, oppure **Spazio / Invio / →**, fa avanzare il quiz.
- `play.html`: pagina che gli invitati aprono dal telefono (il QR punta qui).
- `questions.js`: le domande. `config.js`: nomi degli sposi, tempo per domanda, Firebase.

## Provare subito (demo locale)

Senza configurare nulla il quiz funziona tra schede dello stesso browser.

```bash
python -m http.server 8000
```

Apri `http://localhost:8000/host.html` e, in un'altra scheda, `http://localhost:8000/play.html`.

## Configurare Firebase (gratis)

1. Vai su https://console.firebase.google.com e crea un progetto (puoi disattivare Google Analytics).
2. **Build → Realtime Database → Crea database** (scegli una regione europea, avvia in modalità *bloccata*).
3. Scheda **Regole**: incolla il contenuto di `database.rules.json` e premi *Pubblica*.
4. **Impostazioni progetto (ingranaggio) → Le tue app → Web (`</>`)**: registra un'app e copia l'oggetto `firebaseConfig`.
5. Incollalo in `config.js` al posto di `null` (assicurati che ci sia anche `databaseURL`).

## Pubblicare su GitHub Pages

1. Crea un repository su GitHub e carica tutti questi file.
2. **Settings → Pages → Deploy from a branch → `main` / root**.
3. Dopo un minuto il sito è su `https://TUOUTENTE.github.io/NOME-REPO/`. Apri `host.html` da lì sul portatile collegato al proiettore: il QR punterà in automatico a `play.html`.

## Il giorno del matrimonio

- Prova tutto prima con alcuni amici; premi **Reset** per azzerare partecipanti e punteggi.
- Tieni pronto un hotspot del telefono come riserva per il portatile.
- Se ricarichi `host.html` durante il gioco, riprende dallo stesso punto.
- Le risposte giuste non vengono mai inviate ai telefoni prima della rivelazione.
- Non condividere il link a `host.html`: chi lo apre può controllare il quiz.

## Punteggio

Risposta giusta: 500 punti + fino a 500 di bonus per la velocità. Quando tutti hanno risposto, la risposta viene mostrata subito.
