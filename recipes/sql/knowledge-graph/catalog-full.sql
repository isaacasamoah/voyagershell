WITH objects AS (
  SELECT 'relation' object_type, c.relname object_name,
    c.relkind::text || ':' || coalesce(c.relacl::text, '') detail
  FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
  UNION ALL
  SELECT 'function', p.proname, pg_catalog.pg_get_function_identity_arguments(p.oid) || ':' ||
    CASE WHEN p.prokind IN ('f','p') THEN md5(pg_catalog.pg_get_functiondef(p.oid))
      ELSE md5(to_jsonb(p)::text) END || ':' || coalesce(p.proacl::text, '')
  FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
  UNION ALL
  SELECT 'type', t.typname, t.typtype::text
  FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
  WHERE n.nspname = 'public'
  UNION ALL
  SELECT 'trigger', t.tgname, c.relname
  FROM pg_catalog.pg_trigger t JOIN pg_catalog.pg_class c ON c.oid = t.tgrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND NOT t.tgisinternal
  UNION ALL
  SELECT 'column', table_name || '.' || column_name,
    data_type || ':' || is_nullable || ':' || coalesce(column_default, '') || ':' ||
      is_generated || ':' || coalesce(generation_expression, '')
  FROM information_schema.columns WHERE table_schema = 'public'
  UNION ALL
  SELECT 'policy', policyname,
    tablename || ':' || cmd || ':' || md5(coalesce(qual, '') || ':' || coalesce(with_check, ''))
  FROM pg_catalog.pg_policies WHERE schemaname = 'public'
  UNION ALL
  SELECT 'constraint', con.conname, c.relname
  FROM pg_catalog.pg_constraint con JOIN pg_catalog.pg_class c ON c.oid = con.conrelid
  JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'
)
SELECT object_type, object_name, detail FROM objects ORDER BY object_type, object_name, detail;
