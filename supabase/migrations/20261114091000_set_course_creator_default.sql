alter table public.courses
  alter column created_by set default auth.uid();
