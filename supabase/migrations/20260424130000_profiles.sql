-- ============================================================
-- Profiles table — bridges Supabase auth.users to app roles.
--
-- Every authenticated user (email or Google OAuth) gets one row.
-- The frontend creates/upserts the row right after sign-in,
-- using the role chosen on the login page.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  display_name text,
  role text NOT NULL DEFAULT 'student' CHECK (role IN ('student', 'teacher')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_select_self ON public.profiles;
CREATE POLICY profiles_select_self ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

DROP POLICY IF EXISTS profiles_insert_self ON public.profiles;
CREATE POLICY profiles_insert_self ON public.profiles
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = id);

-- Users can update their own display_name but not their role.
DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
CREATE POLICY profiles_update_self ON public.profiles
  FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id AND role = (SELECT role FROM public.profiles WHERE id = auth.uid()));

DROP POLICY IF EXISTS profiles_select_service ON public.profiles;
CREATE POLICY profiles_select_service ON public.profiles
  FOR SELECT TO service_role USING (true);

DROP POLICY IF EXISTS profiles_all_service ON public.profiles;
CREATE POLICY profiles_all_service ON public.profiles
  FOR ALL TO service_role USING (true) WITH CHECK (true);
