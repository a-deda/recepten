-- RPC's die niet via PostgREST te doen zijn.

-- ---------------------------------------------------------------------------
-- claim_intake: pakt pending rijen en zet ze in één transactie op processing.
-- PostgREST kan geen "for update skip locked", dus dit moet een functie zijn.
-- Zonder skip locked pakken twee gelijktijdige worker-runs dezelfde rij en
-- betaal je de Claude-call twee keer.
-- ---------------------------------------------------------------------------
create or replace function claim_intake(p_batch int default 5)
returns setof intake_queue
language sql
volatile
security definer
set search_path = public
as $$
  update intake_queue q
     set status = 'processing',
         updated_at = now()
   where q.id in (
     select id
       from intake_queue
      where status = 'pending'
      order by created_at
      limit greatest(p_batch, 1)
      for update skip locked
   )
  returning q.*;
$$;

revoke all on function claim_intake(int) from public, anon, authenticated;
grant execute on function claim_intake(int) to service_role;

-- ---------------------------------------------------------------------------
-- mark_cooked: één round-trip vanuit kookmodus. Security invoker, dus RLS
-- bepaalt nog steeds dat je alleen je eigen recept kunt bijwerken.
-- ---------------------------------------------------------------------------
create or replace function mark_cooked(p_recipe uuid, p_note text default null)
returns recipes
language plpgsql
volatile
as $$
declare
  v_row recipes;
  v_regel text;
begin
  v_regel := case
    when p_note is null or btrim(p_note) = '' then null
    else to_char(now(), 'DD-MM-YYYY') || ' — ' || btrim(p_note)
  end;

  update recipes
     set last_cooked = now(),
         cook_count = cook_count + 1,
         notes = case
           when v_regel is null then notes
           when notes is null or btrim(notes) = '' then v_regel
           else notes || E'\n' || v_regel
         end
   where id = p_recipe
  returning * into v_row;

  if v_row.id is null then
    raise exception 'Recept % niet gevonden of geen toegang', p_recipe;
  end if;

  return v_row;
end;
$$;

grant execute on function mark_cooked(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- updated_at bijhouden op intake_queue
-- ---------------------------------------------------------------------------
create or replace function intake_queue_touch()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists intake_queue_touch_trg on intake_queue;
create trigger intake_queue_touch_trg
  before update on intake_queue
  for each row execute function intake_queue_touch();
