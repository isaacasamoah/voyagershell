-- K4b hardening: exact candidate snapshots, scoped rework, and completion safety.
CREATE INDEX knowledge_units_embedding_hnsw ON public.knowledge_units
  USING hnsw (embedding vector_cosine_ops);
CREATE INDEX knowledge_topics_embedding_hnsw ON public.knowledge_topics
  USING hnsw (embedding vector_cosine_ops);

DROP FUNCTION public.write_knowledge_topic_backfill(uuid, jsonb, text, real, vector, jsonb);
DROP FUNCTION public.complete_v4_knowledge_extraction_attempt(
  uuid, uuid, public.knowledge_extraction_outcome_kind, jsonb, text, uuid,
  text, real, vector, jsonb, uuid[], text, integer, integer);
DROP FUNCTION public.write_knowledge_topic_identity_backfill(
  uuid, jsonb, text, real, vector, jsonb, uuid[]);
DROP FUNCTION public.write_v4_knowledge_unit_topics(
  uuid, uuid, uuid, text, jsonb, uuid[], vector);
DROP FUNCTION public.resolve_knowledge_topic(text, uuid, vector, uuid);

CREATE FUNCTION public.resolve_knowledge_topic(
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
  ELSIF p_extractor_version = 'cartographer-single-claim-v4' THEN
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

CREATE FUNCTION public.write_v4_knowledge_unit_topics(
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
  IF p_extractor_version <> 'cartographer-single-claim-v4'
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

CREATE FUNCTION public.complete_knowledge_extraction_attempt_core(
  p_attempt_id uuid,
  p_lease_token uuid,
  p_result public.knowledge_extraction_outcome_kind,
  p_raw_output jsonb,
  p_claim text,
  p_about_person_id uuid,
  p_knowledge_type text,
  p_attention_score real,
  p_embedding vector(1536),
  p_topic_inputs jsonb,
  p_error_class text,
  p_input_tokens integer,
  p_output_tokens integer
) RETURNS TABLE(
  outcome public.knowledge_extraction_outcome_kind,
  unit_id uuid,
  replayed boolean
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_attempt public.knowledge_extraction_attempts; v_job public.knowledge_extraction_jobs;
  v_event public.knowledge_events; v_existing jsonb; v_unit public.knowledge_units;
  v_final public.knowledge_extraction_outcome_kind := p_result; v_error text := p_error_class;
  v_unit_id uuid; v_unit_node uuid; v_event_node uuid; v_person_node public.graph_nodes;
  v_edge uuid; v_now timestamptz := clock_timestamp(); v_physics boolean; v_topics boolean;
BEGIN
  SELECT * INTO STRICT v_attempt
  FROM public.knowledge_extraction_attempts WHERE id = p_attempt_id;
  v_physics := v_attempt.extractor_version IN
    ('cartographer-single-claim-v2', 'cartographer-single-claim-v3');
  v_topics := v_attempt.extractor_version = 'cartographer-single-claim-v3';
  SELECT * INTO STRICT v_job
  FROM public.knowledge_extraction_jobs
  WHERE source_event_id = v_attempt.source_event_id
    AND extractor_version = v_attempt.extractor_version
  FOR UPDATE;
  SELECT to_jsonb(stored.*) INTO v_existing
  FROM public.knowledge_extraction_attempt_outcomes stored
  WHERE stored.attempt_id = p_attempt_id;
  IF v_existing IS NOT NULL THEN
    SELECT * INTO v_unit FROM public.knowledge_units
    WHERE source_event_id = v_attempt.source_event_id
      AND extractor_version = v_attempt.extractor_version
      AND claim_key = 'claim:0';
    IF v_existing->>'outcome' IS DISTINCT FROM p_result::text
      OR v_existing->'raw_output' IS DISTINCT FROM p_raw_output
      OR v_existing->>'error_class' IS DISTINCT FROM p_error_class
      OR (p_result = 'succeeded' AND (
        v_unit.claim IS DISTINCT FROM btrim(p_claim)
        OR v_unit.knowledge_type IS DISTINCT FROM p_knowledge_type
        OR v_unit.attention_score IS DISTINCT FROM p_attention_score
        OR v_unit.embedding::text IS DISTINCT FROM p_embedding::text
      )) THEN
      RAISE EXCEPTION 'knowledge_extraction_outcome_payload_conflict'
        USING ERRCODE = '23505';
    END IF;
    RETURN QUERY SELECT p_result,
      CASE WHEN p_result = 'succeeded' THEN v_unit.id END, true;
    RETURN;
  END IF;
  IF v_job.state <> 'leased'
    OR v_job.active_attempt_id <> p_attempt_id
    OR v_job.lease_token <> p_lease_token
    OR v_attempt.lease_token <> p_lease_token THEN
    RAISE EXCEPTION 'knowledge_extraction_lease_not_owned' USING ERRCODE = '42501';
  END IF;
  IF v_job.lease_expires_at <= v_now THEN
    v_final := 'expired'; v_error := 'lease_expired';
  ELSIF p_result NOT IN (
    'succeeded', 'no_claim', 'provider_failed', 'malformed_output'
  ) THEN
    RAISE EXCEPTION 'knowledge_extraction_result_invalid' USING ERRCODE = '22023';
  ELSIF p_result = 'succeeded' AND (
    p_claim IS NULL OR length(btrim(p_claim)) = 0
    OR p_raw_output IS NULL
    OR p_raw_output->>'claim' IS DISTINCT FROM btrim(p_claim)
    OR p_raw_output->>'aboutPersonId' IS DISTINCT FROM p_about_person_id::text
    OR (v_physics AND (
      p_knowledge_type NOT IN ('domain', 'operational', 'preference')
      OR p_attention_score IS NULL OR p_attention_score NOT BETWEEN 0 AND 1
      OR p_embedding IS NULL
    ))
    OR (v_topics AND (
      jsonb_typeof(p_raw_output->'topics') <> 'array'
      OR jsonb_array_length(p_raw_output->'topics') > 3
      OR coalesce(jsonb_array_length(p_topic_inputs), 0)
        <> jsonb_array_length(p_raw_output->'topics')
    ))
  ) THEN
    v_final := 'commit_rejected'; v_error := 'success_payload_invalid';
  ELSIF p_result = 'no_claim' AND (
    p_claim IS NOT NULL OR p_about_person_id IS NOT NULL
    OR p_raw_output IS NULL OR p_raw_output->'claim' IS DISTINCT FROM 'null'
    OR p_raw_output->'aboutPersonId' IS DISTINCT FROM 'null'
    OR (v_topics AND p_raw_output->'topics' IS DISTINCT FROM '[]')
  ) THEN
    v_final := 'commit_rejected'; v_error := 'no_claim_payload_invalid';
  ELSIF p_result IN ('provider_failed', 'malformed_output') AND (
    p_claim IS NOT NULL OR p_about_person_id IS NOT NULL OR p_error_class IS NULL
  ) THEN
    RAISE EXCEPTION 'knowledge_extraction_failure_payload_invalid'
      USING ERRCODE = '22023';
  END IF;
  SELECT * INTO STRICT v_event
  FROM public.knowledge_events WHERE id = v_attempt.source_event_id;
  v_unit_id := md5(format(
    'voyager-unit:k3:%s:%s:claim:0',
    v_attempt.source_event_id, v_attempt.extractor_version
  ))::uuid;
  SELECT * INTO v_unit FROM public.knowledge_units
  WHERE source_event_id = v_attempt.source_event_id
    AND extractor_version = v_attempt.extractor_version
    AND claim_key = 'claim:0';
  IF v_final = 'succeeded'
    AND v_unit.id IS NOT NULL
    AND v_unit.claim IS DISTINCT FROM btrim(p_claim) THEN
    v_final := 'commit_rejected'; v_error := 'claim_key_conflict';
  END IF;
  IF v_final = 'succeeded' AND p_about_person_id IS NOT NULL THEN
    SELECT node.* INTO v_person_node
    FROM public.graph_nodes node
    JOIN public.knowledge_audiences audience
      ON audience.id = v_attempt.knowledge_audience_id
    WHERE node.kind = 'person'
      AND node.authority_id = p_about_person_id
      AND p_about_person_id = ANY(audience.member_profile_ids);
    IF v_person_node.id IS NULL THEN
      v_final := 'commit_rejected'; v_error := 'about_person_not_candidate';
    END IF;
  END IF;
  INSERT INTO public.knowledge_extraction_attempt_outcomes(
    attempt_id, source_event_id, extractor_version, knowledge_audience_id,
    outcome, raw_output, error_class, input_tokens, output_tokens
  ) VALUES (
    p_attempt_id, v_attempt.source_event_id, v_attempt.extractor_version,
    v_attempt.knowledge_audience_id, v_final, p_raw_output, v_error,
    p_input_tokens, p_output_tokens
  );
  IF v_final = 'succeeded' THEN
    INSERT INTO public.knowledge_units(
      id, claim, source_event_id, extractor_version, claim_key,
      knowledge_audience_id, knowledge_type, attention_score, embedding
    ) VALUES (
      v_unit_id, btrim(p_claim), v_attempt.source_event_id,
      v_attempt.extractor_version, 'claim:0', v_attempt.knowledge_audience_id,
      p_knowledge_type, p_attention_score, p_embedding
    ) ON CONFLICT DO NOTHING;
    v_unit_node := public.canonical_graph_node_id('knowledge_unit', v_unit_id);
    v_event_node := public.canonical_graph_node_id(
      'message_event', v_attempt.source_event_id
    );
    INSERT INTO public.graph_nodes(id, kind, authority_id, label)
    VALUES (v_unit_node, 'knowledge_unit', v_unit_id, btrim(p_claim))
    ON CONFLICT DO NOTHING;
    INSERT INTO public.graph_node_grants(
      node_id, knowledge_audience_id, basis_kind, basis_id,
      basis_version, label_snapshot, granted_at
    ) VALUES (
      v_unit_node, v_attempt.knowledge_audience_id, 'source_event',
      v_attempt.source_event_id, 1, btrim(p_claim), v_event.created_at
    ) ON CONFLICT DO NOTHING;
    v_edge := public.canonical_graph_edge_id(
      v_unit_node, 'derived_from', v_event_node
    );
    INSERT INTO public.graph_edges(id, source_node_id, target_node_id, kind)
    VALUES (v_edge, v_unit_node, v_event_node, 'derived_from')
    ON CONFLICT DO NOTHING;
    INSERT INTO public.graph_edge_evidence(edge_id, evidence_event_id)
    VALUES (v_edge, v_attempt.source_event_id) ON CONFLICT DO NOTHING;
    IF p_about_person_id IS NOT NULL THEN
      v_edge := public.canonical_graph_edge_id(
        v_unit_node, 'about', v_person_node.id
      );
      INSERT INTO public.graph_edges(id, source_node_id, target_node_id, kind)
      VALUES (v_edge, v_unit_node, v_person_node.id, 'about')
      ON CONFLICT DO NOTHING;
      INSERT INTO public.graph_edge_evidence(edge_id, evidence_event_id)
      VALUES (v_edge, v_attempt.source_event_id) ON CONFLICT DO NOTHING;
      INSERT INTO public.graph_node_grants(
        node_id, knowledge_audience_id, basis_kind, basis_id,
        basis_version, label_snapshot, granted_at, basis_event_id
      ) VALUES (
        v_person_node.id, v_attempt.knowledge_audience_id, 'edge_evidence',
        v_edge, 1, v_person_node.label, v_event.created_at,
        v_attempt.source_event_id
      ) ON CONFLICT DO NOTHING;
    END IF;
    IF v_topics THEN
      PERFORM public.write_knowledge_unit_topics(
        v_unit_id, v_attempt.source_event_id,
        v_attempt.knowledge_audience_id, v_attempt.extractor_version,
        p_raw_output->'topics', p_topic_inputs
      );
    END IF;
  END IF;
  UPDATE public.knowledge_extraction_jobs
  SET state = CASE
      WHEN v_final = 'succeeded'
        THEN 'succeeded'::public.knowledge_extraction_job_state
      WHEN v_final = 'no_claim'
        THEN 'no_claim'::public.knowledge_extraction_job_state
      ELSE 'pending'::public.knowledge_extraction_job_state
    END,
    active_attempt_id = NULL,
    lease_token = NULL,
    lease_expires_at = NULL,
    updated_at = v_now
  WHERE source_event_id = v_attempt.source_event_id
    AND extractor_version = v_attempt.extractor_version;
  RETURN QUERY SELECT v_final,
    CASE WHEN v_final = 'succeeded' THEN v_unit_id END, false;
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
  IF v_extractor_version = 'cartographer-single-claim-v4' THEN
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

CREATE FUNCTION public.complete_v4_knowledge_extraction_attempt(
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
  IF v_attempt.extractor_version <> 'cartographer-single-claim-v4' THEN
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

CREATE OR REPLACE FUNCTION public.guard_topic_identity_rework_row()
RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_old jsonb := to_jsonb(OLD); v_new jsonb := to_jsonb(NEW); v_allowed boolean := false;
BEGIN
  IF TG_TABLE_NAME = 'graph_nodes' AND TG_OP = 'UPDATE'
    AND v_new->>'id' IS NOT DISTINCT FROM v_old->>'id'
    AND v_new->>'kind' IS NOT DISTINCT FROM v_old->>'kind'
    AND v_new->>'authority_id' IS NOT DISTINCT FROM v_old->>'authority_id'
    AND (
      v_old->>'kind' <> 'topic'
      OR v_new->>'label' IS NOT DISTINCT FROM v_old->>'label'
    ) THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'DELETE'
    AND current_setting('voyager.topic_identity_rework', true) = 'on' THEN
    IF TG_TABLE_NAME = 'graph_edges' THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.graph_nodes source_node, public.graph_nodes target_node
        WHERE source_node.id = (v_old->>'source_node_id')::uuid
          AND source_node.kind = 'knowledge_unit'
          AND target_node.id = (v_old->>'target_node_id')::uuid
          AND target_node.kind::text = 'topic'
          AND v_old->>'kind' = 'about'
      ) INTO v_allowed;
    ELSIF TG_TABLE_NAME = 'graph_edge_evidence' THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.graph_edges edge
        JOIN public.graph_nodes source_node ON source_node.id = edge.source_node_id
        JOIN public.graph_nodes target_node ON target_node.id = edge.target_node_id
        WHERE edge.id = (v_old->>'edge_id')::uuid
          AND edge.kind = 'about'
          AND source_node.kind = 'knowledge_unit'
          AND target_node.kind::text = 'topic'
      ) INTO v_allowed;
    ELSIF TG_TABLE_NAME = 'graph_node_grants' THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.graph_edges edge
        JOIN public.graph_nodes source_node ON source_node.id = edge.source_node_id
        JOIN public.graph_nodes target_node ON target_node.id = edge.target_node_id
        WHERE edge.id = (v_old->>'basis_id')::uuid
          AND edge.target_node_id = (v_old->>'node_id')::uuid
          AND edge.kind = 'about'
          AND source_node.kind = 'knowledge_unit'
          AND target_node.kind::text = 'topic'
          AND v_old->>'basis_kind' = 'edge_evidence'
      ) INTO v_allowed;
    ELSIF TG_TABLE_NAME = 'graph_nodes' THEN
      v_allowed := v_old->>'kind' = 'topic'
        AND NOT EXISTS (
          SELECT 1 FROM public.graph_edges
          WHERE source_node_id = (v_old->>'id')::uuid
            OR target_node_id = (v_old->>'id')::uuid
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.graph_node_grants
          WHERE node_id = (v_old->>'id')::uuid
        );
    ELSIF TG_TABLE_NAME = 'knowledge_topics' THEN
      v_allowed := NOT EXISTS (
        SELECT 1 FROM public.graph_nodes
        WHERE kind::text = 'topic'
          AND authority_id = (v_old->>'id')::uuid
      );
    END IF;
    IF v_allowed THEN RETURN OLD; END IF;
  END IF;
  RAISE EXCEPTION '%_immutable', TG_TABLE_NAME USING ERRCODE = '23514';
END $$;

CREATE FUNCTION public.write_knowledge_topic_identity_backfill(
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
  IF v_unit.extractor_version = 'cartographer-single-claim-v4'
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

REVOKE EXECUTE ON FUNCTION public.list_knowledge_topic_backfill_units()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_knowledge_topic_backfill_units()
  TO service_role;
REVOKE EXECUTE ON FUNCTION public.complete_knowledge_extraction_attempt_core(
  uuid, uuid, public.knowledge_extraction_outcome_kind, jsonb, text, uuid,
  text, real, vector, jsonb, text, integer, integer
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.write_v4_knowledge_unit_topics(
  uuid, uuid, uuid, text, jsonb, jsonb, vector
), public.guard_topic_identity_rework_row(),
  public.write_knowledge_topic_identity_backfill(
    uuid, jsonb, text, real, vector, jsonb, jsonb
  ) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.resolve_knowledge_topic(
  text, uuid, vector, uuid
), public.complete_knowledge_extraction_attempt(
  uuid, uuid, public.knowledge_extraction_outcome_kind, jsonb, text, uuid,
  text, real, vector, jsonb, text, integer, integer
), public.complete_v4_knowledge_extraction_attempt(
  uuid, uuid, public.knowledge_extraction_outcome_kind, jsonb, text, uuid,
  text, real, vector, jsonb, jsonb, text, integer, integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_knowledge_topic(
  text, uuid, vector, uuid
), public.complete_knowledge_extraction_attempt(
  uuid, uuid, public.knowledge_extraction_outcome_kind, jsonb, text, uuid,
  text, real, vector, jsonb, text, integer, integer
), public.complete_v4_knowledge_extraction_attempt(
  uuid, uuid, public.knowledge_extraction_outcome_kind, jsonb, text, uuid,
  text, real, vector, jsonb, jsonb, text, integer, integer
), public.write_knowledge_topic_identity_backfill(
  uuid, jsonb, text, real, vector, jsonb, jsonb
) TO service_role;
