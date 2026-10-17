-- ============================================================
-- Spazi di PDTravel: chi vede cosa.
--   "coppia" → Leonardo e Chiara: vedono e modificano gli stessi viaggi, come prima
--   "prova"  → 23leo07: account di prova, vede solo i viaggi creati da lui
-- Ogni viaggio appartiene allo spazio di chi l'ha creato; prenotazioni, spese,
-- valigie, documenti ecc. seguono il loro viaggio. Chi non ha uno spazio
-- (es. Kurashi da solo) non legge né scrive nulla.
-- Stesse email di SPACES in js/config.js. Da eseguire nel SQL Editor; si può rieseguire.
-- ============================================================

-- Spazio di un'email
create or replace function public.pdtravel_space(e text)
returns text language sql immutable set search_path = '' as $$
  select case lower(e)
    when 'leonardobolli@gmail.com'       then 'coppia'
    when 'biagettimariachiara@gmail.com' then 'coppia'
    when '23leo07@gmail.com'             then 'prova'
  end
$$;

-- Spazio di chi sta usando l'app
create or replace function public.pdtravel_my_space()
returns text language sql stable set search_path = '' as $$
  select public.pdtravel_space(auth.jwt() ->> 'email')
$$;

-- Spazio di un utente, di un viaggio, di una prenotazione, di un file.
-- "security definer": leggono auth.users e le tabelle senza passare dalle
-- policy (altrimenti le policy si richiamerebbero a vicenda); restituiscono
-- solo il nome dello spazio, nessun dato.
create or replace function public.pdtravel_user_space(u uuid)
returns text language sql stable security definer set search_path = '' as $$
  select public.pdtravel_space(email) from auth.users where id = u
$$;

create or replace function public.pdtravel_trip_space(t uuid)
returns text language sql stable security definer set search_path = '' as $$
  select public.pdtravel_user_space(created_by) from public.trips where id = t
$$;

create or replace function public.pdtravel_booking_space(b uuid)
returns text language sql stable security definer set search_path = '' as $$
  select public.pdtravel_trip_space(trip_id) from public.bookings where id = b
$$;

-- I file stanno in <id viaggio>/<id prenotazione>/<nome>
create or replace function public.pdtravel_path_space(p text)
returns text language sql stable security definer set search_path = '' as $$
  select case when split_part(p, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then public.pdtravel_trip_space(split_part(p, '/', 1)::uuid) end
$$;

do $$
declare f text;
begin
  foreach f in array array['pdtravel_space(text)','pdtravel_my_space()','pdtravel_user_space(uuid)',
    'pdtravel_trip_space(uuid)','pdtravel_booking_space(uuid)','pdtravel_path_space(text)'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- Policy: stesso spazio di chi sta usando l'app
do $$
declare
  t text;
  rule text;
begin
  foreach t in array array['trips','expenses','bookings','documents',
    'itinerary_items','packing_items','packing_organizers',
    'packing_templates','todos','custom_options']
  loop
    rule := case t
      when 'trips'             then 'public.pdtravel_user_space(created_by)'
      when 'documents'         then 'public.pdtravel_booking_space(booking_id)'
      when 'packing_templates' then 'public.pdtravel_user_space(owner_id)'
      when 'custom_options'    then 'public.pdtravel_user_space(created_by)'
      else                          'public.pdtravel_trip_space(trip_id)'
    end || ' = (select public.pdtravel_my_space())';
    execute format('drop policy if exists %I on %I', 'authenticated full access ' || t, t);
    execute format('drop policy if exists "pdtravel users" on %I', t);
    execute format('drop policy if exists "pdtravel space" on %I', t);
    execute format('create policy "pdtravel space" on %I for all to authenticated using (%s) with check (%s)', t, rule, rule);
  end loop;
end $$;

-- Le preferenze sono private: ognuno legge e scrive solo la propria riga
drop policy if exists "own preferences" on user_preferences;
create policy "own preferences" on user_preferences
  for all to authenticated
  using (auth.uid() = user_id and (select public.pdtravel_my_space()) is not null)
  with check (auth.uid() = user_id and (select public.pdtravel_my_space()) is not null);

-- Documenti di viaggio: stesso spazio del viaggio nel percorso del file
drop policy if exists "authenticated read documents storage" on storage.objects;
create policy "authenticated read documents storage" on storage.objects
  for select to authenticated
  using (bucket_id = 'trip-documents' and public.pdtravel_path_space(name) = (select public.pdtravel_my_space()));

drop policy if exists "authenticated upload documents storage" on storage.objects;
create policy "authenticated upload documents storage" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'trip-documents' and public.pdtravel_path_space(name) = (select public.pdtravel_my_space()));

drop policy if exists "authenticated delete documents storage" on storage.objects;
create policy "authenticated delete documents storage" on storage.objects
  for delete to authenticated
  using (bucket_id = 'trip-documents' and public.pdtravel_path_space(name) = (select public.pdtravel_my_space()));
