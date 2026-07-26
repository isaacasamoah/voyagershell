CREATE FUNCTION public.canonical_space_member_id(p_space_id uuid, p_user_id uuid)
RETURNS uuid LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path = pg_catalog AS $$
  SELECT md5(format('voyager-space-member:v1:%s:%s', p_space_id, p_user_id))::uuid
$$;
ALTER TABLE public.voyage_members
  ADD COLUMN state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'left')),
  ADD COLUMN state_changed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0);
UPDATE public.voyage_members SET state_changed_at = joined_at;
ALTER TABLE public.space_members
  ADD COLUMN id uuid GENERATED ALWAYS AS (
    public.canonical_space_member_id(space_id, user_id)) STORED NOT NULL,
  ADD COLUMN state_changed_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
  ADD CONSTRAINT space_members_id_key UNIQUE (id);
UPDATE public.space_members SET state_changed_at = added_at;
CREATE FUNCTION public.is_effective_space_member(p_space_id uuid, p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT p_user_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.space_members member
    JOIN public.spaces space ON space.id = member.space_id
    WHERE member.space_id = p_space_id AND member.user_id = p_user_id
      AND member.state = 'active' AND (space.voyage_id IS NULL OR EXISTS (
        SELECT 1 FROM public.voyage_members parent
        WHERE parent.voyage_id = space.voyage_id AND parent.user_id = p_user_id
          AND parent.state = 'active')))
$$;
REVOKE EXECUTE ON FUNCTION public.is_effective_space_member(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_effective_space_member(uuid, uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.is_active_space_member(p_space_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = pg_catalog, public AS $$
  SELECT public.is_effective_space_member(p_space_id, auth.uid())
$$;
REVOKE EXECUTE ON FUNCTION public.is_active_space_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_space_member(uuid) TO authenticated;
CREATE FUNCTION public.get_effective_space_member_ids(p_space_id uuid)
RETURNS TABLE(user_id uuid) LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = pg_catalog, public AS $$
  SELECT member.user_id FROM public.space_members member
  WHERE member.space_id = p_space_id
    AND public.is_effective_space_member(member.space_id, member.user_id)
  ORDER BY member.user_id
$$;
REVOKE EXECUTE ON FUNCTION public.get_effective_space_member_ids(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_effective_space_member_ids(uuid) TO service_role;
CREATE FUNCTION public.guard_membership_authority_transition()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.revision := 1;
    NEW.state_changed_at := clock_timestamp();
  ELSIF NEW.user_id IS DISTINCT FROM OLD.user_id
      OR to_jsonb(NEW)->>TG_ARGV[0] IS DISTINCT FROM to_jsonb(OLD)->>TG_ARGV[0]
      OR (TG_ARGV[1] = 'stored' AND NEW.id IS DISTINCT FROM OLD.id) THEN
    RAISE EXCEPTION 'membership_authority_identity_immutable' USING ERRCODE = '23514';
  ELSIF NEW.state IS DISTINCT FROM OLD.state THEN
    NEW.revision := OLD.revision + 1;
    NEW.state_changed_at := clock_timestamp();
  ELSE
    NEW.revision := OLD.revision;
    NEW.state_changed_at := OLD.state_changed_at;
  END IF;
  IF TG_TABLE_NAME = 'space_members' AND NEW.state <> 'left' THEN
    PERFORM parent.id FROM public.spaces space
    JOIN public.voyage_members parent
      ON parent.voyage_id = space.voyage_id AND parent.user_id = NEW.user_id
    WHERE space.id = (to_jsonb(NEW)->>'space_id')::uuid
      AND parent.state = 'active' FOR SHARE OF parent;
    IF NOT FOUND AND EXISTS (SELECT 1 FROM public.spaces space
      WHERE space.id = (to_jsonb(NEW)->>'space_id')::uuid
        AND space.voyage_id IS NOT NULL) THEN
      RAISE EXCEPTION 'space_member_parent_membership_required' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END
$$;
CREATE FUNCTION public.guard_space_authority_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.voyage_id IS DISTINCT FROM OLD.voyage_id THEN
    RAISE EXCEPTION 'space_authority_identity_immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
CREATE FUNCTION public.deactivate_child_space_memberships()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE public.space_members child SET state = 'left'
  FROM public.spaces space WHERE space.id = child.space_id
    AND space.voyage_id = NEW.voyage_id AND child.user_id = NEW.user_id
    AND child.state <> 'left';
  RETURN NEW;
END
$$;
CREATE FUNCTION public.guard_session_authority_columns()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF NEW.space_id IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.spaces space
    WHERE space.id = NEW.space_id
      AND space.voyage_id IS NOT DISTINCT FROM NEW.voyage_id
  ) THEN
    RAISE EXCEPTION 'session_space_voyage_mismatch' USING ERRCODE = '23514';
  END IF;
  IF current_setting('role', true) IN ('anon', 'authenticated') AND (
    (TG_OP = 'INSERT' AND (NEW.voyage_id IS NOT NULL OR NEW.space_id IS NOT NULL))
    OR (TG_OP = 'UPDATE' AND (NEW.user_id IS DISTINCT FROM OLD.user_id
      OR NEW.voyage_id IS DISTINCT FROM OLD.voyage_id
      OR NEW.space_id IS DISTINCT FROM OLD.space_id))) THEN
    RAISE EXCEPTION 'session_authority_columns_server_only' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END
$$;
REVOKE ALL ON FUNCTION public.guard_session_authority_columns() FROM PUBLIC;
LOCK TABLE public.voyage_members, public.spaces, public.space_members
  IN SHARE ROW EXCLUSIVE MODE;
CREATE TRIGGER trg_voyage_members_authority_guard BEFORE INSERT OR UPDATE
  ON public.voyage_members FOR EACH ROW
  EXECUTE FUNCTION public.guard_membership_authority_transition('voyage_id', 'stored');
CREATE TRIGGER trg_space_members_authority_guard BEFORE INSERT OR UPDATE
  ON public.space_members FOR EACH ROW
  EXECUTE FUNCTION public.guard_membership_authority_transition('space_id', 'generated');
CREATE TRIGGER trg_spaces_authority_guard BEFORE UPDATE OF voyage_id ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION public.guard_space_authority_identity();
CREATE TRIGGER trg_voyage_member_deactivate_children AFTER UPDATE OF state
  ON public.voyage_members FOR EACH ROW
  WHEN (OLD.state = 'active' AND NEW.state = 'left')
  EXECUTE FUNCTION public.deactivate_child_space_memberships();
CREATE TRIGGER trg_sessions_authority_insert BEFORE INSERT
  ON public.sessions FOR EACH ROW
  EXECUTE FUNCTION public.guard_session_authority_columns();
CREATE TRIGGER trg_sessions_authority_guard
  BEFORE UPDATE OF user_id, voyage_id, space_id ON public.sessions
  FOR EACH ROW EXECUTE FUNCTION public.guard_session_authority_columns();
UPDATE public.space_members child SET state = 'left'
FROM public.spaces space WHERE space.id = child.space_id
  AND space.voyage_id IS NOT NULL AND child.state <> 'left' AND NOT EXISTS (
    SELECT 1 FROM public.voyage_members parent
    WHERE parent.voyage_id = space.voyage_id AND parent.user_id = child.user_id
      AND parent.state = 'active');
CREATE OR REPLACE FUNCTION public.is_active_voyage_member_by_id(p_voyage_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (SELECT 1 FROM public.voyage_members member
    WHERE member.voyage_id = p_voyage_id AND member.user_id = auth.uid()
      AND member.state = 'active')
$$;
CREATE OR REPLACE FUNCTION public.is_voyage_captain_by_id(p_voyage_id uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER STABLE SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (SELECT 1 FROM public.voyage_members member
    WHERE member.voyage_id = p_voyage_id AND member.user_id = auth.uid()
      AND member.role = 'captain' AND member.state = 'active')
$$;
CREATE OR REPLACE FUNCTION public.is_voyage_captain(p_voyage_slug text, p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
  SELECT (auth.uid() IS NULL OR auth.uid() = p_user_id) AND EXISTS (
    SELECT 1 FROM public.voyage_members member JOIN public.voyages voyage
      ON voyage.id = member.voyage_id WHERE voyage.slug = p_voyage_slug
      AND member.user_id = p_user_id AND member.role = 'captain' AND member.state = 'active')
$$;
CREATE OR REPLACE FUNCTION public.get_voyage_role(p_voyage_slug text, p_user_id uuid)
RETURNS public.voyage_role LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
  SELECT member.role FROM public.voyage_members member JOIN public.voyages voyage
    ON voyage.id = member.voyage_id WHERE voyage.slug = p_voyage_slug
    AND member.user_id = p_user_id AND member.state = 'active'
    AND (auth.uid() IS NULL OR auth.uid() = p_user_id)
$$;
CREATE OR REPLACE FUNCTION public.get_user_voyages(p_user_id uuid)
RETURNS TABLE(voyage_id uuid, slug text, name text, role public.voyage_role, joined_at timestamptz)
LANGUAGE sql STABLE SET search_path = pg_catalog, public AS $$
  SELECT voyage.id, voyage.slug, voyage.name, member.role, member.joined_at
  FROM public.voyages voyage JOIN public.voyage_members member ON member.voyage_id = voyage.id
  WHERE member.user_id = p_user_id AND member.state = 'active'
    AND (auth.uid() IS NULL OR auth.uid() = p_user_id) ORDER BY member.joined_at DESC
$$;
CREATE OR REPLACE FUNCTION public.regenerate_voyage_invite(p_voyage_id uuid, p_user_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_code text;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'regenerate_voyage_invite: p_user_id must equal auth.uid()' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.voyage_members member WHERE member.voyage_id = p_voyage_id
      AND member.user_id = p_user_id AND member.role = 'captain' AND member.state = 'active')
  THEN
    RETURN NULL;
  END IF;
  v_code := public.generate_invite_code();
  UPDATE public.voyages SET invite_code = v_code WHERE id = p_voyage_id;
  RETURN v_code;
END
$$;
CREATE OR REPLACE FUNCTION public.join_voyage_by_code(p_invite_code text, p_user_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_voyage_id uuid;
  v_member public.voyage_members;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'join_voyage_by_code: p_user_id must equal auth.uid()' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO v_voyage_id FROM public.voyages WHERE invite_code = p_invite_code;
  IF v_voyage_id IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT * INTO v_member FROM public.voyage_members
    WHERE voyage_id = v_voyage_id AND user_id = p_user_id FOR UPDATE;
  IF v_member.id IS NULL THEN
    INSERT INTO public.voyage_members(voyage_id, user_id, role) VALUES (v_voyage_id, p_user_id, 'crew');
  ELSIF v_member.state <> 'active' THEN
    UPDATE public.voyage_members SET state = 'active', role = 'crew' WHERE id = v_member.id;
  END IF;
  RETURN v_voyage_id;
END
$$;
DROP POLICY IF EXISTS "Members can view their voyages" ON public.voyages;
CREATE POLICY "Members can view their voyages" ON public.voyages FOR SELECT USING (
  is_public OR public.is_active_voyage_member_by_id(id));
DROP POLICY IF EXISTS "Captains can update voyages" ON public.voyages;
CREATE POLICY "Captains can update voyages" ON public.voyages FOR UPDATE USING (
  public.is_voyage_captain_by_id(id));
DROP POLICY IF EXISTS "Members can view voyage members" ON public.voyage_members;
CREATE POLICY "Members can view voyage members" ON public.voyage_members FOR SELECT USING (
  state = 'active' AND public.is_active_voyage_member_by_id(voyage_id));
DROP POLICY IF EXISTS "Captains can manage members" ON public.voyage_members;
CREATE POLICY "Captains can manage members" ON public.voyage_members FOR UPDATE USING (
  public.is_voyage_captain_by_id(voyage_id)) WITH CHECK (public.is_voyage_captain_by_id(voyage_id));
DROP POLICY IF EXISTS "Users can join voyages" ON public.voyage_members;
REVOKE INSERT, UPDATE, DELETE ON public.voyage_members FROM anon, authenticated;
REVOKE DELETE, TRUNCATE ON public.voyage_members, public.space_members FROM service_role;
REVOKE EXECUTE ON FUNCTION public.is_active_voyage_member_by_id(uuid),
  public.is_voyage_captain_by_id(uuid), public.is_voyage_captain(text, uuid),
  public.get_voyage_role(text, uuid), public.get_user_voyages(uuid),
  public.regenerate_voyage_invite(uuid, uuid), public.join_voyage_by_code(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_active_voyage_member_by_id(uuid),
  public.is_voyage_captain_by_id(uuid), public.is_voyage_captain(text, uuid),
  public.get_voyage_role(text, uuid), public.get_user_voyages(uuid),
  public.regenerate_voyage_invite(uuid, uuid), public.join_voyage_by_code(text, uuid) TO authenticated, service_role;
-- Remove dead knowledge RPCs and make the sole live embedding writer server-only.
DROP FUNCTION IF EXISTS public.get_knowledge_pending_embedding(integer);
DROP FUNCTION IF EXISTS public.create_knowledge_event(text, text, uuid, text, jsonb, text, jsonb, uuid);
DROP FUNCTION IF EXISTS public.quiet_knowledge(uuid, text), public.pin_knowledge(uuid, text);
DROP FUNCTION IF EXISTS public.search_memories(vector, uuid, double precision, integer), public.supersede_memory(uuid, text, vector, double precision);
REVOKE ALL ON FUNCTION public.update_knowledge_embedding(uuid, vector) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_knowledge_embedding(uuid, vector) TO service_role;
