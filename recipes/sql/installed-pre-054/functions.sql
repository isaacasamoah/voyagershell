SET search_path = public, extensions;

CREATE FUNCTION public.update_knowledge_embedding(uuid, vector)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT false $$;
CREATE FUNCTION public.create_knowledge_event(
  text, text, uuid, text, jsonb, text, jsonb, uuid
) RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$ SELECT NULL::uuid $$;
CREATE FUNCTION public.get_knowledge_pending_embedding(integer)
RETURNS SETOF jsonb LANGUAGE sql SECURITY DEFINER AS $$ SELECT NULL::jsonb WHERE false $$;
CREATE FUNCTION public.quiet_knowledge(uuid, text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT false $$;
CREATE FUNCTION public.pin_knowledge(uuid, text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT false $$;
CREATE FUNCTION public.search_memories(vector, uuid, double precision, integer)
RETURNS SETOF jsonb LANGUAGE sql SECURITY DEFINER AS $$
  SELECT NULL::jsonb WHERE false
$$;
CREATE FUNCTION public.supersede_memory(uuid, text, vector, double precision)
RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$ SELECT NULL::uuid $$;

CREATE FUNCTION public.search_knowledge(
  vector, uuid, text, text[], double precision, integer, text,
  double precision, uuid[]
) RETURNS SETOF jsonb LANGUAGE sql SECURITY DEFINER AS $$
  SELECT NULL::jsonb WHERE false
$$;
REVOKE EXECUTE ON FUNCTION public.search_knowledge(
  vector, uuid, text, text[], double precision, integer, text,
  double precision, uuid[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_knowledge(
  vector, uuid, text, text[], double precision, integer, text,
  double precision, uuid[]
) TO authenticated, service_role;
CREATE FUNCTION public.search_knowledge(
  vector, uuid, text, boolean, text[], double precision, double precision, integer
) RETURNS SETOF jsonb LANGUAGE sql SECURITY DEFINER AS $$
  SELECT NULL::jsonb WHERE false
$$;
CREATE FUNCTION public.search_knowledge(
  vector, uuid, text, boolean, text[], double precision, double precision,
  integer, text, double precision
) RETURNS SETOF jsonb LANGUAGE sql SECURITY DEFINER AS $$
  SELECT NULL::jsonb WHERE false
$$;

CREATE FUNCTION public.keyword_search(
  text, uuid, text, text, double precision, integer, uuid[]
) RETURNS SETOF jsonb LANGUAGE sql AS $$ SELECT NULL::jsonb WHERE false $$;
CREATE FUNCTION public.keyword_search(
  text, uuid, text, text, double precision, integer
) RETURNS SETOF jsonb LANGUAGE sql AS $$ SELECT NULL::jsonb WHERE false $$;
CREATE FUNCTION public.scoped_knowledge_fetch(
  uuid, text, uuid[], text, text, boolean, timestamptz, timestamptz,
  double precision, integer, uuid
) RETURNS SETOF jsonb LANGUAGE sql AS $$ SELECT NULL::jsonb WHERE false $$;
CREATE FUNCTION public.scoped_knowledge_fetch(
  uuid, text, uuid[], text, text, boolean, timestamptz, timestamptz,
  double precision, integer
) RETURNS SETOF jsonb LANGUAGE sql AS $$ SELECT NULL::jsonb WHERE false $$;
CREATE FUNCTION public.graph_traverse(
  uuid, text, text, integer, double precision, integer, uuid, text, uuid[]
) RETURNS SETOF jsonb LANGUAGE sql AS $$ SELECT NULL::jsonb WHERE false $$;
REVOKE EXECUTE ON FUNCTION public.graph_traverse(
  uuid, text, text, integer, double precision, integer, uuid, text, uuid[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.graph_traverse(
  uuid, text, text, integer, double precision, integer, uuid, text, uuid[]
) TO service_role;

CREATE FUNCTION public.get_or_create_active_session(uuid)
RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$ SELECT NULL::uuid $$;
CREATE FUNCTION public.get_resumable_sessions(uuid, integer)
RETURNS SETOF jsonb LANGUAGE sql SECURITY DEFINER AS $$ SELECT NULL::jsonb WHERE false $$;
CREATE FUNCTION public.resume_session(uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT false $$;
CREATE FUNCTION public.resume_session(uuid, uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT false $$;
CREATE FUNCTION public.transition_session(uuid, public.session_status)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT false $$;
CREATE FUNCTION public.mark_session_extracted(uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT false $$;
CREATE FUNCTION public.set_session_title(uuid, text)
RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT false $$;

CREATE FUNCTION public.generate_invite_code()
RETURNS text LANGUAGE sql VOLATILE AS $$ SELECT substr(md5(random()::text), 1, 12) $$;
CREATE FUNCTION public.create_voyage_with_captain(text, text, text, uuid)
RETURNS uuid LANGUAGE sql SECURITY DEFINER AS $$ SELECT NULL::uuid $$;
CREATE FUNCTION public.increment_promotion_count(uuid)
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$ SELECT 1 $$;
CREATE FUNCTION public.promote_private_voyager_reply(uuid, uuid, uuid)
RETURNS TABLE(shared_event_id uuid, status text, shared_content text)
LANGUAGE sql SECURITY DEFINER AS $$
  SELECT NULL::uuid, NULL::text, NULL::text WHERE false
$$;
REVOKE EXECUTE ON FUNCTION public.promote_private_voyager_reply(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.promote_private_voyager_reply(uuid, uuid, uuid)
  TO service_role;
