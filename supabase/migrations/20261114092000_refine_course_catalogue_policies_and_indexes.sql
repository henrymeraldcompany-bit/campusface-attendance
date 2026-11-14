drop policy if exists "Active staff can read active courses" on public.courses;
drop policy if exists "Administrators can read all courses" on public.courses;

create policy "Staff can read permitted courses"
on public.courses
for select
to authenticated
using (
  exists (
    select 1
    from public.staff_profiles sp
    where sp.id = (select auth.uid())
      and sp.is_active = true
      and sp.staff_role in ('lecturer', 'administrator')
      and (public.courses.is_active = true or sp.staff_role = 'administrator')
  )
);

drop index if exists public.courses_active_name_idx;
create index if not exists courses_created_by_idx
  on public.courses (created_by);
