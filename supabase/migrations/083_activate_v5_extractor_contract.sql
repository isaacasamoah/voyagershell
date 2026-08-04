-- Wave 2 (2a): promote the extractor contract from v4 to v5.
--
-- This is harm reduction, NOT acceptance. v5's C5 one-shot verdict remains
-- K5A-V5-RESULT-FAIL: it missed the hard-core false-durability bar (4-5 of 30,
-- bar zero) and the about-person bar (39/40, bar 40/40). It is promoted because
-- the active v4 contract is measurably worse on the arms that matter -- 25/30
-- false-durable, 24/26 preference-boundary failures, correct-domain rate 0.111
-- against v5's 0.889 -- and v4 mints permanent, never-decaying preference units
-- at a 5-in-6 rate. Best available, still below bar. Do not read this migration
-- as evidence that v5 passed.
--
-- v5 is registered as a NEW contract row rather than an edit of v4. Units
-- already stamped v4 stay attributable to the exact prompt that judged them,
-- which is the same reason V5_CARTOGRAPHER_PROMPT was never edited in place.
--
-- Every version-pinned guard is widened BEFORE the active pointer moves, so no
-- v5 completion can be attempted against a v4-only constraint.

INSERT INTO public.knowledge_extractor_contracts(
  extractor_version, embedding_model, embedding_dimensions,
  topic_similarity_threshold, topic_candidate_limit, topic_matcher_version
) VALUES ('cartographer-single-claim-v5', 'text-embedding-3-small', 1536, 0.2, 8, 'topic-retrieval-v4')
ON CONFLICT (extractor_version) DO NOTHING;

-- The topic-identity outcome contract admitted v4 only. Widen it before any v5
-- completion can write, per the v5 readiness receipt. Written as a swap that
-- tolerates re-application so the chain replays cleanly from zero.
DO $widen_topic_identity_outcomes$
DECLARE v_constraint text;
BEGIN
  FOR v_constraint IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.knowledge_topic_identity_outcomes'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%cartographer-single-claim-v4%'
      AND pg_get_constraintdef(oid) NOT LIKE '%cartographer-single-claim-v5%'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.knowledge_topic_identity_outcomes DROP CONSTRAINT %I',
      v_constraint
    );
  END LOOP;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.knowledge_topic_identity_outcomes'::regclass
      AND conname = 'knowledge_topic_identity_outcomes_extractor_version_check'
  ) THEN
    ALTER TABLE public.knowledge_topic_identity_outcomes
      ADD CONSTRAINT knowledge_topic_identity_outcomes_extractor_version_check
      CHECK (extractor_version IN ('cartographer-single-claim-v4', 'cartographer-single-claim-v5'));
  END IF;
END $widen_topic_identity_outcomes$;

CREATE OR REPLACE FUNCTION public.resolve_knowledge_topic(
  p_extractor_version text,
  p_knowledge_audience_id uuid,
  p_embedding vector(1536),
  p_exclude_unit_id uuid DEFAULT NULL
) RETURNS TABLE(
  topic_id uuid,
  label text,
  representative_unit_id uuid,
  representative_claim text,
  similarity real
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_floor real; v_limit integer;
BEGIN
  SELECT topic_similarity_threshold, topic_candidate_limit
  INTO STRICT v_floor, v_limit
  FROM public.knowledge_extractor_contracts
  WHERE extractor_version = p_extractor_version
    AND topic_similarity_threshold IS NOT NULL
    AND topic_candidate_limit IS NOT NULL;

  IF p_extractor_version = 'cartographer-single-claim-v3' THEN
    RETURN QUERY
    SELECT topic.id, topic.normalized_label, NULL::uuid, NULL::text,
      (1 - (topic.embedding <=> p_embedding))::real
    FROM public.knowledge_topics topic
    JOIN public.graph_nodes node
      ON node.kind::text = 'topic' AND node.authority_id = topic.id
    JOIN public.graph_node_grants grant_row
      ON grant_row.node_id = node.id
      AND grant_row.knowledge_audience_id = p_knowledge_audience_id
    WHERE 1 - (topic.embedding <=> p_embedding) >= v_floor
    ORDER BY topic.embedding <=> p_embedding, topic.id
    LIMIT v_limit;
  ELSIF p_extractor_version IN ('cartographer-single-claim-v4', 'cartographer-single-claim-v5') THEN
    RETURN QUERY WITH scored AS (
      SELECT DISTINCT ON (topic.id)
        topic.id,
        topic.normalized_label,
        unit.id AS representative_unit_id,
        unit.claim AS representative_claim,
        (1 - (unit.embedding <=> p_embedding))::real AS score
      FROM public.knowledge_topics topic
      JOIN public.graph_nodes topic_node
        ON topic_node.kind::text = 'topic' AND topic_node.authority_id = topic.id
      JOIN public.graph_node_grants topic_grant
        ON topic_grant.node_id = topic_node.id
        AND topic_grant.knowledge_audience_id = p_knowledge_audience_id
      JOIN public.graph_edges edge
        ON edge.target_node_id = topic_node.id AND edge.kind = 'about'
      JOIN public.graph_nodes unit_node
        ON unit_node.id = edge.source_node_id AND unit_node.kind = 'knowledge_unit'
      JOIN public.knowledge_units unit
        ON unit.id = unit_node.authority_id
        AND unit.knowledge_audience_id = p_knowledge_audience_id
      WHERE unit.embedding IS NOT NULL
        AND unit.id IS DISTINCT FROM p_exclude_unit_id
      ORDER BY topic.id, unit.embedding <=> p_embedding, unit.id
    )
    SELECT scored.id, scored.normalized_label, scored.representative_unit_id,
      scored.representative_claim, scored.score
    FROM scored
    WHERE scored.score >= v_floor
    ORDER BY scored.score DESC, scored.id
    LIMIT v_limit;
  ELSE
    RAISE EXCEPTION 'knowledge_topic_candidate_contract_invalid'
      USING ERRCODE = '22023';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.write_v4_knowledge_unit_topics(
  p_unit_id uuid,
  p_event_id uuid,
  p_audience_id uuid,
  p_extractor_version text,
  p_topic_inputs jsonb,
  p_topic_candidate_snapshot jsonb,
  p_claim_embedding vector(1536)
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_item jsonb; v_topic uuid; v_topic_node uuid; v_unit_node uuid; v_edge uuid;
  v_event public.knowledge_events; v_label text;
  v_current jsonb; v_snapshot jsonb; v_current_topic_ids uuid[];
BEGIN
  IF p_extractor_version NOT IN ('cartographer-single-claim-v4', 'cartographer-single-claim-v5')
    OR p_topic_inputs IS NULL
    OR jsonb_typeof(p_topic_inputs) <> 'array'
    OR jsonb_array_length(p_topic_inputs) > 3
    OR p_topic_candidate_snapshot IS NULL
    OR jsonb_typeof(p_topic_candidate_snapshot) <> 'array'
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_topic_candidate_snapshot) candidate
      WHERE jsonb_typeof(candidate) <> 'array'
        OR jsonb_array_length(candidate) <> 2
        OR jsonb_typeof(candidate->0) <> 'string'
        OR jsonb_typeof(candidate->1) <> 'string'
    )
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_topic_inputs) item
      WHERE item->>'kind' NOT IN ('existing', 'new')
        OR (item->>'kind' = 'existing' AND item->>'topicId' IS NULL)
        OR (item->>'kind' = 'new' AND item->>'label' IS NULL)
    ) THEN
    RAISE EXCEPTION 'knowledge_topic_match_input_invalid' USING ERRCODE = '22023';
  END IF;

  SELECT
    coalesce(jsonb_agg(
      jsonb_build_array(candidate.topic_id, candidate.representative_unit_id)
      ORDER BY candidate.topic_id, candidate.representative_unit_id
    ), '[]'::jsonb),
    coalesce(array_agg(candidate.topic_id ORDER BY candidate.topic_id), '{}')
  INTO v_current, v_current_topic_ids
  FROM public.resolve_knowledge_topic(
    p_extractor_version, p_audience_id, p_claim_embedding, p_unit_id
  ) candidate;
  SELECT coalesce(jsonb_agg(candidate ORDER BY candidate->>0, candidate->>1), '[]'::jsonb)
  INTO v_snapshot
  FROM jsonb_array_elements(p_topic_candidate_snapshot) candidate;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_topic_inputs) item
    WHERE item->>'kind' = 'new'
  ) THEN
    PERFORM pg_advisory_xact_lock(861319074);
    SELECT
      coalesce(jsonb_agg(
        jsonb_build_array(candidate.topic_id, candidate.representative_unit_id)
        ORDER BY candidate.topic_id, candidate.representative_unit_id
      ), '[]'::jsonb),
      coalesce(array_agg(candidate.topic_id ORDER BY candidate.topic_id), '{}')
    INTO v_current, v_current_topic_ids
    FROM public.resolve_knowledge_topic(
      p_extractor_version, p_audience_id, p_claim_embedding, p_unit_id
    ) candidate;
    IF v_current IS DISTINCT FROM v_snapshot THEN
      RAISE EXCEPTION 'knowledge_topic_candidates_stale:%:%', v_snapshot, v_current
        USING ERRCODE = '40001';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_topic_inputs) item
    WHERE item->>'kind' = 'existing'
      AND NOT (
        (item->>'topicId')::uuid = ANY(v_current_topic_ids)
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(v_snapshot) candidate
          WHERE candidate->>0 = item->>'topicId'
        )
      )
  ) THEN
    RAISE EXCEPTION 'knowledge_topic_candidate_not_authorized'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO STRICT v_event
  FROM public.knowledge_events
  WHERE id = p_event_id AND knowledge_audience_id = p_audience_id;
  v_unit_node := public.canonical_graph_node_id('knowledge_unit', p_unit_id);

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_topic_inputs) LOOP
    IF v_item->>'kind' = 'existing' THEN
      v_topic := (v_item->>'topicId')::uuid;
    ELSE
      v_label := public.normalize_knowledge_topic_label(v_item->>'label');
      IF length(v_label) NOT BETWEEN 1 AND 120 THEN
        RAISE EXCEPTION 'knowledge_topic_label_invalid' USING ERRCODE = '22023';
      END IF;
      SELECT id INTO v_topic
      FROM public.knowledge_topics
      WHERE normalized_label = v_label;
      IF v_topic IS NULL THEN
        v_topic := md5(format('voyager-topic:v1:%s', v_label))::uuid;
        INSERT INTO public.knowledge_topics(id, normalized_label, embedding)
        VALUES (v_topic, v_label, p_claim_embedding);
        INSERT INTO public.graph_nodes(id, kind, authority_id, label)
        VALUES (
          public.canonical_graph_node_id('topic', v_topic),
          'topic', v_topic, v_label
        );
      END IF;
    END IF;
    v_topic_node := public.canonical_graph_node_id('topic', v_topic);
    v_edge := public.canonical_graph_edge_id(v_unit_node, 'about', v_topic_node);
    INSERT INTO public.graph_edges(id, source_node_id, target_node_id, kind)
    VALUES (v_edge, v_unit_node, v_topic_node, 'about') ON CONFLICT DO NOTHING;
    INSERT INTO public.graph_edge_evidence(edge_id, evidence_event_id)
    VALUES (v_edge, p_event_id) ON CONFLICT DO NOTHING;
    INSERT INTO public.graph_node_grants(
      node_id, knowledge_audience_id, basis_kind, basis_id,
      basis_version, label_snapshot, granted_at, basis_event_id
    )
    SELECT v_topic_node, p_audience_id, 'edge_evidence', v_edge, 1,
      topic.normalized_label, v_event.created_at, p_event_id
    FROM public.knowledge_topics topic
    WHERE topic.id = v_topic
    ON CONFLICT DO NOTHING;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.complete_knowledge_extraction_attempt(
  p_attempt_id uuid,
  p_lease_token uuid,
  p_result public.knowledge_extraction_outcome_kind,
  p_raw_output jsonb DEFAULT NULL,
  p_claim text DEFAULT NULL,
  p_about_person_id uuid DEFAULT NULL,
  p_knowledge_type text DEFAULT NULL,
  p_attention_score real DEFAULT NULL,
  p_embedding vector(1536) DEFAULT NULL,
  p_topic_inputs jsonb DEFAULT NULL,
  p_error_class text DEFAULT NULL,
  p_input_tokens integer DEFAULT NULL,
  p_output_tokens integer DEFAULT NULL
) RETURNS TABLE(
  outcome public.knowledge_extraction_outcome_kind,
  unit_id uuid,
  replayed boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_extractor_version text;
BEGIN
  SELECT extractor_version INTO STRICT v_extractor_version
  FROM public.knowledge_extraction_attempts
  WHERE id = p_attempt_id;
  IF v_extractor_version IN ('cartographer-single-claim-v4', 'cartographer-single-claim-v5') THEN
    RAISE EXCEPTION 'knowledge_extraction_v4_requires_v4_completion'
      USING ERRCODE = '22023';
  END IF;
  RETURN QUERY
  SELECT completion.outcome, completion.unit_id, completion.replayed
  FROM public.complete_knowledge_extraction_attempt_core(
    p_attempt_id, p_lease_token, p_result, p_raw_output, p_claim,
    p_about_person_id, p_knowledge_type, p_attention_score, p_embedding,
    p_topic_inputs, p_error_class, p_input_tokens, p_output_tokens
  ) completion;
END $$;

CREATE OR REPLACE FUNCTION public.complete_v4_knowledge_extraction_attempt(
  p_attempt_id uuid,
  p_lease_token uuid,
  p_result public.knowledge_extraction_outcome_kind,
  p_raw_output jsonb DEFAULT NULL,
  p_claim text DEFAULT NULL,
  p_about_person_id uuid DEFAULT NULL,
  p_knowledge_type text DEFAULT NULL,
  p_attention_score real DEFAULT NULL,
  p_embedding vector(1536) DEFAULT NULL,
  p_topic_inputs jsonb DEFAULT NULL,
  p_topic_candidate_snapshot jsonb DEFAULT NULL,
  p_error_class text DEFAULT NULL,
  p_input_tokens integer DEFAULT NULL,
  p_output_tokens integer DEFAULT NULL
) RETURNS TABLE(
  outcome public.knowledge_extraction_outcome_kind,
  unit_id uuid,
  replayed boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_attempt public.knowledge_extraction_attempts; v_completion record;
BEGIN
  SELECT * INTO STRICT v_attempt
  FROM public.knowledge_extraction_attempts WHERE id = p_attempt_id;
  IF v_attempt.extractor_version NOT IN ('cartographer-single-claim-v4', 'cartographer-single-claim-v5') THEN
    RAISE EXCEPTION 'knowledge_topic_matcher_contract_invalid'
      USING ERRCODE = '22023';
  END IF;
  IF p_result = 'succeeded' AND (
      p_claim IS NULL
      OR p_embedding IS NULL
      OR p_knowledge_type IS NULL
      OR p_knowledge_type NOT IN ('domain', 'operational', 'preference')
      OR p_attention_score IS NULL
      OR p_attention_score NOT BETWEEN 0 AND 1
      OR p_raw_output->'topics' IS DISTINCT FROM p_topic_inputs
    )
    OR p_result = 'no_claim' AND (
      p_claim IS NOT NULL OR p_raw_output->'topics' IS DISTINCT FROM '[]'
    )
    OR p_result IN ('provider_failed', 'malformed_output') AND (
      p_claim IS NOT NULL OR p_error_class IS NULL
    ) THEN
    RAISE EXCEPTION 'knowledge_topic_matcher_payload_invalid'
      USING ERRCODE = '22023';
  END IF;
  SELECT * INTO STRICT v_completion
  FROM public.complete_knowledge_extraction_attempt_core(
    p_attempt_id, p_lease_token, p_result, p_raw_output, p_claim,
    p_about_person_id, p_knowledge_type, p_attention_score, p_embedding,
    NULL, p_error_class, p_input_tokens, p_output_tokens
  );
  IF v_completion.outcome = 'succeeded' AND NOT v_completion.replayed THEN
    PERFORM public.write_v4_knowledge_unit_topics(
      v_completion.unit_id, v_attempt.source_event_id,
      v_attempt.knowledge_audience_id, v_attempt.extractor_version,
      p_topic_inputs, p_topic_candidate_snapshot, p_embedding
    );
  END IF;
  RETURN QUERY
  SELECT v_completion.outcome, v_completion.unit_id, v_completion.replayed;
END $$;

CREATE OR REPLACE FUNCTION public.write_knowledge_topic_identity_backfill(
  p_unit_id uuid,
  p_raw_output jsonb,
  p_knowledge_type text,
  p_attention_score real,
  p_embedding vector(1536),
  p_topic_inputs jsonb,
  p_topic_candidate_snapshot jsonb
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_unit public.knowledge_units;
BEGIN
  SELECT * INTO STRICT v_unit
  FROM public.knowledge_units WHERE id = p_unit_id FOR UPDATE;
  IF v_unit.extractor_version IN ('cartographer-single-claim-v4', 'cartographer-single-claim-v5')
    OR p_raw_output->>'claim' IS DISTINCT FROM v_unit.claim
    OR p_raw_output->'aboutPersonId' IS DISTINCT FROM 'null'
    OR p_raw_output->'topics' IS DISTINCT FROM p_topic_inputs
    OR p_knowledge_type IS NULL
    OR p_knowledge_type NOT IN ('domain', 'operational', 'preference')
    OR p_attention_score IS NULL
    OR p_attention_score NOT BETWEEN 0 AND 1
    OR p_embedding IS NULL THEN
    RAISE EXCEPTION 'knowledge_topic_identity_backfill_payload_invalid'
      USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.knowledge_topic_identity_outcomes
    WHERE unit_id = p_unit_id
  ) THEN
    RETURN true;
  END IF;
  PERFORM set_config('voyager.topic_identity_rework', 'on', true);
  DELETE FROM public.graph_node_grants grant_row
  USING public.graph_edges edge, public.graph_nodes target_node
  WHERE edge.source_node_id = public.canonical_graph_node_id(
      'knowledge_unit', p_unit_id
    )
    AND edge.kind = 'about'
    AND target_node.id = edge.target_node_id
    AND target_node.kind::text = 'topic'
    AND grant_row.basis_kind = 'edge_evidence'
    AND grant_row.basis_id = edge.id;
  DELETE FROM public.graph_edge_evidence evidence
  USING public.graph_edges edge, public.graph_nodes target_node
  WHERE edge.source_node_id = public.canonical_graph_node_id(
      'knowledge_unit', p_unit_id
    )
    AND edge.kind = 'about'
    AND target_node.id = edge.target_node_id
    AND target_node.kind::text = 'topic'
    AND evidence.edge_id = edge.id;
  DELETE FROM public.graph_edges edge
  USING public.graph_nodes target_node
  WHERE edge.source_node_id = public.canonical_graph_node_id(
      'knowledge_unit', p_unit_id
    )
    AND edge.kind = 'about'
    AND target_node.id = edge.target_node_id
    AND target_node.kind::text = 'topic';
  PERFORM set_config('voyager.topic_backfill', 'on', true);
  UPDATE public.knowledge_units
  SET knowledge_type = coalesce(knowledge_type, p_knowledge_type),
    attention_score = coalesce(attention_score, p_attention_score),
    embedding = coalesce(embedding, p_embedding)
  WHERE id = p_unit_id;
  PERFORM public.write_v4_knowledge_unit_topics(
    p_unit_id, v_unit.source_event_id, v_unit.knowledge_audience_id,
    'cartographer-single-claim-v4', p_topic_inputs,
    p_topic_candidate_snapshot, p_embedding
  );
  INSERT INTO public.knowledge_topic_identity_outcomes(
    unit_id, extractor_version, raw_output
  ) VALUES (p_unit_id, 'cartographer-single-claim-v4', p_raw_output);
  DELETE FROM public.graph_nodes node
  WHERE node.kind::text = 'topic'
    AND NOT EXISTS (
      SELECT 1 FROM public.graph_edges
      WHERE source_node_id = node.id OR target_node_id = node.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.graph_node_grants WHERE node_id = node.id
    );
  DELETE FROM public.knowledge_topics topic
  WHERE NOT EXISTS (
    SELECT 1 FROM public.graph_nodes
    WHERE kind::text = 'topic' AND authority_id = topic.id
  );
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.list_knowledge_topic_backfill_jobs() RETURNS TABLE(source_event_id uuid, requesting_user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT job.source_event_id, audience.member_profile_ids[1]
  FROM public.knowledge_extraction_jobs job JOIN public.knowledge_audiences audience ON audience.id = job.knowledge_audience_id
  WHERE job.extractor_version NOT IN ('cartographer-single-claim-v4', 'cartographer-single-claim-v5')
    AND job.state NOT IN ('succeeded', 'no_claim') ORDER BY job.created_at, job.source_event_id
$$;

CREATE OR REPLACE FUNCTION public.list_knowledge_topic_backfill_units()
RETURNS TABLE(unit_id uuid, source_event_id uuid, source_content text, source_actor_id uuid,
  claim text, knowledge_audience_id uuid, embedding text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT unit.id, event.id, event.content, event.actor_id, unit.claim, unit.knowledge_audience_id, unit.embedding::text
  FROM public.knowledge_units unit JOIN public.knowledge_events event ON event.id = unit.source_event_id
  LEFT JOIN public.knowledge_topic_identity_outcomes done ON done.unit_id = unit.id
  WHERE unit.extractor_version NOT IN ('cartographer-single-claim-v4', 'cartographer-single-claim-v5')
    AND done.unit_id IS NULL ORDER BY unit.id
$$;

CREATE OR REPLACE FUNCTION public.assert_knowledge_topic_backfill_complete() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_jobs integer; v_physics integer; v_units integer; v_orphans integer;
BEGIN
  SELECT count(*) INTO v_jobs FROM public.knowledge_extraction_jobs WHERE extractor_version NOT IN ('cartographer-single-claim-v4', 'cartographer-single-claim-v5') AND state NOT IN ('succeeded','no_claim');
  SELECT count(*) INTO v_physics FROM public.knowledge_units WHERE embedding IS NULL OR knowledge_type IS NULL OR attention_score IS NULL;
  SELECT count(*) INTO v_units FROM public.knowledge_units unit LEFT JOIN public.knowledge_topic_identity_outcomes done ON done.unit_id = unit.id
    WHERE unit.extractor_version NOT IN ('cartographer-single-claim-v4', 'cartographer-single-claim-v5') AND done.unit_id IS NULL;
  SELECT count(*) INTO v_orphans FROM public.knowledge_topics topic WHERE NOT EXISTS (SELECT 1 FROM public.graph_nodes node JOIN public.graph_edges edge ON edge.target_node_id = node.id
      WHERE node.kind::text = 'topic' AND node.authority_id = topic.id AND edge.kind = 'about');
  IF v_jobs <> 0 OR v_physics <> 0 OR v_units <> 0 OR v_orphans <> 0 THEN RAISE EXCEPTION 'knowledge_topic_backfill_incomplete:%:%:%:%', v_jobs, v_physics, v_units, v_orphans; END IF;
  RETURN jsonb_build_object('oldNonTerminalJobs',v_jobs,'unitsMissingPhysics',v_physics,'oldUnitsMissingTopicDerivation',v_units,'orphanTopics',v_orphans);
END $$;

CREATE OR REPLACE FUNCTION public.activate_knowledge_topic_contract() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE public.knowledge_extractor_contract_active SET extractor_version = 'cartographer-single-claim-v5', activated_at = clock_timestamp()
  WHERE singleton AND extractor_version <> 'cartographer-single-claim-v5';
  RETURN (SELECT extractor_version FROM public.knowledge_extractor_contract_active WHERE singleton);
END $$;

-- Activation is an UPDATE of the one singleton row, never a second active
-- insert. It happens last, after every v5-compatible constraint and function
-- exists.
UPDATE public.knowledge_extractor_contract_active
SET extractor_version = 'cartographer-single-claim-v5', activated_at = clock_timestamp()
WHERE singleton AND extractor_version <> 'cartographer-single-claim-v5';

DO $assert_activation$
DECLARE v_active text;
BEGIN
  SELECT extractor_version INTO STRICT v_active
  FROM public.knowledge_extractor_contract_active WHERE singleton;
  IF v_active <> 'cartographer-single-claim-v5' THEN
    RAISE EXCEPTION 'knowledge_extractor_v5_activation_failed:%', v_active;
  END IF;
END $assert_activation$;
