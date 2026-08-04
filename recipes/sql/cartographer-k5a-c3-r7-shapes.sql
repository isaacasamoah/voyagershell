\set ON_ERROR_STOP on

\if :{?per_claim_partner_cap}
\else
  \echo 'per_claim_partner_cap must be supplied from boundary.ts'
  \quit
\endif
\if :{?relation_candidate_limit}
\else
  \echo 'relation_candidate_limit must be supplied from the active K4c contract'
  \quit
\endif

-- Round 7 proves the small/index disjunction pointwise. This disposable table
-- has the production annotation row shape and its own-lookup covering index,
-- while letting each adversarial fixture start from an empty relation. Fresh
-- inserts deliberately keep heap pages off the all-visible map.
CREATE TABLE public.k5a_c3_r7_shape_probe (
  endpoint_unit_id uuid NOT NULL,
  partner_unit_id uuid NOT NULL,
  assertion_person_id uuid NOT NULL,
  edge_id uuid NOT NULL,
  assertion_attempt_id uuid NOT NULL,
  edge_kind public.graph_edge_kind NOT NULL,
  endpoint_is_source boolean NOT NULL,
  repair_priority smallint NOT NULL,
  input_unit_ids uuid[] NOT NULL,
  assertion_recorded_at timestamptz NOT NULL,
  PRIMARY KEY (
    endpoint_unit_id, assertion_person_id, edge_id, assertion_attempt_id
  )
);
CREATE INDEX k5a_c3_r7_shape_own_lookup
  ON public.k5a_c3_r7_shape_probe(
    endpoint_unit_id, assertion_person_id, repair_priority,
    assertion_recorded_at DESC, edge_id, assertion_attempt_id
  ) INCLUDE (
    partner_unit_id, edge_kind, endpoint_is_source, input_unit_ids
  );

CREATE TABLE public.k5a_c3_r7_shape_observations (
  shape_name text NOT NULL,
  foreign_rows integer NOT NULL,
  relation_pages integer NOT NULL,
  design_integrity jsonb NOT NULL,
  PRIMARY KEY (shape_name, foreign_rows)
);
CREATE TABLE public.k5a_c3_r7_source_caps (
  per_claim_partner_cap integer NOT NULL CHECK (per_claim_partner_cap > 0),
  relation_candidate_limit integer NOT NULL CHECK (relation_candidate_limit > 0)
);
INSERT INTO public.k5a_c3_r7_source_caps
VALUES (:per_claim_partner_cap, :relation_candidate_limit);

CREATE FUNCTION public.k5a_c3_r7_shape_plan(
  p_endpoint_unit_id uuid,
  p_viewer_profile_id uuid,
  p_limit integer
) RETURNS jsonb
LANGUAGE plpgsql
SET search_path = pg_catalog, public AS $$
DECLARE v_plan jsonb;
BEGIN
  EXECUTE format(
    'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) '
    'SELECT partner_unit_id, edge_id, assertion_attempt_id, input_unit_ids '
    'FROM public.k5a_c3_r7_shape_probe '
    'WHERE endpoint_unit_id = %L::uuid AND assertion_person_id = %L::uuid '
    'ORDER BY repair_priority, assertion_recorded_at DESC, edge_id, assertion_attempt_id '
    'LIMIT %s', p_endpoint_unit_id, p_viewer_profile_id, p_limit
  ) INTO STRICT v_plan;
  RETURN v_plan;
END
$$;

CREATE FUNCTION public.k5a_c3_r7_shape_design_integrity(p_plan jsonb)
RETURNS jsonb
LANGUAGE plpgsql STABLE STRICT
SET search_path = pg_catalog, public AS $$
DECLARE
  v_rows_read bigint;
  v_rows_removed bigint;
  v_relation_pages integer;
  v_heap_fetches bigint;
  v_node_types text[];
  v_index_names text[];
BEGIN
  SELECT coalesce(sum(
      (
        coalesce((node->>'Actual Rows')::bigint, 0)
        + coalesce((node->>'Rows Removed by Filter')::bigint, 0)
        + coalesce((node->>'Rows Removed by Index Recheck')::bigint, 0)
      ) * coalesce((node->>'Actual Loops')::bigint, 1)
    ), 0),
    coalesce(sum(
      (
        coalesce((node->>'Rows Removed by Filter')::bigint, 0)
        + coalesce((node->>'Rows Removed by Index Recheck')::bigint, 0)
      ) * coalesce((node->>'Actual Loops')::bigint, 1)
    ), 0),
    coalesce(sum(
      coalesce((node->>'Heap Fetches')::bigint, 0)
      + coalesce((node->>'Exact Heap Blocks')::bigint, 0)
      + coalesce((node->>'Lossy Heap Blocks')::bigint, 0)
    ), 0),
    array_agg(DISTINCT node->>'Node Type' ORDER BY node->>'Node Type')
  INTO v_rows_read, v_rows_removed, v_heap_fetches, v_node_types
  FROM public.k5a_c3_plan_nodes_poc(p_plan)
  WHERE node->>'Relation Name' = 'k5a_c3_r7_shape_probe';

  SELECT array_agg(DISTINCT node->>'Index Name' ORDER BY node->>'Index Name')
  INTO v_index_names
  FROM public.k5a_c3_plan_nodes_poc(p_plan)
  WHERE node ? 'Index Name';
  SELECT ceil(
    pg_relation_size('public.k5a_c3_r7_shape_probe'::regclass)
      / current_setting('block_size')::numeric
  )::integer INTO v_relation_pages;

  RETURN jsonb_build_object(
    'node_types', to_jsonb(coalesce(v_node_types, '{}'::text[])),
    'index_names', to_jsonb(coalesce(v_index_names, '{}'::text[])),
    'rows_read', v_rows_read,
    'rows_removed_by_filter', v_rows_removed,
    'heap_fetches_or_blocks', v_heap_fetches,
    'relation_pages', v_relation_pages
  );
END
$$;

DO $k5a_c3_r7_shape_space$
DECLARE
  v_viewer uuid := '72000000-0000-4000-8000-000000000002';
  v_foreign uuid := '72000000-0000-4000-8000-000000000001';
  v_endpoint uuid;
  v_input_ids uuid[];
  v_plan jsonb;
  v_integrity jsonb;
  v_after_growth jsonb;
  v_page_budget integer;
  v_crossover_pages integer;
  v_foreign_rows integer;
  v_row_bytes integer;
  v_shape record;
  v_per_claim_partner_cap integer;
  v_relation_candidate_limit integer;
  i integer;
BEGIN
  SELECT per_claim_partner_cap, relation_candidate_limit
  INTO STRICT v_per_claim_partner_cap, v_relation_candidate_limit
  FROM public.k5a_c3_r7_source_caps;

  FOR v_shape IN
    SELECT * FROM (VALUES
      ('own-degree-cap', v_per_claim_partner_cap, 2),
      ('production-width', 1, v_relation_candidate_limit + 1),
      ('non-all-visible', 1, 2),
      ('combined-worst', v_per_claim_partner_cap,
        v_relation_candidate_limit + 1)
    ) shaped(shape_name, own_degree, input_cardinality)
  LOOP
    TRUNCATE public.k5a_c3_r7_shape_probe;
    DELETE FROM public.k5a_c3_r7_shape_observations
    WHERE shape_name = v_shape.shape_name;
    v_endpoint := md5(format(
      'k5a-c3-r7-shape-endpoint:%s', v_shape.shape_name
    ))::uuid;
    SELECT array_agg(
      md5(format('k5a-c3-r7-shape-input:%s:%s',
        v_shape.shape_name, series))::uuid ORDER BY series
    ) INTO v_input_ids
    FROM generate_series(1, v_shape.input_cardinality) series;

    INSERT INTO public.k5a_c3_r7_shape_probe(
      endpoint_unit_id, partner_unit_id, assertion_person_id,
      edge_id, assertion_attempt_id, edge_kind, endpoint_is_source,
      repair_priority, input_unit_ids, assertion_recorded_at
    )
    SELECT v_endpoint,
      md5(format('k5a-c3-r7-own-partner:%s:%s',
        v_shape.shape_name, series))::uuid,
      v_viewer,
      md5(format('k5a-c3-r7-own-edge:%s:%s',
        v_shape.shape_name, series))::uuid,
      md5(format('k5a-c3-r7-own-attempt:%s:%s',
        v_shape.shape_name, series))::uuid,
      'supersedes', false, 0, v_input_ids,
      clock_timestamp() + make_interval(secs => series / 1000000.0)
    FROM generate_series(1, v_shape.own_degree) series;
    SELECT max(pg_column_size(probe)) INTO STRICT v_row_bytes
    FROM public.k5a_c3_r7_shape_probe probe;
    IF cardinality(v_input_ids) <> v_shape.input_cardinality
      OR (v_shape.input_cardinality = 17 AND cardinality(v_input_ids) <> 17)
      OR v_row_bytes IS NULL THEN
      RAISE EXCEPTION 'k5a_c3_r7_shape_fixture_invalid:%:%:%',
        v_shape.shape_name, cardinality(v_input_ids), v_row_bytes;
    END IF;

    v_page_budget := 0;
    v_crossover_pages := NULL;
    v_foreign_rows := 0;
    FOR i IN 0..512 LOOP
      IF i > 0 THEN
        INSERT INTO public.k5a_c3_r7_shape_probe(
          endpoint_unit_id, partner_unit_id, assertion_person_id,
          edge_id, assertion_attempt_id, edge_kind, endpoint_is_source,
          repair_priority, input_unit_ids, assertion_recorded_at
        )
        SELECT v_endpoint,
          md5(format('k5a-c3-r7-foreign-partner:%s:%s:%s',
            v_shape.shape_name, i, series))::uuid,
          v_foreign,
          md5(format('k5a-c3-r7-foreign-edge:%s:%s:%s',
            v_shape.shape_name, i, series))::uuid,
          md5(format('k5a-c3-r7-foreign-attempt:%s:%s:%s',
            v_shape.shape_name, i, series))::uuid,
          'supersedes', false, 0, v_input_ids,
          clock_timestamp() + make_interval(secs => series / 1000000.0)
        FROM generate_series(1, 8) series;
        v_foreign_rows := v_foreign_rows + 8;
      END IF;
      ANALYZE public.k5a_c3_r7_shape_probe;
      v_plan := public.k5a_c3_r7_shape_plan(
        v_endpoint, v_viewer, v_shape.own_degree + 1
      );
      v_integrity := public.k5a_c3_r7_shape_design_integrity(v_plan);
      INSERT INTO public.k5a_c3_r7_shape_observations
      VALUES (
        v_shape.shape_name, v_foreign_rows,
        (v_integrity->>'relation_pages')::integer, v_integrity
      );

      IF v_integrity->'index_names' ? 'k5a_c3_r7_shape_own_lookup'
        OR v_integrity->'index_names' ? 'k5a_c3_r7_shape_probe_pkey' THEN
        v_crossover_pages := (v_integrity->>'relation_pages')::integer;
        EXIT;
      END IF;
      IF NOT (v_integrity->'node_types' ? 'Seq Scan') THEN
        RAISE EXCEPTION 'k5a_c3_r7_unnamed_access_path:%:%:%',
          v_shape.shape_name, v_integrity, v_plan;
      END IF;
      v_page_budget := greatest(
        v_page_budget, (v_integrity->>'relation_pages')::integer
      );
    END LOOP;

    IF v_crossover_pages IS NULL
      OR v_crossover_pages < v_page_budget
      OR (v_integrity->>'rows_read')::integer <> v_shape.own_degree
      OR (v_integrity->>'rows_removed_by_filter')::integer <> 0
      OR NOT (
        (v_integrity->>'heap_fetches_or_blocks')::integer > 0
        OR v_integrity->'node_types' ? 'Index Scan'
        OR v_integrity->'node_types' ? 'Bitmap Heap Scan'
      ) THEN
      RAISE EXCEPTION 'k5a_c3_r7_crossover_design_integrity_failed:%:%:%:%',
        v_shape.shape_name, v_page_budget, v_integrity, v_plan;
    END IF;

    -- The budget is the last page count at which this own-degree/row-width/
    -- visibility shape selected a bounded sequential read. Assert the ruled
    -- disjunction at every sampled point, then prove it remains on the named
    -- access path after additional foreign growth.
    IF EXISTS (
      SELECT 1 FROM public.k5a_c3_r7_shape_observations observation
      WHERE observation.shape_name = v_shape.shape_name
        AND NOT (
          observation.relation_pages <= v_page_budget
          OR (
            (
              observation.design_integrity->'index_names'
                ? 'k5a_c3_r7_shape_own_lookup'
              OR observation.design_integrity->'index_names'
                ? 'k5a_c3_r7_shape_probe_pkey'
            )
            AND (observation.design_integrity
              ->>'rows_removed_by_filter')::integer = 0
            AND (observation.design_integrity->>'rows_read')::integer
              = v_shape.own_degree
          )
        )
    ) THEN
      RAISE EXCEPTION 'k5a_c3_r7_pointwise_disjunction_failed:%:%',
        v_shape.shape_name, v_page_budget;
    END IF;

    INSERT INTO public.k5a_c3_r7_shape_probe(
      endpoint_unit_id, partner_unit_id, assertion_person_id,
      edge_id, assertion_attempt_id, edge_kind, endpoint_is_source,
      repair_priority, input_unit_ids, assertion_recorded_at
    )
    SELECT v_endpoint,
      md5(format('k5a-c3-r7-growth-partner:%s:%s',
        v_shape.shape_name, series))::uuid,
      v_foreign,
      md5(format('k5a-c3-r7-growth-edge:%s:%s',
        v_shape.shape_name, series))::uuid,
      md5(format('k5a-c3-r7-growth-attempt:%s:%s',
        v_shape.shape_name, series))::uuid,
      'supersedes', false, 0, v_input_ids, clock_timestamp()
    FROM generate_series(1, greatest(v_foreign_rows, 64)) series;
    ANALYZE public.k5a_c3_r7_shape_probe;
    v_after_growth := public.k5a_c3_r7_shape_design_integrity(
      public.k5a_c3_r7_shape_plan(
        v_endpoint, v_viewer, v_shape.own_degree + 1
      )
    );
    IF NOT (
        v_after_growth->'index_names' ? 'k5a_c3_r7_shape_own_lookup'
        OR v_after_growth->'index_names' ? 'k5a_c3_r7_shape_probe_pkey'
      )
      OR (v_after_growth->>'rows_removed_by_filter')::integer <> 0
      OR (v_after_growth->>'rows_read')::integer <> v_shape.own_degree THEN
      RAISE EXCEPTION 'k5a_c3_r7_post_crossover_integrity_failed:%:%',
        v_shape.shape_name, v_after_growth;
    END IF;

    RAISE NOTICE 'K5A_C3_R7_SHAPE:%', jsonb_build_object(
      'shape', v_shape.shape_name,
      'own_degree', v_shape.own_degree,
      'input_unit_ids_cardinality', v_shape.input_cardinality,
      'row_bytes', v_row_bytes,
      'non_all_visible_evidence',
        (v_integrity->>'heap_fetches_or_blocks')::integer > 0
          OR v_integrity->'node_types' ? 'Index Scan'
          OR v_integrity->'node_types' ? 'Bitmap Heap Scan',
      'derived_page_budget', v_page_budget,
      'first_index_pages', v_crossover_pages,
      'foreign_rows_at_first_index', v_foreign_rows,
      'crossover_design_integrity', v_integrity,
      'post_growth_design_integrity', v_after_growth
    );
  END LOOP;
END
$k5a_c3_r7_shape_space$;

SELECT 'CARTOGRAPHER_K5A_C3_R7_SHAPES_GREEN';
