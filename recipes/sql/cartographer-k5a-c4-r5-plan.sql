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
          AND candidate.attention_score IS NOT NULL
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
        AND unit.attention_score IS NOT NULL
    ), scored AS MATERIALIZED (
      SELECT authorized.*,
        public.knowledge_unit_effective_attention(unit_id, $1)
          AS effective_attention
      FROM authorized
    )
    SELECT unit_id
    FROM scored
    WHERE 1 - distance >= 0.99
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

CREATE OR REPLACE FUNCTION public.k5a_c4_plan_design_integrity(
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
    'knowledge_events', 'knowledge_events_pkey'
  );

  IF v_row_sources IS DISTINCT FROM ARRAY[
      'knowledge_audiences', 'knowledge_events', 'knowledge_units'
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
    RAISE EXCEPTION 'k5a_c4_r5_plan_design_integrity_failed:%:%:%:%:%',
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
