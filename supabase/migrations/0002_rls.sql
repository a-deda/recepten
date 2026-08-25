-- RLS (PRD §9). Niet overslaan "omdat het toch alleen ik ben": de
-- intake-endpoint staat publiek en de anon key zit in de browserbundel.

alter table recipes enable row level security;
alter table intake_queue enable row level security;

-- recipes: precies één regel, zoals §4 belooft. owner_id is er vanaf dag één
-- zodat delen later geen migratie kost — het lost delen niet op.
drop policy if exists recipes_eigen_rijen on recipes;
create policy recipes_eigen_rijen on recipes
  for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- intake_queue: RLS aan en géén policies. Alleen de service-role (Netlify
-- functions en Apps Script) komt erbij; de frontend heeft hier niets te zoeken.
