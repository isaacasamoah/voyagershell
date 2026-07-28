DO $k3_fragment$
DECLARE v_source uuid; v_audience uuid; v_unit uuid; v_unit_node uuid; v_event_node uuid;
BEGIN
  SELECT id, knowledge_audience_id INTO STRICT v_source, v_audience
  FROM public.knowledge_events WHERE content = 'Elisheya keeps the amber notebook.';
  v_unit := md5(format('voyager-unit:k3:%s:%s:claim:0',
    v_source, 'cartographer-single-claim-v1'))::uuid;
  v_unit_node := public.canonical_graph_node_id('knowledge_unit', v_unit);
  v_event_node := public.canonical_graph_node_id('message_event', v_source);
  IF (SELECT count(*) FROM public.knowledge_extraction_attempts
      WHERE source_event_id = v_source) <> 2
    OR (SELECT count(*) FROM public.knowledge_extraction_attempt_outcomes
      WHERE source_event_id = v_source AND outcome = 'expired') <> 1
    OR (SELECT count(*) FROM public.knowledge_extraction_attempt_outcomes
      WHERE source_event_id = v_source AND outcome = 'succeeded') <> 1
    OR NOT EXISTS (SELECT 1 FROM public.knowledge_extraction_attempts
      WHERE source_event_id = v_source AND model_provider = 'anthropic'
        AND model_id = 'claude-sonnet-4-6')
    OR NOT EXISTS (SELECT 1 FROM public.knowledge_extraction_attempt_outcomes
      WHERE source_event_id = v_source AND raw_output->>'claim' =
        'Elisheya keeps the amber notebook.' AND input_tokens = 120 AND output_tokens = 30)
    OR (SELECT count(*) FROM public.knowledge_units WHERE id = v_unit
      AND knowledge_audience_id = v_audience) <> 1
    OR (SELECT count(*) FROM public.graph_nodes WHERE id = v_unit_node) <> 1
    OR (SELECT count(*) FROM public.graph_node_grants WHERE node_id = v_unit_node
      AND knowledge_audience_id = v_audience AND basis_id = v_source) <> 1
    OR (SELECT count(*) FROM public.graph_edges WHERE source_node_id = v_unit_node
      AND target_node_id = v_event_node AND kind = 'derived_from') <> 1
    OR (SELECT count(*) FROM public.graph_edges edge
      JOIN public.graph_nodes target ON target.id = edge.target_node_id
      WHERE edge.source_node_id = v_unit_node AND edge.kind = 'about'
        AND target.kind = 'person'
        AND target.authority_id = '72000000-0000-4000-8000-000000000002') <> 1
    OR (SELECT count(*) FROM public.graph_edge_evidence evidence
      JOIN public.graph_edges edge ON edge.id = evidence.edge_id
      WHERE evidence.evidence_event_id = v_source
        AND edge.source_node_id = v_unit_node) <> 2 THEN
    RAISE EXCEPTION 'k3_complete_fragment_failed';
  END IF;
END
$k3_fragment$;

DO $k3_retry_and_terminal_outcomes$
DECLARE v_source uuid; v_attempt uuid; v_token uuid; v_outcome text;
BEGIN
  SELECT id INTO STRICT v_source FROM public.knowledge_events
    WHERE content = 'K3 failure then retry';
  SELECT started.attempt_id, started.lease_token INTO STRICT v_attempt, v_token
  FROM public.begin_knowledge_extraction_attempt(
    '72000000-0000-4000-8000-000000000001', 'anthropic', 'claude-sonnet-4-6',
    'claude-sonnet', v_source, 120) started;
  SELECT done.outcome::text INTO STRICT v_outcome
  FROM public.complete_knowledge_extraction_attempt(v_attempt, v_token,
    'provider_failed', NULL, NULL, NULL, 'APICallError', NULL, NULL) done;
  IF v_outcome <> 'provider_failed' THEN RAISE EXCEPTION 'k3_provider_failure_missing'; END IF;
  SELECT started.attempt_id, started.lease_token INTO STRICT v_attempt, v_token
  FROM public.begin_knowledge_extraction_attempt(
    '72000000-0000-4000-8000-000000000001', 'anthropic', 'claude-sonnet-4-6',
    'claude-sonnet', v_source, 120) started;
  SELECT done.outcome::text INTO STRICT v_outcome
  FROM public.complete_knowledge_extraction_attempt(v_attempt, v_token, 'succeeded',
    '{"claim":"K3 retry succeeds.","aboutPersonId":null,"knowledgeType":"domain","attentionScore":0.5,"contextSnippet":"K3 retry succeeds."}',
    'K3 retry succeeds.', NULL, NULL, 20, 10) done;
  IF v_outcome <> 'succeeded'
    OR (SELECT count(*) FROM public.knowledge_extraction_attempts
      WHERE source_event_id = v_source) <> 2
    OR (SELECT count(DISTINCT outcome) FROM public.knowledge_extraction_attempt_outcomes
      WHERE source_event_id = v_source) <> 2 THEN
    RAISE EXCEPTION 'k3_failure_retry_failed';
  END IF;

  SELECT id INTO STRICT v_source FROM public.knowledge_events WHERE content = 'thanks';
  SELECT started.attempt_id, started.lease_token INTO STRICT v_attempt, v_token
  FROM public.begin_knowledge_extraction_attempt(
    '72000000-0000-4000-8000-000000000001', 'anthropic', 'claude-sonnet-4-6',
    'claude-sonnet', v_source, 120) started;
  SELECT done.outcome::text INTO STRICT v_outcome
  FROM public.complete_knowledge_extraction_attempt(v_attempt, v_token, 'no_claim',
    '{"claim":null,"aboutPersonId":null,"knowledgeType":"operational","attentionScore":0.1,"contextSnippet":"Acknowledgement."}',
    NULL, NULL, NULL, 10, 5) done;
  IF v_outcome <> 'no_claim' OR EXISTS (SELECT 1 FROM public.knowledge_units
      WHERE source_event_id = v_source) THEN RAISE EXCEPTION 'k3_no_claim_failed'; END IF;
END
$k3_retry_and_terminal_outcomes$;

DO $k3_conflict$
DECLARE v_source uuid; v_audience uuid; v_unit uuid; v_attempt uuid; v_token uuid;
  v_before text; v_after text; v_outcome text;
BEGIN
  SELECT id, knowledge_audience_id INTO STRICT v_source, v_audience
  FROM public.knowledge_events WHERE content = 'K3 conflict source';
  v_unit := md5(format('voyager-unit:k3:%s:%s:claim:0',
    v_source, 'cartographer-single-claim-v1'))::uuid;
  INSERT INTO public.knowledge_units(id, claim, source_event_id, extractor_version,
    claim_key, knowledge_audience_id) VALUES (v_unit, 'Original conflict claim.',
      v_source, 'cartographer-single-claim-v1', 'claim:0', v_audience);
  SELECT md5(to_jsonb(unit)::text) INTO STRICT v_before
    FROM public.knowledge_units unit WHERE id = v_unit;
  SELECT started.attempt_id, started.lease_token INTO STRICT v_attempt, v_token
  FROM public.begin_knowledge_extraction_attempt(
    '72000000-0000-4000-8000-000000000001', 'anthropic', 'claude-sonnet-4-6',
    'claude-sonnet', v_source, 120) started;
  SELECT done.outcome::text INTO STRICT v_outcome
  FROM public.complete_knowledge_extraction_attempt(v_attempt, v_token, 'succeeded',
    '{"claim":"Different conflict claim.","aboutPersonId":null,"knowledgeType":"domain","attentionScore":0.5,"contextSnippet":"Conflict."}',
    'Different conflict claim.', NULL, NULL, 20, 10) done;
  SELECT md5(to_jsonb(unit)::text) INTO STRICT v_after
    FROM public.knowledge_units unit WHERE id = v_unit;
  IF v_outcome <> 'commit_rejected' OR v_before <> v_after
    OR (SELECT state FROM public.knowledge_extraction_jobs
      WHERE source_event_id = v_source) <> 'pending' THEN
    RAISE EXCEPTION 'k3_claim_key_conflict_failed';
  END IF;
END
$k3_conflict$;

DO $k3_payload_mismatch$
DECLARE v_source uuid; v_attempt uuid; v_token uuid; v_outcome text;
BEGIN
  SELECT id INTO STRICT v_source FROM public.knowledge_events
    WHERE content = 'K3 payload mismatch';
  SELECT started.attempt_id, started.lease_token INTO STRICT v_attempt, v_token
  FROM public.begin_knowledge_extraction_attempt(
    '72000000-0000-4000-8000-000000000001', 'anthropic', 'claude-sonnet-4-6',
    'claude-sonnet', v_source, 120) started;
  SELECT done.outcome::text INTO STRICT v_outcome
  FROM public.complete_knowledge_extraction_attempt(v_attempt, v_token, 'succeeded',
    '{"claim":"Raw claim.","aboutPersonId":null,"knowledgeType":"domain","attentionScore":0.5,"contextSnippet":"Raw claim."}',
    'Different caller claim.', NULL, NULL, 20, 10) done;
  IF v_outcome <> 'commit_rejected'
    OR EXISTS (SELECT 1 FROM public.knowledge_units WHERE source_event_id = v_source)
    OR (SELECT state FROM public.knowledge_extraction_jobs
      WHERE source_event_id = v_source) <> 'pending' THEN
    RAISE EXCEPTION 'k3_payload_mismatch_accepted';
  END IF;
END
$k3_payload_mismatch$;

DO $k3_boundaries$
DECLARE v_source uuid; v_attempt uuid;
BEGIN
  SELECT id INTO STRICT v_source FROM public.knowledge_events
    WHERE content = 'K3 room eligibility';
  SELECT started.attempt_id INTO v_attempt FROM public.begin_knowledge_extraction_attempt(
    '72000000-0000-4000-8000-000000000003', 'anthropic', 'claude-sonnet-4-6',
    'claude-sonnet', v_source, 120) started;
  IF v_attempt IS NOT NULL THEN RAISE EXCEPTION 'k3_outsider_claimed_job'; END IF;
  BEGIN
    INSERT INTO public.knowledge_extraction_jobs(source_event_id, extractor_version,
      knowledge_audience_id)
    SELECT v_source, 'cartographer-single-claim-v1', audience.id
    FROM public.knowledge_audiences audience WHERE audience.purpose = 'authority' LIMIT 1;
    RAISE EXCEPTION 'k3_authority_audience_job_accepted';
  EXCEPTION WHEN check_violation OR unique_violation THEN NULL;
  END;
  SELECT id INTO STRICT v_attempt FROM public.knowledge_extraction_attempts LIMIT 1;
  BEGIN UPDATE public.knowledge_extraction_attempts SET model_id = 'tampered'
    WHERE id = v_attempt; RAISE EXCEPTION 'k3_attempt_update_accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN UPDATE public.knowledge_extraction_attempt_outcomes SET raw_output = '{}'
    WHERE attempt_id = v_attempt; RAISE EXCEPTION 'k3_outcome_update_accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END
$k3_boundaries$;

SET ROLE authenticated;
DO $k3_authenticated_denial$
BEGIN
  BEGIN PERFORM count(*) FROM public.knowledge_extraction_attempts;
    RAISE EXCEPTION 'k3_authenticated_attempt_read_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM count(*) FROM public.knowledge_extraction_attempt_outcomes;
    RAISE EXCEPTION 'k3_authenticated_outcome_read_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.graph_edges(id, source_node_id, target_node_id, kind)
    VALUES (gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), 'member_of');
    RAISE EXCEPTION 'k3_structural_edge_insert_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$k3_authenticated_denial$;
RESET ROLE;

SELECT 'CARTOGRAPHER_K3_ASSERTIONS_GREEN';
