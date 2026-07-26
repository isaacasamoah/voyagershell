-- Close the future per-file gap: lock writers, install graph triggers, then catch up.
CREATE FUNCTION public.project_graph_authority_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_old jsonb := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END;
  v_new jsonb := CASE WHEN TG_OP IN ('UPDATE', 'INSERT') THEN to_jsonb(NEW) END;
  v_row jsonb := coalesce(v_new, v_old);
  v_scope uuid;
  v_member record;
BEGIN
  IF TG_TABLE_NAME = 'profiles' THEN
    IF TG_OP = 'DELETE' THEN
      DELETE FROM public.graph_authority_edges WHERE authority_kind = 'profile'
        AND authority_row_id = (v_row->>'id')::uuid;
    ELSE
      PERFORM public.project_profile_graph_authority((v_row->>'id')::uuid);
    END IF;
  ELSIF TG_TABLE_NAME = 'voyages' THEN
    IF TG_OP <> 'DELETE' THEN
      PERFORM public.project_voyage_graph_authority((v_row->>'id')::uuid);
    END IF;
  ELSIF TG_TABLE_NAME = 'voyage_members' THEN
    v_scope := (v_row->>'voyage_id')::uuid;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('voyage:' || v_scope, 0));
    IF TG_OP = 'DELETE' THEN
      DELETE FROM public.graph_authority_edges
      WHERE authority_kind = 'voyage_member' AND authority_row_id = (v_row->>'id')::uuid;
    END IF;
    IF EXISTS (SELECT 1 FROM public.voyages WHERE id = v_scope) THEN
      PERFORM public.ensure_authority_audience('voyage', v_scope);
      FOR v_member IN SELECT id FROM public.voyage_members
        WHERE voyage_id = v_scope ORDER BY id LOOP
        PERFORM public.project_voyage_member_graph_authority(v_member.id);
      END LOOP;
    END IF;
  ELSIF TG_TABLE_NAME = 'spaces' THEN
    IF TG_OP = 'DELETE' THEN
      DELETE FROM public.graph_authority_edges
      WHERE authority_kind = 'space' AND authority_row_id = (v_row->>'id')::uuid;
    ELSE
      PERFORM public.project_space_graph_authority((v_row->>'id')::uuid);
    END IF;
  ELSIF TG_TABLE_NAME = 'space_members' THEN
    v_scope := (v_row->>'space_id')::uuid;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('space:' || v_scope, 0));
    IF TG_OP = 'DELETE' THEN
      DELETE FROM public.graph_authority_edges
      WHERE authority_kind = 'space_member' AND authority_row_id = (v_row->>'id')::uuid;
    END IF;
    IF EXISTS (SELECT 1 FROM public.spaces WHERE id = v_scope) THEN
      PERFORM public.ensure_authority_audience('space', v_scope);
      FOR v_member IN SELECT id FROM public.space_members
        WHERE space_id = v_scope ORDER BY id LOOP
        PERFORM public.project_space_member_graph_authority(v_member.id);
      END LOOP;
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END
$$;

LOCK TABLE public.profiles, public.voyages, public.voyage_members,
  public.spaces, public.space_members IN SHARE ROW EXCLUSIVE MODE;

CREATE TRIGGER trg_profiles_graph_authority AFTER INSERT OR UPDATE OF display_name, username ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.project_graph_authority_trigger();
CREATE TRIGGER trg_profiles_graph_authority_delete AFTER DELETE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.project_graph_authority_trigger();
CREATE TRIGGER trg_voyages_graph_authority AFTER INSERT OR UPDATE OF name ON public.voyages
  FOR EACH ROW EXECUTE FUNCTION public.project_graph_authority_trigger();
CREATE TRIGGER trg_voyage_members_graph_authority_insert AFTER INSERT ON public.voyage_members
  FOR EACH ROW EXECUTE FUNCTION public.project_graph_authority_trigger();
CREATE TRIGGER trg_voyage_members_graph_authority_delete AFTER DELETE ON public.voyage_members
  FOR EACH ROW EXECUTE FUNCTION public.project_graph_authority_trigger();
CREATE TRIGGER trg_voyage_members_graph_authority_state AFTER UPDATE OF state ON public.voyage_members
  FOR EACH ROW WHEN (OLD.state IS DISTINCT FROM NEW.state)
  EXECUTE FUNCTION public.project_graph_authority_trigger();
CREATE TRIGGER trg_spaces_graph_authority AFTER INSERT OR DELETE ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION public.project_graph_authority_trigger();
CREATE TRIGGER trg_space_members_graph_authority_insert AFTER INSERT ON public.space_members
  FOR EACH ROW EXECUTE FUNCTION public.project_graph_authority_trigger();
CREATE TRIGGER trg_space_members_graph_authority_delete AFTER DELETE ON public.space_members
  FOR EACH ROW EXECUTE FUNCTION public.project_graph_authority_trigger();
CREATE TRIGGER trg_space_members_graph_authority_state AFTER UPDATE OF state ON public.space_members
  FOR EACH ROW WHEN (OLD.state IS DISTINCT FROM NEW.state)
  EXECUTE FUNCTION public.project_graph_authority_trigger();

DO $catchup$
DECLARE source_row record;
BEGIN
  FOR source_row IN SELECT id FROM public.profiles ORDER BY id LOOP
    PERFORM public.project_profile_graph_authority(source_row.id);
  END LOOP;
  FOR source_row IN SELECT id FROM public.voyages ORDER BY id LOOP
    PERFORM public.project_voyage_graph_authority(source_row.id);
  END LOOP;
  FOR source_row IN SELECT id FROM public.spaces ORDER BY id LOOP
    PERFORM public.project_space_graph_authority(source_row.id);
  END LOOP;
  FOR source_row IN SELECT id FROM public.voyage_members ORDER BY id LOOP
    PERFORM public.project_voyage_member_graph_authority(source_row.id);
  END LOOP;
  FOR source_row IN SELECT id FROM public.space_members ORDER BY id LOOP
    PERFORM public.project_space_member_graph_authority(source_row.id);
  END LOOP;
END
$catchup$;

REVOKE EXECUTE ON FUNCTION public.project_graph_authority_trigger()
  FROM PUBLIC, anon, authenticated, service_role;
