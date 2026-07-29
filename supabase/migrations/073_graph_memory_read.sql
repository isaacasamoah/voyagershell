-- K4a: immutable unit physics, version-pinned execution and graph-memory read.
ALTER TABLE public.knowledge_units
  ADD COLUMN knowledge_type text CHECK (knowledge_type IN ('domain', 'operational', 'preference')),
  ADD COLUMN attention_score real CHECK (attention_score BETWEEN 0 AND 1),
  ADD COLUMN embedding vector(1536);

ALTER TABLE public.knowledge_extractor_contracts
  DROP COLUMN active,
  ADD COLUMN embedding_model text,
  ADD COLUMN embedding_dimensions integer CHECK (embedding_dimensions > 0);

CREATE TABLE public.knowledge_extractor_contract_active (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  extractor_version text NOT NULL REFERENCES public.knowledge_extractor_contracts(extractor_version),
  activated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO public.knowledge_extractor_contract_active(extractor_version)
  VALUES ('cartographer-single-claim-v1');
INSERT INTO public.knowledge_extractor_contracts(
  extractor_version, embedding_model, embedding_dimensions)
VALUES ('cartographer-single-claim-v2', 'text-embedding-3-small', 1536);
UPDATE public.knowledge_extractor_contract_active
  SET extractor_version = 'cartographer-single-claim-v2', activated_at = clock_timestamp();

CREATE TRIGGER trg_knowledge_extractor_contract_active_no_delete
  BEFORE DELETE ON public.knowledge_extractor_contract_active
  FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_knowledge_graph_row();

CREATE OR REPLACE FUNCTION public.enqueue_human_knowledge_extraction() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_version text;
BEGIN
  IF NEW.actor_type = 'user' AND NEW.event_type IN ('conversation', 'message') THEN
    SELECT extractor_version INTO STRICT v_version
    FROM public.knowledge_extractor_contract_active WHERE singleton FOR SHARE;
    INSERT INTO public.knowledge_extraction_jobs(
      source_event_id, extractor_version, knowledge_audience_id)
    VALUES (NEW.id, v_version, NEW.knowledge_audience_id);
  END IF;
  RETURN NEW;
END $$;

DROP FUNCTION public.complete_knowledge_extraction_attempt(
  uuid, uuid, public.knowledge_extraction_outcome_kind, jsonb, text, uuid,
  text, integer, integer);
CREATE FUNCTION public.complete_knowledge_extraction_attempt(
  p_attempt_id uuid, p_lease_token uuid,
  p_result public.knowledge_extraction_outcome_kind, p_raw_output jsonb DEFAULT NULL,
  p_claim text DEFAULT NULL, p_about_person_id uuid DEFAULT NULL,
  p_knowledge_type text DEFAULT NULL, p_attention_score real DEFAULT NULL,
  p_embedding vector(1536) DEFAULT NULL, p_error_class text DEFAULT NULL,
  p_input_tokens integer DEFAULT NULL, p_output_tokens integer DEFAULT NULL
) RETURNS TABLE(outcome public.knowledge_extraction_outcome_kind, unit_id uuid, replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_attempt public.knowledge_extraction_attempts; v_job public.knowledge_extraction_jobs;
  v_event public.knowledge_events; v_existing jsonb; v_unit public.knowledge_units;
  v_final public.knowledge_extraction_outcome_kind := p_result; v_error text := p_error_class;
  v_unit_id uuid; v_unit_node uuid; v_event_node uuid; v_person_node public.graph_nodes;
  v_edge uuid; v_now timestamptz := clock_timestamp(); v_is_v2 boolean;
BEGIN
  SELECT * INTO STRICT v_attempt FROM public.knowledge_extraction_attempts WHERE id = p_attempt_id;
  v_is_v2 := v_attempt.extractor_version = 'cartographer-single-claim-v2';
  SELECT * INTO STRICT v_job FROM public.knowledge_extraction_jobs WHERE
    source_event_id = v_attempt.source_event_id AND extractor_version = v_attempt.extractor_version FOR UPDATE;
  SELECT to_jsonb(stored.*) INTO v_existing FROM public.knowledge_extraction_attempt_outcomes stored
    WHERE stored.attempt_id = p_attempt_id;
  IF v_existing IS NOT NULL THEN
    SELECT * INTO v_unit FROM public.knowledge_units WHERE source_event_id = v_attempt.source_event_id
      AND extractor_version = v_attempt.extractor_version AND claim_key = 'claim:0';
    IF v_existing->>'outcome' IS DISTINCT FROM p_result::text
      OR v_existing->'raw_output' IS DISTINCT FROM p_raw_output
      OR v_existing->>'error_class' IS DISTINCT FROM p_error_class
      OR (p_result = 'succeeded' AND (v_unit.claim IS DISTINCT FROM btrim(p_claim)
        OR v_unit.knowledge_type IS DISTINCT FROM p_knowledge_type
        OR v_unit.attention_score IS DISTINCT FROM p_attention_score
        OR v_unit.embedding IS DISTINCT FROM p_embedding)) THEN
      RAISE EXCEPTION 'knowledge_extraction_outcome_payload_conflict' USING ERRCODE = '23505';
    END IF;
    RETURN QUERY SELECT p_result, CASE WHEN p_result = 'succeeded' THEN
      md5(format('voyager-unit:k3:%s:%s:claim:0', v_attempt.source_event_id,
        v_attempt.extractor_version))::uuid END, true;
    RETURN;
  END IF;
  IF v_job.state <> 'leased' OR v_job.active_attempt_id <> p_attempt_id OR
    v_job.lease_token <> p_lease_token OR v_attempt.lease_token <> p_lease_token THEN
    RAISE EXCEPTION 'knowledge_extraction_lease_not_owned' USING ERRCODE = '42501';
  END IF;
  IF v_job.lease_expires_at <= v_now THEN
    v_final := 'expired'; v_error := 'lease_expired';
  ELSIF p_result NOT IN ('succeeded', 'no_claim', 'provider_failed', 'malformed_output') THEN
    RAISE EXCEPTION 'knowledge_extraction_result_invalid' USING ERRCODE = '22023';
  ELSIF p_result = 'succeeded' AND (p_claim IS NULL OR length(btrim(p_claim)) = 0
    OR p_raw_output IS NULL OR p_raw_output->>'claim' IS DISTINCT FROM btrim(p_claim)
    OR p_raw_output->>'aboutPersonId' IS DISTINCT FROM p_about_person_id::text
    OR (v_is_v2 AND (p_knowledge_type NOT IN ('domain', 'operational', 'preference')
      OR p_attention_score IS NULL OR p_attention_score NOT BETWEEN 0 AND 1
      OR p_embedding IS NULL))) THEN
    v_final := 'commit_rejected'; v_error := 'success_payload_invalid';
  ELSIF p_result = 'no_claim' AND (p_claim IS NOT NULL OR p_about_person_id IS NOT NULL
    OR p_raw_output IS NULL OR p_raw_output->'claim' IS DISTINCT FROM 'null'::jsonb
    OR p_raw_output->'aboutPersonId' IS DISTINCT FROM 'null'::jsonb) THEN
    v_final := 'commit_rejected'; v_error := 'no_claim_payload_invalid';
  ELSIF p_result IN ('provider_failed', 'malformed_output') AND
    (p_claim IS NOT NULL OR p_about_person_id IS NOT NULL OR p_error_class IS NULL) THEN
    RAISE EXCEPTION 'knowledge_extraction_failure_payload_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO STRICT v_event FROM public.knowledge_events WHERE id = v_attempt.source_event_id;
  v_unit_id := md5(format('voyager-unit:k3:%s:%s:claim:0',
    v_attempt.source_event_id, v_attempt.extractor_version))::uuid;
  SELECT * INTO v_unit FROM public.knowledge_units WHERE source_event_id = v_attempt.source_event_id
    AND extractor_version = v_attempt.extractor_version AND claim_key = 'claim:0';
  IF v_final = 'succeeded' AND v_unit.id IS NOT NULL
    AND v_unit.claim IS DISTINCT FROM btrim(p_claim) THEN
    v_final := 'commit_rejected'; v_error := 'claim_key_conflict';
  END IF;
  IF v_final = 'succeeded' AND p_about_person_id IS NOT NULL THEN
    SELECT node.* INTO v_person_node FROM public.graph_nodes node
    JOIN public.knowledge_audiences audience ON audience.id = v_attempt.knowledge_audience_id
    WHERE node.kind = 'person' AND node.authority_id = p_about_person_id
      AND p_about_person_id = ANY(audience.member_profile_ids);
    IF v_person_node.id IS NULL THEN
      v_final := 'commit_rejected'; v_error := 'about_person_not_candidate';
    END IF;
  END IF;
  INSERT INTO public.knowledge_extraction_attempt_outcomes(
    attempt_id, source_event_id, extractor_version, knowledge_audience_id, outcome,
    raw_output, error_class, input_tokens, output_tokens)
  VALUES (p_attempt_id, v_attempt.source_event_id, v_attempt.extractor_version,
    v_attempt.knowledge_audience_id, v_final, p_raw_output, v_error, p_input_tokens, p_output_tokens);
  IF v_final = 'succeeded' THEN
    INSERT INTO public.knowledge_units(id, claim, source_event_id, extractor_version,
      claim_key, knowledge_audience_id, knowledge_type, attention_score, embedding)
    VALUES (v_unit_id, btrim(p_claim), v_attempt.source_event_id, v_attempt.extractor_version,
      'claim:0', v_attempt.knowledge_audience_id, p_knowledge_type, p_attention_score, p_embedding)
    ON CONFLICT DO NOTHING;
    v_unit_node := public.canonical_graph_node_id('knowledge_unit', v_unit_id);
    v_event_node := public.canonical_graph_node_id('message_event', v_attempt.source_event_id);
    INSERT INTO public.graph_nodes(id, kind, authority_id, label) VALUES
      (v_unit_node, 'knowledge_unit', v_unit_id, btrim(p_claim)) ON CONFLICT DO NOTHING;
    INSERT INTO public.graph_node_grants(node_id, knowledge_audience_id, basis_kind, basis_id,
      basis_version, label_snapshot, granted_at) VALUES (v_unit_node,
      v_attempt.knowledge_audience_id, 'source_event', v_attempt.source_event_id, 1,
      btrim(p_claim), v_event.created_at) ON CONFLICT DO NOTHING;
    v_edge := public.canonical_graph_edge_id(v_unit_node, 'derived_from', v_event_node);
    INSERT INTO public.graph_edges(id, source_node_id, target_node_id, kind) VALUES
      (v_edge, v_unit_node, v_event_node, 'derived_from') ON CONFLICT DO NOTHING;
    INSERT INTO public.graph_edge_evidence(edge_id, evidence_event_id)
      VALUES (v_edge, v_attempt.source_event_id) ON CONFLICT DO NOTHING;
    IF p_about_person_id IS NOT NULL THEN
      v_edge := public.canonical_graph_edge_id(v_unit_node, 'about', v_person_node.id);
      INSERT INTO public.graph_edges(id, source_node_id, target_node_id, kind) VALUES
        (v_edge, v_unit_node, v_person_node.id, 'about') ON CONFLICT DO NOTHING;
      INSERT INTO public.graph_edge_evidence(edge_id, evidence_event_id)
        VALUES (v_edge, v_attempt.source_event_id) ON CONFLICT DO NOTHING;
      INSERT INTO public.graph_node_grants(node_id, knowledge_audience_id, basis_kind, basis_id,
        basis_version, label_snapshot, granted_at, basis_event_id) VALUES (v_person_node.id,
        v_attempt.knowledge_audience_id, 'edge_evidence', v_edge, 1, v_person_node.label,
        v_event.created_at, v_attempt.source_event_id) ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  UPDATE public.knowledge_extraction_jobs SET state = CASE
      WHEN v_final = 'succeeded' THEN 'succeeded'::public.knowledge_extraction_job_state
      WHEN v_final = 'no_claim' THEN 'no_claim'::public.knowledge_extraction_job_state
      ELSE 'pending'::public.knowledge_extraction_job_state END,
    active_attempt_id = NULL, lease_token = NULL, lease_expires_at = NULL, updated_at = v_now
  WHERE source_event_id = v_attempt.source_event_id
    AND extractor_version = v_attempt.extractor_version;
  RETURN QUERY SELECT v_final, CASE WHEN v_final = 'succeeded' THEN v_unit_id END, false;
END $$;

CREATE FUNCTION public.retrieve_knowledge_graph_claims_v2(
  p_root_authority_id uuid, p_viewer_profile_id uuid, p_exclude_unit_ids uuid[] DEFAULT '{}',
  p_max_depth integer DEFAULT 4, p_node_budget integer DEFAULT 512,
  p_frontier_budget integer DEFAULT 128
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_root uuid; v_frontier uuid[]; v_next uuid[]; v_seen uuid[]; v_depth integer;
  v_truncated boolean := false; v_claims jsonb;
BEGIN
  SELECT id INTO v_root FROM public.graph_nodes WHERE kind = 'person'
    AND authority_id = p_root_authority_id
    AND public.viewer_has_graph_node_grant(id, p_viewer_profile_id);
  IF v_root IS NULL THEN RETURN jsonb_build_object('claims', '[]'::jsonb, 'truncated', false); END IF;
  v_frontier := ARRAY[v_root]; v_seen := v_frontier;
  FOR v_depth IN 1..least(greatest(p_max_depth, 0), 8) LOOP
    SELECT coalesce(array_agg(node_id ORDER BY node_id), '{}') INTO v_next FROM (
      SELECT DISTINCT neighbor.node_id FROM unnest(v_frontier) f(node_id)
      CROSS JOIN LATERAL public.authorized_graph_neighbors(f.node_id, p_viewer_profile_id, NULL) neighbor
      WHERE NOT neighbor.node_id = ANY(v_seen) ORDER BY neighbor.node_id
      LIMIT p_frontier_budget + 1) bounded;
    IF cardinality(v_next) > p_frontier_budget THEN
      v_truncated := true; v_next := v_next[1:p_frontier_budget];
    END IF;
    IF cardinality(v_seen) + cardinality(v_next) > p_node_budget THEN
      v_truncated := true; v_next := v_next[1:greatest(p_node_budget - cardinality(v_seen), 0)];
    END IF;
    EXIT WHEN cardinality(v_next) = 0;
    v_seen := v_seen || v_next; v_frontier := v_next;
  END LOOP;
  IF EXISTS (SELECT 1 FROM unnest(v_frontier) f(node_id)
    CROSS JOIN LATERAL public.authorized_graph_neighbors(f.node_id, p_viewer_profile_id, NULL) n
    WHERE NOT n.node_id = ANY(v_seen)) THEN v_truncated := true; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object('knowledgeUnitId', unit.id, 'claim', unit.claim,
    'knowledgeType', unit.knowledge_type, 'attentionScore', unit.attention_score,
    'sourceEventId', event.id,
    'sourceContent', event.content) ORDER BY unit.id), '[]'::jsonb) INTO v_claims
  FROM public.graph_nodes node JOIN public.knowledge_units unit
    ON node.kind = 'knowledge_unit' AND node.authority_id = unit.id
  JOIN public.knowledge_events event ON event.id = unit.source_event_id
  WHERE node.id = ANY(v_seen) AND NOT unit.id = ANY(coalesce(p_exclude_unit_ids, '{}'))
    AND EXISTS (SELECT 1 FROM public.knowledge_audiences audience
      WHERE audience.id = unit.knowledge_audience_id
        AND p_viewer_profile_id = ANY(audience.member_profile_ids));
  RETURN jsonb_build_object('claims', v_claims, 'truncated', v_truncated);
END $$;

ALTER TABLE public.knowledge_extractor_contract_active ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.knowledge_extractor_contract_active FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.knowledge_extractor_contract_active TO service_role;
REVOKE EXECUTE ON FUNCTION public.complete_knowledge_extraction_attempt(
  uuid, uuid, public.knowledge_extraction_outcome_kind, jsonb, text, uuid, text, real,
  vector, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_knowledge_extraction_attempt(
  uuid, uuid, public.knowledge_extraction_outcome_kind, jsonb, text, uuid, text, real,
  vector, text, integer, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.retrieve_knowledge_graph_claims_v2(
  uuid, uuid, uuid[], integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retrieve_knowledge_graph_claims_v2(
  uuid, uuid, uuid[], integer, integer, integer) TO service_role;
