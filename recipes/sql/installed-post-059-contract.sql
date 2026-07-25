-- Read-only catalogue/type/ACL contract for the installed authority boundary
-- after product migrations 054–059. Callers accept only the exact marker.
WITH
expected_columns(table_name, column_name, type_name, not_null) AS (VALUES
  ('voyage_members', 'state', 'text', true),
  ('voyage_members', 'state_changed_at', 'timestamp with time zone', true),
  ('voyage_members', 'revision', 'bigint', true),
  ('space_members', 'id', 'uuid', true),
  ('space_members', 'state', 'text', true),
  ('space_members', 'state_changed_at', 'timestamp with time zone', true),
  ('space_members', 'revision', 'bigint', true),
  ('sessions', 'status', 'session_status', true),
  ('knowledge_current', 'embedding', 'vector(1536)', false),
  ('knowledge_current', 'participants', 'uuid[]', false),
  ('knowledge_current', 'event_type', 'text', false),
  ('knowledge_current', 'sender_display_name', 'text', false),
  ('knowledge_current', 'sender_user_id', 'uuid', false),
  ('knowledge_current', 'addressed_to', 'uuid[]', false),
  ('knowledge_current', 'search_vector', 'tsvector', false),
  ('knowledge_current', 'superseded_by', 'uuid', false),
  ('knowledge_current', 'base_attention', 'double precision', false),
  ('knowledge_current', 'promotion_count', 'integer', false)
),
expected_functions(
  function_name, identity_arguments, security_definer,
  public_execute, anon_execute, authenticated_execute, service_execute
) AS (VALUES
  ('update_knowledge_embedding', 'uuid, vector',
    true, false, false, false, true),
  ('search_knowledge',
    'vector, uuid, text, text[], double precision, integer, text, double precision',
    true, false, false, true, true),
  ('keyword_search', 'text, uuid, text, text, double precision, integer',
    true, false, false, true, true),
  ('scoped_knowledge_fetch',
    'uuid, text, text, text, boolean, timestamp with time zone, timestamp with time zone, double precision, integer, uuid',
    true, false, false, true, true),
  ('graph_traverse',
    'uuid, uuid, text, text, text, integer, double precision, integer',
    true, false, false, false, true),
  ('get_knowledge_by_ids', 'uuid[], uuid, text',
    true, false, false, false, true),
  ('get_voyage_messages', 'uuid, text, timestamp with time zone, integer',
    true, false, false, false, true),
  ('authorize_session_scope', 'uuid, uuid, boolean',
    true, false, false, false, false),
  ('authorize_session_room_capability', 'uuid, uuid',
    true, false, false, false, false),
  ('get_session_scope', 'uuid, uuid',
    true, false, false, false, true),
  ('get_or_create_active_session', 'uuid, text',
    true, false, false, false, true),
  ('get_resumable_sessions', 'uuid, text, integer',
    true, false, false, false, true),
  ('resume_session', 'uuid, uuid',
    true, false, false, false, true),
  ('archive_session', 'uuid, uuid',
    true, false, false, false, true),
  ('touch_session_activity', 'uuid, uuid',
    true, false, false, false, true),
  ('get_last_active_voyage_slug', 'uuid',
    true, false, false, false, true),
  ('set_session_ai_presence', 'uuid, uuid, boolean',
    true, false, false, false, true),
  ('remove_session_room_member', 'uuid, uuid, uuid',
    true, false, false, false, true),
  ('create_room_invite', 'uuid, uuid, uuid',
    true, false, false, false, true),
  ('transition_room_invite', 'uuid, uuid, uuid, text',
    true, false, false, false, true),
  ('promote_private_voyager_reply', 'uuid, uuid, uuid',
    true, false, false, false, true),
  ('canonical_space_member_id', 'uuid, uuid',
    false, false, false, false, true),
  ('is_effective_space_member', 'uuid, uuid',
    true, false, false, false, true),
  ('get_effective_space_member_ids', 'uuid',
    true, false, false, false, true),
  ('authorize_knowledge_scope', 'text, uuid, text',
    true, false, false, false, false),
  ('knowledge_in_scope', 'uuid, text, text, text, uuid[], uuid, text, uuid[]',
    true, false, false, false, false)
),
actual_columns AS (
  SELECT relation.relname AS table_name, attribute.attname AS column_name,
    regexp_replace(
      pg_catalog.format_type(attribute.atttypid, attribute.atttypmod),
      '^(public|extensions)\.', ''
    ) AS type_name,
    attribute.attnotnull AS not_null,
    attribute.attgenerated AS generated
  FROM pg_catalog.pg_class relation
  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
  JOIN pg_catalog.pg_attribute attribute ON attribute.attrelid = relation.oid
  WHERE namespace.nspname = 'public' AND relation.relkind IN ('r', 'p')
    AND attribute.attnum > 0 AND NOT attribute.attisdropped
),
actual_functions AS (
  SELECT function_row.oid, function_row.proname AS function_name,
    regexp_replace(
      pg_catalog.oidvectortypes(function_row.proargtypes),
      '(public|extensions)\.', '', 'g'
    ) AS identity_arguments,
    function_row.prosecdef AS security_definer,
    function_row.proconfig AS function_config,
    EXISTS (
      SELECT 1
      FROM pg_catalog.aclexplode(coalesce(
        function_row.proacl,
        pg_catalog.acldefault('f', function_row.proowner)
      )) acl
      WHERE acl.grantee = 0 AND acl.privilege_type = 'EXECUTE'
    ) AS public_execute,
    pg_catalog.has_function_privilege('anon', function_row.oid, 'EXECUTE')
      AS anon_execute,
    pg_catalog.has_function_privilege('authenticated', function_row.oid, 'EXECUTE')
      AS authenticated_execute,
    pg_catalog.has_function_privilege('service_role', function_row.oid, 'EXECUTE')
      AS service_execute
  FROM pg_catalog.pg_proc function_row
  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = function_row.pronamespace
  WHERE namespace.nspname = 'public' AND function_row.prokind = 'f'
),
failures AS (
  SELECT 'column:' || expected.table_name || '.' || expected.column_name AS failure
  FROM expected_columns expected
  LEFT JOIN actual_columns actual USING (table_name, column_name)
  WHERE actual.column_name IS NULL OR actual.type_name <> expected.type_name
    OR actual.not_null <> expected.not_null
  UNION ALL
  SELECT 'generated_space_member_id'
  WHERE NOT EXISTS (
    SELECT 1 FROM actual_columns
    WHERE table_name = 'space_members' AND column_name = 'id'
      AND generated = 's'
  )
  UNION ALL
  SELECT 'function:' || expected.function_name
  FROM expected_functions expected
  LEFT JOIN actual_functions actual
    ON actual.function_name = expected.function_name
    AND actual.identity_arguments = expected.identity_arguments
  WHERE actual.oid IS NULL
    OR actual.security_definer <> expected.security_definer
    OR actual.public_execute <> expected.public_execute
    OR actual.anon_execute <> expected.anon_execute
    OR actual.authenticated_execute <> expected.authenticated_execute
    OR actual.service_execute <> expected.service_execute
  UNION ALL
  SELECT 'function_overload:' || expected.function_name
  FROM expected_functions expected
  JOIN actual_functions actual USING (function_name)
  GROUP BY expected.function_name HAVING count(*) <> 1
  UNION ALL
  SELECT 'dead_function:' || actual.function_name
  FROM actual_functions actual
  WHERE actual.function_name IN (
    'create_knowledge_event', 'get_knowledge_pending_embedding',
    'mark_session_extracted', 'pin_knowledge', 'quiet_knowledge',
    'search_memories', 'set_session_title', 'supersede_memory',
    'transition_session'
  )
  UNION ALL
  SELECT 'session_function_search_path:' || actual.function_name
  FROM actual_functions actual
  WHERE actual.function_name IN (
      'authorize_session_scope', 'authorize_session_room_capability',
      'get_session_scope',
      'get_or_create_active_session', 'get_resumable_sessions',
      'resume_session', 'archive_session', 'touch_session_activity',
      'get_last_active_voyage_slug', 'set_session_ai_presence',
      'remove_session_room_member'
    )
    AND actual.function_config IS DISTINCT FROM
      ARRAY['search_path=pg_catalog, public']::text[]
  UNION ALL
  SELECT 'connected_to_residue'
  WHERE EXISTS (
    SELECT 1 FROM actual_columns
    WHERE table_name = 'knowledge_current' AND column_name = 'connected_to'
  )
  UNION ALL
  SELECT 'membership_revision_check'
  WHERE (
    SELECT count(*)
    FROM pg_catalog.pg_constraint constraint_row
    WHERE constraint_row.contype = 'c'
      AND constraint_row.conrelid IN (
        'public.voyage_members'::pg_catalog.regclass,
        'public.space_members'::pg_catalog.regclass
      )
      AND pg_catalog.pg_get_constraintdef(constraint_row.oid) LIKE '%revision > 0%'
  ) <> 2
  UNION ALL
  SELECT 'space_member_generated_identity'
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_constraint constraint_row
    WHERE constraint_row.conrelid = 'public.space_members'::pg_catalog.regclass
      AND constraint_row.contype = 'u'
      AND pg_catalog.pg_get_constraintdef(constraint_row.oid) LIKE '%(id)%'
  )
  UNION ALL
  SELECT 'session_cleanup_residue'
  WHERE pg_catalog.to_regprocedure(
      'public.transition_session(uuid,public.session_status)'
    ) IS NOT NULL
    OR pg_catalog.to_regprocedure('public.mark_session_extracted(uuid)') IS NOT NULL
    OR pg_catalog.to_regprocedure('public.set_session_title(uuid,text)') IS NOT NULL
  UNION ALL
  SELECT 'session_table_privilege:' || privilege_name
  FROM unnest(ARRAY[
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
  ]) AS denied(privilege_name)
  WHERE pg_catalog.has_table_privilege(
    'service_role', 'public.sessions', privilege_name
  )
  UNION ALL
  SELECT 'session_column_privilege:' || privilege_name
  FROM unnest(ARRAY[
    'SELECT', 'INSERT', 'UPDATE', 'REFERENCES'
  ]) AS denied(privilege_name)
  WHERE pg_catalog.has_any_column_privilege(
    'service_role', 'public.sessions', privilege_name
  )
)
SELECT 'INSTALLED_POST_059_CONTRACT_GREEN' AS postcondition_marker
WHERE NOT EXISTS (SELECT 1 FROM failures);
