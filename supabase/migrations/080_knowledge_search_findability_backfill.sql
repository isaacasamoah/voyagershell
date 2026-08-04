-- K5a G8 and G9: exact search spans the whole authorized set; coverage stays
-- on already-live event kinds. This migration is one atomic pre-cutover unit.
BEGIN;
SELECT public.assert_knowledge_topic_backfill_complete();
SELECT public.activate_knowledge_topic_contract();

CREATE TABLE IF NOT EXISTS public.knowledge_extraction_coverage_backfill_markers (
  extractor_version text PRIMARY KEY REFERENCES public.knowledge_extractor_contracts(extractor_version),
  eligible_event_count integer NOT NULL CHECK (eligible_event_count >= 0),
  job_limit integer NOT NULL CHECK (job_limit > 0),
  drained_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
DROP TRIGGER IF EXISTS trg_knowledge_extraction_coverage_marker_immutable
  ON public.knowledge_extraction_coverage_backfill_markers;
CREATE TRIGGER trg_knowledge_extraction_coverage_marker_immutable
  BEFORE UPDATE OR DELETE ON public.knowledge_extraction_coverage_backfill_markers
  FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_knowledge_graph_row();
ALTER TABLE public.knowledge_extraction_coverage_backfill_markers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.knowledge_extraction_coverage_backfill_markers
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.knowledge_extraction_coverage_backfill_markers TO service_role;

CREATE OR REPLACE FUNCTION public.assert_knowledge_extraction_coverage_backfill_complete()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_version text; v_eligible integer; v_missing integer; v_undrained integer;
  v_limit integer := 256;
BEGIN
  SELECT extractor_version INTO STRICT v_version
  FROM public.knowledge_extractor_contract_active WHERE singleton FOR SHARE;
  IF v_version <> 'cartographer-single-claim-v4' THEN
    RAISE EXCEPTION 'knowledge_extraction_coverage_contract_unexpected:%', v_version;
  END IF;
  SELECT count(*)::integer INTO v_eligible FROM public.knowledge_events event
  JOIN public.knowledge_audiences audience ON audience.id = event.knowledge_audience_id
  WHERE event.actor_type = 'user' AND event.event_type IN ('conversation', 'message')
    AND audience.purpose = 'source';
  SELECT count(*)::integer INTO v_missing FROM public.knowledge_events event
  JOIN public.knowledge_audiences audience ON audience.id = event.knowledge_audience_id
  LEFT JOIN public.knowledge_extraction_jobs job ON job.source_event_id = event.id
    AND job.extractor_version = v_version
  WHERE event.actor_type = 'user' AND event.event_type IN ('conversation', 'message')
    AND audience.purpose = 'source' AND job.source_event_id IS NULL;
  SELECT count(*)::integer INTO v_undrained FROM public.knowledge_extraction_jobs job
  JOIN public.knowledge_events event ON event.id = job.source_event_id
  JOIN public.knowledge_audiences audience ON audience.id = event.knowledge_audience_id
  WHERE job.extractor_version = v_version AND job.state NOT IN ('succeeded', 'no_claim')
    AND event.actor_type = 'user' AND event.event_type IN ('conversation', 'message')
    AND audience.purpose = 'source';
  IF v_missing <> 0 OR v_undrained <> 0 THEN
    RAISE EXCEPTION 'knowledge_extraction_coverage_backfill_incomplete:%:%', v_missing, v_undrained;
  END IF;
  INSERT INTO public.knowledge_extraction_coverage_backfill_markers(
    extractor_version, eligible_event_count, job_limit
  ) VALUES (v_version, v_eligible, v_limit) ON CONFLICT DO NOTHING;
  RETURN jsonb_build_object('extractor_version', v_version,
    'eligible_event_count', v_eligible, 'missing_jobs', 0, 'undrained_jobs', 0);
END $$;
REVOKE EXECUTE ON FUNCTION public.assert_knowledge_extraction_coverage_backfill_complete()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_knowledge_extraction_coverage_backfill_complete()
  TO service_role;

DO $coverage_backfill$
DECLARE v_version text; v_missing integer; v_limit integer := 256;
BEGIN
  SELECT extractor_version INTO STRICT v_version
  FROM public.knowledge_extractor_contract_active WHERE singleton FOR SHARE;
  IF v_version <> 'cartographer-single-claim-v4' THEN
    RAISE EXCEPTION 'knowledge_extraction_coverage_contract_unexpected:%', v_version;
  END IF;
  SELECT count(*)::integer INTO v_missing FROM public.knowledge_events event
  JOIN public.knowledge_audiences audience ON audience.id = event.knowledge_audience_id
  LEFT JOIN public.knowledge_extraction_jobs job ON job.source_event_id = event.id
    AND job.extractor_version = v_version
  WHERE event.actor_type = 'user' AND event.event_type IN ('conversation', 'message')
    AND audience.purpose = 'source' AND job.source_event_id IS NULL;
  IF v_missing > v_limit THEN
    RAISE EXCEPTION 'knowledge_extraction_coverage_backfill_over_limit:%:%', v_missing, v_limit;
  END IF;
  INSERT INTO public.knowledge_extraction_jobs(
    source_event_id, extractor_version, knowledge_audience_id, created_at, updated_at
  ) SELECT event.id, v_version, event.knowledge_audience_id, event.created_at, clock_timestamp()
  FROM public.knowledge_events event JOIN public.knowledge_audiences audience
    ON audience.id = event.knowledge_audience_id
  WHERE event.actor_type = 'user' AND event.event_type IN ('conversation', 'message')
    AND audience.purpose = 'source'
  ON CONFLICT (source_event_id, extractor_version) DO NOTHING;
END $coverage_backfill$;

DROP INDEX IF EXISTS public.knowledge_units_audience_lookup;
CREATE INDEX knowledge_units_audience_lookup
  ON public.knowledge_units(knowledge_audience_id, id)
  WHERE embedding IS NOT NULL AND knowledge_type IS NOT NULL
    AND attention_score IS NOT NULL;

CREATE OR REPLACE FUNCTION public.knowledge_unit_viewer_retired(
  p_unit_id uuid, p_viewer_profile_id uuid
) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
  SELECT EXISTS (SELECT 1 FROM public.knowledge_unit_citations retirement
    WHERE retirement.knowledge_unit_id = p_unit_id
      AND retirement.person_id = p_viewer_profile_id
      AND retirement.act_kind = 'retired')
$$;
REVOKE EXECUTE ON FUNCTION public.knowledge_unit_viewer_retired(uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;

DROP FUNCTION public.search_knowledge_units(
  uuid, vector, double precision, integer, uuid, timestamptz, timestamptz, uuid[]);
CREATE FUNCTION public.search_knowledge_units(
  p_viewer_profile_id uuid, p_query_embedding vector(1536) DEFAULT NULL,
  p_match_threshold double precision DEFAULT 0.6, p_match_count integer DEFAULT 20,
  p_anchor_person_id uuid DEFAULT NULL, p_since timestamptz DEFAULT NULL,
  p_until timestamptz DEFAULT NULL, p_unit_ids uuid[] DEFAULT NULL
) RETURNS TABLE(unit_id uuid, claim text, source_event_id uuid, source_content text,
  source_created_at timestamptz, knowledge_type text, viewer_retired boolean,
  effective_attention real, similarity double precision)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_viewer_profile_id IS NULL OR p_match_threshold IS NULL
    OR p_match_threshold NOT BETWEEN 0 AND 1 OR p_match_count IS NULL
    OR p_match_count NOT BETWEEN 1 AND 50
    OR (p_since IS NOT NULL AND p_until IS NOT NULL AND p_since > p_until)
    OR (p_unit_ids IS NOT NULL AND cardinality(p_unit_ids) > 50)
    OR (p_query_embedding IS NOT NULL AND (p_anchor_person_id IS NOT NULL
      OR p_since IS NOT NULL OR p_until IS NOT NULL OR p_unit_ids IS NOT NULL))
    OR (p_query_embedding IS NULL AND p_anchor_person_id IS NULL
      AND p_since IS NULL AND p_until IS NULL AND p_unit_ids IS NULL) THEN
    RAISE EXCEPTION 'knowledge_unit_search_input_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_query_embedding IS NOT NULL THEN RETURN QUERY
    WITH viewer_audiences AS MATERIALIZED (
      SELECT audience.id FROM public.knowledge_audiences audience
      WHERE audience.member_profile_ids @> ARRAY[p_viewer_profile_id]::uuid[]
    ), authorized_unit_ids AS MATERIALIZED (
      SELECT unit.id FROM viewer_audiences audience CROSS JOIN LATERAL (
        SELECT candidate.id FROM public.knowledge_units candidate
        WHERE candidate.knowledge_audience_id = audience.id
          AND candidate.embedding IS NOT NULL AND candidate.knowledge_type IS NOT NULL
          AND candidate.attention_score IS NOT NULL
          AND public.viewer_has_graph_node_grant(
            public.canonical_graph_node_id('knowledge_unit', candidate.id), p_viewer_profile_id)
        ORDER BY candidate.id OFFSET 0) unit
    ), authorized AS MATERIALIZED (
      SELECT unit.id AS unit_id, unit.claim, event.id AS source_event_id,
        event.content AS source_content, event.created_at AS source_created_at,
        unit.knowledge_type, unit.embedding <=> p_query_embedding AS distance
      FROM authorized_unit_ids authorized_id CROSS JOIN LATERAL (
        SELECT candidate.* FROM public.knowledge_units candidate
        WHERE candidate.id = authorized_id.id OFFSET 0) unit
      CROSS JOIN LATERAL (SELECT source.id, source.content, source.created_at
        FROM public.knowledge_events source WHERE source.id = unit.source_event_id OFFSET 0) event
      WHERE unit.embedding IS NOT NULL AND unit.knowledge_type IS NOT NULL
        AND unit.attention_score IS NOT NULL
    ), scored AS MATERIALIZED (
      SELECT authorized.*, public.knowledge_unit_effective_attention(
        authorized.unit_id, p_viewer_profile_id) AS effective_attention FROM authorized)
    SELECT selected.unit_id, selected.claim, selected.source_event_id,
      selected.source_content, selected.source_created_at, selected.knowledge_type,
      public.knowledge_unit_viewer_retired(selected.unit_id, p_viewer_profile_id),
      selected.effective_attention, 1 - selected.distance FROM (
        SELECT scored.* FROM scored WHERE 1 - scored.distance >= p_match_threshold
        ORDER BY scored.distance, scored.unit_id LIMIT p_match_count) selected;
    RETURN;
  END IF;
  RETURN QUERY WITH anchor_root AS MATERIALIZED (
    SELECT node.id FROM public.graph_nodes node WHERE p_anchor_person_id IS NOT NULL
      AND node.kind = 'person' AND node.authority_id = p_anchor_person_id
      AND public.viewer_has_graph_node_grant(node.id, p_viewer_profile_id)
  ), reachable AS MATERIALIZED (
    SELECT walked.node_id FROM anchor_root root CROSS JOIN LATERAL
      public.traverse_knowledge_graph(root.id, p_viewer_profile_id, 8, NULL, 512, 128) walked
  ), authorized AS MATERIALIZED (
    SELECT unit.id AS unit_id, unit.claim, event.id AS source_event_id,
      event.content AS source_content, event.created_at AS source_created_at,
      unit.knowledge_type,
      public.knowledge_unit_effective_attention(unit.id, p_viewer_profile_id) AS effective_attention,
      NULL::double precision AS similarity FROM public.knowledge_units unit
    JOIN public.graph_nodes node ON node.kind = 'knowledge_unit' AND node.authority_id = unit.id
    JOIN public.knowledge_events event ON event.id = unit.source_event_id
    JOIN public.knowledge_audiences audience ON audience.id = unit.knowledge_audience_id
    WHERE p_viewer_profile_id = ANY(audience.member_profile_ids)
      AND public.viewer_has_graph_node_grant(node.id, p_viewer_profile_id)
      AND unit.knowledge_type IS NOT NULL AND unit.attention_score IS NOT NULL
      AND (p_unit_ids IS NULL OR unit.id = ANY(p_unit_ids))
      AND (p_since IS NULL OR event.created_at >= p_since)
      AND (p_until IS NULL OR event.created_at <= p_until)
      AND (p_anchor_person_id IS NULL OR (event.actor_id = p_anchor_person_id
        AND node.id IN (SELECT reached.node_id FROM reachable reached)))
  ) SELECT selected.unit_id, selected.claim, selected.source_event_id,
    selected.source_content, selected.source_created_at, selected.knowledge_type,
    public.knowledge_unit_viewer_retired(selected.unit_id, p_viewer_profile_id),
    selected.effective_attention, selected.similarity FROM (
      SELECT authorized.* FROM authorized ORDER BY authorized.source_created_at DESC,
        authorized.unit_id LIMIT p_match_count) selected;
END $$;

DROP FUNCTION public.keyword_search_units(uuid, text, integer, uuid);
CREATE FUNCTION public.keyword_search_units(
  p_viewer_profile_id uuid, p_query text, p_match_count integer DEFAULT 20,
  p_anchor_person_id uuid DEFAULT NULL
) RETURNS TABLE(unit_id uuid, claim text, source_event_id uuid, source_content text,
  source_created_at timestamptz, knowledge_type text, viewer_retired boolean,
  effective_attention real, rank_score double precision)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF p_viewer_profile_id IS NULL OR p_query IS NULL OR length(btrim(p_query)) = 0
    OR p_match_count IS NULL OR p_match_count NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'knowledge_unit_keyword_search_input_invalid' USING ERRCODE = '22023';
  END IF;
  RETURN QUERY WITH anchor_root AS MATERIALIZED (
    SELECT node.id FROM public.graph_nodes node WHERE p_anchor_person_id IS NOT NULL
      AND node.kind = 'person' AND node.authority_id = p_anchor_person_id
      AND public.viewer_has_graph_node_grant(node.id, p_viewer_profile_id)
  ), reachable AS MATERIALIZED (
    SELECT walked.node_id FROM anchor_root root CROSS JOIN LATERAL
      public.traverse_knowledge_graph(root.id, p_viewer_profile_id, 8, NULL, 512, 128) walked
  ), authorized AS MATERIALIZED (
    SELECT unit.id AS unit_id, unit.claim, event.id AS source_event_id,
      event.content AS source_content, event.created_at AS source_created_at,
      unit.knowledge_type,
      public.knowledge_unit_effective_attention(unit.id, p_viewer_profile_id) AS effective_attention,
      ts_rank(unit.claim_search_vector, plainto_tsquery('english', p_query))::double precision
        AS rank_score FROM public.knowledge_units unit
    JOIN public.graph_nodes node ON node.kind = 'knowledge_unit' AND node.authority_id = unit.id
    JOIN public.knowledge_events event ON event.id = unit.source_event_id
    JOIN public.knowledge_audiences audience ON audience.id = unit.knowledge_audience_id
    WHERE unit.claim_search_vector @@ plainto_tsquery('english', p_query)
      AND p_viewer_profile_id = ANY(audience.member_profile_ids)
      AND public.viewer_has_graph_node_grant(node.id, p_viewer_profile_id)
      AND unit.knowledge_type IS NOT NULL AND unit.attention_score IS NOT NULL
      AND (p_anchor_person_id IS NULL
        OR (event.actor_id = p_anchor_person_id
          AND node.id IN (SELECT reached.node_id FROM reachable reached)))
  ) SELECT selected.unit_id, selected.claim, selected.source_event_id,
    selected.source_content, selected.source_created_at, selected.knowledge_type,
    public.knowledge_unit_viewer_retired(selected.unit_id, p_viewer_profile_id),
    selected.effective_attention, selected.rank_score FROM (
      SELECT authorized.* FROM authorized ORDER BY authorized.rank_score DESC,
        authorized.source_created_at DESC, authorized.unit_id LIMIT p_match_count) selected;
END $$;

REVOKE EXECUTE ON FUNCTION public.search_knowledge_units(
  uuid, vector, double precision, integer, uuid, timestamptz, timestamptz, uuid[]),
  public.keyword_search_units(uuid, text, integer, uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.search_knowledge_units(
  uuid, vector, double precision, integer, uuid, timestamptz, timestamptz, uuid[]),
  public.keyword_search_units(uuid, text, integer, uuid)
TO service_role;

DO $empty_coverage$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.knowledge_events event
    JOIN public.knowledge_audiences audience
      ON audience.id = event.knowledge_audience_id
    WHERE event.actor_type = 'user'
      AND event.event_type IN ('conversation', 'message')
      AND audience.purpose = 'source'
  ) THEN
    PERFORM public.assert_knowledge_extraction_coverage_backfill_complete();
  END IF;
END $empty_coverage$;

COMMIT;
