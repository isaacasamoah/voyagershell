SET statement_timeout = '30s';
DO $catalogue$
DECLARE restricted text[] := ARRAY['canonical_space_member_id',
  'get_knowledge_by_ids', 'get_voyage_messages', 'graph_traverse',
  'get_session_scope', 'get_or_create_active_session', 'get_resumable_sessions',
  'resume_session', 'archive_session', 'touch_session_activity',
  'get_last_active_voyage_slug', 'set_session_ai_presence',
  'remove_session_room_member', 'update_knowledge_embedding'];
  internal text[] := ARRAY['authorize_knowledge_scope', 'authorize_session_scope',
    'authorize_session_room_capability', 'knowledge_in_scope'];
  dead text[] := ARRAY['create_knowledge_event', 'get_knowledge_pending_embedding',
    'pin_knowledge', 'quiet_knowledge', 'search_memories', 'supersede_memory',
    'transition_session', 'mark_session_extracted', 'set_session_title'];
BEGIN
  -- Both whole-schema sweeps below audit PRODUCT callables. pgvector is
  -- installed into `public` on every real Voyager database, and it ships its own
  -- overloaded names (l2_distance, cosine_distance, vector_dims, …) already
  -- granted EXECUTE to PUBLIC. Judging those as product residue or as an ACL
  -- leak would fail against the live shape, so extension-owned functions are
  -- excluded here rather than hidden by putting the extension somewhere else.
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc function_row
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = function_row.pronamespace
    WHERE namespace.nspname = 'public' AND NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_depend dep
      WHERE dep.objid = function_row.oid AND dep.deptype = 'e'
        AND dep.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass)
    GROUP BY function_row.proname HAVING count(*) <> 1)
  THEN
    RAISE EXCEPTION 'installed_callable_overload_residue';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc function_row
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = function_row.pronamespace
    WHERE namespace.nspname = 'public' AND function_row.proname = ANY(dead))
  THEN
    RAISE EXCEPTION 'installed_dead_callable_residue';
  END IF;
  IF to_regprocedure('public.get_knowledge_by_ids(uuid[],uuid,text)') IS NULL
    OR to_regprocedure('public.get_voyage_messages(uuid,text,timestamptz,integer)') IS NULL
    OR to_regprocedure('public.graph_traverse(uuid,uuid,text,text,text,integer,double precision,integer)') IS NULL
    OR to_regprocedure('public.resume_session(uuid,uuid)') IS NULL
  THEN
    RAISE EXCEPTION 'installed_callable_identity_mismatch';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc function_row
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = function_row.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(function_row.proacl,
      pg_catalog.acldefault('f', function_row.proowner))) acl
    LEFT JOIN pg_catalog.pg_roles role_row ON role_row.oid = acl.grantee
    WHERE namespace.nspname = 'public'
      AND acl.privilege_type = 'EXECUTE'
      AND (acl.grantee = 0 OR role_row.rolname = 'anon')
      AND NOT EXISTS (SELECT 1 FROM pg_catalog.pg_depend dep
        WHERE dep.objid = function_row.oid AND dep.deptype = 'e'
          AND dep.classid = 'pg_catalog.pg_proc'::pg_catalog.regclass))
  THEN
    RAISE EXCEPTION 'installed_public_callable_acl_leak';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc function_row
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = function_row.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(function_row.proacl,
      pg_catalog.acldefault('f', function_row.proowner))) acl
    JOIN pg_catalog.pg_roles role_row ON role_row.oid = acl.grantee
    WHERE namespace.nspname = 'public' AND function_row.proname = ANY(restricted)
      AND acl.privilege_type = 'EXECUTE' AND role_row.rolname = 'authenticated')
  THEN
    RAISE EXCEPTION 'installed_restricted_callable_acl_leak';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc function_row
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = function_row.pronamespace
    CROSS JOIN LATERAL pg_catalog.aclexplode(coalesce(function_row.proacl,
      pg_catalog.acldefault('f', function_row.proowner))) acl
    LEFT JOIN pg_catalog.pg_roles role_row ON role_row.oid = acl.grantee
    WHERE namespace.nspname = 'public' AND function_row.proname = ANY(internal)
      AND acl.privilege_type = 'EXECUTE'
      AND (acl.grantee = 0 OR role_row.rolname IN ('anon', 'authenticated', 'service_role')))
  THEN
    RAISE EXCEPTION 'installed_internal_callable_acl_leak';
  END IF;
  IF EXISTS (SELECT 1 FROM unnest(restricted) name WHERE NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc function_row
    JOIN pg_catalog.pg_namespace namespace ON namespace.oid = function_row.pronamespace
    WHERE namespace.nspname = 'public' AND function_row.proname = name
      AND has_function_privilege('service_role', function_row.oid, 'EXECUTE')))
  THEN
    RAISE EXCEPTION 'installed_service_callable_acl_missing';
  END IF;
END
$catalogue$;
SET ROLE anon;
DO $anon$
BEGIN
  BEGIN
    PERFORM public.resume_session('22000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001');
    RAISE EXCEPTION 'installed_anon_resume_accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
  BEGIN
    PERFORM public.get_knowledge_by_ids(
      ARRAY['30000000-0000-4000-8000-000000000001']::uuid[],
      '10000000-0000-4000-8000-000000000002', 'installed-authority');
    RAISE EXCEPTION 'installed_anon_knowledge_accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END
$anon$;
RESET ROLE;
