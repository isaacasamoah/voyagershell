-- K3 event-owned work, bounded provider leases and immutable attempt evidence.
CREATE TYPE public.knowledge_extraction_job_state AS ENUM ('pending', 'leased', 'succeeded', 'no_claim');
CREATE TYPE public.knowledge_extraction_outcome_kind AS ENUM ('succeeded', 'no_claim', 'provider_failed', 'malformed_output', 'commit_rejected', 'expired');
CREATE TABLE public.knowledge_extractor_contracts (
  extractor_version text PRIMARY KEY CHECK (length(btrim(extractor_version)) BETWEEN 1 AND 120),
  active boolean NOT NULL DEFAULT false, activated_at timestamptz NOT NULL DEFAULT clock_timestamp());
CREATE UNIQUE INDEX knowledge_extractor_contracts_one_active ON public.knowledge_extractor_contracts ((active)) WHERE active;
INSERT INTO public.knowledge_extractor_contracts(extractor_version, active)
  VALUES ('cartographer-single-claim-v1', true);
CREATE TABLE public.knowledge_extraction_jobs (
  source_event_id uuid NOT NULL REFERENCES public.knowledge_events(id) ON DELETE RESTRICT,
  extractor_version text NOT NULL REFERENCES public.knowledge_extractor_contracts(extractor_version),
  knowledge_audience_id uuid NOT NULL REFERENCES public.knowledge_audiences(id),
  state public.knowledge_extraction_job_state NOT NULL DEFAULT 'pending',
  next_attempt_number integer NOT NULL DEFAULT 1 CHECK (next_attempt_number > 0),
  active_attempt_id uuid, lease_token uuid, lease_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(), updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (source_event_id, extractor_version),
  CONSTRAINT knowledge_extraction_job_lease_shape CHECK ((state = 'leased') =
    (active_attempt_id IS NOT NULL AND lease_token IS NOT NULL AND lease_expires_at IS NOT NULL)));
CREATE INDEX knowledge_extraction_jobs_due ON public.knowledge_extraction_jobs(state, created_at);
CREATE TABLE public.knowledge_extraction_attempts (
  id uuid PRIMARY KEY, source_event_id uuid NOT NULL, extractor_version text NOT NULL,
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  knowledge_audience_id uuid NOT NULL REFERENCES public.knowledge_audiences(id),
  model_provider text NOT NULL CHECK (length(btrim(model_provider)) BETWEEN 1 AND 120),
  model_id text NOT NULL CHECK (length(btrim(model_id)) BETWEEN 1 AND 200),
  resolver_label text CHECK (resolver_label IS NULL OR length(btrim(resolver_label)) BETWEEN 1 AND 200),
  lease_token uuid NOT NULL UNIQUE, started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (source_event_id, extractor_version, attempt_number), FOREIGN KEY
    (source_event_id, extractor_version) REFERENCES public.knowledge_extraction_jobs(source_event_id, extractor_version));
ALTER TABLE public.knowledge_extraction_jobs ADD CONSTRAINT
  knowledge_extraction_jobs_active_attempt_fkey FOREIGN KEY (active_attempt_id)
  REFERENCES public.knowledge_extraction_attempts(id);
CREATE TABLE public.knowledge_extraction_attempt_outcomes (
  attempt_id uuid PRIMARY KEY REFERENCES public.knowledge_extraction_attempts(id),
  source_event_id uuid NOT NULL, extractor_version text NOT NULL,
  knowledge_audience_id uuid NOT NULL REFERENCES public.knowledge_audiences(id),
  outcome public.knowledge_extraction_outcome_kind NOT NULL, raw_output jsonb,
  error_class text CHECK (error_class IS NULL OR length(btrim(error_class)) BETWEEN 1 AND 80),
  input_tokens integer CHECK (input_tokens IS NULL OR input_tokens >= 0),
  output_tokens integer CHECK (output_tokens IS NULL OR output_tokens >= 0),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (source_event_id, extractor_version) REFERENCES public.knowledge_extraction_jobs(source_event_id, extractor_version),
  CONSTRAINT knowledge_extraction_outcome_error_shape CHECK
    ((outcome IN ('succeeded', 'no_claim')) = (error_class IS NULL)));
CREATE FUNCTION public.validate_knowledge_extraction_job() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND (NEW.source_event_id,
      NEW.extractor_version, NEW.knowledge_audience_id, NEW.created_at) IS DISTINCT FROM
      (OLD.source_event_id, OLD.extractor_version, OLD.knowledge_audience_id, OLD.created_at)) THEN
    RAISE EXCEPTION 'knowledge_extraction_job_identity_immutable' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.knowledge_events event JOIN
      public.knowledge_audiences audience ON audience.id = event.knowledge_audience_id
      WHERE event.id = NEW.source_event_id AND event.actor_type = 'user'
        AND event.event_type IN ('conversation', 'message') AND audience.purpose = 'source'
        AND event.knowledge_audience_id = NEW.knowledge_audience_id) THEN
    RAISE EXCEPTION 'knowledge_extraction_job_source_invalid' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_knowledge_extraction_job_validate BEFORE INSERT OR UPDATE OR DELETE ON
  public.knowledge_extraction_jobs FOR EACH ROW EXECUTE FUNCTION public.validate_knowledge_extraction_job();
CREATE TRIGGER trg_knowledge_extractor_contract_immutable BEFORE UPDATE OR DELETE ON
  public.knowledge_extractor_contracts FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_knowledge_graph_row();
CREATE TRIGGER trg_knowledge_extraction_attempt_immutable BEFORE UPDATE OR DELETE ON
  public.knowledge_extraction_attempts FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_knowledge_graph_row();
CREATE TRIGGER trg_knowledge_extraction_outcome_immutable BEFORE UPDATE OR DELETE ON
  public.knowledge_extraction_attempt_outcomes FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_knowledge_graph_row();
CREATE FUNCTION public.enqueue_human_knowledge_extraction() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_version text;
BEGIN
  IF NEW.actor_type = 'user' AND NEW.event_type IN ('conversation', 'message') THEN
    SELECT extractor_version INTO STRICT v_version FROM public.knowledge_extractor_contracts
      WHERE active;
    INSERT INTO public.knowledge_extraction_jobs(source_event_id, extractor_version,
      knowledge_audience_id)
    VALUES (NEW.id, v_version, NEW.knowledge_audience_id);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_enqueue_human_knowledge_extraction AFTER INSERT ON public.knowledge_events
  FOR EACH ROW EXECUTE FUNCTION public.enqueue_human_knowledge_extraction();
CREATE FUNCTION public.begin_knowledge_extraction_attempt(p_requesting_user_id uuid, p_model_provider text, p_model_id text, p_resolver_label text DEFAULT NULL, p_source_event_id uuid DEFAULT NULL, p_lease_seconds integer DEFAULT 120
) RETURNS TABLE(attempt_id uuid, lease_token uuid, source_event_id uuid, extractor_version text, knowledge_audience_id uuid, source_content text, source_event_type text, source_actor_id uuid, source_session_id text, candidate_person_ids uuid[], attempt_number integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_job public.knowledge_extraction_jobs; v_attempt_id uuid := gen_random_uuid();
  v_token uuid := gen_random_uuid(); v_now timestamptz := clock_timestamp();
BEGIN
  IF length(btrim(p_model_provider)) NOT BETWEEN 1 AND 120 OR
    length(btrim(p_model_id)) NOT BETWEEN 1 AND 200 OR p_lease_seconds NOT BETWEEN 1 AND 900 THEN
    RAISE EXCEPTION 'knowledge_extraction_attempt_input_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT job.* INTO v_job FROM public.knowledge_extraction_jobs job JOIN public.knowledge_events event
    ON event.id = job.source_event_id JOIN public.knowledge_audiences audience
    ON audience.id = job.knowledge_audience_id
  WHERE (job.state = 'pending' OR (job.state = 'leased' AND job.lease_expires_at <= v_now))
    AND p_requesting_user_id = ANY(audience.member_profile_ids)
    AND (p_source_event_id IS NULL OR job.source_event_id = p_source_event_id)
  ORDER BY job.created_at, job.source_event_id LIMIT 1 FOR UPDATE OF job SKIP LOCKED;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_job.state = 'leased' THEN
    INSERT INTO public.knowledge_extraction_attempt_outcomes(attempt_id, source_event_id,
      extractor_version, knowledge_audience_id, outcome, error_class)
    VALUES (v_job.active_attempt_id, v_job.source_event_id, v_job.extractor_version,
      v_job.knowledge_audience_id, 'expired', 'lease_expired');
  END IF;
  INSERT INTO public.knowledge_extraction_attempts(id, source_event_id, extractor_version,
    attempt_number, knowledge_audience_id, model_provider, model_id, resolver_label, lease_token)
  VALUES (v_attempt_id, v_job.source_event_id, v_job.extractor_version, v_job.next_attempt_number,
    v_job.knowledge_audience_id, btrim(p_model_provider), btrim(p_model_id),
    nullif(btrim(p_resolver_label), ''), v_token);
  UPDATE public.knowledge_extraction_jobs SET state = 'leased', active_attempt_id = v_attempt_id,
    lease_token = v_token, lease_expires_at = v_now + make_interval(secs => p_lease_seconds),
    next_attempt_number = next_attempt_number + 1, updated_at = v_now
  WHERE (knowledge_extraction_jobs.source_event_id, knowledge_extraction_jobs.extractor_version) =
    (v_job.source_event_id, v_job.extractor_version);
  RETURN QUERY SELECT v_attempt_id, v_token, event.id, v_job.extractor_version,
    v_job.knowledge_audience_id, event.content, event.event_type, event.actor_id,
    event.metadata->>'session_id',
    coalesce((SELECT array_agg(node.authority_id ORDER BY node.authority_id)
      FROM public.graph_nodes node JOIN public.knowledge_audiences audience
        ON audience.id = v_job.knowledge_audience_id
      WHERE node.kind = 'person' AND node.authority_id = ANY(audience.member_profile_ids)),
      '{}'::uuid[]), v_job.next_attempt_number
  FROM public.knowledge_events event WHERE event.id = v_job.source_event_id;
END $$;
CREATE FUNCTION public.complete_knowledge_extraction_attempt(p_attempt_id uuid, p_lease_token uuid, p_result public.knowledge_extraction_outcome_kind, p_raw_output jsonb DEFAULT NULL,
  p_claim text DEFAULT NULL, p_about_person_id uuid DEFAULT NULL, p_error_class text DEFAULT NULL,
  p_input_tokens integer DEFAULT NULL, p_output_tokens integer DEFAULT NULL
) RETURNS TABLE(outcome public.knowledge_extraction_outcome_kind, unit_id uuid, replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_attempt public.knowledge_extraction_attempts; v_job public.knowledge_extraction_jobs;
  v_event public.knowledge_events; v_unit public.knowledge_units; v_existing jsonb;
  v_final public.knowledge_extraction_outcome_kind := p_result; v_error text := p_error_class;
  v_unit_id uuid; v_unit_node uuid; v_event_node uuid; v_person_node public.graph_nodes;
  v_edge uuid; v_now timestamptz := clock_timestamp();
BEGIN
  SELECT * INTO STRICT v_attempt FROM public.knowledge_extraction_attempts WHERE id = p_attempt_id;
  SELECT * INTO STRICT v_job FROM public.knowledge_extraction_jobs WHERE
    source_event_id = v_attempt.source_event_id AND extractor_version = v_attempt.extractor_version FOR UPDATE;
  SELECT to_jsonb(stored.*) INTO v_existing
    FROM public.knowledge_extraction_attempt_outcomes stored WHERE stored.attempt_id = p_attempt_id;
  IF v_existing IS NOT NULL THEN
    IF v_existing->>'outcome' IS DISTINCT FROM p_result::text
      OR v_existing->'raw_output' IS DISTINCT FROM p_raw_output OR v_existing->>'error_class' IS DISTINCT FROM p_error_class
      OR (v_existing->>'input_tokens')::integer IS DISTINCT FROM p_input_tokens
      OR (v_existing->>'output_tokens')::integer IS DISTINCT FROM p_output_tokens
      OR (p_result = 'succeeded' AND (p_raw_output->>'claim' IS DISTINCT FROM btrim(p_claim)
        OR p_raw_output->>'aboutPersonId' IS DISTINCT FROM p_about_person_id::text))
      OR (p_result = 'no_claim' AND (p_raw_output->'claim' IS DISTINCT FROM 'null'::jsonb
        OR p_raw_output->'aboutPersonId' IS DISTINCT FROM 'null'::jsonb)) THEN
      RAISE EXCEPTION 'knowledge_extraction_outcome_payload_conflict' USING ERRCODE = '23505';
    END IF;
    RETURN QUERY SELECT p_result,
      CASE WHEN p_result = 'succeeded' THEN md5(format('voyager-unit:k3:%s:%s:claim:0',
        v_attempt.source_event_id, v_attempt.extractor_version))::uuid ELSE NULL END, true;
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
  ELSIF p_result = 'succeeded' AND (p_claim IS NULL OR length(btrim(p_claim)) = 0 OR p_raw_output IS NULL OR
      p_raw_output->>'claim' IS DISTINCT FROM btrim(p_claim) OR
      p_raw_output->>'aboutPersonId' IS DISTINCT FROM p_about_person_id::text) THEN
    v_final := 'commit_rejected'; v_error := 'success_payload_invalid';
  ELSIF p_result = 'no_claim' AND (p_claim IS NOT NULL OR p_about_person_id IS NOT NULL OR
      p_raw_output IS NULL OR p_raw_output->'claim' IS DISTINCT FROM 'null'::jsonb
      OR p_raw_output->'aboutPersonId' IS DISTINCT FROM 'null'::jsonb) THEN
    v_final := 'commit_rejected'; v_error := 'no_claim_payload_invalid';
  ELSIF p_result IN ('provider_failed', 'malformed_output') AND (p_claim IS NOT NULL OR
      p_about_person_id IS NOT NULL OR p_error_class IS NULL OR length(btrim(p_error_class)) = 0) THEN
    RAISE EXCEPTION 'knowledge_extraction_failure_payload_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO STRICT v_event FROM public.knowledge_events WHERE id = v_attempt.source_event_id;
  v_unit_id := md5(format('voyager-unit:k3:%s:%s:claim:0', v_attempt.source_event_id,
    v_attempt.extractor_version))::uuid;
  SELECT * INTO v_unit FROM public.knowledge_units WHERE source_event_id = v_attempt.source_event_id
    AND extractor_version = v_attempt.extractor_version AND claim_key = 'claim:0';
  IF v_final = 'succeeded' AND v_unit.id IS NOT NULL AND v_unit.claim IS DISTINCT FROM btrim(p_claim) THEN
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
  INSERT INTO public.knowledge_extraction_attempt_outcomes(attempt_id, source_event_id,
    extractor_version, knowledge_audience_id, outcome, raw_output, error_class, input_tokens,
    output_tokens) VALUES (p_attempt_id, v_attempt.source_event_id, v_attempt.extractor_version,
    v_attempt.knowledge_audience_id, v_final, p_raw_output, v_error, p_input_tokens, p_output_tokens);
  IF v_final = 'succeeded' THEN
    INSERT INTO public.knowledge_units(id, claim, source_event_id, extractor_version, claim_key,
      knowledge_audience_id) VALUES (v_unit_id, btrim(p_claim), v_attempt.source_event_id,
      v_attempt.extractor_version, 'claim:0', v_attempt.knowledge_audience_id) ON CONFLICT DO NOTHING;
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
    INSERT INTO public.graph_edge_evidence(edge_id, evidence_event_id) VALUES
      (v_edge, v_attempt.source_event_id) ON CONFLICT DO NOTHING;
    IF p_about_person_id IS NOT NULL THEN
      v_edge := public.canonical_graph_edge_id(v_unit_node, 'about', v_person_node.id);
      INSERT INTO public.graph_edges(id, source_node_id, target_node_id, kind) VALUES
        (v_edge, v_unit_node, v_person_node.id, 'about') ON CONFLICT DO NOTHING;
      INSERT INTO public.graph_edge_evidence(edge_id, evidence_event_id) VALUES
        (v_edge, v_attempt.source_event_id) ON CONFLICT DO NOTHING;
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
DROP FUNCTION public.write_knowledge_graph_edge(public.graph_node_kind, uuid, public.graph_node_kind, uuid, public.graph_edge_kind);
ALTER TABLE public.knowledge_extractor_contracts ENABLE ROW LEVEL SECURITY; ALTER TABLE public.knowledge_extraction_jobs ENABLE ROW LEVEL SECURITY; ALTER TABLE public.knowledge_extraction_attempts ENABLE ROW LEVEL SECURITY; ALTER TABLE public.knowledge_extraction_attempt_outcomes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.knowledge_extractor_contracts, public.knowledge_extraction_jobs, public.knowledge_extraction_attempts, public.knowledge_extraction_attempt_outcomes FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.knowledge_extractor_contracts, public.knowledge_extraction_jobs, public.knowledge_extraction_attempts, public.knowledge_extraction_attempt_outcomes TO service_role;
REVOKE EXECUTE ON FUNCTION public.begin_knowledge_extraction_attempt(uuid, text, text, text, uuid, integer),
  public.complete_knowledge_extraction_attempt(uuid, uuid, public.knowledge_extraction_outcome_kind, jsonb, text, uuid, text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_knowledge_extraction_attempt(uuid, text, text, text, uuid, integer),
  public.complete_knowledge_extraction_attempt(uuid, uuid, public.knowledge_extraction_outcome_kind, jsonb, text, uuid, text, integer, integer) TO service_role;
