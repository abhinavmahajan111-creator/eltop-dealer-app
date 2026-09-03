-- sales_attendance.sql
--
-- Attendance calendar (mockup approved 3 Sep 2026): a day counts as
-- "present" simply by starting it (sales_day_starts) — there's no separate
-- punch-in concept, so this doesn't add a new table, just a read-only RPC
-- listing which days in a given month the caller was present. Used by:
--   - The new Attendance screen's monthly calendar (with month nav).
--   - The dashboard's "This Month" ring stat (current month only).
--
-- Leaves and Holidays aren't real features yet (no leave-request or
-- holiday-calendar data model), so the screen shows those counts as a
-- fixed 0 rather than querying anything — same "clearly not built yet"
-- approach already used for Territory/Targets/Commission.
--
-- Run in Supabase SQL Editor, after sales_day_end_and_activity.sql.

create or replace function public.get_my_attendance_month(p_year int, p_month int)
returns table (work_date date)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_start date;
  v_end   date;
begin
  select sp.email into v_email from public.staff_profiles sp where sp.id = v_uid;
  if v_email is null then
    return;
  end if;

  if p_year is null or p_month is null or p_month < 1 or p_month > 12 then
    return;
  end if;

  v_start := make_date(p_year, p_month, 1);
  v_end   := (v_start + interval '1 month')::date;

  return query
    select sds.work_date
    from public.sales_day_starts sds
    where sds.staff_email = v_email
      and sds.work_date >= v_start
      and sds.work_date < v_end
    order by sds.work_date asc;
end;
$$;

grant execute on function public.get_my_attendance_month(int, int) to authenticated;
