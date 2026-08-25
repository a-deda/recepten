-- Storage voor bijlagen (PRD §3: bijlagen gaan buiten de function om).

insert into storage.buckets (id, name, public)
values ('recipe-images', 'recipe-images', false)
on conflict (id) do nothing;

-- Private bucket: de frontend leest via signed URLs, niet via een raadbaar pad.
-- Apps Script en de worker schrijven met de service-role key en omzeilen RLS.
drop policy if exists recipe_images_eigen_map on storage.objects;
create policy recipe_images_eigen_map on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'recipe-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
