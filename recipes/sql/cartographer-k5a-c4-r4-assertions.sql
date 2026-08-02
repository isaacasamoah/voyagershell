-- K5a C4 R5: exact vector distance over the membership-indexed authorized set.
-- The battery asserts plan mechanism, never literal executor-node placement.
-- No planner GUC or ANN setting is permitted.

CREATE OR REPLACE FUNCTION public.k5a_c4_seed_private_units(
  p_person_id uuid,
  p_key_prefix text,
  p_count integer,
  p_target_vector vector(1536) DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
DECLARE
  v_audience_id uuid := public.canonical_knowledge_audience_id(
    'source', 'private', p_person_id, ARRAY[p_person_id]
  );
BEGIN
  IF p_count < 0 OR length(btrim(p_key_prefix)) = 0 THEN
    RAISE EXCEPTION 'k5a_c4_seed_input_invalid';
  END IF;
  INSERT INTO public.knowledge_audiences(
    id, purpose, scope_kind, scope_authority_id, member_profile_ids
  ) VALUES (
    v_audience_id, 'source', 'private', p_person_id, ARRAY[p_person_id]
  ) ON CONFLICT DO NOTHING;

  WITH shaped AS MATERIALIZED (
    SELECT series,
      md5(format('k5a-c4-r4-event:%s:%s:%s',
        p_person_id, p_key_prefix, series))::uuid AS event_id,
      md5(format('k5a-c4-r4-unit:%s:%s:%s',
        p_person_id, p_key_prefix, series))::uuid AS unit_id,
      format('R4 exact-vector %s item %s.', p_key_prefix, series) AS claim,
      clock_timestamp() + make_interval(secs => series / 1000000.0)
        AS created_at
    FROM generate_series(1, p_count) series
  )
  INSERT INTO public.knowledge_events(
    id, user_id, event_type, content, metadata, source_type, source_ref,
    actor_id, actor_type, created_at, participants, knowledge_audience_id
  )
  SELECT event_id, p_person_id, 'message', claim,
    jsonb_build_object('proof', 'k5a-c4-r4'), 'conversation',
    jsonb_build_object('proof_key', p_key_prefix, 'series', series),
    p_person_id, 'user', created_at, ARRAY[p_person_id], v_audience_id
  FROM shaped
  ON CONFLICT (id) DO NOTHING;

  WITH shaped AS MATERIALIZED (
    SELECT series,
      md5(format('k5a-c4-r4-event:%s:%s:%s',
        p_person_id, p_key_prefix, series))::uuid AS event_id,
      md5(format('k5a-c4-r4-unit:%s:%s:%s',
        p_person_id, p_key_prefix, series))::uuid AS unit_id,
      format('R4 exact-vector %s item %s.', p_key_prefix, series) AS claim
    FROM generate_series(1, p_count) series
  )
  INSERT INTO public.knowledge_units(
    id, claim, source_event_id, extractor_version, claim_key,
    knowledge_audience_id, knowledge_type, attention_score, embedding
  )
  SELECT unit_id, claim, event_id, 'k5a-c4-r4-proof',
    format('proof:%s:%s', p_key_prefix, series), v_audience_id,
    'domain', 0.7,
    CASE WHEN series = 1 AND p_target_vector IS NOT NULL
      THEN p_target_vector
      ELSE (ARRAY[1::real] || array_fill(0::real, ARRAY[1535]))::vector
    END
  FROM shaped
  ON CONFLICT (id) DO NOTHING;

  WITH shaped AS MATERIALIZED (
    SELECT series,
      md5(format('k5a-c4-r4-event:%s:%s:%s',
        p_person_id, p_key_prefix, series))::uuid AS event_id,
      md5(format('k5a-c4-r4-unit:%s:%s:%s',
        p_person_id, p_key_prefix, series))::uuid AS unit_id,
      format('R4 exact-vector %s item %s.', p_key_prefix, series) AS claim
    FROM generate_series(1, p_count) series
  )
  INSERT INTO public.graph_nodes(id, kind, authority_id, label)
  SELECT public.canonical_graph_node_id('knowledge_unit', unit_id),
    'knowledge_unit', unit_id, claim
  FROM shaped
  ON CONFLICT DO NOTHING;

  WITH shaped AS MATERIALIZED (
    SELECT series,
      md5(format('k5a-c4-r4-event:%s:%s:%s',
        p_person_id, p_key_prefix, series))::uuid AS event_id,
      md5(format('k5a-c4-r4-unit:%s:%s:%s',
        p_person_id, p_key_prefix, series))::uuid AS unit_id,
      format('R4 exact-vector %s item %s.', p_key_prefix, series) AS claim
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
    AND unit.attention_score > 0
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
      md5(format('k5a-c4-r4-backdrop-event:%s', series))::uuid AS event_id,
      md5(format('k5a-c4-r4-backdrop-unit:%s', series))::uuid AS unit_id
    FROM generate_series(1, p_count) series
  )
  INSERT INTO public.knowledge_events(
    id, user_id, event_type, content, metadata, source_type, source_ref,
    actor_id, actor_type, created_at, participants, knowledge_audience_id
  )
  SELECT event_id, p_person_id, 'message',
    format('R4 planner backdrop %s.', series),
    jsonb_build_object('proof', 'k5a-c4-r4-backdrop'), 'conversation',
    jsonb_build_object('series', series), p_person_id, 'user',
    clock_timestamp(), ARRAY[p_person_id], v_audience_id
  FROM shaped
  ON CONFLICT (id) DO NOTHING;

  WITH shaped AS MATERIALIZED (
    SELECT series,
      md5(format('k5a-c4-r4-backdrop-event:%s', series))::uuid AS event_id,
      md5(format('k5a-c4-r4-backdrop-unit:%s', series))::uuid AS unit_id
    FROM generate_series(1, p_count) series
  )
  INSERT INTO public.knowledge_units(
    id, claim, source_event_id, extractor_version, claim_key,
    knowledge_audience_id, knowledge_type, attention_score, embedding
  )
  SELECT unit_id, format('R4 planner backdrop %s.', series), event_id,
    'k5a-c4-r4-backdrop', format('proof:backdrop:%s', series),
    v_audience_id, NULL, NULL, NULL
  FROM shaped
  ON CONFLICT (id) DO NOTHING;
END
$$;

CREATE OR REPLACE FUNCTION public.k5a_c4_exact_search_plan(
  p_viewer_profile_id uuid,
  p_query_embedding vector(1536)
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
DECLARE
  v_plan jsonb;
BEGIN
  EXECUTE $plan$
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    WITH viewer_audiences AS MATERIALIZED (
      SELECT audience.id
      FROM public.knowledge_audiences audience
      WHERE audience.member_profile_ids @> ARRAY[$1]::uuid[]
    ), authorized_unit_ids AS MATERIALIZED (
      SELECT unit.id
      FROM viewer_audiences audience
      CROSS JOIN LATERAL (
        SELECT candidate.id
        FROM public.knowledge_units candidate
        WHERE candidate.knowledge_audience_id = audience.id
          AND candidate.embedding IS NOT NULL
          AND candidate.knowledge_type IS NOT NULL
          AND candidate.attention_score > 0
          AND public.viewer_has_graph_node_grant(
            public.canonical_graph_node_id('knowledge_unit', candidate.id), $1
          )
        ORDER BY candidate.id
        OFFSET 0
      ) unit
    ), authorized AS MATERIALIZED (
      SELECT unit.id AS unit_id, unit.claim,
        event.id AS source_event_id, event.content AS source_content,
        event.created_at AS source_created_at, unit.knowledge_type,
        unit.embedding <=> $2 AS distance
      FROM authorized_unit_ids authorized_id
      CROSS JOIN LATERAL (
        SELECT candidate.*
        FROM public.knowledge_units candidate
        WHERE candidate.id = authorized_id.id
        OFFSET 0
      ) unit
      CROSS JOIN LATERAL (
        SELECT source.id, source.content, source.created_at
        FROM public.knowledge_events source
        WHERE source.id = unit.source_event_id
        OFFSET 0
      ) event
      WHERE unit.embedding IS NOT NULL
        AND unit.knowledge_type IS NOT NULL
        AND unit.attention_score > 0
        AND NOT EXISTS (
          SELECT 1 FROM public.knowledge_unit_citations retirement
          WHERE retirement.knowledge_unit_id = unit.id
            AND retirement.person_id = $1
            AND retirement.act_kind = 'retired'
        )
    ), scored AS MATERIALIZED (
      SELECT authorized.*,
        public.knowledge_unit_effective_attention(unit_id, $1)
          AS effective_attention
      FROM authorized
    )
    SELECT unit_id
    FROM scored
    WHERE effective_attention > 0 AND 1 - distance >= 0.99
    ORDER BY distance, unit_id
    LIMIT 10
  $plan$ INTO STRICT v_plan USING p_viewer_profile_id, p_query_embedding;
  RETURN v_plan;
END
$$;

CREATE OR REPLACE FUNCTION public.k5a_c4_plan_nodes(p_plan jsonb)
RETURNS TABLE(path text, node jsonb)
LANGUAGE sql IMMUTABLE STRICT
SET search_path = pg_catalog AS $$
  WITH RECURSIVE nodes(node, path) AS (
    SELECT p_plan->0->'Plan', '0000'::text
    UNION ALL
    SELECT child.value,
      nodes.path || '.' || lpad(child.ordinality::text, 4, '0')
    FROM nodes
    CROSS JOIN LATERAL jsonb_array_elements(
      coalesce(nodes.node->'Plans', '[]'::jsonb)
    ) WITH ORDINALITY child(value, ordinality)
  )
  SELECT path, node
  FROM nodes
$$;

CREATE OR REPLACE FUNCTION public.k5a_c4_plan_mechanism(
  p_plan jsonb,
  p_authorized_cardinality integer
) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE STRICT
SET search_path = pg_catalog, public AS $$
DECLARE
  v_row_sources text[];
  v_unit_rows_read bigint;
  v_rows_removed bigint;
  v_access_paths jsonb;
BEGIN
  SELECT array_agg(source ORDER BY source) INTO v_row_sources
  FROM (
    SELECT DISTINCT node->>'Relation Name' AS source
    FROM public.k5a_c4_plan_nodes(p_plan)
    WHERE node ? 'Relation Name'
  ) sources;

  SELECT coalesce(sum(
    (node->>'Actual Rows')::bigint * (node->>'Actual Loops')::bigint
  ), 0) INTO v_unit_rows_read
  FROM public.k5a_c4_plan_nodes(p_plan)
  WHERE node->>'Relation Name' = 'knowledge_units'
    AND node->>'Index Name' = 'knowledge_units_pkey';

  SELECT coalesce(sum(
    coalesce((node->>'Rows Removed by Filter')::bigint, 0)
    + coalesce((node->>'Rows Removed by Index Recheck')::bigint, 0)
  ), 0) INTO v_rows_removed
  FROM public.k5a_c4_plan_nodes(p_plan)
  WHERE node->>'Relation Name' = 'knowledge_units'
    OR node->>'Alias' IN ('unit', 'candidate');

  v_access_paths := jsonb_build_object(
    'knowledge_audiences', 'knowledge_audiences_member_profile_ids_lookup',
    'knowledge_units_membership', 'knowledge_units_audience_lookup',
    'knowledge_units_hydration', 'knowledge_units_pkey',
    'knowledge_events', 'knowledge_events_pkey',
    'knowledge_unit_citations', 'knowledge_unit_retirements_lookup'
  );

  IF v_row_sources IS DISTINCT FROM ARRAY[
      'knowledge_audiences', 'knowledge_events',
      'knowledge_unit_citations', 'knowledge_units'
    ]::text[]
    OR NOT EXISTS (
      SELECT 1 FROM public.k5a_c4_plan_nodes(p_plan)
      WHERE node->>'Index Name' =
        'knowledge_audiences_member_profile_ids_lookup'
    )
    OR NOT EXISTS (
      SELECT 1 FROM public.k5a_c4_plan_nodes(p_plan)
      WHERE node->>'Relation Name' = 'knowledge_units'
        AND node->>'Index Name' = 'knowledge_units_audience_lookup'
    )
    OR NOT EXISTS (
      SELECT 1 FROM public.k5a_c4_plan_nodes(p_plan)
      WHERE node->>'Relation Name' = 'knowledge_units'
        AND node->>'Index Name' = 'knowledge_units_pkey'
    )
    OR NOT EXISTS (
      SELECT 1 FROM public.k5a_c4_plan_nodes(p_plan)
      WHERE node->>'Relation Name' = 'knowledge_events'
        AND node->>'Index Name' = 'knowledge_events_pkey'
    )
    OR NOT EXISTS (
      SELECT 1 FROM public.k5a_c4_plan_nodes(p_plan)
      WHERE node->>'Relation Name' = 'knowledge_unit_citations'
        AND node->>'Index Name' = 'knowledge_unit_retirements_lookup'
    )
    OR EXISTS (
      SELECT 1 FROM public.k5a_c4_plan_nodes(p_plan)
      WHERE node->>'Relation Name' = 'knowledge_units'
        AND (
          node->>'Node Type' = 'Seq Scan'
          OR node->>'Index Name' = 'knowledge_units_embedding_hnsw'
        )
    )
    OR v_unit_rows_read IS DISTINCT FROM p_authorized_cardinality::bigint
    OR v_rows_removed > 1 THEN
    RAISE EXCEPTION 'k5a_c4_r5_plan_mechanism_failed:%:%:%:%:%',
      p_authorized_cardinality, v_row_sources, v_unit_rows_read,
      v_rows_removed, p_plan;
  END IF;

  RETURN jsonb_build_object(
    'row_sources', to_jsonb(v_row_sources),
    'access_paths', v_access_paths,
    'unit_rows_read', v_unit_rows_read,
    'unit_rows_removed_by_filter', v_rows_removed
  );
END
$$;

CREATE OR REPLACE FUNCTION public.k5a_c4_measure_p95(
  p_viewer_profile_id uuid,
  p_query_embedding vector(1536),
  p_expected_unit_id uuid,
  p_repetitions integer DEFAULT 20
) RETURNS double precision
LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
DECLARE
  v_started timestamptz;
  v_elapsed double precision;
  v_samples double precision[] := '{}';
  v_result jsonb;
  i integer;
BEGIN
  IF p_repetitions < 20 THEN
    RAISE EXCEPTION 'k5a_c4_p95_sample_too_small';
  END IF;
  -- One warm read is excluded from the curve.
  PERFORM * FROM public.search_knowledge_units(
    p_viewer_profile_id, p_query_embedding, 0.99, 10,
    NULL, NULL, NULL, NULL
  );
  FOR i IN 1..p_repetitions LOOP
    v_started := clock_timestamp();
    SELECT coalesce(jsonb_agg(to_jsonb(hit) ORDER BY hit.unit_id), '[]')
    INTO v_result
    FROM public.search_knowledge_units(
      p_viewer_profile_id, p_query_embedding, 0.99, 10,
      NULL, NULL, NULL, NULL
    ) hit;
    v_elapsed := extract(epoch FROM clock_timestamp() - v_started) * 1000;
    IF jsonb_array_length(v_result) <> 1
      OR (v_result->0->>'unit_id')::uuid IS DISTINCT FROM p_expected_unit_id
      OR (v_result->0->>'similarity')::double precision IS DISTINCT FROM 1 THEN
      RAISE EXCEPTION 'k5a_c4_exact_recall_failed:%:%',
        p_expected_unit_id, v_result;
    END IF;
    v_samples := array_append(v_samples, v_elapsed);
  END LOOP;
  RETURN (
    SELECT percentile_disc(0.95) WITHIN GROUP (ORDER BY sample)
    FROM unnest(v_samples) sample
  );
END
$$;

DO $k5a_c4_r5$
DECLARE
  v_owner uuid := '72000000-0000-4000-8000-000000000001';
  v_member uuid := '72000000-0000-4000-8000-000000000002';
  v_query vector(1536) :=
    (array_fill(0::real, ARRAY[1534]) || ARRAY[1::real, 0::real])::vector;
  v_owner_target uuid := md5(format(
    'k5a-c4-r4-unit:%s:%s:%s', v_owner, 'owner-target', 1
  ))::uuid;
  v_member_target uuid := md5(format(
    'k5a-c4-r4-unit:%s:%s:%s', v_member, 'member-target', 1
  ))::uuid;
  v_missing integer;
  v_plan_100 jsonb;
  v_plan_1001 jsonb;
  v_plan_curve_probe jsonb;
  v_plan_owner_before jsonb;
  v_plan_owner_after jsonb;
  v_mechanism_100 jsonb;
  v_mechanism_1001 jsonb;
  v_mechanism_curve_probe jsonb;
  v_owner_mechanism_before jsonb;
  v_owner_mechanism_after jsonb;
  v_owner_result_before jsonb;
  v_owner_result_after jsonb;
  v_p95_100 double precision;
  v_p95_1001 double precision;
  v_p95_curve_probe double precision;
  v_owner_p95_before double precision;
  v_owner_p95_after double precision;
  v_owner_baseline_p95 double precision[] := '{}';
  v_owner_p95_stddev double precision;
  v_timing_envelope double precision;
  v_slope double precision;
  v_curve_probe_units integer;
  v_curve_probe_kind text := 'interpolated_instrumented_550ms_sample';
  v_foreign_before integer;
  v_foreign_after integer;
  i integer;
BEGIN
  -- Enough nonmatching audience rows make membership lookup a real planner
  -- choice rather than a tiny-table artifact.
  INSERT INTO auth.users(id, email, raw_user_meta_data, created_at)
  SELECT md5(format('k5a-c4-r4-noise-profile:%s', series))::uuid,
    format('k5a-c4-r4-noise-%s@example.invalid', series),
    jsonb_build_object('display_name', format('R4 noise %s', series)),
    clock_timestamp()
  FROM generate_series(1, 8192) series
  ON CONFLICT DO NOTHING;

  INSERT INTO auth.users(id, email, raw_user_meta_data, created_at)
  VALUES (
    '72000000-0000-4000-8000-000000000003',
    'k5a-c4-r4-backdrop@example.invalid',
    '{"display_name":"R4 planner backdrop"}'::jsonb,
    clock_timestamp()
  ) ON CONFLICT DO NOTHING;
  PERFORM public.k5a_c4_seed_foreign_backdrop(
    '72000000-0000-4000-8000-000000000003', 20000
  );
  ANALYZE public.knowledge_audiences;
  ANALYZE public.knowledge_units;
  ANALYZE public.knowledge_events;

  PERFORM public.k5a_c4_seed_private_units(
    v_owner, 'owner-target', 1, v_query
  );
  PERFORM public.k5a_c4_seed_private_units(
    v_member, 'member-target', 1, v_query
  );

  v_missing := greatest(100 - public.k5a_c4_authorized_unit_count(v_member), 0);
  PERFORM public.k5a_c4_seed_private_units(
    v_member, 'member-to-100', v_missing, NULL
  );
  ANALYZE public.knowledge_audiences;
  ANALYZE public.knowledge_units;
  v_plan_100 := public.k5a_c4_exact_search_plan(v_member, v_query);
  v_mechanism_100 := public.k5a_c4_plan_mechanism(v_plan_100, 100);
  v_p95_100 := public.k5a_c4_measure_p95(
    v_member, v_query, v_member_target
  );

  v_missing := greatest(1001 - public.k5a_c4_authorized_unit_count(v_member), 0);
  PERFORM public.k5a_c4_seed_private_units(
    v_member, 'member-to-1001', v_missing, NULL
  );
  ANALYZE public.knowledge_units;
  v_plan_1001 := public.k5a_c4_exact_search_plan(v_member, v_query);
  v_mechanism_1001 := public.k5a_c4_plan_mechanism(v_plan_1001, 1001);
  v_p95_1001 := public.k5a_c4_measure_p95(
    v_member, v_query, v_member_target
  );

  IF v_p95_100 >= 550 THEN
    v_curve_probe_units := 100;
    v_curve_probe_kind := 'first_instrumented_sample_at_550ms';
  ELSIF v_p95_1001 > v_p95_100 THEN
    v_slope := (v_p95_1001 - v_p95_100) / 901;
    v_curve_probe_units := ceil(
      1001 + greatest(550 - v_p95_1001, 0) / v_slope
    )::integer;
    v_curve_probe_units := greatest(v_curve_probe_units, 1001);
  ELSE
    v_curve_probe_units := 10010;
    v_curve_probe_kind := 'instrumented_nonpositive_sample_slope';
  END IF;

  v_missing := greatest(
    v_curve_probe_units - public.k5a_c4_authorized_unit_count(v_member), 0
  );
  PERFORM public.k5a_c4_seed_private_units(
    v_member, 'member-to-curve-probe', v_missing, NULL
  );
  ANALYZE public.knowledge_units;
  v_plan_curve_probe := public.k5a_c4_exact_search_plan(v_member, v_query);
  v_mechanism_curve_probe := public.k5a_c4_plan_mechanism(
    v_plan_curve_probe, v_curve_probe_units
  );
  v_p95_curve_probe := public.k5a_c4_measure_p95(
    v_member, v_query, v_member_target
  );

  v_missing := greatest(1001 - public.k5a_c4_authorized_unit_count(v_owner), 0);
  PERFORM public.k5a_c4_seed_private_units(
    v_owner, 'owner-to-1001', v_missing, NULL
  );
  ANALYZE public.knowledge_units;
  v_plan_owner_before := public.k5a_c4_exact_search_plan(v_owner, v_query);
  v_owner_mechanism_before := public.k5a_c4_plan_mechanism(
    v_plan_owner_before, 1001
  );
  SELECT coalesce(jsonb_agg(to_jsonb(hit) ORDER BY hit.unit_id), '[]')
  INTO v_owner_result_before
  FROM public.search_knowledge_units(
    v_owner, v_query, 0.99, 10, NULL, NULL, NULL, NULL
  ) hit;
  FOR i IN 1..5 LOOP
    v_owner_baseline_p95 := array_append(
      v_owner_baseline_p95,
      public.k5a_c4_measure_p95(v_owner, v_query, v_owner_target)
    );
  END LOOP;
  SELECT avg(sample), coalesce(stddev_samp(sample), 0)
  INTO v_owner_p95_before, v_owner_p95_stddev
  FROM unnest(v_owner_baseline_p95) sample;
  v_timing_envelope := 3 * v_owner_p95_stddev;

  -- Grow only the member's private corpus by exactly ten times while the
  -- owner's authorized subset remains fixed at 1,001 units.
  v_foreign_before := public.k5a_c4_authorized_unit_count(v_member);
  v_missing := greatest(
    v_foreign_before * 10
      - public.k5a_c4_authorized_unit_count(v_member),
    0
  );
  PERFORM public.k5a_c4_seed_private_units(
    v_member, 'member-foreign-growth', v_missing, NULL
  );
  ANALYZE public.knowledge_units;
  v_plan_owner_after := public.k5a_c4_exact_search_plan(v_owner, v_query);
  v_owner_mechanism_after := public.k5a_c4_plan_mechanism(
    v_plan_owner_after, 1001
  );
  SELECT coalesce(jsonb_agg(to_jsonb(hit) ORDER BY hit.unit_id), '[]')
  INTO v_owner_result_after
  FROM public.search_knowledge_units(
    v_owner, v_query, 0.99, 10, NULL, NULL, NULL, NULL
  ) hit;
  v_owner_p95_after := public.k5a_c4_measure_p95(
    v_owner, v_query, v_owner_target
  );
  v_foreign_after := public.k5a_c4_authorized_unit_count(v_member);

  IF v_mechanism_100->'row_sources'
      IS DISTINCT FROM v_mechanism_1001->'row_sources'
    OR v_mechanism_100->'row_sources'
      IS DISTINCT FROM v_mechanism_curve_probe->'row_sources'
    OR v_mechanism_100->'access_paths'
      IS DISTINCT FROM v_mechanism_1001->'access_paths'
    OR v_mechanism_100->'access_paths'
      IS DISTINCT FROM v_mechanism_curve_probe->'access_paths' THEN
    RAISE EXCEPTION 'k5a_c4_r5_plan_semantics_changed:%:%:%',
      v_mechanism_100, v_mechanism_1001, v_mechanism_curve_probe;
  END IF;

  IF v_owner_result_before IS DISTINCT FROM v_owner_result_after
    OR v_foreign_after IS DISTINCT FROM v_foreign_before * 10
    OR v_owner_mechanism_before->'row_sources'
      IS DISTINCT FROM v_owner_mechanism_after->'row_sources'
    OR v_owner_mechanism_before->'access_paths'
      IS DISTINCT FROM v_owner_mechanism_after->'access_paths'
    OR v_owner_mechanism_before->'unit_rows_read'
      IS DISTINCT FROM v_owner_mechanism_after->'unit_rows_read'
    OR abs(v_owner_p95_before - v_owner_p95_after) > v_timing_envelope THEN
    RAISE EXCEPTION 'k5a_c4_r5_foreign_corpus_changed:%:%:%:%:%:%:%:%',
      v_owner_result_before, v_owner_result_after,
      v_owner_mechanism_before, v_owner_mechanism_after,
      v_owner_baseline_p95, v_owner_p95_after,
      v_timing_envelope, v_foreign_after;
  END IF;

  IF pg_get_functiondef(
      'public.search_knowledge_units(uuid,vector,double precision,integer,uuid,timestamptz,timestamptz,uuid[])'::regprocedure
    ) ~ '(enable_(seqscan|bitmapscan|sort)|ef_search|iterative_scan)'
    OR pg_get_functiondef(
      'public.search_knowledge_units(uuid,vector,double precision,integer,uuid,timestamptz,timestamptz,uuid[])'::regprocedure
    ) LIKE '%knowledge_units_embedding_hnsw%' THEN
    RAISE EXCEPTION 'k5a_c4_r5_planner_forcing_or_ann_survived';
  END IF;

  IF pg_get_functiondef(
      'public.retrieve_knowledge_graph_claims_v3(uuid,uuid,uuid[],integer,integer,integer,integer,integer,integer,integer)'::regprocedure
    ) ~ 'enable_(seqscan|bitmapscan|sort)' THEN
    RAISE EXCEPTION 'k5a_c4_r5_kernel_planner_forcing_survived';
  END IF;

  RAISE NOTICE 'K5A_C4_R5_MECHANISM:%', jsonb_build_object(
    'p95_ms_100', round(v_p95_100::numeric, 3),
    'p95_ms_1001', round(v_p95_1001::numeric, 3),
    'instrumented_curve_probe_units', v_curve_probe_units,
    'curve_probe_kind', v_curve_probe_kind,
    'p95_ms_curve_probe', round(v_p95_curve_probe::numeric, 3),
    'g5_ann_threshold_units', NULL,
    'g5_status', 'clean_non_explain_measurement_required',
    'owner_baseline_p95_ms', to_jsonb(v_owner_baseline_p95),
    'owner_p95_mean_before_foreign_growth',
      round(v_owner_p95_before::numeric, 3),
    'owner_p95_ms_after_foreign_growth',
      round(v_owner_p95_after::numeric, 3),
    'timing_envelope_3sigma_ms', round(v_timing_envelope::numeric, 3),
    'owner_mechanism', v_owner_mechanism_after,
    'foreign_authorized_units',
      v_foreign_after
  );
END
$k5a_c4_r5$;

SELECT 'CARTOGRAPHER_K5A_C4_R5_GREEN';
