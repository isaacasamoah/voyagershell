-- K4c: per-person conflict discovery with immutable provider evidence.
-- The relation enum values already exist from migration 061. This migration
-- deliberately gives only contradicts and supersedes a writer.

CREATE TABLE public.knowledge_relation_contracts (
  contract_version text PRIMARY KEY
    CHECK (length(btrim(contract_version)) BETWEEN 1 AND 120),
  description text NOT NULL CHECK (length(btrim(description)) > 0),
  stage1_instruction text NOT NULL CHECK (length(btrim(stage1_instruction)) > 0),
  stage2_instruction text NOT NULL CHECK (length(btrim(stage2_instruction)) > 0),
  verdicts public.graph_edge_kind[] NOT NULL CHECK (
    verdicts = ARRAY['contradicts', 'supersedes']::public.graph_edge_kind[]
  ),
  blocking_spec jsonb NOT NULL CHECK (
    jsonb_typeof(blocking_spec) = 'object'
    AND blocking_spec->'sources'
      = '["topic_siblings","claim_embedding"]'::jsonb
    AND (blocking_spec->>'embeddingModel') IS NOT NULL
    AND (blocking_spec->>'embeddingDimensions')::integer = 1536
    AND (blocking_spec->>'candidateFloor')::real BETWEEN 0 AND 1
    AND (blocking_spec->>'candidateLimit')::integer BETWEEN 1 AND 64
  ),
  model_task text NOT NULL CHECK (length(btrim(model_task)) BETWEEN 1 AND 80),
  model_quality text NOT NULL CHECK (length(btrim(model_quality)) BETWEEN 1 AND 80),
  provider_calls_per_job integer NOT NULL CHECK (provider_calls_per_job = 2),
  max_attempts integer NOT NULL CHECK (max_attempts BETWEEN 1 AND 10),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE public.knowledge_relation_contract_active (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  contract_version text NOT NULL REFERENCES public.knowledge_relation_contracts(contract_version),
  activated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE public.knowledge_relation_jobs (
  unit_id uuid NOT NULL REFERENCES public.knowledge_units(id) ON DELETE RESTRICT,
  person_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  contract_version text NOT NULL
    REFERENCES public.knowledge_relation_contracts(contract_version),
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'leased', 'completed')),
  next_attempt_number integer NOT NULL DEFAULT 1 CHECK (next_attempt_number > 0),
  active_attempt_id uuid,
  lease_token uuid,
  lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (unit_id, person_id, contract_version),
  CONSTRAINT knowledge_relation_job_lease_shape CHECK (
    (state = 'leased') = (
      active_attempt_id IS NOT NULL
      AND lease_token IS NOT NULL
      AND lease_expires_at IS NOT NULL
    )
  )
);
CREATE INDEX knowledge_relation_jobs_due
  ON public.knowledge_relation_jobs(person_id, state, created_at, unit_id);

CREATE TABLE public.knowledge_relation_attempts (
  id uuid PRIMARY KEY,
  unit_id uuid NOT NULL,
  person_id uuid NOT NULL,
  contract_version text NOT NULL,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  candidate_unit_ids uuid[] NOT NULL,
  model_provider text NOT NULL CHECK (length(btrim(model_provider)) BETWEEN 1 AND 120),
  model_id text NOT NULL CHECK (length(btrim(model_id)) BETWEEN 1 AND 200),
  resolver_label text CHECK (
    resolver_label IS NULL OR length(btrim(resolver_label)) BETWEEN 1 AND 200
  ),
  lease_token uuid NOT NULL UNIQUE,
  started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (unit_id, person_id, contract_version, attempt_number),
  FOREIGN KEY (unit_id, person_id, contract_version)
    REFERENCES public.knowledge_relation_jobs(unit_id, person_id, contract_version)
);
ALTER TABLE public.knowledge_relation_jobs
  ADD CONSTRAINT knowledge_relation_jobs_active_attempt_fkey
  FOREIGN KEY (active_attempt_id) REFERENCES public.knowledge_relation_attempts(id);

CREATE TABLE public.knowledge_relation_outcomes (
  attempt_id uuid PRIMARY KEY REFERENCES public.knowledge_relation_attempts(id),
  unit_id uuid NOT NULL,
  person_id uuid NOT NULL,
  contract_version text NOT NULL,
  outcome public.knowledge_extraction_outcome_kind NOT NULL,
  raw_output jsonb,
  relations jsonb NOT NULL DEFAULT '[]'::jsonb,
  grant_requests jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_class text CHECK (
    error_class IS NULL OR length(btrim(error_class)) BETWEEN 1 AND 80
  ),
  input_tokens integer CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens integer CHECK (output_tokens IS NULL OR output_tokens >= 0),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (unit_id, person_id, contract_version)
    REFERENCES public.knowledge_relation_jobs(unit_id, person_id, contract_version),
  CONSTRAINT knowledge_relation_outcome_error_shape CHECK (
    (outcome = 'succeeded') = (error_class IS NULL)
  ),
  CONSTRAINT knowledge_relation_outcome_payload_shape CHECK (
    jsonb_typeof(relations) = 'array'
    AND jsonb_typeof(grant_requests) = 'array'
  )
);

CREATE TABLE public.knowledge_relation_assertions (
  edge_id uuid NOT NULL REFERENCES public.graph_edges(id) ON DELETE RESTRICT,
  input_unit_ids uuid[] NOT NULL CHECK (cardinality(input_unit_ids) >= 2),
  contract_version text NOT NULL
    REFERENCES public.knowledge_relation_contracts(contract_version),
  attempt_id uuid NOT NULL REFERENCES public.knowledge_relation_attempts(id),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (edge_id, attempt_id)
);
CREATE INDEX knowledge_relation_assertions_edge
  ON public.knowledge_relation_assertions(edge_id);

CREATE TRIGGER trg_knowledge_relation_contract_immutable
  BEFORE UPDATE OR DELETE ON public.knowledge_relation_contracts
  FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_knowledge_graph_row();
CREATE TRIGGER trg_knowledge_relation_contract_active_no_delete
  BEFORE DELETE ON public.knowledge_relation_contract_active
  FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_knowledge_graph_row();
CREATE TRIGGER trg_knowledge_relation_attempt_immutable
  BEFORE UPDATE OR DELETE ON public.knowledge_relation_attempts
  FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_knowledge_graph_row();
CREATE TRIGGER trg_knowledge_relation_outcome_immutable
  BEFORE UPDATE OR DELETE ON public.knowledge_relation_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_knowledge_graph_row();
CREATE TRIGGER trg_knowledge_relation_assertion_immutable
  BEFORE UPDATE OR DELETE ON public.knowledge_relation_assertions
  FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_knowledge_graph_row();

CREATE FUNCTION public.validate_knowledge_relation_job()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (
    TG_OP = 'UPDATE'
    AND (NEW.unit_id, NEW.person_id, NEW.contract_version, NEW.created_at)
      IS DISTINCT FROM
      (OLD.unit_id, OLD.person_id, OLD.contract_version, OLD.created_at)
  ) THEN
    RAISE EXCEPTION 'knowledge_relation_job_identity_immutable'
      USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.knowledge_units unit
    JOIN public.knowledge_audiences audience
      ON audience.id = unit.knowledge_audience_id
    WHERE unit.id = NEW.unit_id
      AND audience.purpose = 'source'
      AND NEW.person_id = ANY(audience.member_profile_ids)
  ) THEN
    RAISE EXCEPTION 'knowledge_relation_job_source_invalid'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER trg_knowledge_relation_job_validate
  BEFORE INSERT OR UPDATE OR DELETE ON public.knowledge_relation_jobs
  FOR EACH ROW EXECUTE FUNCTION public.validate_knowledge_relation_job();

CREATE FUNCTION public.validate_knowledge_relation_attempt()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_distinct integer;
BEGIN
  SELECT count(DISTINCT candidate_id) INTO v_distinct
  FROM unnest(NEW.candidate_unit_ids) candidate_id;
  IF NEW.unit_id = ANY(NEW.candidate_unit_ids)
    OR v_distinct <> cardinality(NEW.candidate_unit_ids) THEN
    RAISE EXCEPTION 'knowledge_relation_attempt_candidates_invalid'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER trg_knowledge_relation_attempt_validate
  BEFORE INSERT ON public.knowledge_relation_attempts
  FOR EACH ROW EXECUTE FUNCTION public.validate_knowledge_relation_attempt();

INSERT INTO public.knowledge_relation_contracts(
  contract_version, description, stage1_instruction, stage2_instruction,
  verdicts, blocking_spec, model_task, model_quality,
  provider_calls_per_job, max_attempts
) VALUES (
  'relation-conflict-v2',
  'Precision-first two-stage conflict discovery for immutable KnowledgeUnits. The judgment instruction must remain example-free: few-shot examples are prohibited because the K4b measured harness produced ten false merges when worked examples were included. Stage 2 defaults to contradicts because a false supersedes can retire a true fact in K5 while contradicts only preserves a tension for retrieval.',
  $stage1$You detect conflicts for a personal memory ledger. Judge one newly committed immutable focus claim against every ordered earlier candidate claim that the same person is authorized to read. Return exactly one conflict or none decision for every candidate.

Ask only this user-consequence question: if the person acted on the candidate claim today, would the focus claim make that action wrong or out of date? Emit conflict when it would; otherwise emit none. Restatement, shared subject, causal influence, additional detail, and adjacent compatible facts are none. Do not infer missing dates, scope, intent, priority, replacement, or truth. When uncertain whether there is any conflict, emit none. Use only supplied candidate unit IDs.$stage1$,
  $stage2$You classify only claim pairs already judged to conflict for a personal memory ledger. Return exactly one directed verdict for every candidate.

Supersedes has an asymmetric, higher bar. Emit supersedes only when the focus claim contains explicit replacement evidence and states the newer current state of the same operative commitment, decision, or fact expressed by the candidate, so that keeping both as current is incoherent. Compare the claims' referent and operative meaning, not identical wording: an earlier required action or plan is the same commitment when the focus explicitly cancels, ends, completes, or replaces the state that made it current.

A constraint, exception, obstacle, countervailing instruction, incompatible plan, or different fact that merely makes acting on the candidate unsafe or impossible is not replacement evidence. Those conflicts are contradicts.

DEFAULT TO CONTRADICTS. Every conflict that does not meet every supersedes requirement is contradicts. When uncertain between the two verdicts, emit contradicts. This default is mandatory because contradicts preserves both claims for retrieval while supersedes can feed later truth machinery that retires a true fact.

Use the focus unit as source and the candidate unit as target. Use only supplied unit IDs. Discovery records tension only; it never decides truth, changes attention, hides a unit, or grants access.$stage2$,
  ARRAY['contradicts', 'supersedes']::public.graph_edge_kind[],
  '{"sources":["topic_siblings","claim_embedding"],"embeddingModel":"text-embedding-3-small","embeddingDimensions":1536,"candidateFloor":0.2,"candidateLimit":16}'::jsonb,
  'classification', 'balanced', 2, 3
);
INSERT INTO public.knowledge_relation_contract_active(contract_version)
VALUES ('relation-conflict-v2');

CREATE FUNCTION public.enqueue_knowledge_relation_jobs()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_version text;
BEGIN
  SELECT contract_version INTO STRICT v_version
  FROM public.knowledge_relation_contract_active
  WHERE singleton
  FOR SHARE;
  INSERT INTO public.knowledge_relation_jobs(
    unit_id, person_id, contract_version, created_at, updated_at
  )
  SELECT NEW.id, member_id, v_version, event.created_at, clock_timestamp()
  FROM public.knowledge_events event
  JOIN public.knowledge_audiences audience
    ON audience.id = NEW.knowledge_audience_id
  CROSS JOIN LATERAL unnest(audience.member_profile_ids) member_id
  WHERE event.id = NEW.source_event_id
  ON CONFLICT (unit_id, person_id, contract_version) DO NOTHING;
  RETURN NEW;
END
$$;
CREATE TRIGGER trg_enqueue_knowledge_relation_jobs
  AFTER INSERT ON public.knowledge_units
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_knowledge_relation_jobs();

CREATE FUNCTION public.relation_candidate_units(
  p_unit_id uuid,
  p_person_id uuid,
  p_contract_version text
) RETURNS TABLE(
  unit_id uuid,
  claim text,
  topic_labels text[],
  similarity real
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_floor real; v_limit integer;
BEGIN
  SELECT (blocking_spec->>'candidateFloor')::real,
    (blocking_spec->>'candidateLimit')::integer
  INTO STRICT v_floor, v_limit
  FROM public.knowledge_relation_contracts
  WHERE contract_version = p_contract_version;

  RETURN QUERY
  WITH focus AS MATERIALIZED (
    SELECT unit.id, unit.embedding, event.sequence_num
    FROM public.knowledge_units unit
    JOIN public.knowledge_events event ON event.id = unit.source_event_id
    JOIN public.graph_nodes node
      ON node.kind = 'knowledge_unit' AND node.authority_id = unit.id
    WHERE unit.id = p_unit_id
      AND public.viewer_has_graph_node_grant(node.id, p_person_id)
  ),
  focus_topics AS MATERIALIZED (
    SELECT edge.target_node_id
    FROM focus
    JOIN public.graph_nodes focus_node
      ON focus_node.kind = 'knowledge_unit' AND focus_node.authority_id = focus.id
    JOIN public.graph_edges edge
      ON edge.source_node_id = focus_node.id AND edge.kind = 'about'
    JOIN public.graph_nodes topic_node
      ON topic_node.id = edge.target_node_id AND topic_node.kind = 'topic'
  ),
  scored AS MATERIALIZED (
    SELECT candidate.id AS unit_id,
      candidate.claim,
      coalesce((
        SELECT array_agg(topic.normalized_label ORDER BY topic.normalized_label)
        FROM public.graph_nodes candidate_node
        JOIN public.graph_edges topic_edge
          ON topic_edge.source_node_id = candidate_node.id
          AND topic_edge.kind = 'about'
        JOIN public.graph_nodes topic_node
          ON topic_node.id = topic_edge.target_node_id
          AND topic_node.kind = 'topic'
        JOIN public.knowledge_topics topic
          ON topic.id = topic_node.authority_id
        WHERE candidate_node.kind = 'knowledge_unit'
          AND candidate_node.authority_id = candidate.id
      ), '{}'::text[]) AS topic_labels,
      CASE
        WHEN focus.embedding IS NULL OR candidate.embedding IS NULL THEN NULL
        ELSE (1 - (candidate.embedding <=> focus.embedding))::real
      END AS similarity,
      EXISTS (
        SELECT 1
        FROM public.graph_nodes candidate_node
        JOIN public.graph_edges topic_edge
          ON topic_edge.source_node_id = candidate_node.id
          AND topic_edge.kind = 'about'
        JOIN focus_topics
          ON focus_topics.target_node_id = topic_edge.target_node_id
        WHERE candidate_node.kind = 'knowledge_unit'
          AND candidate_node.authority_id = candidate.id
      ) AS shares_topic
    FROM focus
    JOIN public.knowledge_units candidate ON candidate.id <> focus.id
    JOIN public.knowledge_events candidate_event
      ON candidate_event.id = candidate.source_event_id
    JOIN public.graph_nodes candidate_node
      ON candidate_node.kind = 'knowledge_unit'
      AND candidate_node.authority_id = candidate.id
    WHERE candidate_event.sequence_num < focus.sequence_num
      AND public.viewer_has_graph_node_grant(candidate_node.id, p_person_id)
  )
  SELECT scored.unit_id, scored.claim, scored.topic_labels, scored.similarity
  FROM scored
  WHERE scored.shares_topic
    OR (scored.similarity IS NOT NULL AND scored.similarity >= v_floor)
  ORDER BY scored.similarity DESC NULLS LAST, scored.unit_id
  LIMIT v_limit;
END
$$;

CREATE FUNCTION public.begin_relation_attempt(
  p_requesting_user_id uuid,
  p_model_provider text,
  p_model_id text,
  p_resolver_label text DEFAULT NULL,
  p_unit_id uuid DEFAULT NULL,
  p_lease_seconds integer DEFAULT 120
) RETURNS TABLE(
  attempt_id uuid,
  lease_token uuid,
  unit_id uuid,
  person_id uuid,
  contract_version text,
  focus_claim text,
  candidates jsonb,
  attempt_number integer
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
  v_job public.knowledge_relation_jobs;
  v_contract public.knowledge_relation_contracts;
  v_attempt_id uuid;
  v_token uuid;
  v_now timestamptz := clock_timestamp();
  v_candidate_ids uuid[];
  v_candidates jsonb;
  v_focus_claim text;
  v_expired_number integer;
BEGIN
  IF p_requesting_user_id IS NULL
    OR p_model_provider IS NULL
    OR length(btrim(p_model_provider)) NOT BETWEEN 1 AND 120
    OR p_model_id IS NULL
    OR length(btrim(p_model_id)) NOT BETWEEN 1 AND 200
    OR p_lease_seconds IS NULL
    OR p_lease_seconds NOT BETWEEN 1 AND 900 THEN
    RAISE EXCEPTION 'knowledge_relation_attempt_input_invalid'
      USING ERRCODE = '22023';
  END IF;

  LOOP
    SELECT job.* INTO v_job
    FROM public.knowledge_relation_jobs job
    JOIN public.graph_nodes focus_node
      ON focus_node.kind = 'knowledge_unit'
      AND focus_node.authority_id = job.unit_id
    WHERE job.person_id = p_requesting_user_id
      AND (
        job.state = 'pending'
        OR (job.state = 'leased' AND job.lease_expires_at <= v_now)
      )
      AND (p_unit_id IS NULL OR job.unit_id = p_unit_id)
      AND public.viewer_has_graph_node_grant(focus_node.id, p_requesting_user_id)
    ORDER BY job.created_at, job.unit_id
    LIMIT 1
    FOR UPDATE OF job SKIP LOCKED;
    IF NOT FOUND THEN RETURN; END IF;

    SELECT contract_row.* INTO STRICT v_contract
    FROM public.knowledge_relation_contracts contract_row
    WHERE contract_row.contract_version = v_job.contract_version;
    IF v_job.state = 'leased' THEN
      SELECT relation_attempt.attempt_number INTO STRICT v_expired_number
      FROM public.knowledge_relation_attempts relation_attempt
      WHERE relation_attempt.id = v_job.active_attempt_id;
      INSERT INTO public.knowledge_relation_outcomes(
        attempt_id, unit_id, person_id, contract_version, outcome,
        relations, grant_requests, error_class
      ) VALUES (
        v_job.active_attempt_id, v_job.unit_id, v_job.person_id,
        v_job.contract_version, 'expired', '[]', '[]', 'lease_expired'
      );
      IF v_expired_number >= v_contract.max_attempts THEN
        UPDATE public.knowledge_relation_jobs
        SET state = 'completed', active_attempt_id = NULL, lease_token = NULL,
          lease_expires_at = NULL, updated_at = v_now
        WHERE knowledge_relation_jobs.unit_id = v_job.unit_id
          AND knowledge_relation_jobs.person_id = v_job.person_id
          AND knowledge_relation_jobs.contract_version = v_job.contract_version;
        CONTINUE;
      END IF;
    END IF;
    EXIT;
  END LOOP;

  SELECT coalesce(array_agg(candidate.unit_id ORDER BY
      candidate.similarity DESC NULLS LAST, candidate.unit_id), '{}'::uuid[]),
    coalesce(jsonb_agg(jsonb_build_object(
      'unitId', candidate.unit_id,
      'claim', candidate.claim,
      'topicLabels', candidate.topic_labels,
      'similarity', candidate.similarity
    ) ORDER BY candidate.similarity DESC NULLS LAST, candidate.unit_id), '[]'::jsonb)
  INTO v_candidate_ids, v_candidates
  FROM public.relation_candidate_units(
    v_job.unit_id, v_job.person_id, v_job.contract_version
  ) candidate;
  SELECT claim INTO STRICT v_focus_claim
  FROM public.knowledge_units WHERE id = v_job.unit_id;

  v_attempt_id := gen_random_uuid();
  v_token := gen_random_uuid();
  INSERT INTO public.knowledge_relation_attempts(
    id, unit_id, person_id, contract_version, attempt_number,
    candidate_unit_ids, model_provider, model_id, resolver_label, lease_token
  ) VALUES (
    v_attempt_id, v_job.unit_id, v_job.person_id, v_job.contract_version,
    v_job.next_attempt_number, v_candidate_ids, btrim(p_model_provider),
    btrim(p_model_id), nullif(btrim(p_resolver_label), ''), v_token
  );
  UPDATE public.knowledge_relation_jobs
  SET state = 'leased', active_attempt_id = v_attempt_id,
    lease_token = v_token,
    lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
    next_attempt_number = next_attempt_number + 1,
    updated_at = v_now
  WHERE knowledge_relation_jobs.unit_id = v_job.unit_id
    AND knowledge_relation_jobs.person_id = v_job.person_id
    AND knowledge_relation_jobs.contract_version = v_job.contract_version;

  RETURN QUERY SELECT v_attempt_id, v_token, v_job.unit_id, v_job.person_id,
    v_job.contract_version, v_focus_claim, v_candidates,
    v_job.next_attempt_number;
END
$$;

CREATE FUNCTION public.complete_relation_attempt(
  p_attempt_id uuid,
  p_lease_token uuid,
  p_result public.knowledge_extraction_outcome_kind,
  p_raw_output jsonb DEFAULT NULL,
  p_relations jsonb DEFAULT '[]'::jsonb,
  p_grant_requests jsonb DEFAULT '[]'::jsonb,
  p_error_class text DEFAULT NULL,
  p_input_tokens integer DEFAULT NULL,
  p_output_tokens integer DEFAULT NULL
) RETURNS TABLE(
  outcome public.knowledge_extraction_outcome_kind,
  edge_ids uuid[],
  replayed boolean
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
  v_attempt public.knowledge_relation_attempts;
  v_job public.knowledge_relation_jobs;
  v_contract public.knowledge_relation_contracts;
  v_existing public.knowledge_relation_outcomes;
  v_final public.knowledge_extraction_outcome_kind := p_result;
  v_error text := p_error_class;
  v_now timestamptz := clock_timestamp();
  v_relation jsonb;
  v_candidate_id uuid;
  v_kind public.graph_edge_kind;
  v_source_node uuid;
  v_target_node uuid;
  v_edge uuid;
  v_input_ids uuid[];
  v_edge_ids uuid[] := '{}';
  v_forbidden text;
BEGIN
  IF p_attempt_id IS NULL OR p_lease_token IS NULL THEN
    RAISE EXCEPTION 'knowledge_relation_completion_input_invalid'
      USING ERRCODE = '22023';
  END IF;
  SELECT * INTO STRICT v_attempt
  FROM public.knowledge_relation_attempts WHERE id = p_attempt_id;
  IF v_attempt.lease_token IS DISTINCT FROM p_lease_token THEN
    RAISE EXCEPTION 'knowledge_relation_lease_not_owned'
      USING ERRCODE = '42501';
  END IF;
  SELECT * INTO STRICT v_job
  FROM public.knowledge_relation_jobs
  WHERE unit_id = v_attempt.unit_id
    AND person_id = v_attempt.person_id
    AND contract_version = v_attempt.contract_version
  FOR UPDATE;
  SELECT * INTO v_existing
  FROM public.knowledge_relation_outcomes WHERE attempt_id = p_attempt_id;
  IF v_existing.attempt_id IS NOT NULL THEN
    IF v_existing.outcome IS DISTINCT FROM p_result
      OR v_existing.raw_output IS DISTINCT FROM p_raw_output
      OR v_existing.relations IS DISTINCT FROM coalesce(p_relations, '[]'::jsonb)
      OR v_existing.grant_requests
        IS DISTINCT FROM coalesce(p_grant_requests, '[]'::jsonb)
      OR v_existing.error_class IS DISTINCT FROM p_error_class
      OR v_existing.input_tokens IS DISTINCT FROM p_input_tokens
      OR v_existing.output_tokens IS DISTINCT FROM p_output_tokens THEN
      RAISE EXCEPTION 'knowledge_relation_outcome_payload_conflict'
        USING ERRCODE = '23505';
    END IF;
    SELECT coalesce(array_agg(assertion.edge_id ORDER BY assertion.edge_id), '{}')
    INTO v_edge_ids
    FROM public.knowledge_relation_assertions assertion
    WHERE assertion.attempt_id = p_attempt_id;
    RETURN QUERY SELECT v_existing.outcome, v_edge_ids, true;
    RETURN;
  END IF;

  IF v_job.state <> 'leased'
    OR v_job.active_attempt_id IS DISTINCT FROM p_attempt_id
    OR v_job.lease_token IS DISTINCT FROM p_lease_token THEN
    RAISE EXCEPTION 'knowledge_relation_lease_not_owned'
      USING ERRCODE = '42501';
  END IF;
  SELECT * INTO STRICT v_contract
  FROM public.knowledge_relation_contracts
  WHERE contract_version = v_attempt.contract_version;

  IF v_job.lease_expires_at <= v_now THEN
    v_final := 'expired';
    v_error := 'lease_expired';
  ELSIF p_result IS NULL OR p_result NOT IN (
    'succeeded', 'provider_failed', 'malformed_output'
  ) THEN
    v_final := 'commit_rejected';
    v_error := 'relation_result_invalid';
  ELSIF p_relations IS NULL OR jsonb_typeof(p_relations) <> 'array'
    OR p_grant_requests IS NULL OR jsonb_typeof(p_grant_requests) <> 'array' THEN
    v_final := 'commit_rejected';
    v_error := 'relation_payload_shape_invalid';
  ELSIF p_result = 'succeeded' AND (
    p_raw_output IS NULL
    OR jsonb_typeof(p_raw_output) <> 'object'
    OR p_raw_output->'relations' IS DISTINCT FROM p_relations
    OR p_error_class IS NOT NULL
  ) THEN
    v_final := 'commit_rejected';
    v_error := 'relation_success_payload_invalid';
  ELSIF p_result IN ('provider_failed', 'malformed_output') AND (
    p_error_class IS NULL
    OR p_raw_output IS NOT NULL
    OR p_relations IS DISTINCT FROM '[]'::jsonb
    OR p_grant_requests IS DISTINCT FROM '[]'::jsonb
  ) THEN
    v_final := 'commit_rejected';
    v_error := 'relation_failure_payload_invalid';
  ELSIF jsonb_array_length(p_grant_requests) > 0 THEN
    v_final := 'commit_rejected';
    v_error := 'relation_grant_write_forbidden';
  END IF;

  IF v_final = 'succeeded' THEN
    SELECT item->>'kind' INTO v_forbidden
    FROM jsonb_array_elements(p_relations) item
    WHERE item->>'kind' IS NULL
      OR item->>'kind' NOT IN ('contradicts', 'supersedes')
    LIMIT 1;
    IF FOUND THEN
      v_final := 'commit_rejected';
      v_error := left('relation_edge_kind_forbidden:' || coalesce(v_forbidden, 'null'), 80);
    ELSIF EXISTS (
      SELECT 1
      FROM jsonb_array_elements(p_relations) item
      WHERE jsonb_typeof(item) <> 'object'
        OR item->>'candidateUnitId' IS NULL
        OR item->>'sourceUnitId' IS DISTINCT FROM v_attempt.unit_id::text
        OR item->>'targetUnitId' IS DISTINCT FROM item->>'candidateUnitId'
        OR NOT EXISTS (
          SELECT 1
          FROM unnest(v_attempt.candidate_unit_ids) candidate_id
          WHERE candidate_id::text = item->>'candidateUnitId'
        )
    ) OR (
      SELECT count(*) FROM jsonb_array_elements(p_relations)
    ) <> (
      SELECT count(DISTINCT item->>'candidateUnitId')
      FROM jsonb_array_elements(p_relations) item
    ) THEN
      v_final := 'commit_rejected';
      v_error := 'relation_edges_invalid';
    END IF;
  END IF;

  v_input_ids := ARRAY[v_attempt.unit_id] || v_attempt.candidate_unit_ids;
  IF v_final = 'succeeded' AND EXISTS (
    SELECT 1
    FROM unnest(v_input_ids) input_unit_id
    WHERE NOT EXISTS (
      SELECT 1 FROM public.graph_nodes input_node
      WHERE input_node.kind = 'knowledge_unit'
        AND input_node.authority_id = input_unit_id
        AND public.viewer_has_graph_node_grant(input_node.id, v_attempt.person_id)
    )
  ) THEN
    v_final := 'commit_rejected';
    v_error := 'relation_candidate_authorization_changed';
  END IF;

  IF v_final = 'succeeded' THEN
    BEGIN
      FOR v_relation IN SELECT value FROM jsonb_array_elements(p_relations) LOOP
        v_candidate_id := (v_relation->>'candidateUnitId')::uuid;
        v_kind := (v_relation->>'kind')::public.graph_edge_kind;
        v_source_node := public.canonical_graph_node_id(
          'knowledge_unit', v_attempt.unit_id
        );
        v_target_node := public.canonical_graph_node_id(
          'knowledge_unit', v_candidate_id
        );
        v_edge := public.canonical_graph_edge_id(
          v_source_node, v_kind, v_target_node
        );
        INSERT INTO public.graph_edges(
          id, source_node_id, target_node_id, kind
        ) VALUES (v_edge, v_source_node, v_target_node, v_kind)
        ON CONFLICT (source_node_id, target_node_id, kind) DO NOTHING;
        INSERT INTO public.graph_edge_evidence(edge_id, evidence_event_id)
        SELECT v_edge, unit.source_event_id
        FROM public.knowledge_units unit
        WHERE unit.id IN (v_attempt.unit_id, v_candidate_id)
        ON CONFLICT (edge_id, evidence_event_id) DO NOTHING;
        INSERT INTO public.knowledge_relation_assertions(
          edge_id, input_unit_ids, contract_version, attempt_id
        ) VALUES (
          v_edge, v_input_ids, v_attempt.contract_version, p_attempt_id
        )
        ON CONFLICT (edge_id, attempt_id) DO NOTHING;
        v_edge_ids := array_append(v_edge_ids, v_edge);
      END LOOP;
    EXCEPTION
      WHEN serialization_failure OR deadlock_detected OR lock_not_available THEN
        RAISE;
      WHEN OTHERS THEN
        v_final := 'commit_rejected';
        v_error := left('relation_commit_rejected:' || SQLSTATE, 80);
        v_edge_ids := '{}';
    END;
  END IF;

  INSERT INTO public.knowledge_relation_outcomes(
    attempt_id, unit_id, person_id, contract_version, outcome,
    raw_output, relations, grant_requests, error_class,
    input_tokens, output_tokens
  ) VALUES (
    p_attempt_id, v_attempt.unit_id, v_attempt.person_id,
    v_attempt.contract_version, v_final, p_raw_output,
    coalesce(p_relations, '[]'::jsonb),
    coalesce(p_grant_requests, '[]'::jsonb), v_error,
    p_input_tokens, p_output_tokens
  );
  UPDATE public.knowledge_relation_jobs
  SET state = CASE
      WHEN v_final IN ('provider_failed', 'malformed_output', 'expired')
        AND v_attempt.attempt_number < v_contract.max_attempts
        THEN 'pending'
      ELSE 'completed'
    END,
    active_attempt_id = NULL,
    lease_token = NULL,
    lease_expires_at = NULL,
    updated_at = v_now
  WHERE unit_id = v_attempt.unit_id
    AND person_id = v_attempt.person_id
    AND contract_version = v_attempt.contract_version;
  RETURN QUERY SELECT v_final, v_edge_ids, false;
END
$$;

-- Relation assertions replace the shared-evidence-audience rule only for the
-- two relation kinds. Every historical non-relation hop and every current
-- authority hop keeps the migration-063 predicate unchanged.
CREATE OR REPLACE FUNCTION public.authorized_graph_neighbors(
  p_node_id uuid,
  p_viewer_profile_id uuid,
  p_edge_kinds public.graph_edge_kind[]
) RETURNS TABLE(node_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
  SELECT CASE WHEN edge.source_node_id = p_node_id
    THEN edge.target_node_id ELSE edge.source_node_id END
  FROM public.graph_edges edge
  JOIN public.graph_nodes source_node ON source_node.id = edge.source_node_id
  JOIN public.graph_nodes target_node ON target_node.id = edge.target_node_id
  WHERE (edge.source_node_id = p_node_id OR edge.target_node_id = p_node_id)
    AND edge.kind NOT IN ('contradicts', 'supersedes')
    AND (p_edge_kinds IS NULL OR edge.kind = ANY(p_edge_kinds))
    AND public.viewer_has_graph_node_grant(edge.source_node_id, p_viewer_profile_id)
    AND public.viewer_has_graph_node_grant(edge.target_node_id, p_viewer_profile_id)
    AND EXISTS (SELECT 1 FROM public.graph_edge_evidence evidence
      JOIN public.knowledge_events event ON event.id = evidence.evidence_event_id
      JOIN public.knowledge_audiences audience ON audience.id = event.knowledge_audience_id
      JOIN public.graph_node_grants source_grant ON source_grant.node_id = edge.source_node_id
        AND source_grant.knowledge_audience_id = audience.id
      JOIN public.graph_node_grants target_grant ON target_grant.node_id = edge.target_node_id
        AND target_grant.knowledge_audience_id = audience.id
      WHERE evidence.edge_id = edge.id
        AND p_viewer_profile_id = ANY(audience.member_profile_ids)
        AND (source_node.kind IN ('message_event', 'knowledge_unit')
          OR (source_grant.basis_kind = 'edge_evidence' AND source_grant.basis_id = edge.id
            AND source_grant.basis_event_id = evidence.evidence_event_id))
        AND (target_node.kind IN ('message_event', 'knowledge_unit')
          OR (target_grant.basis_kind = 'edge_evidence' AND target_grant.basis_id = edge.id
            AND target_grant.basis_event_id = evidence.evidence_event_id)))
  UNION
  SELECT CASE WHEN edge.source_node_id = p_node_id
    THEN edge.target_node_id ELSE edge.source_node_id END
  FROM public.graph_edges edge
  WHERE (edge.source_node_id = p_node_id OR edge.target_node_id = p_node_id)
    AND edge.kind IN ('contradicts', 'supersedes')
    AND (p_edge_kinds IS NULL OR edge.kind = ANY(p_edge_kinds))
    AND public.viewer_has_graph_node_grant(edge.source_node_id, p_viewer_profile_id)
    AND public.viewer_has_graph_node_grant(edge.target_node_id, p_viewer_profile_id)
    AND EXISTS (
      SELECT 1
      FROM public.knowledge_relation_assertions assertion
      WHERE assertion.edge_id = edge.id
        AND NOT EXISTS (
          SELECT 1
          FROM unnest(assertion.input_unit_ids) input_unit_id
          WHERE NOT EXISTS (
            SELECT 1
            FROM public.graph_nodes input_node
            WHERE input_node.kind = 'knowledge_unit'
              AND input_node.authority_id = input_unit_id
              AND public.viewer_has_graph_node_grant(
                input_node.id, p_viewer_profile_id
              )
          )
        )
    )
  UNION
  SELECT CASE WHEN edge.source_node_id = p_node_id
    THEN edge.target_node_id ELSE edge.source_node_id END
  FROM public.graph_authority_edges edge
  WHERE (edge.source_node_id = p_node_id OR edge.target_node_id = p_node_id)
    AND (p_edge_kinds IS NULL OR edge.kind = ANY(p_edge_kinds))
    AND public.graph_authority_edge_is_current(edge.id, p_viewer_profile_id)
    AND EXISTS (SELECT 1 FROM public.graph_node_grants source_grant
      JOIN public.graph_node_grants target_grant
        ON target_grant.knowledge_audience_id = source_grant.knowledge_audience_id
      WHERE source_grant.node_id = edge.source_node_id
        AND target_grant.node_id = edge.target_node_id
        AND source_grant.knowledge_audience_id = edge.knowledge_audience_id)
$$;

-- The migration-time pass is intentionally bounded. It covers the small dev
-- corpus; a production-scale pass must be priced and explicitly approved.
DO $relation_backfill$
DECLARE v_eligible integer; v_limit integer := 256; v_version text;
BEGIN
  SELECT contract_version INTO STRICT v_version
  FROM public.knowledge_relation_contract_active
  WHERE singleton
  FOR SHARE;
  SELECT count(*) INTO v_eligible
  FROM public.knowledge_units unit
  JOIN public.knowledge_audiences audience
    ON audience.id = unit.knowledge_audience_id
  CROSS JOIN LATERAL unnest(audience.member_profile_ids) member_id;
  IF v_eligible > v_limit THEN
    RAISE EXCEPTION 'knowledge_relation_backfill_limit_exceeded:%:%',
      v_eligible, v_limit USING ERRCODE = '54000';
  END IF;
  INSERT INTO public.knowledge_relation_jobs(
    unit_id, person_id, contract_version, created_at, updated_at
  )
  SELECT unit.id, member_id, v_version, event.created_at, clock_timestamp()
  FROM public.knowledge_units unit
  JOIN public.knowledge_events event ON event.id = unit.source_event_id
  JOIN public.knowledge_audiences audience
    ON audience.id = unit.knowledge_audience_id
  CROSS JOIN LATERAL unnest(audience.member_profile_ids) member_id
  ON CONFLICT (unit_id, person_id, contract_version) DO NOTHING;
END
$relation_backfill$;

ALTER TABLE public.knowledge_relation_contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_relation_contract_active ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_relation_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_relation_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_relation_outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_relation_assertions ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.knowledge_relation_contracts,
  public.knowledge_relation_contract_active,
  public.knowledge_relation_jobs,
  public.knowledge_relation_attempts,
  public.knowledge_relation_outcomes,
  public.knowledge_relation_assertions
FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.knowledge_relation_contracts,
  public.knowledge_relation_contract_active,
  public.knowledge_relation_jobs,
  public.knowledge_relation_attempts,
  public.knowledge_relation_outcomes,
  public.knowledge_relation_assertions
TO service_role;

REVOKE EXECUTE ON FUNCTION public.validate_knowledge_relation_job(),
  public.validate_knowledge_relation_attempt(),
  public.enqueue_knowledge_relation_jobs(),
  public.relation_candidate_units(uuid, uuid, text)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.begin_relation_attempt(
  uuid, text, text, text, uuid, integer
), public.complete_relation_attempt(
  uuid, uuid, public.knowledge_extraction_outcome_kind,
  jsonb, jsonb, jsonb, text, integer, integer
), public.authorized_graph_neighbors(
  uuid, uuid, public.graph_edge_kind[]
)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_relation_attempt(
  uuid, text, text, text, uuid, integer
), public.complete_relation_attempt(
  uuid, uuid, public.knowledge_extraction_outcome_kind,
  jsonb, jsonb, jsonb, text, integer, integer
), public.authorized_graph_neighbors(
  uuid, uuid, public.graph_edge_kind[]
)
TO service_role;
