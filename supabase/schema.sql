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
  type text not null check (type in ('flight','hotel','car','other')),
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
  type text not null default 'other'
    check (type in ('attraction','transport','meal','accommodation','free_time','other')),
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
-- PACKING ITEMS (valigia - una lista separata per persona,
-- distinta tramite owner_id)
-- ------------------------------------------------------------
create table if not exists packing_items (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  owner_id uuid not null references auth.users(id),
  category text not null default 'altro',
  name text not null,
  quantity integer not null default 1,
  packed boolean not null default false,
  created_at timestamptz not null default now()
);

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
-- MIGRAZIONE 1: se avete già eseguito questo schema in precedenza
-- (prima che esistessero Itinerario/Valigia), e NON avete ancora
-- eseguito la Migrazione 1 in passato, eseguite questo blocco:
-- ------------------------------------------------------------
alter table itinerary_items enable row level security;
alter table packing_items enable row level security;

create policy "authenticated full access itinerary_items" on itinerary_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated full access packing_items" on packing_items
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

alter publication supabase_realtime add table itinerary_items;
alter publication supabase_realtime add table packing_items;

-- ------------------------------------------------------------
-- MIGRAZIONE 2: se avete già eseguito la Migrazione 1 qui sopra in
-- passato (quindi itinerary_items/packing_items esistono già) e vi
-- serve solo aggiungere i Modelli di valigia salvati, eseguite SOLO
-- questo blocco (la Migrazione 1 andrebbe in errore se rieseguita):
-- ------------------------------------------------------------
alter table packing_templates enable row level security;

create policy "authenticated full access packing_templates" on packing_templates
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

alter publication supabase_realtime add table packing_templates;

-- ------------------------------------------------------------
-- ROW LEVEL SECURITY
-- App pensata per un piccolo gruppo chiuso (2 persone):
-- chiunque sia autenticato nel progetto puo' leggere/scrivere tutto.
-- L'accesso e' limitato a monte creando solo i vostri 2 account
-- e disabilitando le registrazioni pubbliche (vedi README).
-- ------------------------------------------------------------
alter table trips enable row level security;
alter table expenses enable row level security;
alter table bookings enable row level security;
alter table documents enable row level security;

create policy "authenticated full access trips" on trips
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated full access expenses" on expenses
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated full access bookings" on bookings
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

create policy "authenticated full access documents" on documents
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- ------------------------------------------------------------
-- REALTIME
-- Abilita la pubblicazione realtime sulle tabelle principali
-- ------------------------------------------------------------
alter publication supabase_realtime add table trips;
alter publication supabase_realtime add table expenses;
alter publication supabase_realtime add table bookings;
alter publication supabase_realtime add table documents;

-- ------------------------------------------------------------
-- STORAGE BUCKET per i documenti di viaggio
-- Da eseguire una volta (o crearlo da UI: Storage > New bucket "trip-documents", privato)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('trip-documents', 'trip-documents', false)
on conflict (id) do nothing;

create policy "authenticated read documents storage" on storage.objects
  for select using (bucket_id = 'trip-documents' and auth.role() = 'authenticated');

create policy "authenticated upload documents storage" on storage.objects
  for insert with check (bucket_id = 'trip-documents' and auth.role() = 'authenticated');

create policy "authenticated delete documents storage" on storage.objects
  for delete using (bucket_id = 'trip-documents' and auth.role() = 'authenticated');
