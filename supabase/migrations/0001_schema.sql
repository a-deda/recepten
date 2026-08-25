-- Receptenbak — datamodel (PRD §4)
-- Draaien in de Supabase SQL-editor, in volgorde van bestandsnaam.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- recipes
-- ---------------------------------------------------------------------------
create table if not exists recipes (
  id            uuid primary key default gen_random_uuid(),
  owner_id      uuid not null references auth.users(id) on delete cascade,
  status        text not null default 'inbox'
                  check (status in ('inbox', 'library', 'discarded')),
  title         text not null,
  summary       text,
  ingredients   jsonb not null default '[]',   -- [{qty, unit, item, note}]
  steps         jsonb not null default '[]',   -- [{n, text, minutes}]
  servings      int,
  total_minutes int,
  source_type   text check (source_type in ('url', 'image', 'pdf', 'text', 'book')),
  source_url    text,
  source_book   text,                          -- "Ottolenghi Simple, p. 142"
  image_path    text,                          -- pad in Storage-bucket recipe-images
  raw_input     text,                          -- ruwe input, altijd bewaren
  language      text default 'nl',
  parse_notes   text,                          -- wat Claude niet zeker wist
  created_at    timestamptz not null default now(),
  last_cooked   timestamptz,
  cook_count    int not null default 0,
  notes         text,                          -- jouw aantekeningen achteraf
  -- Zoekvector over titel + samenvatting + ingrediënten (§7). Gevuld door een
  -- trigger: een jsonb->text-expressie is niet immutable, dus een generated
  -- column of expressie-index kan hier niet.
  search_tsv    tsvector
);

create index if not exists recipes_status_created_idx
  on recipes (owner_id, status, created_at desc);

create index if not exists recipes_search_idx
  on recipes using gin (search_tsv);

-- Ingrediëntteksten uit de jsonb halen voor de zoekvector.
create or replace function recipes_search_text(p_row recipes)
returns text
language sql
immutable
as $$
  select coalesce(p_row.title, '') || ' ' ||
         coalesce(p_row.summary, '') || ' ' ||
         coalesce(p_row.source_book, '') || ' ' ||
         coalesce(
           (select string_agg(
              trim(coalesce(el ->> 'item', '') || ' ' || coalesce(el ->> 'note', '')),
              ' ')
            from jsonb_array_elements(p_row.ingredients) as el),
           ''
         );
$$;

create or replace function recipes_search_refresh()
returns trigger
language plpgsql
as $$
begin
  new.search_tsv := to_tsvector('dutch', recipes_search_text(new));
  return new;
end;
$$;

drop trigger if exists recipes_search_refresh_trg on recipes;
create trigger recipes_search_refresh_trg
  before insert or update of title, summary, ingredients, source_book on recipes
  for each row execute function recipes_search_refresh();

-- ---------------------------------------------------------------------------
-- intake_queue
-- ---------------------------------------------------------------------------
create table if not exists intake_queue (
  id          uuid primary key default gen_random_uuid(),
  status      text not null default 'pending'
                check (status in ('pending', 'processing', 'done', 'failed')),
  -- Gmail-message-id: maakt een Apps Script-retry idempotent.
  message_id  text unique,
  payload     jsonb not null,                 -- afzender, body, bijlagen
  error       text,
  result      jsonb,                          -- {titles: [...]}
  recipe_id   uuid references recipes(id) on delete set null,
  -- Gezet door Apps Script zodra de bevestigingsmail eruit is; voorkomt dubbel
  -- mailen zonder dat de rij zelf verdwijnt.
  notified_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists intake_queue_status_idx
  on intake_queue (status, created_at);

-- Deelindex voor de bevestigingsronde van Apps Script.
create index if not exists intake_queue_te_melden_idx
  on intake_queue (created_at)
  where notified_at is null and status in ('done', 'failed');
