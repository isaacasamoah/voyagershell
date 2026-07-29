-- K4b rework: claim-vector blocking plus versioned model identity decisions.
ALTER TABLE public.knowledge_extractor_contracts ADD COLUMN topic_matcher_version text
  CHECK (topic_matcher_version IS NULL OR length(btrim(topic_matcher_version)) BETWEEN 1 AND 120);
INSERT INTO public.knowledge_extractor_contracts(extractor_version, embedding_model, embedding_dimensions,
  topic_similarity_threshold, topic_candidate_limit, topic_matcher_version)
VALUES ('cartographer-single-claim-v4', 'text-embedding-3-small', 1536, 0.2, 8, 'topic-retrieval-v4');
CREATE TABLE public.knowledge_topic_identity_outcomes (
  unit_id uuid PRIMARY KEY REFERENCES public.knowledge_units(id),
  extractor_version text NOT NULL REFERENCES public.knowledge_extractor_contracts(extractor_version)
    CHECK (extractor_version = 'cartographer-single-claim-v4'), raw_output jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TRIGGER trg_knowledge_topic_identity_outcomes_immutable BEFORE UPDATE OR DELETE ON public.knowledge_topic_identity_outcomes
  FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_knowledge_graph_row();
DROP FUNCTION public.find_knowledge_topic_candidates(uuid, vector);
CREATE FUNCTION public.resolve_knowledge_topic(p_extractor_version text, p_knowledge_audience_id uuid,
  p_embedding vector(1536), p_exclude_unit_id uuid DEFAULT NULL)
RETURNS TABLE(topic_id uuid, label text, representative_claim text, similarity real)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_floor real; v_limit integer;
BEGIN
  SELECT topic_similarity_threshold, topic_candidate_limit INTO STRICT v_floor, v_limit FROM public.knowledge_extractor_contracts
  WHERE extractor_version = p_extractor_version
    AND topic_similarity_threshold IS NOT NULL AND topic_candidate_limit IS NOT NULL;
  IF p_extractor_version = 'cartographer-single-claim-v3' THEN
    RETURN QUERY SELECT topic.id, topic.normalized_label, NULL::text, (1 - (topic.embedding <=> p_embedding))::real
    FROM public.knowledge_topics topic
    JOIN public.graph_nodes node ON node.kind::text = 'topic' AND node.authority_id = topic.id
    JOIN public.graph_node_grants grant_row ON grant_row.node_id = node.id AND grant_row.knowledge_audience_id = p_knowledge_audience_id
    WHERE 1 - (topic.embedding <=> p_embedding) >= v_floor
    ORDER BY topic.embedding <=> p_embedding, topic.id LIMIT v_limit;
  ELSIF p_extractor_version = 'cartographer-single-claim-v4' THEN
    RETURN QUERY WITH scored AS (
      SELECT DISTINCT ON (topic.id) topic.id, topic.normalized_label, unit.claim AS representative_claim, (1 - (unit.embedding <=> p_embedding))::real AS score
      FROM public.knowledge_topics topic
      JOIN public.graph_nodes topic_node ON topic_node.kind::text = 'topic' AND topic_node.authority_id = topic.id
      JOIN public.graph_node_grants topic_grant ON topic_grant.node_id = topic_node.id AND topic_grant.knowledge_audience_id = p_knowledge_audience_id
      JOIN public.graph_edges edge ON edge.target_node_id = topic_node.id AND edge.kind = 'about'
      JOIN public.graph_nodes unit_node ON unit_node.id = edge.source_node_id AND unit_node.kind = 'knowledge_unit'
      JOIN public.knowledge_units unit ON unit.id = unit_node.authority_id AND unit.knowledge_audience_id = p_knowledge_audience_id
      WHERE unit.embedding IS NOT NULL AND unit.id IS DISTINCT FROM p_exclude_unit_id
      ORDER BY topic.id, unit.embedding <=> p_embedding, unit.id
    )
    SELECT scored.id, scored.normalized_label, scored.representative_claim, scored.score FROM scored
    WHERE scored.score >= v_floor ORDER BY scored.score DESC, scored.id LIMIT v_limit;
  ELSE
    RAISE EXCEPTION 'knowledge_topic_candidate_contract_invalid' USING ERRCODE = '22023';
  END IF;
END $$;
CREATE FUNCTION public.write_v4_knowledge_unit_topics(p_unit_id uuid, p_event_id uuid, p_audience_id uuid, p_extractor_version text,
  p_topic_inputs jsonb, p_candidate_topic_ids uuid[], p_claim_embedding vector(1536))
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_item jsonb; v_topic uuid; v_topic_node uuid; v_unit_node uuid; v_edge uuid;
  v_event public.knowledge_events; v_label text; v_current uuid[]; v_snapshot uuid[];
BEGIN
  IF p_extractor_version <> 'cartographer-single-claim-v4' OR jsonb_typeof(p_topic_inputs) <> 'array'
    OR jsonb_array_length(p_topic_inputs) > 3
    OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_topic_inputs) item
      WHERE item->>'kind' NOT IN ('existing', 'new')
        OR (item->>'kind' = 'existing' AND item->>'topicId' IS NULL)
        OR (item->>'kind' = 'new' AND item->>'label' IS NULL)) THEN
    RAISE EXCEPTION 'knowledge_topic_match_input_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT coalesce(array_agg(candidate.topic_id ORDER BY candidate.topic_id), '{}') INTO v_current
  FROM public.resolve_knowledge_topic(p_extractor_version, p_audience_id, p_claim_embedding, p_unit_id) candidate;
  SELECT ARRAY(SELECT value FROM unnest(coalesce(p_candidate_topic_ids, '{}')) value ORDER BY value) INTO v_snapshot;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_topic_inputs) item
      WHERE item->>'kind' = 'new') THEN
    PERFORM pg_advisory_xact_lock(861319074);
    SELECT coalesce(array_agg(candidate.topic_id ORDER BY candidate.topic_id), '{}') INTO v_current
    FROM public.resolve_knowledge_topic(p_extractor_version, p_audience_id, p_claim_embedding, p_unit_id) candidate;
    IF v_current IS DISTINCT FROM v_snapshot THEN
      RAISE EXCEPTION 'knowledge_topic_candidates_stale:%:%', v_snapshot, v_current
        USING ERRCODE = '40001';
    END IF;
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_topic_inputs) item WHERE item->>'kind' = 'existing'
      AND NOT ((item->>'topicId')::uuid = ANY(v_current) AND (item->>'topicId')::uuid = ANY(v_snapshot))) THEN
    RAISE EXCEPTION 'knowledge_topic_candidate_not_authorized' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO STRICT v_event FROM public.knowledge_events
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
      SELECT id INTO v_topic FROM public.knowledge_topics WHERE normalized_label = v_label;
      IF v_topic IS NULL THEN
        v_topic := md5(format('voyager-topic:v1:%s', v_label))::uuid;
        INSERT INTO public.knowledge_topics(id, normalized_label, embedding) VALUES (v_topic, v_label, p_claim_embedding);
        INSERT INTO public.graph_nodes(id, kind, authority_id, label)
          VALUES (public.canonical_graph_node_id('topic', v_topic), 'topic', v_topic, v_label);
      END IF;
    END IF;
    v_topic_node := public.canonical_graph_node_id('topic', v_topic);
    v_edge := public.canonical_graph_edge_id(v_unit_node, 'about', v_topic_node);
    INSERT INTO public.graph_edges(id, source_node_id, target_node_id, kind) VALUES (v_edge, v_unit_node, v_topic_node, 'about') ON CONFLICT DO NOTHING;
    INSERT INTO public.graph_edge_evidence(edge_id, evidence_event_id) VALUES (v_edge, p_event_id) ON CONFLICT DO NOTHING;
    INSERT INTO public.graph_node_grants(node_id, knowledge_audience_id, basis_kind, basis_id,
      basis_version, label_snapshot, granted_at, basis_event_id)
    SELECT v_topic_node, p_audience_id, 'edge_evidence', v_edge, 1,
      topic.normalized_label, v_event.created_at, p_event_id
    FROM public.knowledge_topics topic WHERE topic.id = v_topic ON CONFLICT DO NOTHING;
  END LOOP;
END $$;
CREATE FUNCTION public.complete_v4_knowledge_extraction_attempt(p_attempt_id uuid, p_lease_token uuid, p_result public.knowledge_extraction_outcome_kind,
  p_raw_output jsonb DEFAULT NULL, p_claim text DEFAULT NULL, p_about_person_id uuid DEFAULT NULL,
  p_knowledge_type text DEFAULT NULL, p_attention_score real DEFAULT NULL,
  p_embedding vector(1536) DEFAULT NULL, p_topic_inputs jsonb DEFAULT NULL,
  p_topic_candidate_ids uuid[] DEFAULT NULL, p_error_class text DEFAULT NULL,
  p_input_tokens integer DEFAULT NULL, p_output_tokens integer DEFAULT NULL)
RETURNS TABLE(outcome public.knowledge_extraction_outcome_kind, unit_id uuid, replayed boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_attempt public.knowledge_extraction_attempts; v_completion record;
BEGIN
  SELECT * INTO STRICT v_attempt FROM public.knowledge_extraction_attempts WHERE id = p_attempt_id;
  IF v_attempt.extractor_version <> 'cartographer-single-claim-v4' THEN
    RAISE EXCEPTION 'knowledge_topic_matcher_contract_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_result = 'succeeded' AND (p_claim IS NULL OR p_embedding IS NULL OR p_knowledge_type NOT IN ('domain', 'operational', 'preference')
      OR p_attention_score NOT BETWEEN 0 AND 1 OR p_raw_output->'topics' IS DISTINCT FROM p_topic_inputs)
    OR p_result = 'no_claim' AND (p_claim IS NOT NULL OR p_raw_output->'topics' IS DISTINCT FROM '[]')
    OR p_result IN ('provider_failed', 'malformed_output') AND (p_claim IS NOT NULL OR p_error_class IS NULL) THEN
    RAISE EXCEPTION 'knowledge_topic_matcher_payload_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO STRICT v_completion FROM public.complete_knowledge_extraction_attempt(p_attempt_id, p_lease_token, p_result, p_raw_output,
    p_claim, p_about_person_id, p_knowledge_type, p_attention_score, p_embedding, NULL, p_error_class,
    p_input_tokens, p_output_tokens);
  IF v_completion.outcome = 'succeeded' AND NOT v_completion.replayed THEN
    PERFORM public.write_v4_knowledge_unit_topics(v_completion.unit_id, v_attempt.source_event_id,
      v_attempt.knowledge_audience_id, v_attempt.extractor_version,
      p_topic_inputs, p_topic_candidate_ids, p_embedding);
  END IF;
  RETURN QUERY SELECT v_completion.outcome, v_completion.unit_id, v_completion.replayed;
END $$;
CREATE OR REPLACE FUNCTION public.activate_knowledge_topic_contract() RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  UPDATE public.knowledge_extractor_contract_active SET extractor_version = 'cartographer-single-claim-v4', activated_at = clock_timestamp()
  WHERE singleton AND extractor_version <> 'cartographer-single-claim-v4';
  RETURN (SELECT extractor_version FROM public.knowledge_extractor_contract_active WHERE singleton);
END $$;
CREATE OR REPLACE FUNCTION public.list_knowledge_topic_backfill_jobs() RETURNS TABLE(source_event_id uuid, requesting_user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT job.source_event_id, audience.member_profile_ids[1]
  FROM public.knowledge_extraction_jobs job JOIN public.knowledge_audiences audience ON audience.id = job.knowledge_audience_id
  WHERE job.extractor_version <> 'cartographer-single-claim-v4'
    AND job.state NOT IN ('succeeded', 'no_claim') ORDER BY job.created_at, job.source_event_id
$$;
DROP FUNCTION public.list_knowledge_topic_backfill_units();
CREATE FUNCTION public.list_knowledge_topic_backfill_units()
RETURNS TABLE(unit_id uuid, source_event_id uuid, source_content text, source_actor_id uuid,
  claim text, knowledge_audience_id uuid, embedding text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT unit.id, event.id, event.content, event.actor_id, unit.claim, unit.knowledge_audience_id, unit.embedding::text
  FROM public.knowledge_units unit JOIN public.knowledge_events event ON event.id = unit.source_event_id
  LEFT JOIN public.knowledge_topic_identity_outcomes done ON done.unit_id = unit.id
  WHERE unit.extractor_version <> 'cartographer-single-claim-v4'
    AND done.unit_id IS NULL ORDER BY unit.id
$$;
CREATE FUNCTION public.guard_topic_identity_rework_row() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_old jsonb := to_jsonb(OLD); v_new jsonb := to_jsonb(NEW); v_allowed boolean := false;
BEGIN
  IF TG_TABLE_NAME = 'graph_nodes' AND TG_OP = 'UPDATE' AND v_new->>'id' IS NOT DISTINCT FROM v_old->>'id'
    AND v_new->>'kind' IS NOT DISTINCT FROM v_old->>'kind' AND v_new->>'authority_id' IS NOT DISTINCT FROM v_old->>'authority_id'
    AND (v_old->>'kind' <> 'topic' OR v_new->>'label' IS NOT DISTINCT FROM v_old->>'label')
    THEN RETURN NEW; END IF;
  IF TG_OP = 'DELETE' AND current_setting('voyager.topic_identity_rework', true) = 'on' THEN
    IF TG_TABLE_NAME = 'graph_edges' THEN SELECT EXISTS (SELECT 1 FROM public.graph_nodes source_node, public.graph_nodes target_node
      WHERE source_node.id = (v_old->>'source_node_id')::uuid AND source_node.kind = 'knowledge_unit'
        AND target_node.id = (v_old->>'target_node_id')::uuid AND target_node.kind::text = 'topic'
        AND v_old->>'kind' = 'about') INTO v_allowed;
    ELSIF TG_TABLE_NAME = 'graph_edge_evidence' THEN SELECT EXISTS (SELECT 1 FROM public.graph_edges edge
      WHERE edge.id = (v_old->>'edge_id')::uuid AND edge.kind = 'about') INTO v_allowed;
    ELSIF TG_TABLE_NAME = 'graph_node_grants' THEN SELECT EXISTS (SELECT 1 FROM public.graph_edges edge
      WHERE edge.id = (v_old->>'basis_id')::uuid AND edge.target_node_id = (v_old->>'node_id')::uuid
        AND edge.kind = 'about') INTO v_allowed;
    ELSIF TG_TABLE_NAME = 'graph_nodes' THEN v_allowed := v_old->>'kind' = 'topic'
      AND NOT EXISTS (SELECT 1 FROM public.graph_edges WHERE source_node_id = (v_old->>'id')::uuid OR target_node_id = (v_old->>'id')::uuid)
      AND NOT EXISTS (SELECT 1 FROM public.graph_node_grants WHERE node_id = (v_old->>'id')::uuid);
    ELSIF TG_TABLE_NAME = 'knowledge_topics' THEN v_allowed := NOT EXISTS (SELECT 1 FROM public.graph_nodes
      WHERE kind::text = 'topic' AND authority_id = (v_old->>'id')::uuid);
    END IF;
    IF v_allowed THEN RETURN OLD; END IF;
  END IF;
  RAISE EXCEPTION '%_immutable', TG_TABLE_NAME USING ERRCODE = '23514';
END $$;
DROP TRIGGER trg_graph_node_identity ON public.graph_nodes; CREATE TRIGGER trg_graph_node_identity BEFORE UPDATE OR DELETE ON public.graph_nodes FOR EACH ROW EXECUTE FUNCTION public.guard_topic_identity_rework_row();
DROP TRIGGER trg_graph_node_grant_immutable ON public.graph_node_grants; CREATE TRIGGER trg_graph_node_grant_immutable BEFORE UPDATE OR DELETE ON public.graph_node_grants FOR EACH ROW EXECUTE FUNCTION public.guard_topic_identity_rework_row();
DROP TRIGGER trg_graph_edge_immutable ON public.graph_edges; CREATE TRIGGER trg_graph_edge_immutable BEFORE UPDATE OR DELETE ON public.graph_edges FOR EACH ROW EXECUTE FUNCTION public.guard_topic_identity_rework_row();
DROP TRIGGER trg_graph_edge_evidence_immutable ON public.graph_edge_evidence; CREATE TRIGGER trg_graph_edge_evidence_immutable BEFORE UPDATE OR DELETE ON public.graph_edge_evidence FOR EACH ROW EXECUTE FUNCTION public.guard_topic_identity_rework_row();
DROP TRIGGER trg_knowledge_topics_immutable ON public.knowledge_topics; CREATE TRIGGER trg_knowledge_topics_immutable BEFORE UPDATE OR DELETE ON public.knowledge_topics FOR EACH ROW EXECUTE FUNCTION public.guard_topic_identity_rework_row();
CREATE FUNCTION public.write_knowledge_topic_identity_backfill(p_unit_id uuid, p_raw_output jsonb, p_knowledge_type text,
  p_attention_score real, p_embedding vector(1536), p_topic_inputs jsonb, p_topic_candidate_ids uuid[]) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_unit public.knowledge_units;
BEGIN
  SELECT * INTO STRICT v_unit FROM public.knowledge_units WHERE id = p_unit_id FOR UPDATE;
  IF v_unit.extractor_version = 'cartographer-single-claim-v4' OR p_raw_output->>'claim' IS DISTINCT FROM v_unit.claim
    OR p_raw_output->'aboutPersonId' IS DISTINCT FROM 'null'
    OR p_raw_output->'topics' IS DISTINCT FROM p_topic_inputs OR p_knowledge_type NOT IN ('domain','operational','preference')
    OR p_attention_score NOT BETWEEN 0 AND 1 OR p_embedding IS NULL THEN
    RAISE EXCEPTION 'knowledge_topic_identity_backfill_payload_invalid' USING ERRCODE = '22023'; END IF;
  IF EXISTS (SELECT 1 FROM public.knowledge_topic_identity_outcomes WHERE unit_id = p_unit_id) THEN RETURN true; END IF;
  PERFORM set_config('voyager.topic_identity_rework', 'on', true);
  DELETE FROM public.graph_node_grants grant_row USING public.graph_edges edge WHERE edge.source_node_id = public.canonical_graph_node_id('knowledge_unit', p_unit_id)
      AND edge.kind = 'about' AND grant_row.basis_kind = 'edge_evidence' AND grant_row.basis_id = edge.id;
  DELETE FROM public.graph_edge_evidence evidence USING public.graph_edges edge WHERE edge.source_node_id = public.canonical_graph_node_id('knowledge_unit', p_unit_id)
      AND edge.kind = 'about' AND evidence.edge_id = edge.id;
  DELETE FROM public.graph_edges edge USING public.graph_nodes target_node WHERE edge.source_node_id = public.canonical_graph_node_id('knowledge_unit', p_unit_id)
      AND edge.kind = 'about' AND target_node.id = edge.target_node_id AND target_node.kind::text = 'topic';
  PERFORM set_config('voyager.topic_backfill', 'on', true);
  UPDATE public.knowledge_units SET knowledge_type = coalesce(knowledge_type, p_knowledge_type), attention_score = coalesce(attention_score, p_attention_score),
    embedding = coalesce(embedding, p_embedding) WHERE id = p_unit_id;
  PERFORM public.write_v4_knowledge_unit_topics(p_unit_id, v_unit.source_event_id, v_unit.knowledge_audience_id,
    'cartographer-single-claim-v4', p_topic_inputs, p_topic_candidate_ids, p_embedding);
  INSERT INTO public.knowledge_topic_identity_outcomes(unit_id, extractor_version, raw_output) VALUES (p_unit_id, 'cartographer-single-claim-v4', p_raw_output);
  DELETE FROM public.graph_nodes node WHERE node.kind::text = 'topic'
    AND NOT EXISTS (SELECT 1 FROM public.graph_edges WHERE source_node_id = node.id OR target_node_id = node.id)
    AND NOT EXISTS (SELECT 1 FROM public.graph_node_grants WHERE node_id = node.id);
  DELETE FROM public.knowledge_topics topic WHERE NOT EXISTS (SELECT 1 FROM public.graph_nodes WHERE kind::text = 'topic' AND authority_id = topic.id);
  RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.assert_knowledge_topic_backfill_complete() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_jobs integer; v_physics integer; v_units integer; v_orphans integer;
BEGIN
  SELECT count(*) INTO v_jobs FROM public.knowledge_extraction_jobs WHERE extractor_version <> 'cartographer-single-claim-v4' AND state NOT IN ('succeeded','no_claim');
  SELECT count(*) INTO v_physics FROM public.knowledge_units WHERE embedding IS NULL OR knowledge_type IS NULL OR attention_score IS NULL;
  SELECT count(*) INTO v_units FROM public.knowledge_units unit LEFT JOIN public.knowledge_topic_identity_outcomes done ON done.unit_id = unit.id
    WHERE unit.extractor_version <> 'cartographer-single-claim-v4' AND done.unit_id IS NULL;
  SELECT count(*) INTO v_orphans FROM public.knowledge_topics topic WHERE NOT EXISTS (SELECT 1 FROM public.graph_nodes node JOIN public.graph_edges edge ON edge.target_node_id = node.id
      WHERE node.kind::text = 'topic' AND node.authority_id = topic.id AND edge.kind = 'about');
  IF v_jobs <> 0 OR v_physics <> 0 OR v_units <> 0 OR v_orphans <> 0 THEN RAISE EXCEPTION 'knowledge_topic_backfill_incomplete:%:%:%:%', v_jobs, v_physics, v_units, v_orphans; END IF;
  RETURN jsonb_build_object('oldNonTerminalJobs',v_jobs,'unitsMissingPhysics',v_physics,'oldUnitsMissingTopicDerivation',v_units,'orphanTopics',v_orphans);
END $$;
ALTER TABLE public.knowledge_topic_identity_outcomes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.knowledge_topic_identity_outcomes FROM PUBLIC, anon, authenticated, service_role; GRANT SELECT ON public.knowledge_topic_identity_outcomes TO service_role;
REVOKE EXECUTE ON FUNCTION public.write_v4_knowledge_unit_topics(uuid,uuid,uuid,text,jsonb,uuid[],vector), public.guard_topic_identity_rework_row(),
  public.write_knowledge_topic_identity_backfill(uuid,jsonb,text,real,vector,jsonb,uuid[]) FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.resolve_knowledge_topic(text,uuid,vector,uuid), public.complete_v4_knowledge_extraction_attempt(uuid,uuid,public.knowledge_extraction_outcome_kind,jsonb,text,uuid,text,real,vector,jsonb,uuid[],text,integer,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_knowledge_topic(text,uuid,vector,uuid), public.complete_v4_knowledge_extraction_attempt(uuid,uuid,public.knowledge_extraction_outcome_kind,jsonb,text,uuid,text,real,vector,jsonb,uuid[],text,integer,integer),
  public.write_knowledge_topic_identity_backfill(uuid,jsonb,text,real,vector,jsonb,uuid[]) TO service_role;
