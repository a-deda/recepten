-- Uploaden vanuit de app zelf.
--
-- Apps Script zet bijlagen neer met een signed upload URL en heeft geen policy
-- nodig. De browser doet het anders: die uploadt met je eigen inlogsessie
-- rechtstreeks naar Storage, en heeft daar dus insert-recht voor nodig — in
-- je eigen map, niet daarbuiten.
--
-- Rechtstreeks uploaden is hier geen luxe: een function mag ~6 MB request body
-- ontvangen en een telefoonfoto komt daar makkelijk overheen (§3).

drop policy if exists recipe_images_eigen_upload on storage.objects;
create policy recipe_images_eigen_upload on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
