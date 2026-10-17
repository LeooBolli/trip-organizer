# PDTravel — note per Claude

## Database: progetto Supabase condiviso con Kurashi
- PDTravel usa il progetto Supabase **Kurashi** (`zwqoxbkcfebiipkssiws`), non più "Trip Planner": dal 16 ottobre 2026 non lo usa più nessuna app.
- Nello stesso database ci sono le tabelle di Kurashi (`goals`, `habits`, `meal_entries`, `settings`, …): non toccarle. Le tabelle di PDTravel sono `trips`, `expenses`, `bookings`, `documents`, `itinerary_items`, `packing_*`, `todos`, `custom_options`, `user_preferences` e il bucket `trip-documents`.
- Sessione separata da Kurashi: il client usa `storageKey: "pdtravel-auth"` (vedi `js/supabaseClient.js`), perché entrambe le app stanno su `leoobolli.github.io`.
- Le scritture con il connettore Supabase di claude.ai vengono rifiutate: le modifiche al database si danno all'utente come file SQL da incollare nel SQL Editor. Dopo l'esecuzione si verifica con query di sola lettura.

## Account e spazi
| Email | Chi | Spazio |
|---|---|---|
| leonardobolli@gmail.com | Leonardo | `coppia` |
| biagettimariachiara@gmail.com | Chiara | `coppia` |
| 23leo07@gmail.com | account di prova "Ospite", vuoto, lo usa solo Leonardo per mostrare l'app | `prova` |

- Ognuno vede solo i viaggi del proprio spazio. Ogni viaggio appartiene allo spazio di chi l'ha creato (`trips.created_by`), e tutto il resto (spese, prenotazioni, documenti, valigie) segue il suo viaggio. Le regole sono le funzioni `public.pdtravel_*_space()` e le policy "pdtravel space" in `supabase/schema.sql`; la migrazione è in `supabase/migration-spazi.sql`.
- Una nuova email va aggiunta in **due** posti, sempre con il suo spazio: `pdtravel_space()` in `supabase/schema.sql` e `ALLOWED_EMAILS` / `SPACES` / `USER_NAMES` in `js/config.js`.
- Non tornare a policy del tipo "email nella lista = vede tutto": l'account di prova vedrebbe i viaggi e le spese di Leonardo e Chiara.
- "L'altra persona" (`Auth.otherName()`, divisione delle spese) è chi condivide il tuo spazio. Per l'account di prova non c'è nessuno: compare "l'altra persona".
- I file del bucket stanno in `<id viaggio>/<id prenotazione>/<nome>`: la policy dello storage legge lo spazio dal primo pezzo del percorso, quindi non cambiare questo formato.
