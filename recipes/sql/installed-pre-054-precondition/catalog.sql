-- Read-only catalogue projections shared by local and hosted precondition proof.
actual_columns AS (
  SELECT relation.relname AS table_name, attribute.attname AS column_name,
    regexp_replace(
      pg_catalog.format_type(attribute.atttypid, attribute.atttypmod),
      '^(public|extensions)\.', ''
    ) AS type_name,
    attribute.attnotnull AS not_null,
    pg_catalog.pg_get_expr(default_row.adbin, default_row.adrelid)
      AS default_expression
  FROM pg_catalog.pg_class relation
  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
  JOIN pg_catalog.pg_attribute attribute ON attribute.attrelid = relation.oid
  LEFT JOIN pg_catalog.pg_attrdef default_row
    ON default_row.adrelid = attribute.attrelid
    AND default_row.adnum = attribute.attnum
  WHERE namespace.nspname = 'public' AND relation.relkind IN ('r', 'p')
    AND attribute.attnum > 0 AND NOT attribute.attisdropped
),
actual_enums AS (
  SELECT type_row.typname AS type_name,
    array_agg(enum_row.enumlabel::text ORDER BY enum_row.enumsortorder)
      AS enum_values
  FROM pg_catalog.pg_type type_row
  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = type_row.typnamespace
  JOIN pg_catalog.pg_enum enum_row ON enum_row.enumtypid = type_row.oid
  WHERE namespace.nspname = 'public'
  GROUP BY type_row.typname
),
actual_functions AS (
  SELECT function_row.oid, function_row.proname AS function_name,
    regexp_replace(
      pg_catalog.oidvectortypes(function_row.proargtypes),
      '(public|extensions)\.', '', 'g'
    ) AS identity_arguments,
    function_row.prosecdef AS security_definer,
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
key_columns AS (
  SELECT relation.relname AS table_name, constraint_row.contype,
    array_agg(attribute.attname::text ORDER BY key_row.ordinal) AS columns
  FROM pg_catalog.pg_constraint constraint_row
  JOIN pg_catalog.pg_class relation ON relation.oid = constraint_row.conrelid
  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
  CROSS JOIN LATERAL unnest(constraint_row.conkey)
    WITH ORDINALITY key_row(attnum, ordinal)
  JOIN pg_catalog.pg_attribute attribute
    ON attribute.attrelid = relation.oid AND attribute.attnum = key_row.attnum
  WHERE namespace.nspname = 'public' AND constraint_row.contype IN ('p', 'u')
  GROUP BY relation.relname, constraint_row.oid, constraint_row.contype
),
actual_triggers AS (
  SELECT relation.relname AS table_name, trigger_row.tgname AS trigger_name,
    function_row.proname AS function_name, trigger_row.tgtype AS trigger_type,
    trigger_row.tgenabled AS enabled
  FROM pg_catalog.pg_trigger trigger_row
  JOIN pg_catalog.pg_class relation ON relation.oid = trigger_row.tgrelid
  JOIN pg_catalog.pg_namespace relation_namespace
    ON relation_namespace.oid = relation.relnamespace
  JOIN pg_catalog.pg_proc function_row ON function_row.oid = trigger_row.tgfoid
  JOIN pg_catalog.pg_namespace function_namespace
    ON function_namespace.oid = function_row.pronamespace
  WHERE relation_namespace.nspname = 'public'
    AND function_namespace.nspname = 'public' AND NOT trigger_row.tgisinternal
),
actual_foreign_keys AS (
  SELECT relation.relname AS table_name,
    constraint_row.conname AS constraint_name,
    ARRAY(
      SELECT attribute.attname::text
      FROM unnest(constraint_row.conkey)
        WITH ORDINALITY key_row(attnum, ordinal)
      JOIN pg_catalog.pg_attribute attribute
        ON attribute.attrelid = relation.oid
        AND attribute.attnum = key_row.attnum
      ORDER BY key_row.ordinal
    ) AS columns,
    referenced_relation.relname AS referenced_table,
    ARRAY(
      SELECT attribute.attname::text
      FROM unnest(constraint_row.confkey)
        WITH ORDINALITY key_row(attnum, ordinal)
      JOIN pg_catalog.pg_attribute attribute
        ON attribute.attrelid = referenced_relation.oid
        AND attribute.attnum = key_row.attnum
      ORDER BY key_row.ordinal
    ) AS referenced_columns,
    constraint_row.confdeltype AS delete_action,
    constraint_row.condeferrable AS is_deferrable,
    constraint_row.condeferred AS is_deferred
  FROM pg_catalog.pg_constraint constraint_row
  JOIN pg_catalog.pg_class relation ON relation.oid = constraint_row.conrelid
  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
  JOIN pg_catalog.pg_class referenced_relation
    ON referenced_relation.oid = constraint_row.confrelid
  JOIN pg_catalog.pg_namespace referenced_namespace
    ON referenced_namespace.oid = referenced_relation.relnamespace
  WHERE constraint_row.contype = 'f' AND namespace.nspname = 'public'
    AND referenced_namespace.nspname = 'public'
),
actual_checks AS (
  SELECT relation.relname AS table_name,
    pg_catalog.pg_get_expr(
      constraint_row.conbin,
      constraint_row.conrelid
    ) AS check_expression
  FROM pg_catalog.pg_constraint constraint_row
  JOIN pg_catalog.pg_class relation ON relation.oid = constraint_row.conrelid
  JOIN pg_catalog.pg_namespace namespace ON namespace.oid = relation.relnamespace
  WHERE constraint_row.contype = 'c' AND namespace.nspname = 'public'
),
