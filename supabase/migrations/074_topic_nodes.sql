-- K4b: canonical topic authorities, convergent aboutness, and explicit v3 backfill.
ALTER TYPE public.graph_node_kind ADD VALUE 'topic'; ALTER TABLE public.knowledge_extractor_contracts
  ADD COLUMN topic_similarity_threshold real CHECK (topic_similarity_threshold > 0 AND topic_similarity_threshold <= 1),   ADD COLUMN topic_candidate_limit integer CHECK (topic_candidate_limit BETWEEN 1 AND 32);
INSERT INTO public.knowledge_extractor_contracts(   extractor_version, embedding_model, embedding_dimensions,
  topic_similarity_threshold, topic_candidate_limit) VALUES ('cartographer-single-claim-v3', 'text-embedding-3-small', 1536, 0.7, 8);
CREATE TABLE public.knowledge_topics (   id uuid PRIMARY KEY, normalized_label text NOT NULL UNIQUE
    CHECK (normalized_label = lower(regexp_replace(btrim(normalized_label), '\s+', ' ', 'g'))       AND length(normalized_label) BETWEEN 1 AND 120),
  embedding vector(1536) NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp() );
CREATE TRIGGER trg_knowledge_topics_immutable BEFORE UPDATE OR DELETE ON public.knowledge_topics   FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_knowledge_graph_row();
CREATE TABLE public.knowledge_topic_backfill_outcomes (   unit_id uuid PRIMARY KEY REFERENCES public.knowledge_units(id),
  extractor_version text NOT NULL REFERENCES public.knowledge_extractor_contracts(extractor_version)     CHECK (extractor_version = 'cartographer-single-claim-v3'),
  raw_output jsonb NOT NULL, recorded_at timestamptz NOT NULL DEFAULT clock_timestamp() );
CREATE TRIGGER trg_knowledge_topic_backfill_outcomes_immutable   BEFORE UPDATE OR DELETE ON public.knowledge_topic_backfill_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_knowledge_graph_row();
CREATE FUNCTION public.normalize_knowledge_topic_label(p_label text) RETURNS text LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path = pg_catalog AS $$
  SELECT lower(regexp_replace(btrim(p_label), '\s+', ' ', 'g')) $$;
CREATE OR REPLACE FUNCTION public.validate_graph_node() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN   IF NOT (CASE NEW.kind
    WHEN 'person' THEN EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.authority_id)     WHEN 'voyager' THEN EXISTS (SELECT 1 FROM public.profiles WHERE id = NEW.authority_id)
    WHEN 'voyage' THEN EXISTS (SELECT 1 FROM public.voyages WHERE id = NEW.authority_id)     WHEN 'space' THEN EXISTS (SELECT 1 FROM public.spaces WHERE id = NEW.authority_id)
    WHEN 'message_event' THEN EXISTS (SELECT 1 FROM public.knowledge_events       WHERE id = NEW.authority_id AND knowledge_audience_id IS NOT NULL)
    WHEN 'knowledge_unit' THEN EXISTS (SELECT 1 FROM public.knowledge_units WHERE id = NEW.authority_id)     WHEN 'topic' THEN EXISTS (SELECT 1 FROM public.knowledge_topics
      WHERE id = NEW.authority_id AND normalized_label = NEW.label)     ELSE false END) THEN RAISE EXCEPTION 'graph_node_authority_invalid' USING ERRCODE = '23514'; END IF;
  RETURN NEW; END $$;
CREATE OR REPLACE FUNCTION public.guard_graph_node_identity() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN   IF TG_OP = 'DELETE' OR NEW.id IS DISTINCT FROM OLD.id OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.authority_id IS DISTINCT FROM OLD.authority_id     OR (OLD.kind::text = 'topic' AND NEW.label IS DISTINCT FROM OLD.label) THEN
    RAISE EXCEPTION 'graph_node_identity_immutable' USING ERRCODE = '23514'; END IF;   RETURN NEW;
END $$; CREATE FUNCTION public.resolve_knowledge_topic(
  p_extractor_version text, p_label text, p_embedding vector(1536)) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_label text := public.normalize_knowledge_topic_label(p_label); v_threshold real;   v_topic public.knowledge_topics; v_id uuid;
BEGIN   SELECT topic_similarity_threshold INTO STRICT v_threshold FROM public.knowledge_extractor_contracts
    WHERE extractor_version = p_extractor_version AND topic_similarity_threshold IS NOT NULL;   IF length(v_label) NOT BETWEEN 1 AND 120 THEN
    RAISE EXCEPTION 'knowledge_topic_label_invalid' USING ERRCODE = '22023'; END IF;   SELECT * INTO v_topic FROM public.knowledge_topics
    WHERE 1 - (embedding <=> p_embedding) >= v_threshold     ORDER BY embedding <=> p_embedding, id LIMIT 1;
  IF v_topic.id IS NOT NULL THEN RETURN v_topic.id; END IF;   PERFORM pg_advisory_xact_lock(861319074);
  SELECT * INTO v_topic FROM public.knowledge_topics     WHERE 1 - (embedding <=> p_embedding) >= v_threshold
    ORDER BY embedding <=> p_embedding, id LIMIT 1;   IF v_topic.id IS NOT NULL THEN RETURN v_topic.id; END IF;
  v_id := md5(format('voyager-topic:v1:%s', v_label))::uuid;   INSERT INTO public.knowledge_topics(id, normalized_label, embedding) VALUES (v_id, v_label, p_embedding);
  INSERT INTO public.graph_nodes(id, kind, authority_id, label) VALUES     (public.canonical_graph_node_id('topic', v_id), 'topic', v_id, v_label);
  RETURN v_id; END $$;
CREATE FUNCTION public.write_knowledge_unit_topics(   p_unit_id uuid, p_event_id uuid, p_audience_id uuid, p_extractor_version text,
  p_raw_topics jsonb, p_topic_inputs jsonb) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_item jsonb; v_position bigint; v_topic uuid; v_topic_node uuid; v_unit_node uuid;   v_edge uuid; v_event public.knowledge_events; v_expected integer;
BEGIN   v_expected := CASE WHEN p_raw_topics IS NULL THEN 0 ELSE jsonb_array_length(p_raw_topics) END;
  IF v_expected > 3 OR coalesce(jsonb_array_length(p_topic_inputs), 0) <> v_expected
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(p_raw_topics, '[]')) item WHERE jsonb_typeof(item) <> 'string')
    OR (SELECT count(DISTINCT public.normalize_knowledge_topic_label(item #>> '{}'))
      FROM jsonb_array_elements(coalesce(p_raw_topics, '[]')) item) <> v_expected THEN     RAISE EXCEPTION 'knowledge_topic_input_count_invalid' USING ERRCODE = '22023'; END IF;
  SELECT * INTO STRICT v_event FROM public.knowledge_events WHERE id = p_event_id     AND knowledge_audience_id = p_audience_id;
  v_unit_node := public.canonical_graph_node_id('knowledge_unit', p_unit_id);   FOR v_item, v_position IN SELECT value, ordinality FROM
      jsonb_array_elements(coalesce(p_topic_inputs, '[]')) WITH ORDINALITY LOOP     IF v_item->>'label' IS DISTINCT FROM p_raw_topics->>((v_position - 1)::integer) THEN
      RAISE EXCEPTION 'knowledge_topic_input_label_invalid' USING ERRCODE = '22023'; END IF;     v_topic := public.resolve_knowledge_topic(
      p_extractor_version, v_item->>'label', (v_item->>'embedding')::vector(1536));     v_topic_node := public.canonical_graph_node_id('topic', v_topic);
    v_edge := public.canonical_graph_edge_id(v_unit_node, 'about', v_topic_node);     INSERT INTO public.graph_edges(id, source_node_id, target_node_id, kind)
      VALUES (v_edge, v_unit_node, v_topic_node, 'about') ON CONFLICT DO NOTHING;     INSERT INTO public.graph_edge_evidence(edge_id, evidence_event_id)
      VALUES (v_edge, p_event_id) ON CONFLICT DO NOTHING;     INSERT INTO public.graph_node_grants(node_id, knowledge_audience_id, basis_kind, basis_id,
      basis_version, label_snapshot, granted_at, basis_event_id)     SELECT v_topic_node, p_audience_id, 'edge_evidence', v_edge, 1, topic.normalized_label,
      v_event.created_at, p_event_id FROM public.knowledge_topics topic WHERE topic.id = v_topic     ON CONFLICT DO NOTHING;
  END LOOP; END $$;
DROP FUNCTION public.complete_knowledge_extraction_attempt(   uuid, uuid, public.knowledge_extraction_outcome_kind, jsonb, text, uuid,
  text, real, vector, text, integer, integer); CREATE FUNCTION public.complete_knowledge_extraction_attempt(
  p_attempt_id uuid, p_lease_token uuid, p_result public.knowledge_extraction_outcome_kind,   p_raw_output jsonb DEFAULT NULL, p_claim text DEFAULT NULL, p_about_person_id uuid DEFAULT NULL,
  p_knowledge_type text DEFAULT NULL, p_attention_score real DEFAULT NULL,   p_embedding vector(1536) DEFAULT NULL, p_topic_inputs jsonb DEFAULT NULL,
  p_error_class text DEFAULT NULL, p_input_tokens integer DEFAULT NULL, p_output_tokens integer DEFAULT NULL ) RETURNS TABLE(outcome public.knowledge_extraction_outcome_kind, unit_id uuid, replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$ DECLARE v_attempt public.knowledge_extraction_attempts; v_job public.knowledge_extraction_jobs;
  v_event public.knowledge_events; v_existing jsonb; v_unit public.knowledge_units;   v_final public.knowledge_extraction_outcome_kind := p_result; v_error text := p_error_class;
  v_unit_id uuid; v_unit_node uuid; v_event_node uuid; v_person_node public.graph_nodes;   v_edge uuid; v_now timestamptz := clock_timestamp(); v_physics boolean; v_topics boolean;
BEGIN   SELECT * INTO STRICT v_attempt FROM public.knowledge_extraction_attempts WHERE id = p_attempt_id;
  v_physics := v_attempt.extractor_version IN     ('cartographer-single-claim-v2', 'cartographer-single-claim-v3');
  v_topics := v_attempt.extractor_version = 'cartographer-single-claim-v3';   SELECT * INTO STRICT v_job FROM public.knowledge_extraction_jobs WHERE
    source_event_id = v_attempt.source_event_id AND extractor_version = v_attempt.extractor_version FOR UPDATE;   SELECT to_jsonb(stored.*) INTO v_existing FROM public.knowledge_extraction_attempt_outcomes stored
    WHERE stored.attempt_id = p_attempt_id;   IF v_existing IS NOT NULL THEN
    SELECT * INTO v_unit FROM public.knowledge_units WHERE source_event_id = v_attempt.source_event_id       AND extractor_version = v_attempt.extractor_version AND claim_key = 'claim:0';
    IF v_existing->>'outcome' IS DISTINCT FROM p_result::text       OR v_existing->'raw_output' IS DISTINCT FROM p_raw_output
      OR v_existing->>'error_class' IS DISTINCT FROM p_error_class       OR (p_result = 'succeeded' AND (v_unit.claim IS DISTINCT FROM btrim(p_claim)
        OR v_unit.knowledge_type IS DISTINCT FROM p_knowledge_type         OR v_unit.attention_score IS DISTINCT FROM p_attention_score
        OR v_unit.embedding::text IS DISTINCT FROM p_embedding::text)) THEN       RAISE EXCEPTION 'knowledge_extraction_outcome_payload_conflict' USING ERRCODE = '23505'; END IF;
    RETURN QUERY SELECT p_result, CASE WHEN p_result = 'succeeded' THEN v_unit.id END, true; RETURN;   END IF;
  IF v_job.state <> 'leased' OR v_job.active_attempt_id <> p_attempt_id     OR v_job.lease_token <> p_lease_token OR v_attempt.lease_token <> p_lease_token THEN
    RAISE EXCEPTION 'knowledge_extraction_lease_not_owned' USING ERRCODE = '42501'; END IF;   IF v_job.lease_expires_at <= v_now THEN v_final := 'expired'; v_error := 'lease_expired';
  ELSIF p_result NOT IN ('succeeded', 'no_claim', 'provider_failed', 'malformed_output') THEN     RAISE EXCEPTION 'knowledge_extraction_result_invalid' USING ERRCODE = '22023';
  ELSIF p_result = 'succeeded' AND (p_claim IS NULL OR length(btrim(p_claim)) = 0     OR p_raw_output IS NULL OR p_raw_output->>'claim' IS DISTINCT FROM btrim(p_claim)
    OR p_raw_output->>'aboutPersonId' IS DISTINCT FROM p_about_person_id::text     OR (v_physics AND (p_knowledge_type NOT IN ('domain', 'operational', 'preference')
      OR p_attention_score IS NULL OR p_attention_score NOT BETWEEN 0 AND 1 OR p_embedding IS NULL))     OR (v_topics AND (jsonb_typeof(p_raw_output->'topics') <> 'array'
      OR jsonb_array_length(p_raw_output->'topics') > 3       OR coalesce(jsonb_array_length(p_topic_inputs), 0) <> jsonb_array_length(p_raw_output->'topics'))))
    THEN v_final := 'commit_rejected'; v_error := 'success_payload_invalid';   ELSIF p_result = 'no_claim' AND (p_claim IS NOT NULL OR p_about_person_id IS NOT NULL
    OR p_raw_output IS NULL OR p_raw_output->'claim' IS DISTINCT FROM 'null'     OR p_raw_output->'aboutPersonId' IS DISTINCT FROM 'null'
    OR (v_topics AND p_raw_output->'topics' IS DISTINCT FROM '[]')) THEN     v_final := 'commit_rejected'; v_error := 'no_claim_payload_invalid';
  ELSIF p_result IN ('provider_failed', 'malformed_output')     AND (p_claim IS NOT NULL OR p_about_person_id IS NOT NULL OR p_error_class IS NULL) THEN
    RAISE EXCEPTION 'knowledge_extraction_failure_payload_invalid' USING ERRCODE = '22023'; END IF;   SELECT * INTO STRICT v_event FROM public.knowledge_events WHERE id = v_attempt.source_event_id;
  v_unit_id := md5(format('voyager-unit:k3:%s:%s:claim:0',     v_attempt.source_event_id, v_attempt.extractor_version))::uuid;
  SELECT * INTO v_unit FROM public.knowledge_units WHERE source_event_id = v_attempt.source_event_id     AND extractor_version = v_attempt.extractor_version AND claim_key = 'claim:0';
  IF v_final = 'succeeded' AND v_unit.id IS NOT NULL AND v_unit.claim IS DISTINCT FROM btrim(p_claim)     THEN v_final := 'commit_rejected'; v_error := 'claim_key_conflict'; END IF;
  IF v_final = 'succeeded' AND p_about_person_id IS NOT NULL THEN     SELECT node.* INTO v_person_node FROM public.graph_nodes node JOIN public.knowledge_audiences audience
      ON audience.id = v_attempt.knowledge_audience_id WHERE node.kind = 'person'       AND node.authority_id = p_about_person_id AND p_about_person_id = ANY(audience.member_profile_ids);
    IF v_person_node.id IS NULL THEN v_final := 'commit_rejected';       v_error := 'about_person_not_candidate'; END IF;
  END IF;   INSERT INTO public.knowledge_extraction_attempt_outcomes(attempt_id, source_event_id,
    extractor_version, knowledge_audience_id, outcome, raw_output, error_class, input_tokens, output_tokens)   VALUES (p_attempt_id, v_attempt.source_event_id, v_attempt.extractor_version,
    v_attempt.knowledge_audience_id, v_final, p_raw_output, v_error, p_input_tokens, p_output_tokens);   IF v_final = 'succeeded' THEN
    INSERT INTO public.knowledge_units(id, claim, source_event_id, extractor_version, claim_key,       knowledge_audience_id, knowledge_type, attention_score, embedding) VALUES
      (v_unit_id, btrim(p_claim), v_attempt.source_event_id, v_attempt.extractor_version, 'claim:0',        v_attempt.knowledge_audience_id, p_knowledge_type, p_attention_score, p_embedding) ON CONFLICT DO NOTHING;
    v_unit_node := public.canonical_graph_node_id('knowledge_unit', v_unit_id);     v_event_node := public.canonical_graph_node_id('message_event', v_attempt.source_event_id);
    INSERT INTO public.graph_nodes(id, kind, authority_id, label)       VALUES (v_unit_node, 'knowledge_unit', v_unit_id, btrim(p_claim)) ON CONFLICT DO NOTHING;
    INSERT INTO public.graph_node_grants(node_id, knowledge_audience_id, basis_kind, basis_id,       basis_version, label_snapshot, granted_at) VALUES (v_unit_node, v_attempt.knowledge_audience_id,
      'source_event', v_attempt.source_event_id, 1, btrim(p_claim), v_event.created_at) ON CONFLICT DO NOTHING;     v_edge := public.canonical_graph_edge_id(v_unit_node, 'derived_from', v_event_node);
    INSERT INTO public.graph_edges(id, source_node_id, target_node_id, kind)       VALUES (v_edge, v_unit_node, v_event_node, 'derived_from') ON CONFLICT DO NOTHING;
    INSERT INTO public.graph_edge_evidence(edge_id, evidence_event_id)       VALUES (v_edge, v_attempt.source_event_id) ON CONFLICT DO NOTHING;
    IF p_about_person_id IS NOT NULL THEN       v_edge := public.canonical_graph_edge_id(v_unit_node, 'about', v_person_node.id);
      INSERT INTO public.graph_edges(id, source_node_id, target_node_id, kind)         VALUES (v_edge, v_unit_node, v_person_node.id, 'about') ON CONFLICT DO NOTHING;
      INSERT INTO public.graph_edge_evidence(edge_id, evidence_event_id)         VALUES (v_edge, v_attempt.source_event_id) ON CONFLICT DO NOTHING;
      INSERT INTO public.graph_node_grants(node_id, knowledge_audience_id, basis_kind, basis_id,         basis_version, label_snapshot, granted_at, basis_event_id) VALUES (v_person_node.id,
        v_attempt.knowledge_audience_id, 'edge_evidence', v_edge, 1, v_person_node.label,         v_event.created_at, v_attempt.source_event_id) ON CONFLICT DO NOTHING;
    END IF;     IF v_topics THEN PERFORM public.write_knowledge_unit_topics(v_unit_id, v_attempt.source_event_id,
      v_attempt.knowledge_audience_id, v_attempt.extractor_version,       p_raw_output->'topics', p_topic_inputs); END IF;
  END IF;   UPDATE public.knowledge_extraction_jobs SET state = CASE
      WHEN v_final = 'succeeded' THEN 'succeeded'::public.knowledge_extraction_job_state       WHEN v_final = 'no_claim' THEN 'no_claim'::public.knowledge_extraction_job_state
      ELSE 'pending'::public.knowledge_extraction_job_state END,     active_attempt_id = NULL, lease_token = NULL, lease_expires_at = NULL, updated_at = v_now
  WHERE source_event_id = v_attempt.source_event_id AND extractor_version = v_attempt.extractor_version;   RETURN QUERY SELECT v_final, CASE WHEN v_final = 'succeeded' THEN v_unit_id END, false;
END $$;
CREATE FUNCTION public.guard_knowledge_unit_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN   IF TG_OP = 'DELETE' OR current_setting('voyager.topic_backfill', true) IS DISTINCT FROM 'on'
    OR (to_jsonb(NEW) - ARRAY['knowledge_type','attention_score','embedding'])       IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['knowledge_type','attention_score','embedding'])
    OR (OLD.knowledge_type IS NOT NULL AND NEW.knowledge_type IS DISTINCT FROM OLD.knowledge_type)     OR (OLD.attention_score IS NOT NULL AND NEW.attention_score IS DISTINCT FROM OLD.attention_score)
    OR (OLD.embedding IS NOT NULL AND NEW.embedding::text IS DISTINCT FROM OLD.embedding::text) THEN     RAISE EXCEPTION 'knowledge_units_immutable' USING ERRCODE = '23514'; END IF;
  RETURN NEW; END $$;
DROP TRIGGER trg_knowledge_unit_immutable ON public.knowledge_units; CREATE TRIGGER trg_knowledge_unit_immutable BEFORE UPDATE OR DELETE ON public.knowledge_units
  FOR EACH ROW EXECUTE FUNCTION public.guard_knowledge_unit_immutable(); CREATE FUNCTION public.activate_knowledge_topic_contract() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$ BEGIN
  UPDATE public.knowledge_extractor_contract_active SET     extractor_version = 'cartographer-single-claim-v3', activated_at = clock_timestamp()
  WHERE singleton AND extractor_version <> 'cartographer-single-claim-v3';   RETURN (SELECT extractor_version FROM public.knowledge_extractor_contract_active WHERE singleton);
END $$; CREATE FUNCTION public.find_knowledge_topic_candidates(
  p_knowledge_audience_id uuid, p_embedding vector(1536)) RETURNS TABLE(topic_id uuid, label text, similarity real)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$   SELECT topic.id, topic.normalized_label, (1 - (topic.embedding <=> p_embedding))::real
  FROM public.knowledge_topics topic JOIN public.graph_nodes node     ON node.kind::text = 'topic' AND node.authority_id = topic.id
  JOIN public.graph_node_grants grant_row ON grant_row.node_id = node.id     AND grant_row.knowledge_audience_id = p_knowledge_audience_id
  CROSS JOIN public.knowledge_extractor_contracts contract   WHERE contract.extractor_version = 'cartographer-single-claim-v3'
    AND 1 - (topic.embedding <=> p_embedding) >= contract.topic_similarity_threshold   ORDER BY topic.embedding <=> p_embedding, topic.id LIMIT (SELECT topic_candidate_limit FROM
      public.knowledge_extractor_contracts WHERE extractor_version = 'cartographer-single-claim-v3')
$$; CREATE FUNCTION public.list_knowledge_topic_backfill_jobs()
RETURNS TABLE(source_event_id uuid, requesting_user_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT job.source_event_id, audience.member_profile_ids[1]   FROM public.knowledge_extraction_jobs job JOIN public.knowledge_audiences audience
    ON audience.id = job.knowledge_audience_id   WHERE job.extractor_version IN ('cartographer-single-claim-v1', 'cartographer-single-claim-v2')
    AND job.state NOT IN ('succeeded', 'no_claim') ORDER BY job.created_at, job.source_event_id $$;
CREATE FUNCTION public.list_knowledge_topic_backfill_units() RETURNS TABLE(unit_id uuid, source_event_id uuid, source_content text, source_actor_id uuid,
  claim text, knowledge_audience_id uuid) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT unit.id, event.id, event.content, event.actor_id, unit.claim, unit.knowledge_audience_id   FROM public.knowledge_units unit JOIN public.knowledge_events event ON event.id = unit.source_event_id
  LEFT JOIN public.knowledge_topic_backfill_outcomes done ON done.unit_id = unit.id   WHERE unit.extractor_version <> 'cartographer-single-claim-v3'
    AND done.unit_id IS NULL ORDER BY unit.id $$;
CREATE FUNCTION public.write_knowledge_topic_backfill(   p_unit_id uuid, p_raw_output jsonb, p_knowledge_type text, p_attention_score real,
  p_embedding vector(1536), p_topic_inputs jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_unit public.knowledge_units; BEGIN
  SELECT * INTO STRICT v_unit FROM public.knowledge_units WHERE id = p_unit_id FOR UPDATE;   IF v_unit.extractor_version = 'cartographer-single-claim-v3'
    OR p_raw_output->>'claim' IS DISTINCT FROM v_unit.claim     OR p_raw_output->'aboutPersonId' IS DISTINCT FROM 'null'
    OR jsonb_typeof(p_raw_output->'topics') <> 'array'     OR p_knowledge_type NOT IN ('domain', 'operational', 'preference')
    OR p_attention_score NOT BETWEEN 0 AND 1 OR p_embedding IS NULL THEN     RAISE EXCEPTION 'knowledge_topic_backfill_payload_invalid' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.knowledge_topic_backfill_outcomes WHERE unit_id = p_unit_id) THEN     RETURN true; END IF;
  PERFORM set_config('voyager.topic_backfill', 'on', true);   UPDATE public.knowledge_units SET knowledge_type = coalesce(knowledge_type, p_knowledge_type),
    attention_score = coalesce(attention_score, p_attention_score),     embedding = coalesce(embedding, p_embedding) WHERE id = p_unit_id;
  PERFORM public.write_knowledge_unit_topics(p_unit_id, v_unit.source_event_id,     v_unit.knowledge_audience_id, 'cartographer-single-claim-v3',
    p_raw_output->'topics', p_topic_inputs);   INSERT INTO public.knowledge_topic_backfill_outcomes(unit_id, extractor_version, raw_output)
    VALUES (p_unit_id, 'cartographer-single-claim-v3', p_raw_output);   RETURN true;
END $$; CREATE FUNCTION public.assert_knowledge_topic_backfill_complete() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$ DECLARE v_jobs integer; v_physics integer; v_units integer;
BEGIN   SELECT count(*) INTO v_jobs FROM public.knowledge_extraction_jobs WHERE
    extractor_version IN ('cartographer-single-claim-v1', 'cartographer-single-claim-v2')     AND state NOT IN ('succeeded', 'no_claim');
  SELECT count(*) INTO v_physics FROM public.knowledge_units WHERE     embedding IS NULL OR knowledge_type IS NULL OR attention_score IS NULL;
  SELECT count(*) INTO v_units FROM public.knowledge_units unit     LEFT JOIN public.knowledge_topic_backfill_outcomes done ON done.unit_id = unit.id
    WHERE unit.extractor_version <> 'cartographer-single-claim-v3'       AND done.unit_id IS NULL;
  IF v_jobs <> 0 OR v_physics <> 0 OR v_units <> 0 THEN     RAISE EXCEPTION 'knowledge_topic_backfill_incomplete:%:%:%', v_jobs, v_physics, v_units; END IF;
  RETURN jsonb_build_object('oldNonTerminalJobs', v_jobs, 'unitsMissingPhysics', v_physics,     'oldUnitsMissingTopicDerivation', v_units);
END $$;
ALTER TABLE public.knowledge_topics ENABLE ROW LEVEL SECURITY; ALTER TABLE public.knowledge_topic_backfill_outcomes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.knowledge_topics, public.knowledge_topic_backfill_outcomes   FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.knowledge_topics, public.knowledge_topic_backfill_outcomes TO service_role; REVOKE EXECUTE ON FUNCTION public.resolve_knowledge_topic(text, text, vector),
  public.write_knowledge_unit_topics(uuid, uuid, uuid, text, jsonb, jsonb)   FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.complete_knowledge_extraction_attempt(   uuid, uuid, public.knowledge_extraction_outcome_kind, jsonb, text, uuid, text,
  real, vector, jsonb, text, integer, integer) FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION public.complete_knowledge_extraction_attempt(
  uuid, uuid, public.knowledge_extraction_outcome_kind, jsonb, text, uuid, text,   real, vector, jsonb, text, integer, integer) TO service_role;
REVOKE EXECUTE ON FUNCTION public.activate_knowledge_topic_contract(),   public.find_knowledge_topic_candidates(uuid, vector),
  public.list_knowledge_topic_backfill_jobs(), public.list_knowledge_topic_backfill_units(),   public.write_knowledge_topic_backfill(uuid, jsonb, text, real, vector, jsonb),
  public.assert_knowledge_topic_backfill_complete() FROM PUBLIC, anon, authenticated; GRANT EXECUTE ON FUNCTION public.activate_knowledge_topic_contract(),
  public.find_knowledge_topic_candidates(uuid, vector),   public.list_knowledge_topic_backfill_jobs(), public.list_knowledge_topic_backfill_units(),
  public.write_knowledge_topic_backfill(uuid, jsonb, text, real, vector, jsonb),   public.assert_knowledge_topic_backfill_complete() TO service_role;
