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
   Se avevi già eseguito questo script in una versione precedente dell'app,
   nessun problema: **puoi rieseguire tutto il file da cima a fondo in
   qualsiasi momento**, quante volte vuoi — è scritto apposta per non dare
   mai errori "esiste già" e non tocca i dati che hai già salvato. Se vedi
   un errore tipo `Could not find the table 'public.xxx'` mentre usi l'app,
   è segno che ti manca l'ultima versione dello schema: rieseguilo.
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
js/packing.js           valigia/checklist a organizer (lista separata per persona)
js/jetlag.js            consigli e piano di adattamento jet lag (fuso orario reale)
js/todos.js             To Do per viaggio
js/customOptions.js     voci personalizzate nei menu a tendina
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

Tab "Valigia": ogni persona crea liberamente i propri **organizer** (es.
"Valigia", "Zaino", "Beauty case" — nome a scelta, quanti ne vuoi), ognuno
con la propria checklist a categorie e progresso. Interruttore in alto per
vedere anche la valigia dell'altra persona (in sola lettura). Le liste
predefinite per destinazione (Sud-est asiatico, Sud America, Caraibi, Città
europea, Montagna/Neve, Safari/Africa, Lavoro) aggiungono in un tocco una
selezione di oggetti realistici nell'organizer scelto. Puoi anche salvare la
tua valigia attuale come modello personalizzato riutilizzabile sui prossimi
viaggi ("Salva tutta la valigia come modello").

## Jet lag

Tab "Jet Lag": consigli generali (luce, pasti, idratazione, melatonina) e un
calcolatore basato su **fuso orario reale** (scegli le città di partenza e
destinazione da un elenco, o aggiungine una libera) — la differenza oraria
tiene conto automaticamente dell'ora legale nella data del volo. Il piano
generato dà orari specifici (non solo consigli generici): a che ora andare a
letto nei giorni prima della partenza, e finestre precise di luce naturale
da cercare/evitare nei giorni di recupero a destinazione.

## To Do

Tab "To Do": promemoria/checklist libera per singolo viaggio (es. "controllare
il passaporto", "disdire il gatto sitter"), con spunta, modifica e
eliminazione — indipendente da spese/prenotazioni/valigia.

## Voci personalizzate nei menu

Categoria spesa, tipo prenotazione, tipo tappa dell'itinerario e categoria
valigia hanno tutti in fondo al menu a tendina una voce **"➕ Aggiungi
nuovo..."**: permette di creare una voce libera, salvata e condivisa tra i
due account, disponibile da quel momento in poi in tutta l'app.

## Documenti prenotazioni

I documenti allegati alle prenotazioni (PDF, foto) si aprono in un'anteprima
dentro l'app con un tocco sul chip — non serve scaricarli per vederli. Dal
visualizzatore c'è comunque un link per aprirli a schermo intero se preferisci.

## Possibili miglioramenti futuri

- Notifiche push quando l'altro aggiunge una spesa
- Galleria foto del viaggio
- "Salda e archivia" con storico dei saldi chiusi
- Promemoria scadenze (check-in, documenti)
