CREATE SCHEMA extensions;
-- pgvector lives in `public` on every real Voyager database, because migration
-- 002 ran a bare `CREATE EXTENSION IF NOT EXISTS vector`. The `extensions`
-- schema exists but holds no vector operators. Modelling the extension in
-- `extensions` here made the whole ring green against a shape the product does
-- not have, and hid a live 42883 in search_knowledge. The baseline must mirror
-- the installed database, not a tidier one.
CREATE EXTENSION vector WITH SCHEMA public;
SET search_path = public, extensions;

CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE TABLE auth.users (
  id uuid PRIMARY KEY,
  email text UNIQUE,
  raw_user_meta_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
CREATE FUNCTION auth.role() RETURNS text
LANGUAGE sql STABLE SET search_path = pg_catalog AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role',
    current_user
  )
$$;
GRANT USAGE ON SCHEMA auth, extensions TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid(), auth.role() TO anon, authenticated, service_role;

CREATE TYPE public.session_status AS ENUM ('active', 'historical', 'archived');
CREATE TYPE public.voyage_role AS ENUM ('captain', 'crew');

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE,
  display_name text,
  username text,
  personalization jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION public.local_handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  INSERT INTO public.profiles(id, email, display_name, username)
  VALUES (
    NEW.id,
    coalesce(NEW.email, NEW.id::text || '@example.invalid'),
    NEW.raw_user_meta_data->>'display_name',
    NEW.raw_user_meta_data->>'username'
  );
  RETURN NEW;
END
$$;
CREATE TRIGGER local_auth_profile AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.local_handle_new_user();

CREATE TABLE public.voyages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  invite_code text UNIQUE DEFAULT md5(random()::text),
  is_public boolean NOT NULL DEFAULT false,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.voyage_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  voyage_id uuid NOT NULL REFERENCES public.voyages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.voyage_role NOT NULL DEFAULT 'crew',
  nickname text,
  notifications_enabled boolean NOT NULL DEFAULT true,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (voyage_id, user_id)
);
CREATE TABLE public.spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL DEFAULT 'room',
  voyage_id uuid REFERENCES public.voyages(id) ON DELETE CASCADE,
  ai_present boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.space_members (
  space_id uuid NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'active'
    CHECK (state IN ('invited', 'active', 'left')),
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (space_id, user_id)
);
CREATE TABLE public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text,
  status public.session_status NOT NULL DEFAULT 'historical',
  last_message_at timestamptz DEFAULT now(),
  message_count integer DEFAULT 0,
  title_generated_at timestamptz,
  extracted_at timestamptz,
  voyage_id uuid REFERENCES public.voyages(id) ON DELETE CASCADE,
  space_id uuid REFERENCES public.spaces(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.voyages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voyage_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can join voyages" ON public.voyage_members
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Captains can manage members" ON public.voyage_members
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.voyage_members TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE
  ON public.voyage_members, public.space_members TO service_role;
GRANT SELECT ON public.spaces TO service_role;
