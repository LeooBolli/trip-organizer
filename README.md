# Trip Organizer

App web (PWA) per organizzare viaggi in due: spese condivise, prenotazioni
(voli/hotel/auto) con documenti allegati, itinerario giorno per giorno,
valigia/checklist, consigli e piano anti jet lag, tema chiaro/scuro, export
Excel. Sincronizzazione in tempo reale tramite Supabase. Nessun server da
gestire: solo GitHub Pages (hosting statico) + Supabase (backend).

## 1. Crea il progetto Supabase

1. Vai su https://supabase.com, crea un account e un nuovo progetto (gratuito).
2. Nel progetto, apri **SQL Editor** → **New query**, incolla il contenuto di
   [`supabase/schema.sql`](supabase/schema.sql) ed esegui (RUN).
   Questo crea le tabelle, le policy di sicurezza e il bucket di storage.
   Se avevi già eseguito questo script in una versione precedente dell'app
   (prima che esistessero Itinerario/Valigia), non rieseguirlo per intero:
   nel file trovi un blocco marcato **"MIGRAZIONE"** subito dopo la creazione
   delle tabelle `itinerary_items`/`packing_items` — esegui solo quello.
3. Vai su **Authentication → Providers** e assicurati che **Email** sia
   abilitato. In **Authentication → URL Configuration**, imposta l'URL
   dell'app (lo saprai dopo aver attivato GitHub Pages, es.
   `https://tuo-utente.github.io/trip-organizer/`) come **Site URL** e in
   **Redirect URLs**.
4. Vai su **Authentication → Providers → Email** e **disabilita "Allow new
   users to sign up"** dopo aver creato i vostri due account (vedi punto 6),
   così nessun altro potrà registrarsi.
5. Vai su **Project Settings → API**: copia **Project URL** e **anon public
   key**.
6. Crea i due utenti: **Authentication → Users → Add user**, uno per te e uno
   per la tua compagna. Imposta email e **password** per ciascuno e spunta
   **"Auto Confirm User"** (altrimenti l'account resta in attesa di conferma
   email). Queste sono le uniche credenziali che potranno accedere all'app.

## 2. Configura l'app

Apri [`js/config.js`](js/config.js) e compila:

```js
SUPABASE_URL: "https://xxxxxxxx.supabase.co",
SUPABASE_ANON_KEY: "eyJ...",
ALLOWED_EMAILS: ["tua-email@esempio.com", "email-compagna@esempio.com"],
```

`ALLOWED_EMAILS` è un controllo extra lato app (solo un messaggio d'errore
più chiaro): la sicurezza reale è data dal fatto che esistono solo i due
account che create voi, con "Allow new users to sign up" disabilitato.

## 3. Metti il codice su GitHub

```bash
cd trip-organizer
git init
git add .
git commit -m "Prima versione Trip Organizer"
git branch -M main
git remote add origin https://github.com/TUO-UTENTE/trip-organizer.git
git push -u origin main
```

Crea prima il repository vuoto su github.com (può essere pubblico: la
`anon key` di Supabase è pensata per stare nel frontend, la sicurezza reale
è data dalle policy RLS + dalla lista email autorizzate + dalla registrazione
disabilitata).

## 4. Attiva GitHub Pages

1. Sul repository GitHub → **Settings → Pages**.
2. **Source**: Deploy from a branch → branch `main`, cartella `/ (root)`.
3. Salva. Dopo un minuto l'app sarà su
   `https://TUO-UTENTE.github.io/trip-organizer/`.
4. Torna su Supabase (punto 1.3) e aggiorna Site URL / Redirect URLs con
   questo indirizzo definitivo.

## 5. Installa l'app su iPhone

1. Apri l'URL con **Safari** (non Chrome: "Aggiungi a Home" con icona a
   schermo intero funziona solo da Safari su iOS).
2. Tocca l'icona **Condividi** → **Aggiungi a Home**.
3. L'app comparirà come icona autonoma, a schermo intero, senza barra Safari.
4. Ripeti sul telefono della tua compagna.

## 6. Uso quotidiano

- Login: email + password (quelle create nel passo 1.6).
- Le modifiche fatte da uno dei due (nuova spesa, prenotazione, ecc.)
  compaiono in automatico anche sull'altro telefono, senza ricaricare.
- "Riepilogo" → **Esporta in Excel** scarica un file `.xlsx` con spese,
  prenotazioni e saldo del viaggio.

## Struttura del progetto

```
index.html          pagina unica dell'app
css/style.css        stile, tema chiaro/scuro
js/config.js          le vostre chiavi Supabase (da compilare)
js/supabaseClient.js  inizializzazione client
js/auth.js            login/logout
js/theme.js            tema chiaro/scuro
js/trips.js            gestione viaggi
js/expenses.js         spese + calcolo saldo
js/bookings.js         prenotazioni + documenti
js/itinerary.js         itinerario giorno per giorno
js/packing.js           valigia/checklist (lista separata per persona)
js/jetlag.js            consigli e piano di adattamento jet lag
js/export.js           export Excel
js/app.js              avvio app
manifest.json / sw.js   PWA (icona home, offline app-shell)
supabase/schema.sql     schema database da eseguire su Supabase
icons/                  icone dell'app (puoi sostituirle con le tue)
```

## Posizione e mappa nelle prenotazioni

Nel form "Aggiungi prenotazione" c'è un campo di ricerca: scrivendo il nome
di un hotel, aeroporto o indirizzo (almeno 3 caratteri) compaiono suggerimenti
in tempo reale grazie a **OpenStreetMap (Nominatim)** — gratuito, nessuna API
key, nessun account da creare. Selezionando un risultato vengono salvati
indirizzo e coordinate precise; la card della prenotazione mostra poi una
mini-mappa incorporata e un link "Apri in Mappe" che apre l'app Mappe di
iPhone (Apple Maps) sul punto esatto.

Nota: Nominatim è pensato per un uso personale leggero come questo (max 1
richiesta al secondo, già rispettata dal debounce nel codice). Se in futuro
serviranno più dati (telefono, sito web, foto del luogo), si può passare a
Google Places, ma richiede di creare un progetto Google Cloud con una API key.

## Itinerario giorno per giorno

Tab "Itinerario": aggiungi tappe (attrazione, trasporto, pasto, alloggio,
tempo libero...) con orario, luogo (stessa ricerca/mappa delle prenotazioni),
tempo di spostamento verso la tappa successiva e costo opzionale. Le tappe
sono raggruppate per giorno, riordinabili con le frecce ▲▼, e un costo può
essere trasformato in una spesa condivisa con un tocco ("Aggiungi come
spesa"), comparendo poi anche nel saldo e nell'export Excel.

## Valigia

Tab "Valigia": checklist a categorie (abbigliamento, elettronica, documenti,
igiene, salute...) con quantità e spunta. Ogni persona ha la propria lista
(interruttore in alto per passare dalla propria a quella dell'altro/a, che
resta visibile ma non modificabile). Le liste predefinite (Mare, Montagna/
Neve, Città, Lavoro) aggiungono in un tocco una selezione di oggetti comuni,
poi modificabile liberamente.

## Jet lag

Tab "Jet Lag": consigli generali (luce, pasti, idratazione, melatonina) e un
piccolo calcolatore che, data la data di partenza e la differenza di fuso
orario, genera un piano di adattamento (pre-shift del sonno nei giorni prima
della partenza + giorni di recupero stimati a destinazione). Nessun dato
viene salvato: è solo uno strumento calcolato al momento, diverso per volo
verso est o verso ovest.

## Possibili miglioramenti futuri

- Notifiche push quando l'altro aggiunge una spesa
- Galleria foto del viaggio
- "Salda e archivia" con storico dei saldi chiusi
- Promemoria scadenze (check-in, documenti)
