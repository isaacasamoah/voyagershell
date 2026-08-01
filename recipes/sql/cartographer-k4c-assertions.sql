\set ON_ERROR_STOP on

DO $k4c_contract_and_backfill$
DECLARE v_expected integer;
BEGIN
  IF (SELECT contract_version FROM public.knowledge_relation_contract_active
      WHERE singleton) <> 'relation-conflict-v2'
    OR (SELECT verdicts FROM public.knowledge_relation_contracts
      WHERE contract_version = 'relation-conflict-v2')
      <> ARRAY['contradicts','supersedes']::public.graph_edge_kind[]
    OR (SELECT provider_calls_per_job FROM public.knowledge_relation_contracts
      WHERE contract_version = 'relation-conflict-v2') <> 2 THEN
    RAISE EXCEPTION 'k4c_contract_not_pinned';
  END IF;
  SELECT count(*) INTO v_expected
  FROM public.knowledge_units unit
  JOIN public.knowledge_audiences audience
    ON audience.id = unit.knowledge_audience_id
  CROSS JOIN LATERAL unnest(audience.member_profile_ids) member_id;
  IF (SELECT count(*) FROM public.knowledge_relation_jobs) <> v_expected THEN
    RAISE EXCEPTION 'k4c_backfill_job_count_failed';
  END IF;
END
$k4c_contract_and_backfill$;

DO $k4c_relation_writer$
DECLARE
  v_owner uuid := '72000000-0000-4000-8000-000000000001';
  v_member uuid := '72000000-0000-4000-8000-000000000002';
  v_room_old uuid; v_private uuid; v_focus uuid; v_topic uuid;
  v_attempt uuid; v_token uuid; v_candidates jsonb; v_candidate_ids uuid[];
  v_relation jsonb; v_raw jsonb; v_outcome text; v_replayed boolean;
  v_edge uuid; v_focus_node uuid; v_old_node uuid; v_kind public.graph_edge_kind;
  v_forbidden public.graph_edge_kind[] := ARRAY[
    'authored_by','posted_in','reply_to','in_voyage','member_of',
    'companion_of','derived_from','generated_by','about','supports',
    'elaborates','relates_to','decided_by','raised_by'
  ]::public.graph_edge_kind[];
BEGIN
  v_room_old := public.k4b_commit(
    'k4c-room-old', 'Marathon training starts Monday.',
    '[{"kind":"new","label":"marathon training"}]', 1, true
  );
  SELECT id INTO STRICT v_topic FROM public.knowledge_topics
  WHERE normalized_label = 'marathon training';
  v_private := public.k4b_commit(
    'k4c-private-input', 'The private physio note is still under review.',
    '[{"kind":"new","label":"private physio review"}]', 1, false
  );
  v_focus := public.k4b_commit(
    'k4c-room-focus', 'The physio said no running for eight weeks.',
    jsonb_build_array(jsonb_build_object(
      'kind','existing','topicId',v_topic)), 1, true
  );
  IF (SELECT count(*) FROM public.knowledge_relation_jobs
      WHERE unit_id = v_focus) <> 2
    OR (SELECT count(*) FROM public.knowledge_relation_jobs
      WHERE unit_id = v_focus AND person_id = v_member AND state = 'pending') <> 1 THEN
    RAISE EXCEPTION 'k4c_per_person_fanout_failed';
  END IF;

  SELECT begun.attempt_id, begun.lease_token, begun.candidates
  INTO STRICT v_attempt, v_token, v_candidates
  FROM public.begin_relation_attempt(
    v_owner, 'openai', 'classification-model', 'balanced', v_focus, 120
  ) begun;
  SELECT candidate_unit_ids INTO STRICT v_candidate_ids
  FROM public.knowledge_relation_attempts WHERE id = v_attempt;
  IF NOT (v_room_old = ANY(v_candidate_ids))
    OR NOT (v_private = ANY(v_candidate_ids))
    OR v_candidate_ids IS DISTINCT FROM ARRAY(
      SELECT (candidate->>'unitId')::uuid
      FROM jsonb_array_elements(v_candidates) candidate
    ) THEN
    RAISE EXCEPTION 'k4c_ordered_candidate_snapshot_failed:%:%:%:%',
      v_room_old, v_private, v_candidate_ids, v_candidates;
  END IF;

  FOREACH v_kind IN ARRAY v_forbidden LOOP
    v_relation := jsonb_build_array(jsonb_build_object(
      'candidateUnitId',v_room_old,'sourceUnitId',v_focus,
      'targetUnitId',v_room_old,'kind',v_kind
    ));
    v_raw := jsonb_build_object('relations',v_relation);
    BEGIN
      SELECT done.outcome::text INTO STRICT v_outcome
      FROM public.complete_relation_attempt(
        v_attempt, v_token, 'succeeded', v_raw, v_relation, '[]', NULL, 10, 5
      ) done;
      IF v_outcome <> 'commit_rejected' OR NOT EXISTS (
        SELECT 1 FROM public.knowledge_relation_outcomes
        WHERE attempt_id = v_attempt
          AND error_class = 'relation_edge_kind_forbidden:' || v_kind::text
      ) THEN
        RAISE EXCEPTION 'k4c_forbidden_edge_kind_accepted:%', v_kind;
      END IF;
      RAISE EXCEPTION USING ERRCODE = 'P3191',
        MESSAGE = 'rollback expected writer refusal';
    EXCEPTION WHEN SQLSTATE 'P3191' THEN NULL;
    END;
  END LOOP;

  BEGIN
    SELECT done.outcome::text INTO STRICT v_outcome
    FROM public.complete_relation_attempt(
      v_attempt, v_token, 'succeeded', '{"relations":[]}', '[]',
      '[{"nodeId":"forbidden"}]', NULL, 10, 5
    ) done;
    IF v_outcome <> 'commit_rejected' OR NOT EXISTS (
      SELECT 1 FROM public.knowledge_relation_outcomes
      WHERE attempt_id = v_attempt
        AND error_class = 'relation_grant_write_forbidden'
    ) THEN
      RAISE EXCEPTION 'k4c_grant_insert_accepted';
    END IF;
    RAISE EXCEPTION USING ERRCODE = 'P3191',
      MESSAGE = 'rollback expected writer refusal';
  EXCEPTION WHEN SQLSTATE 'P3191' THEN NULL;
  END;

  v_relation := jsonb_build_array(jsonb_build_object(
    'candidateUnitId',v_room_old,'sourceUnitId',v_focus,
    'targetUnitId',v_room_old,'kind','contradicts'
  ));
  v_raw := jsonb_build_object(
    'stage1',jsonb_build_object('decisions',jsonb_build_array()),
    'stage2',jsonb_build_object('relations',v_relation),
    'relations',v_relation
  );
  SELECT done.outcome::text, done.edge_ids[1], done.replayed
  INTO STRICT v_outcome, v_edge, v_replayed
  FROM public.complete_relation_attempt(
    v_attempt, v_token, 'succeeded', v_raw, v_relation, '[]', NULL, 20, 8
  ) done;
  IF v_outcome <> 'succeeded' OR v_replayed
    OR (SELECT count(*) FROM public.graph_edge_evidence
      WHERE edge_id = v_edge) <> 2
    OR NOT EXISTS (
      SELECT 1 FROM public.knowledge_relation_assertions
      WHERE edge_id = v_edge AND attempt_id = v_attempt
        AND v_private = ANY(input_unit_ids)
    ) THEN
    RAISE EXCEPTION 'k4c_relation_commit_failed';
  END IF;

  v_focus_node := public.canonical_graph_node_id('knowledge_unit', v_focus);
  v_old_node := public.canonical_graph_node_id('knowledge_unit', v_room_old);
  IF NOT EXISTS (
      SELECT 1 FROM public.authorized_graph_neighbors(
        v_focus_node, v_owner, ARRAY['contradicts']::public.graph_edge_kind[]
      ) WHERE node_id = v_old_node
    ) OR EXISTS (
      SELECT 1 FROM public.authorized_graph_neighbors(
        v_focus_node, v_member, ARRAY['contradicts']::public.graph_edge_kind[]
      ) WHERE node_id = v_old_node
    ) THEN
    RAISE EXCEPTION 'all-input relation assertion leaked';
  END IF;

  SELECT done.outcome::text, done.replayed INTO STRICT v_outcome, v_replayed
  FROM public.complete_relation_attempt(
    v_attempt, v_token, 'succeeded', v_raw, v_relation, '[]', NULL, 20, 8
  ) done;
  IF v_outcome <> 'succeeded' OR NOT v_replayed
    OR (SELECT count(*) FROM public.knowledge_relation_outcomes
      WHERE attempt_id = v_attempt) <> 1 THEN
    RAISE EXCEPTION 'k4c_identical_completion_replay_failed';
  END IF;
  BEGIN
    PERFORM public.complete_relation_attempt(
      v_attempt, v_token, 'succeeded', v_raw, v_relation, '[]', NULL, 21, 8
    );
    RAISE EXCEPTION 'k4c_changed_completion_replay_accepted';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  SELECT begun.attempt_id, begun.lease_token
  INTO STRICT v_attempt, v_token
  FROM public.begin_relation_attempt(
    v_member, 'openai', 'classification-model', 'balanced', v_focus, 120
  ) begun;
  SELECT done.outcome::text INTO STRICT v_outcome
  FROM public.complete_relation_attempt(
    v_attempt, v_token, 'succeeded', v_raw, v_relation, '[]', NULL, 20, 8
  ) done;
  IF v_outcome <> 'succeeded'
    OR (SELECT count(*) FROM public.graph_edges WHERE id = v_edge) <> 1
    OR (SELECT count(*) FROM public.knowledge_relation_assertions
      WHERE edge_id = v_edge) <> 2
    OR NOT EXISTS (
      SELECT 1 FROM public.authorized_graph_neighbors(
        v_focus_node, v_member, ARRAY['contradicts']::public.graph_edge_kind[]
      ) WHERE node_id = v_old_node
    ) THEN
    RAISE EXCEPTION 'k4c_canonical_edge_convergence_failed';
  END IF;
END
$k4c_relation_writer$;

DO $k4c_zero_overlap$
DECLARE v_owner uuid := '72000000-0000-4000-8000-000000000001';
  v_old uuid; v_focus uuid; v_topic uuid; v_attempt uuid; v_token uuid;
  v_outcome text; v_focus_node uuid;
BEGIN
  v_old := public.k4b_commit(
    'k4c-compatible-old', 'The garden bed gets morning sun.',
    '[{"kind":"new","label":"garden bed"}]', 2, true
  );
  SELECT id INTO STRICT v_topic FROM public.knowledge_topics
  WHERE normalized_label = 'garden bed';
  v_focus := public.k4b_commit(
    'k4c-compatible-focus', 'The garden bed is beside the shed.',
    jsonb_build_array(jsonb_build_object(
      'kind','existing','topicId',v_topic)), 2, true
  );
  SELECT begun.attempt_id, begun.lease_token INTO STRICT v_attempt, v_token
  FROM public.begin_relation_attempt(
    v_owner, 'openai', 'classification-model', 'balanced', v_focus, 120
  ) begun;
  IF NOT ARRAY[v_old] <@ (SELECT candidate_unit_ids
      FROM public.knowledge_relation_attempts WHERE id = v_attempt) THEN
    RAISE EXCEPTION 'k4c_compatible_topic_sibling_not_blocked';
  END IF;
  SELECT done.outcome::text INTO STRICT v_outcome
  FROM public.complete_relation_attempt(
    v_attempt, v_token, 'succeeded',
    '{"stage1":{"decisions":[]},"stage2":{"relations":[]},"relations":[]}',
    '[]', '[]', NULL, 10, 3
  ) done;
  v_focus_node := public.canonical_graph_node_id('knowledge_unit', v_focus);
  IF v_outcome <> 'succeeded' OR EXISTS (
    SELECT 1 FROM public.graph_edges
    WHERE source_node_id = v_focus_node
      AND kind IN ('contradicts','supersedes')
  ) THEN
    RAISE EXCEPTION 'k4c_compatible_cofiled_units_minted_edge';
  END IF;
END
$k4c_zero_overlap$;

DO $k4c_expiry_fixture$
BEGIN
  PERFORM public.k4b_commit(
    'k4c-expiry', 'K4c expiry focus.',
    '[{"kind":"new","label":"expiry proof"}]', 13, false
  );
  PERFORM public.k4b_commit(
    'k4c-race', 'K4c race focus.',
    '[{"kind":"new","label":"race proof"}]', 14, false
  );
END
$k4c_expiry_fixture$;

DO $k4c_expiry_and_exhaustion$
DECLARE v_owner uuid := '72000000-0000-4000-8000-000000000001';
  v_unit uuid; v_attempt uuid; v_token uuid; v_outcome text;
BEGIN
  SELECT id INTO STRICT v_unit FROM public.knowledge_units
  WHERE claim = 'K4c expiry focus.';
  SELECT attempt_id, lease_token INTO STRICT v_attempt, v_token
  FROM public.begin_relation_attempt(
    v_owner, 'openai', 'expiry-model', 'balanced', v_unit, 1
  );
  PERFORM pg_sleep(1.1);
  SELECT attempt_id, lease_token INTO STRICT v_attempt, v_token
  FROM public.begin_relation_attempt(
    v_owner, 'openai', 'expiry-model', 'balanced', v_unit, 120
  );
  IF (SELECT count(*) FROM public.knowledge_relation_outcomes
      WHERE unit_id = v_unit AND outcome = 'expired') <> 1 THEN
    RAISE EXCEPTION 'k4c_expired_attempt_not_recorded';
  END IF;
  SELECT outcome::text INTO STRICT v_outcome
  FROM public.complete_relation_attempt(
    v_attempt, v_token, 'provider_failed', NULL, '[]', '[]',
    'APICallError', NULL, NULL
  );
  SELECT attempt_id, lease_token INTO STRICT v_attempt, v_token
  FROM public.begin_relation_attempt(
    v_owner, 'openai', 'expiry-model', 'balanced', v_unit, 120
  );
  SELECT outcome::text INTO STRICT v_outcome
  FROM public.complete_relation_attempt(
    v_attempt, v_token, 'provider_failed', NULL, '[]', '[]',
    'APICallError', NULL, NULL
  );
  IF v_outcome <> 'provider_failed'
    OR (SELECT state FROM public.knowledge_relation_jobs
      WHERE unit_id = v_unit AND person_id = v_owner) <> 'completed'
    OR EXISTS (
      SELECT 1 FROM public.knowledge_relation_jobs
      WHERE unit_id = v_unit AND person_id = v_owner
        AND (active_attempt_id IS NOT NULL OR lease_token IS NOT NULL
          OR lease_expires_at IS NOT NULL)
    ) OR (SELECT count(*) FROM public.knowledge_relation_outcomes
      WHERE unit_id = v_unit) <> 3 THEN
    RAISE EXCEPTION 'k4c_retry_exhaustion_stranded_lease';
  END IF;
END
$k4c_expiry_and_exhaustion$;

SET ROLE authenticated;
DO $k4c_authenticated_denial$
BEGIN
  BEGIN PERFORM count(*) FROM public.knowledge_relation_attempts;
    RAISE EXCEPTION 'k4c_authenticated_attempt_read_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM count(*) FROM public.knowledge_relation_outcomes;
    RAISE EXCEPTION 'k4c_authenticated_outcome_read_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM public.begin_relation_attempt(
    '72000000-0000-4000-8000-000000000001','openai','forbidden','balanced',NULL,120);
    RAISE EXCEPTION 'k4c_authenticated_begin_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$k4c_authenticated_denial$;
RESET ROLE;

SELECT 'CARTOGRAPHER_K4C_ASSERTIONS_GREEN';
