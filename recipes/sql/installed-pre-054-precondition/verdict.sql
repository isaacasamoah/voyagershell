-- Deterministic bounded verdict. Green and failure both use one scalar column
-- so psql and the Management API observe the same logical result.
failures AS (
  SELECT 'missing_table:' || expected.table_name AS failure
  FROM expected_tables expected
  WHERE pg_catalog.to_regclass('public.' || expected.table_name) IS NULL
  UNION ALL
  SELECT 'column:' || expected.table_name || '.' || expected.column_name
  FROM expected_columns expected
  LEFT JOIN actual_columns actual USING (table_name, column_name)
  WHERE actual.column_name IS NULL OR actual.type_name <> expected.type_name
    OR actual.not_null <> expected.not_null
  UNION ALL
  SELECT 'enum:' || expected.type_name
  FROM expected_enums expected
  LEFT JOIN actual_enums actual USING (type_name)
  WHERE actual.enum_values IS DISTINCT FROM expected.enum_values
  UNION ALL
  SELECT 'default:' || expected.table_name || '.' || expected.column_name
  FROM expected_defaults expected
  LEFT JOIN actual_columns actual USING (table_name, column_name)
  WHERE actual.default_expression IS DISTINCT FROM expected.default_expression
  UNION ALL
  SELECT 'table_privilege:' || expected.role_name || ':' ||
    expected.table_name || ':' || expected.privilege_name
  FROM expected_table_privileges expected
  WHERE pg_catalog.to_regclass('public.' || expected.table_name) IS NULL
    OR NOT pg_catalog.has_table_privilege(
      expected.role_name,
      pg_catalog.to_regclass('public.' || expected.table_name),
      expected.privilege_name
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
  SELECT 'unexpected_function_identity:' || actual.function_name
  FROM actual_functions actual
  WHERE actual.function_name IN (
      SELECT function_name FROM expected_functions
    )
    AND NOT EXISTS (
      SELECT 1 FROM expected_functions expected
      WHERE expected.function_name = actual.function_name
        AND expected.identity_arguments = actual.identity_arguments
    )
    AND NOT EXISTS (
      SELECT 1 FROM allowed_cleanup_functions cleanup
      WHERE cleanup.function_name = actual.function_name
        AND cleanup.identity_arguments = actual.identity_arguments
    )
  UNION ALL
  SELECT 'unexpected_cleanup_function:' || actual.function_name
  FROM actual_functions actual
  WHERE actual.function_name IN ('search_memories', 'supersede_memory')
    AND NOT EXISTS (
      SELECT 1 FROM allowed_cleanup_functions cleanup
      WHERE cleanup.function_name = actual.function_name
        AND cleanup.identity_arguments = actual.identity_arguments
    )
  UNION ALL
  SELECT 'promotion_function_result'
  WHERE pg_catalog.pg_get_function_result(
    pg_catalog.to_regprocedure(
      'public.promote_private_voyager_reply(uuid,uuid,uuid)'
    )
  ) IS DISTINCT FROM
    'TABLE(shared_event_id uuid, status text, shared_content text)'
  UNION ALL
  SELECT 'pre054_membership_shape'
  WHERE EXISTS (
    SELECT 1 FROM actual_columns
    WHERE (table_name = 'voyage_members'
        AND column_name IN ('state', 'state_changed_at', 'revision'))
      OR (table_name = 'space_members'
        AND column_name IN ('id', 'state_changed_at', 'revision'))
      OR (table_name = 'knowledge_current' AND column_name = 'connected_to')
  )
  UNION ALL
  SELECT 'voyage_invite_identity'
  WHERE NOT EXISTS (
    SELECT 1 FROM key_columns WHERE table_name = 'voyages'
      AND contype = 'u' AND columns = ARRAY['invite_code']
  )
  UNION ALL
  SELECT 'voyage_member_identity'
  WHERE NOT EXISTS (
    SELECT 1 FROM key_columns WHERE table_name = 'voyage_members'
      AND contype = 'u' AND columns = ARRAY['voyage_id', 'user_id']
  )
  UNION ALL
  SELECT 'space_member_identity'
  WHERE NOT EXISTS (
    SELECT 1 FROM key_columns WHERE table_name = 'space_members'
      AND contype = 'p' AND columns = ARRAY['space_id', 'user_id']
  )
  UNION ALL
  SELECT 'authority_uniqueness'
  WHERE (
    SELECT count(*) FROM key_columns
    WHERE (table_name = 'knowledge_edges' AND contype = 'u'
        AND columns = ARRAY['source_id', 'target_id', 'edge_type'])
      OR (table_name = 'message_deliveries' AND contype = 'u'
        AND columns = ARRAY['event_id', 'recipient_user_id'])
      OR (table_name = 'private_reply_promotions' AND contype = 'p'
        AND columns =
          ARRAY['source_event_id', 'sharer_user_id', 'destination_space_id'])
      OR (table_name = 'private_reply_promotions' AND contype = 'u'
        AND columns = ARRAY['shared_event_id'])
  ) <> 4
  UNION ALL
  SELECT 'space_members_extra_column'
  WHERE EXISTS (
    SELECT 1 FROM actual_columns
    WHERE table_name = 'space_members'
      AND column_name NOT IN ('space_id', 'user_id', 'state', 'added_at')
  )
  UNION ALL
  SELECT 'event_projection_trigger'
  WHERE EXISTS (
    SELECT 1 FROM expected_triggers expected
    LEFT JOIN actual_triggers actual
      USING (table_name, trigger_name)
    WHERE actual.trigger_name IS NULL
      OR actual.function_name <> expected.function_name
      OR actual.trigger_type <> expected.trigger_type
      OR actual.enabled <> expected.enabled
  )
  UNION ALL
  SELECT 'spaces_id_default'
  WHERE (
    SELECT pg_catalog.pg_get_expr(default_row.adbin, default_row.adrelid)
    FROM pg_catalog.pg_attribute attribute
    LEFT JOIN pg_catalog.pg_attrdef default_row
      ON default_row.adrelid = attribute.attrelid
      AND default_row.adnum = attribute.attnum
    WHERE attribute.attrelid = pg_catalog.to_regclass('public.spaces')
      AND attribute.attname = 'id'
  ) IS DISTINCT FROM 'gen_random_uuid()'
  UNION ALL
  SELECT 'space_members_state_check'
  WHERE NOT EXISTS (
    SELECT 1 FROM expected_checks expected
    JOIN actual_checks actual USING (table_name, check_expression)
  )
  UNION ALL
  SELECT 'promotion_foreign_keys'
  WHERE EXISTS (
    SELECT 1 FROM expected_foreign_keys expected
    LEFT JOIN actual_foreign_keys actual
      USING (table_name, constraint_name)
    WHERE actual.constraint_name IS NULL
      OR actual.columns IS DISTINCT FROM expected.columns
      OR actual.referenced_table <> expected.referenced_table
      OR actual.referenced_columns IS DISTINCT FROM expected.referenced_columns
      OR actual.delete_action <> expected.delete_action
      OR actual.is_deferrable <> expected.is_deferrable
      OR actual.is_deferred <> expected.is_deferred
  )
  OR (
    SELECT count(*) FROM actual_foreign_keys
    WHERE table_name = 'private_reply_promotions'
  ) <> (
    SELECT count(*) FROM expected_foreign_keys
    WHERE table_name = 'private_reply_promotions'
  )
)
SELECT coalesce(
  (
    SELECT failure
    FROM failures
    ORDER BY (failure LIKE 'missing_table:%') DESC, failure COLLATE "C"
    LIMIT 1
  ),
  'INSTALLED_PRE_054_PRECONDITION_GREEN'
) AS precondition_marker;
