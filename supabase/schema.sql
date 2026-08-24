-- ============================================================
-- Trip Organizer - Supabase schema
-- Eseguire questo script nel SQL Editor del progetto Supabase
-- ============================================================

-- Estensione per UUID
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- TRIPS
-- ------------------------------------------------------------
create table if not exists trips (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  destination text,
  start_date date,
  end_date date,
  base_currency text not null default 'EUR',
  emoji text default '🧳',
  archived boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- EXPENSES
-- paid_by = utente che ha pagato
-- payer_share_percent = quota % di competenza del pagante
--   (100 - payer_share_percent) = quota a carico dell'altra persona
--   es. 50 = diviso equamente, 100 = spesa personale non condivisa
-- ------------------------------------------------------------
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  description text not null,
  category text not null default 'altro',
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'EUR',
  exchange_rate numeric(12,6) not null default 1,
  payer_share_percent numeric(5,2) not null default 50,
  paid_by uuid not null references auth.users(id),
  expense_date date not null default current_date,
  receipt_path text,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- BOOKINGS (voli, hotel, auto, altro)
-- ------------------------------------------------------------
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  type text not null, -- valori suggeriti in app + tipi personalizzati liberi
  title text not null,
  provider text,
  start_datetime timestamptz,
  end_datetime timestamptz,
  confirmation_code text,
  notes text,
  address text,
  latitude double precision,
  longitude double precision,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Se avete già eseguito questo schema in precedenza, eseguite anche questo
-- blocco per aggiungere le colonne della posizione senza perdere i dati:
alter table bookings add column if not exists address text;
alter table bookings add column if not exists latitude double precision;
alter table bookings add column if not exists longitude double precision;

-- ------------------------------------------------------------
-- DOCUMENTS (allegati collegati a una prenotazione)
-- il file vero e proprio vive nello storage bucket "trip-documents"
-- ------------------------------------------------------------
create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  file_path text not null,
  file_name text not null,
  uploaded_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- ITINERARY ITEMS (tappe organizzate giorno per giorno)
-- ------------------------------------------------------------
create table if not exists itinerary_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  day date not null,
  position integer not null default 0,
  type text not null default 'other', -- valori suggeriti in app + tipi personalizzati liberi
  title text not null,
  start_datetime timestamptz,
  end_datetime timestamptz,
  travel_minutes_to_next integer,
  transport_mode text,
  cost numeric(12,2),
  currency text,
  exchange_rate numeric(12,6) not null default 1,
  address text,
  latitude double precision,
  longitude double precision,
  booking_id uuid references bookings(id) on delete set null,
  expense_id uuid references expenses(id) on delete set null,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- PACKING ORGANIZERS (contenitori a scelta libera dentro la
-- valigia di una persona, es. "Valigia", "Zaino", "Beauty case")
-- ------------------------------------------------------------
create table if not exists packing_organizers (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  owner_id uuid not null references auth.users(id),
  name text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- PACKING ITEMS (valigia - una lista separata per persona,
-- distinta tramite owner_id, raggruppata in organizer_id)
-- ------------------------------------------------------------
create table if not exists packing_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  owner_id uuid not null references auth.users(id),
  organizer_id uuid references packing_organizers(id) on delete cascade,
  category text not null default 'altro',
  name text not null,
  quantity integer not null default 1,
  packed boolean not null default false,
  created_at timestamptz not null default now()
);

-- Se avete già eseguito questo schema in precedenza (packing_items
-- esisteva prima degli organizer), eseguite anche questo per
-- aggiungere la colonna senza perdere i dati:
alter table packing_items add column if not exists organizer_id uuid references packing_organizers(id) on delete cascade;

-- ------------------------------------------------------------
-- PACKING TEMPLATES (modelli di valigia salvati dagli utenti,
-- riutilizzabili su qualsiasi viaggio futuro - non legati a un
-- trip_id specifico)
-- ------------------------------------------------------------
create table if not exists packing_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id),
  name text not null,
  items jsonb not null, -- [{ category, name, quantity }, ...]
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- TODO (promemoria/checklist per singolo viaggio)
-- ------------------------------------------------------------
create table if not exists todos (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  position integer not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- CUSTOM OPTIONS (voci aggiunte a mano dagli utenti nei vari menu
-- a tendina dell'app - field_key identifica il menu, es.
-- 'expense_category', 'booking_type', 'itinerary_type',
-- 'packing_category')
-- ------------------------------------------------------------
create table if not exists custom_options (
  id uuid primary key default gen_random_uuid(),
  field_key text not null,
  value text not null,
  label text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------
-- MIGRAZIONE: questo blocco è sicuro da eseguire quante volte
-- vuoi, in qualsiasi momento, indipendentemente da cosa avete già
-- eseguito in passato (non genera mai errori "esiste già") - se
-- non siete sicuri di cosa manca sul vostro progetto, eseguite
-- semplicemente TUTTO il file da cima a fondo, questo blocco compreso.
-- ------------------------------------------------------------
alter table bookings drop constraint if exists bookings_type_check;
alter table itinerary_items drop constraint if exists itinerary_items_type_check;

alter table trips enable row level security;
alter table expenses enable row level security;
alter table bookings enable row level security;
alter table documents enable row level security;
alter table itinerary_items enable row level security;
alter table packing_items enable row level security;
alter table packing_organizers enable row level security;
alter table packing_templates enable row level security;
alter table todos enable row level security;
alter table custom_options enable row level security;

drop policy if exists "authenticated full access trips" on trips;
create policy "authenticated full access trips" on trips
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access expenses" on expenses;
create policy "authenticated full access expenses" on expenses
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access bookings" on bookings;
create policy "authenticated full access bookings" on bookings
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access documents" on documents;
create policy "authenticated full access documents" on documents
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access itinerary_items" on itinerary_items;
create policy "authenticated full access itinerary_items" on itinerary_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access packing_items" on packing_items;
create policy "authenticated full access packing_items" on packing_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access packing_organizers" on packing_organizers;
create policy "authenticated full access packing_organizers" on packing_organizers
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access packing_templates" on packing_templates;
create policy "authenticated full access packing_templates" on packing_templates
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access todos" on todos;
create policy "authenticated full access todos" on todos
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "authenticated full access custom_options" on custom_options;
create policy "authenticated full access custom_options" on custom_options
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ------------------------------------------------------------
-- REALTIME
-- Abilita la pubblicazione realtime su tutte le tabelle, saltando
-- quelle già abilitate in precedenza (evita l'errore "relation is
-- already member of publication")
-- ------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['trips','expenses','bookings','documents',
    'itinerary_items','packing_items','packing_organizers',
    'packing_templates','todos','custom_options']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table %I', t);
    end if;
  end loop;
end $$;

-- ------------------------------------------------------------
-- STORAGE BUCKET per i documenti di viaggio
-- Da eseguire una volta (o crearlo da UI: Storage > New bucket "trip-documents", privato)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('trip-documents', 'trip-documents', false)
on conflict (id) do nothing;

drop policy if exists "authenticated read documents storage" on storage.objects;
create policy "authenticated read documents storage" on storage.objects
  for select using (bucket_id = 'trip-documents' and auth.role() = 'authenticated');

drop policy if exists "authenticated upload documents storage" on storage.objects;
create policy "authenticated upload documents storage" on storage.objects
  for insert with check (bucket_id = 'trip-documents' and auth.role() = 'authenticated');

drop policy if exists "authenticated delete documents storage" on storage.objects;
create policy "authenticated delete documents storage" on storage.objects
  for delete using (bucket_id = 'trip-documents' and auth.role() = 'authenticated');
