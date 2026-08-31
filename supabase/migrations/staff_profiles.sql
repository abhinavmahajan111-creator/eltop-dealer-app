-- staff_profiles table
-- Replaces the old ad-hoc "staff" table (email+role lookup, never linked to
-- auth.users, not tracked in any migration). This is the real thing: every
-- internal Eltop employee who needs to log in via the "Staff" option on the
-- login screen gets exactly one row here, created by Admin BEFORE they ever
-- log in (no self-signup, unlike profiles/dealers).
--
-- email is the primary key because the row has to exist pre-login (Admin
-- creates it), so there's no auth.users id yet at creation time. `id` gets
-- filled in by the app on first successful OTP verify.
--
-- Run in Supabase SQL Editor.

CREATE TABLE public.staff_profiles (
  email       text        PRIMARY KEY,
  id          uuid        UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
  name        text,
  role        text        NOT NULL CHECK (role IN (
                'sales_associate', 'senior_sales_associate', 'senior_sales_executive',
                'after_sales_head',
                'dispatch', 'logistics_coordinator',
                'back_office', 'calling_support',
                'content_marketing',
                'hr', 'legal', 'office_admin', 'operations', 'delhi_head'
              )),
  department  text        NOT NULL,
  reports_to  text        REFERENCES public.staff_profiles(email),
  is_active   boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.staff_profiles ENABLE ROW LEVEL SECURITY;

-- A staff member can read their own row (looked up by their logged-in id).
CREATE POLICY "Staff can view their own profile"
  ON public.staff_profiles FOR SELECT
  USING (id = auth.uid());

-- The pre-OTP login gate needs to check whether an email is registered as
-- staff BEFORE that person has a session (id is still null at that point).
-- Deliberately NOT a public SELECT policy on the table (that would expose
-- the whole roster — names, roles, reports_to — to anyone unauthenticated).
-- Instead, a security-definer function that only ever returns a boolean,
-- same pattern as is_admin() above.
-- lower() on both sides: emails are stored lowercase (AdminStaff.jsx
-- lowercases on insert) but this must not silently fail for a browser/
-- keyboard that auto-capitalizes what the person typed.
CREATE OR REPLACE FUNCTION public.is_staff_email(check_email text)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.staff_profiles
    WHERE lower(email) = lower(check_email) AND is_active = true
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Staff can link their own row to their auth id on first successful login
-- (id starts null; the app sets it once, only while it's still null).
CREATE POLICY "Staff can claim their own unlinked profile"
  ON public.staff_profiles FOR UPDATE
  USING (id IS NULL)
  WITH CHECK (id = auth.uid());

-- Admins manage the roster: create, edit, deactivate staff accounts.
CREATE POLICY "Admins can view all staff profiles"
  ON public.staff_profiles FOR SELECT
  USING (public.is_admin());

CREATE POLICY "Admins can insert staff profiles"
  ON public.staff_profiles FOR INSERT
  WITH CHECK (public.is_admin());

CREATE POLICY "Admins can update any staff profile"
  ON public.staff_profiles FOR UPDATE
  USING (public.is_admin());

CREATE POLICY "Admins can delete staff profiles"
  ON public.staff_profiles FOR DELETE
  USING (public.is_admin());
