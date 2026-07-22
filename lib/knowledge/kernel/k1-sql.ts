const quote = (value: string): string => `'${value.replaceAll("'", "''")}'`;
const legacyRelation = ["knowledge", "edges"].join("_");
const legacyTraversal = ["graph", "traverse"].join("_");

export const K1_SEED = {
  ownerId: "13000000-0000-4000-8000-000000000001",
  recipientId: "13000000-0000-4000-8000-000000000002",
  voyageId: "43000000-0000-4000-8000-000000000001",
  spaceId: "44000000-0000-4000-8000-000000000001",
  sessionId: "45000000-0000-4000-8000-000000000001",
  eligibleSourceId: "63000000-0000-4000-8000-000000000001",
  eligibleTargetId: "63000000-0000-4000-8000-000000000002",
  unresolvedEventId: "63000000-0000-4000-8000-000000000003",
  voyageEventId: "63000000-0000-4000-8000-000000000004",
  spaceEventId: "63000000-0000-4000-8000-000000000005",
  eligibleEdgeId: "83000000-0000-4000-8000-000000000001",
  unresolvedEdgeId: "83000000-0000-4000-8000-000000000002",
  unitId: "73000000-0000-4000-8000-000000000001",
  unitNodeId: "73000000-0000-4000-8000-000000000011",
} as const;

export const renderK1LegacySetupSql = (): string => {
  const seed = K1_SEED;
  return `
-- K1 legacy cutover controls, created only inside the recipe transaction.
INSERT INTO auth.users
  (id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
VALUES (${quote(seed.ownerId)}::uuid, 'authenticated', 'authenticated',
  'oru-319-k1@example.invalid', '{}'::jsonb,
  '{"display_name":"K1 owner"}'::jsonb, now(), now()),
  (${quote(seed.recipientId)}::uuid, 'authenticated', 'authenticated',
  'oru-319-k1-recipient@example.invalid', '{}'::jsonb,
  '{"display_name":"K1 recipient"}'::jsonb, now(), now())
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.voyages (id, slug, name) VALUES
  (${quote(seed.voyageId)}::uuid, 'oru-319-k1-backfill', 'ORU-319 K1 backfill')
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.spaces (id, voyage_id, created_by) VALUES
  (${quote(seed.spaceId)}::uuid, ${quote(seed.voyageId)}::uuid, ${quote(seed.ownerId)}::uuid)
ON CONFLICT (id) DO NOTHING;
INSERT INTO public.sessions (id, user_id, voyage_id, space_id) VALUES
  (${quote(seed.sessionId)}::uuid, ${quote(seed.ownerId)}::uuid,
    ${quote(seed.voyageId)}::uuid, ${quote(seed.spaceId)}::uuid)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.knowledge_events
  (id, event_type, user_id, voyage_slug, content, metadata, source_type,
    actor_type, participants) VALUES
  (${quote(seed.eligibleSourceId)}::uuid, 'message', ${quote(seed.ownerId)}::uuid,
    NULL, 'K1 eligible source', '{}'::jsonb, 'explicit', 'pipeline',
    ARRAY[${quote(seed.ownerId)}::uuid]),
  (${quote(seed.eligibleTargetId)}::uuid, 'message', ${quote(seed.ownerId)}::uuid,
    NULL, 'K1 eligible target', '{}'::jsonb, 'explicit', 'pipeline',
    ARRAY[${quote(seed.ownerId)}::uuid]),
  (${quote(seed.unresolvedEventId)}::uuid, 'message', ${quote(seed.ownerId)}::uuid,
    'oru-319-unattested-voyage', 'K1 unresolved source', '{}'::jsonb,
    'explicit', 'pipeline', NULL),
  (${quote(seed.voyageEventId)}::uuid, 'message', ${quote(seed.ownerId)}::uuid,
    'oru-319-k1-backfill', 'K1 explicit voyage source', '{}'::jsonb,
    'explicit', 'pipeline', ARRAY[${quote(seed.recipientId)}::uuid]),
  (${quote(seed.spaceEventId)}::uuid, 'message', ${quote(seed.ownerId)}::uuid,
    'oru-319-k1-backfill', 'K1 explicit space source',
    ${quote(JSON.stringify({ session_id: seed.sessionId }))}::jsonb,
    'explicit', 'pipeline', ARRAY[${quote(seed.recipientId)}::uuid])
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.${legacyRelation}
  (id, source_id, target_id, edge_type, created_by) VALUES
  (${quote(seed.eligibleEdgeId)}::uuid, ${quote(seed.eligibleSourceId)}::uuid,
    ${quote(seed.eligibleTargetId)}::uuid, 'relates_to', 'k1-proof'),
  (${quote(seed.unresolvedEdgeId)}::uuid, ${quote(seed.eligibleSourceId)}::uuid,
    ${quote(seed.unresolvedEventId)}::uuid, 'relates_to', 'k1-proof')
ON CONFLICT (source_id, target_id, edge_type) DO NOTHING;
`;
};

export const renderK1CutoverAssertionsSql = (): string => {
  const seed = K1_SEED;
  const sixArg = `public.${legacyTraversal}(uuid,text,text,integer,double precision,integer)`;
  const nineArg = `public.${legacyTraversal}(uuid,text,text,integer,double precision,integer,uuid,text,uuid[])`;
  return `
DO $knowledge_graph_k1$
DECLARE
  v_source_node uuid := md5('voyager-node:v1:message_event:${seed.eligibleSourceId}')::uuid;
  v_target_node uuid := md5('voyager-node:v1:message_event:${seed.eligibleTargetId}')::uuid;
  v_audience uuid; v_claim text;
BEGIN
  SELECT knowledge_audience_id INTO v_audience FROM public.knowledge_events
  WHERE id = ${quote(seed.eligibleSourceId)}::uuid;
  IF v_audience IS NULL OR v_audience IS DISTINCT FROM (SELECT knowledge_audience_id
    FROM public.knowledge_events WHERE id = ${quote(seed.eligibleTargetId)}::uuid) THEN
    RAISE EXCEPTION 'knowledge_graph_k1_explicit_mapping_failed'; END IF;
  IF (SELECT knowledge_audience_id FROM public.knowledge_events
      WHERE id = ${quote(seed.unresolvedEventId)}::uuid) IS NOT NULL
    OR EXISTS (SELECT 1 FROM public.graph_nodes
      WHERE authority_id = ${quote(seed.unresolvedEventId)}::uuid) THEN
    RAISE EXCEPTION 'knowledge_graph_k1_unresolved_event_entered_graph'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.knowledge_graph_backfill_rejections
      WHERE source_kind = 'knowledge_event'
        AND source_id = ${quote(seed.unresolvedEventId)}::uuid
        AND reason = 'voyage_audience_not_explicit')
    OR NOT EXISTS (SELECT 1 FROM public.knowledge_graph_backfill_rejections
      WHERE source_kind = 'knowledge_edge'
        AND source_id = ${quote(seed.unresolvedEdgeId)}::uuid
        AND reason = 'edge_endpoint_unresolved') THEN
    RAISE EXCEPTION 'knowledge_graph_k1_rejection_report_failed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.knowledge_events event
      JOIN public.knowledge_audiences audience ON audience.id = event.knowledge_audience_id
      WHERE event.id = ${quote(seed.voyageEventId)}::uuid
        AND audience.scope_kind = 'voyage'
        AND audience.scope_authority_id = ${quote(seed.voyageId)}::uuid
        AND audience.member_profile_ids = ARRAY[
          ${quote(seed.ownerId)}::uuid, ${quote(seed.recipientId)}::uuid]) THEN
    RAISE EXCEPTION 'knowledge_graph_k1_voyage_mapping_failed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.knowledge_events event
      JOIN public.knowledge_audiences audience ON audience.id = event.knowledge_audience_id
      WHERE event.id = ${quote(seed.spaceEventId)}::uuid
        AND audience.scope_kind = 'space'
        AND audience.scope_authority_id = ${quote(seed.spaceId)}::uuid
        AND audience.member_profile_ids = ARRAY[
          ${quote(seed.ownerId)}::uuid, ${quote(seed.recipientId)}::uuid]) THEN
    RAISE EXCEPTION 'knowledge_graph_k1_space_mapping_failed'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.graph_edges edge
      WHERE edge.source_node_id = least(v_source_node, v_target_node)
        AND edge.target_node_id = greatest(v_source_node, v_target_node)
        AND edge.kind = 'relates_to' AND edge.knowledge_audience_id = v_audience)
    OR (SELECT count(*) FROM public.graph_edges edge
      WHERE edge.source_node_id = least(v_source_node, v_target_node)
        AND edge.target_node_id = greatest(v_source_node, v_target_node)
        AND edge.kind = 'relates_to') <> 1 THEN
    RAISE EXCEPTION 'knowledge_graph_k1_eligible_edge_parity_failed'; END IF;
  IF to_regclass('public.${legacyRelation}') IS NOT NULL
    OR to_regprocedure(${quote(sixArg)}) IS NOT NULL
    OR to_regprocedure(${quote(nineArg)}) IS NOT NULL THEN
    RAISE EXCEPTION 'knowledge_graph_k1_old_catalogue_present'; END IF;
  IF has_table_privilege('service_role', 'public.graph_edges', 'INSERT')
    OR has_function_privilege('anon',
      'public.write_knowledge_graph_edge(public.graph_node_kind,uuid,public.graph_node_kind,uuid,public.graph_edge_kind)',
      'EXECUTE')
    OR has_function_privilege('authenticated',
      'public.write_knowledge_graph_edge(public.graph_node_kind,uuid,public.graph_node_kind,uuid,public.graph_edge_kind)',
      'EXECUTE')
    OR NOT has_function_privilege('service_role',
      'public.write_knowledge_graph_edge(public.graph_node_kind,uuid,public.graph_node_kind,uuid,public.graph_edge_kind)',
      'EXECUTE') THEN RAISE EXCEPTION 'knowledge_graph_k1_writer_acl_failed'; END IF;

  INSERT INTO public.knowledge_units
    (id, claim, source_event_id, extractor_version, claim_key, knowledge_audience_id)
  VALUES (${quote(seed.unitId)}::uuid, 'K1 writer reaches its immutable source.',
    ${quote(seed.eligibleSourceId)}::uuid, 'k1-proof', 'writer-retrieval', v_audience);
  INSERT INTO public.graph_nodes (id, kind, authority_id, label, knowledge_audience_id)
  VALUES (${quote(seed.unitNodeId)}::uuid, 'knowledge_unit', ${quote(seed.unitId)}::uuid,
    'K1 writer retrieval unit', v_audience);
  PERFORM public.write_knowledge_graph_edge('knowledge_unit', ${quote(seed.unitId)}::uuid,
    'message_event', ${quote(seed.eligibleSourceId)}::uuid, 'derived_from');
  SELECT claim INTO v_claim FROM public.retrieve_knowledge_graph_claims(
    'message_event', ${quote(seed.eligibleTargetId)}::uuid,
    ${quote(seed.ownerId)}::uuid, true, 4)
  WHERE knowledge_unit_id = ${quote(seed.unitId)}::uuid;
  IF v_claim IS DISTINCT FROM 'K1 writer reaches its immutable source.' THEN
    RAISE EXCEPTION 'knowledge_graph_k1_write_retrieval_failed'; END IF;
  BEGIN
    UPDATE public.knowledge_graph_backfill_rejections SET reason = 'changed'
    WHERE source_id = ${quote(seed.unresolvedEventId)}::uuid;
    RAISE EXCEPTION 'knowledge_graph_k1_report_mutable';
  EXCEPTION WHEN check_violation THEN NULL; END;
END
$knowledge_graph_k1$;
`;
};
