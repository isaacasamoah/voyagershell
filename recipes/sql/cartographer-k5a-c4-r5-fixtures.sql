-- K5a C4 R5: exact vector distance over the membership-indexed authorized set.
-- Row sources, named access paths, rows read and rows removed are
-- design-integrity checks, never privacy proxies or literal executor placement.
-- No planner GUC or ANN setting is permitted.

CREATE OR REPLACE FUNCTION public.k5a_c4_seed_private_units(
  p_person_id uuid,
  p_key_prefix text,
  p_count integer,
  p_target_vector vector(1536) DEFAULT NULL,
  p_attention real DEFAULT 0.7
) RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
DECLARE
  v_audience_id uuid := public.canonical_knowledge_audience_id(
    'source', 'private', p_person_id, ARRAY[p_person_id]
  );
BEGIN
  IF p_count < 0 OR length(btrim(p_key_prefix)) = 0
    OR p_attention IS NULL OR p_attention NOT BETWEEN 0 AND 1 THEN
    RAISE EXCEPTION 'k5a_c4_seed_input_invalid';
  END IF;
  INSERT INTO public.knowledge_audiences(
    id, purpose, scope_kind, scope_authority_id, member_profile_ids
  ) VALUES (
    v_audience_id, 'source', 'private', p_person_id, ARRAY[p_person_id]
  ) ON CONFLICT DO NOTHING;

  WITH shaped AS MATERIALIZED (
    SELECT series,
      md5(format('k5a-c4-r5-event:%s:%s:%s',
        p_person_id, p_key_prefix, series))::uuid AS event_id,
      md5(format('k5a-c4-r5-unit:%s:%s:%s',
        p_person_id, p_key_prefix, series))::uuid AS unit_id,
      format('R5 exact-vector %s item %s.', p_key_prefix, series) AS claim,
      clock_timestamp() + make_interval(secs => series / 1000000.0)
        AS created_at
    FROM generate_series(1, p_count) series
  )
  INSERT INTO public.knowledge_events(
    id, user_id, event_type, content, metadata, source_type, source_ref,
    actor_id, actor_type, created_at, participants, knowledge_audience_id
  )
  SELECT event_id, p_person_id, 'message', claim,
    jsonb_build_object('proof', 'k5a-c4-r5'), 'conversation',
    jsonb_build_object('proof_key', p_key_prefix, 'series', series),
    p_person_id, 'user', created_at, ARRAY[p_person_id], v_audience_id
  FROM shaped
  ON CONFLICT (id) DO NOTHING;

  WITH shaped AS MATERIALIZED (
    SELECT series,
      md5(format('k5a-c4-r5-event:%s:%s:%s',
        p_person_id, p_key_prefix, series))::uuid AS event_id,
      md5(format('k5a-c4-r5-unit:%s:%s:%s',
        p_person_id, p_key_prefix, series))::uuid AS unit_id,
      format('R5 exact-vector %s item %s.', p_key_prefix, series) AS claim
    FROM generate_series(1, p_count) series
  )
  INSERT INTO public.knowledge_units(
    id, claim, source_event_id, extractor_version, claim_key,
    knowledge_audience_id, knowledge_type, attention_score, embedding
  )
  SELECT unit_id, claim, event_id, 'k5a-c4-r5-proof',
    format('proof:%s:%s', p_key_prefix, series), v_audience_id,
    'domain', p_attention,
    CASE WHEN series = 1 AND p_target_vector IS NOT NULL
      THEN p_target_vector
      ELSE (ARRAY[1::real] || array_fill(0::real, ARRAY[1535]))::vector
    END
  FROM shaped
  ON CONFLICT (id) DO NOTHING;

  WITH shaped AS MATERIALIZED (
    SELECT series,
      md5(format('k5a-c4-r5-event:%s:%s:%s',
        p_person_id, p_key_prefix, series))::uuid AS event_id,
      md5(format('k5a-c4-r5-unit:%s:%s:%s',
        p_person_id, p_key_prefix, series))::uuid AS unit_id,
      format('R5 exact-vector %s item %s.', p_key_prefix, series) AS claim
    FROM generate_series(1, p_count) series
  )
  INSERT INTO public.graph_nodes(id, kind, authority_id, label)
  SELECT public.canonical_graph_node_id('knowledge_unit', unit_id),
    'knowledge_unit', unit_id, claim
  FROM shaped
  ON CONFLICT DO NOTHING;

  WITH shaped AS MATERIALIZED (
    SELECT series,
      md5(format('k5a-c4-r5-event:%s:%s:%s',
        p_person_id, p_key_prefix, series))::uuid AS event_id,
      md5(format('k5a-c4-r5-unit:%s:%s:%s',
        p_person_id, p_key_prefix, series))::uuid AS unit_id,
      format('R5 exact-vector %s item %s.', p_key_prefix, series) AS claim
    FROM generate_series(1, p_count) series
  )
  INSERT INTO public.graph_node_grants(
    node_id, knowledge_audience_id, basis_kind, basis_id, basis_version,
    label_snapshot, granted_at
  )
  SELECT public.canonical_graph_node_id('knowledge_unit', unit_id),
    v_audience_id, 'source_event', event_id, 1, claim, event.created_at
  FROM shaped
  JOIN public.knowledge_events event ON event.id = shaped.event_id
  ON CONFLICT DO NOTHING;
END
$$;
CREATE OR REPLACE FUNCTION public.k5a_c4_authorized_unit_count(
  p_viewer_profile_id uuid
) RETURNS integer
LANGUAGE sql STABLE
SET search_path = pg_catalog, public AS $$
  SELECT count(*)::integer
  FROM public.knowledge_audiences audience
  JOIN public.knowledge_units unit
    ON unit.knowledge_audience_id = audience.id
  WHERE audience.member_profile_ids @> ARRAY[p_viewer_profile_id]::uuid[]
    AND unit.embedding IS NOT NULL
    AND unit.knowledge_type IS NOT NULL
    AND unit.attention_score IS NOT NULL
    AND public.viewer_has_graph_node_grant(
      public.canonical_graph_node_id('knowledge_unit', unit.id),
      p_viewer_profile_id
    )
$$;

CREATE OR REPLACE FUNCTION public.k5a_c4_seed_foreign_backdrop(
  p_person_id uuid,
  p_count integer
) RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
DECLARE
  v_audience_id uuid := public.canonical_knowledge_audience_id(
    'source', 'private', p_person_id, ARRAY[p_person_id]
  );
BEGIN
  INSERT INTO public.knowledge_audiences(
    id, purpose, scope_kind, scope_authority_id, member_profile_ids
  ) VALUES (
    v_audience_id, 'source', 'private', p_person_id, ARRAY[p_person_id]
  ) ON CONFLICT DO NOTHING;

  WITH shaped AS MATERIALIZED (
    SELECT series,
      md5(format('k5a-c4-r5-backdrop-event:%s', series))::uuid AS event_id,
      md5(format('k5a-c4-r5-backdrop-unit:%s', series))::uuid AS unit_id
    FROM generate_series(1, p_count) series
  )
  INSERT INTO public.knowledge_events(
    id, user_id, event_type, content, metadata, source_type, source_ref,
    actor_id, actor_type, created_at, participants, knowledge_audience_id
  )
  SELECT event_id, p_person_id, 'message',
    format('R5 planner backdrop %s.', series),
    jsonb_build_object('proof', 'k5a-c4-r5-backdrop'), 'conversation',
    jsonb_build_object('series', series), p_person_id, 'user',
    clock_timestamp(), ARRAY[p_person_id], v_audience_id
  FROM shaped
  ON CONFLICT (id) DO NOTHING;

  WITH shaped AS MATERIALIZED (
    SELECT series,
      md5(format('k5a-c4-r5-backdrop-event:%s', series))::uuid AS event_id,
      md5(format('k5a-c4-r5-backdrop-unit:%s', series))::uuid AS unit_id
    FROM generate_series(1, p_count) series
  )
  INSERT INTO public.knowledge_units(
    id, claim, source_event_id, extractor_version, claim_key,
    knowledge_audience_id, knowledge_type, attention_score, embedding
  )
  SELECT unit_id, format('R5 planner backdrop %s.', series), event_id,
    'k5a-c4-r5-backdrop', format('proof:backdrop:%s', series),
    v_audience_id, NULL, NULL, NULL
  FROM shaped
  ON CONFLICT (id) DO NOTHING;
END
$$;
