import type { K1FixtureSeed } from './k1-fixture-seed'
const quote = (value: string): string => `'${value.replaceAll("'", "''")}'`
const normalizedMembers = (values: readonly string[]): string =>
  `public.normalize_knowledge_audience_members(ARRAY[${values.map((value) => `${quote(value)}::uuid`).join(', ')}])`
const legacyRelation = ['knowledge', 'edges'].join('_')
const legacyTraversal = ['graph', 'traverse'].join('_')

export const renderK1CutoverAssertionsSql = (seed: K1FixtureSeed): string => {
  const sixArg = `public.${legacyTraversal}(uuid,text,text,integer,double precision,integer)`
  const nineArg = `public.${legacyTraversal}(uuid,text,text,integer,double precision,integer,uuid,text,uuid[])`
  const ownerMembers = normalizedMembers([seed.ownerId])
  const sharedMembers = normalizedMembers([seed.ownerId, seed.recipientId])
  return `
DO $knowledge_graph_k1$
DECLARE v_source_node uuid := public.canonical_graph_node_id('message_event', ${quote(seed.eligibleSourceId)}::uuid);
  v_target_node uuid := public.canonical_graph_node_id('message_event', ${quote(seed.eligibleTargetId)}::uuid);
  v_audience uuid; v_edge uuid;
  v_claim text;
  v_grant_count bigint;
BEGIN
  SELECT knowledge_audience_id INTO v_audience FROM public.knowledge_events
  WHERE id = ${quote(seed.eligibleSourceId)}::uuid;
  IF v_audience IS NULL OR v_audience IS DISTINCT FROM (SELECT knowledge_audience_id
      FROM public.knowledge_events WHERE id = ${quote(seed.eligibleTargetId)}::uuid) THEN
    RAISE EXCEPTION 'knowledge_graph_k1_explicit_mapping_failed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.knowledge_audiences audience WHERE audience.id = v_audience
      AND audience.purpose = 'source' AND audience.scope_kind = 'private'
      AND audience.scope_authority_id = ${quote(seed.ownerId)}::uuid
      AND audience.member_profile_ids = ${ownerMembers})
    OR NOT EXISTS (SELECT 1 FROM public.knowledge_events event
      JOIN public.knowledge_audiences audience ON audience.id = event.knowledge_audience_id
      WHERE event.id = ${quote(seed.voyageEventId)}::uuid AND audience.purpose = 'source'
        AND audience.scope_kind = 'voyage' AND audience.scope_authority_id = ${quote(seed.voyageId)}::uuid
        AND audience.member_profile_ids = ${sharedMembers})
    OR NOT EXISTS (SELECT 1 FROM public.knowledge_events event
      JOIN public.knowledge_audiences audience ON audience.id = event.knowledge_audience_id
      WHERE event.id = ${quote(seed.spaceEventId)}::uuid AND audience.purpose = 'source'
        AND audience.scope_kind = 'space' AND audience.scope_authority_id = ${quote(seed.spaceId)}::uuid
        AND audience.member_profile_ids = ${sharedMembers})
    OR NOT EXISTS (SELECT 1 FROM public.knowledge_events event
      JOIN public.knowledge_audiences audience ON audience.id = event.knowledge_audience_id
      WHERE event.id = ${quote(seed.orphanSpaceEventId)}::uuid AND audience.purpose = 'source'
        AND audience.scope_kind = 'space'
        AND audience.scope_authority_id = ${quote(seed.orphanSpaceId)}::uuid
        AND audience.member_profile_ids = ${sharedMembers}) THEN
    RAISE EXCEPTION 'knowledge_graph_k1_exact_source_audiences_failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.knowledge_events WHERE id IN (${quote(seed.unresolvedEventId)}::uuid,
      ${quote(seed.malformedSessionEventId)}::uuid, ${quote(seed.mismatchedSpaceEventId)}::uuid,
      ${quote(seed.crossVoyageSessionEventId)}::uuid, ${quote(seed.unlinkedPersonalEventId)}::uuid)
      AND knowledge_audience_id IS NOT NULL)
    OR EXISTS (SELECT 1 FROM public.graph_nodes WHERE kind = 'message_event' AND authority_id IN
      (${quote(seed.unresolvedEventId)}::uuid, ${quote(seed.malformedSessionEventId)}::uuid,
        ${quote(seed.mismatchedSpaceEventId)}::uuid, ${quote(seed.crossVoyageSessionEventId)}::uuid,
        ${quote(seed.unlinkedPersonalEventId)}::uuid)) THEN
    RAISE EXCEPTION 'knowledge_graph_k1_unresolved_event_entered_graph';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.knowledge_graph_backfill_rejections rejection
      JOIN public.knowledge_events event ON event.id = rejection.source_id
      WHERE rejection.source_kind = 'message_event'
        AND rejection.source_id = ${quote(seed.unresolvedEventId)}::uuid
        AND rejection.reason = 'source_audience_not_explicit' AND event.content = 'K1 unresolved')
    OR NOT EXISTS (SELECT 1 FROM public.knowledge_graph_backfill_rejections
      WHERE source_id = ${quote(seed.malformedSessionEventId)}::uuid
        AND reason = 'session_authority_malformed')
    OR NOT EXISTS (SELECT 1 FROM public.knowledge_graph_backfill_rejections
      WHERE source_id = ${quote(seed.mismatchedSpaceEventId)}::uuid
        AND reason = 'space_voyage_mismatch')
    OR NOT EXISTS (SELECT 1 FROM public.knowledge_graph_backfill_rejections
      WHERE source_id = ${quote(seed.crossVoyageSessionEventId)}::uuid
        AND reason = 'session_voyage_mismatch')
    OR NOT EXISTS (SELECT 1 FROM public.knowledge_graph_backfill_rejections
      WHERE source_id = ${quote(seed.unlinkedPersonalEventId)}::uuid
        AND reason = 'private_participants_conflict')
    OR EXISTS (SELECT 1 FROM public.knowledge_graph_backfill_rejections rejection
      JOIN public.knowledge_events event ON event.id = rejection.source_id
      WHERE rejection.source_kind = 'message_event'
        AND rejection.source_digest IS DISTINCT FROM md5(jsonb_build_array(
          'message_event:v1', event.id, event.sequence_num, event.user_id, event.voyage_slug,
          event.event_type, event.source_type, event.actor_id, event.actor_type,
          public.normalize_knowledge_audience_members(coalesce(event.participants, '{}'::uuid[])),
          extract(epoch FROM event.created_at))::text))
    OR (SELECT count(*) FROM public.knowledge_graph_backfill_rejections
      WHERE source_kind = 'knowledge_edge' AND source_id IN
        (${quote(seed.eligibleEdgeId)}::uuid, ${quote(seed.unresolvedEdgeId)}::uuid)
        AND reason = 'legacy_edge_unattested'
        AND source_digest ~ '^[0-9a-f]{32}$') <> 2 THEN
    RAISE EXCEPTION 'knowledge_graph_k1_rejection_report_failed';
  END IF;
  IF (SELECT count(*) FROM public.graph_nodes WHERE authority_id IN
      (${quote(seed.ownerId)}::uuid, ${quote(seed.recipientId)}::uuid)
      AND kind IN ('person', 'voyager')) <> 4
    OR NOT EXISTS (SELECT 1 FROM public.graph_nodes WHERE kind = 'voyage'
      AND authority_id = ${quote(seed.voyageId)}::uuid)
    OR NOT EXISTS (SELECT 1 FROM public.graph_nodes WHERE kind = 'space'
      AND authority_id = ${quote(seed.spaceId)}::uuid)
    OR NOT EXISTS (SELECT 1 FROM public.graph_nodes WHERE kind = 'space'
      AND authority_id = ${quote(seed.orphanSpaceId)}::uuid)
    OR (SELECT count(*) FROM public.graph_nodes WHERE kind = 'message_event'
      AND authority_id IN (${quote(seed.eligibleSourceId)}::uuid, ${quote(seed.eligibleTargetId)}::uuid,
        ${quote(seed.voyageEventId)}::uuid, ${quote(seed.spaceEventId)}::uuid,
        ${quote(seed.orphanSpaceEventId)}::uuid)) <> 5 THEN
    RAISE EXCEPTION 'knowledge_graph_k1_identity_backfill_failed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.graph_authority_edges edge
      WHERE edge.authority_kind = 'space_member'
        AND edge.authority_row_id = ${quote(seed.orphanSpaceMemberId)}::uuid
        AND edge.kind = 'member_of' AND edge.state = 'active')
    OR EXISTS (SELECT 1 FROM public.graph_authority_edges edge
      WHERE edge.authority_kind = 'space' AND edge.authority_row_id = ${quote(seed.orphanSpaceId)}::uuid
        AND edge.kind = 'in_voyage') THEN
    RAISE EXCEPTION 'knowledge_graph_k1_personal_space_projection_failed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.graph_edges edge WHERE edge.id = ${quote(seed.eligibleEdgeId)}::uuid) THEN
    RAISE EXCEPTION 'knowledge_graph_k1_legacy_edge_canonized';
  END IF;
  v_edge := public.canonical_graph_edge_id(
    least(v_source_node, v_target_node), 'relates_to', greatest(v_source_node, v_target_node));
  INSERT INTO public.graph_edges(id, source_node_id, target_node_id, kind)
  VALUES (v_edge, least(v_source_node, v_target_node),
    greatest(v_source_node, v_target_node), 'relates_to');
  INSERT INTO public.graph_edge_evidence(edge_id, evidence_event_id)
  VALUES (v_edge, ${quote(seed.eligibleSourceId)}::uuid);
  IF NOT EXISTS (SELECT 1 FROM public.graph_edges edge
      JOIN public.graph_edge_evidence evidence ON evidence.edge_id = edge.id
      WHERE edge.id = public.canonical_graph_edge_id(least(v_source_node, v_target_node),
        'relates_to'::public.graph_edge_kind, greatest(v_source_node, v_target_node))
        AND edge.source_node_id = least(v_source_node, v_target_node)
        AND edge.target_node_id = greatest(v_source_node, v_target_node)
        AND edge.kind = 'relates_to' AND evidence.evidence_event_id = ${quote(seed.eligibleSourceId)}::uuid) THEN
    RAISE EXCEPTION 'knowledge_graph_k1_eligible_edge_parity_failed';
  END IF;
  INSERT INTO public.knowledge_events(id, event_type, user_id, voyage_slug, content,
    metadata, source_type, actor_type, participants, sequence_num)
  VALUES (${quote(seed.recoveryEventId)}::uuid, 'message', ${quote(seed.ownerId)}::uuid,
    NULL, 'K1 deployment-gap recovery', '{}'::jsonb, 'explicit', 'pipeline', NULL, -319308);
  UPDATE public.knowledge_events SET knowledge_audience_id = v_audience
    WHERE id = ${quote(seed.recoveryEventId)}::uuid;
  INSERT INTO public.graph_nodes(id, kind, authority_id, label) VALUES
    (public.canonical_graph_node_id('message_event', ${quote(seed.recoveryEventId)}::uuid),
      'message_event', ${quote(seed.recoveryEventId)}::uuid, 'K1 deployment-gap recovery');
  INSERT INTO public.graph_node_grants(node_id, knowledge_audience_id, basis_kind,
    basis_id, basis_version, label_snapshot, granted_at)
  SELECT public.canonical_graph_node_id('message_event', event.id), event.knowledge_audience_id,
    'source_event', event.id, 1, 'K1 deployment-gap recovery', event.created_at
  FROM public.knowledge_events event WHERE event.id = ${quote(seed.recoveryEventId)}::uuid;
  IF NOT EXISTS (SELECT 1 FROM public.traverse_knowledge_graph(
      public.canonical_graph_node_id('message_event', ${quote(seed.recoveryEventId)}::uuid),
      ${quote(seed.ownerId)}::uuid, 0)) THEN
    RAISE EXCEPTION 'knowledge_graph_k1_null_audience_recovery_failed';
  END IF;
  BEGIN
    UPDATE public.knowledge_events SET knowledge_audience_id = (SELECT id
      FROM public.knowledge_audiences WHERE purpose = 'source' AND scope_kind = 'voyage'
        AND scope_authority_id = ${quote(seed.voyageId)}::uuid LIMIT 1)
      WHERE id = ${quote(seed.recoveryEventId)}::uuid;
    RAISE EXCEPTION 'knowledge_graph_k1_second_audience_change_accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  IF to_regclass('public.${legacyRelation}') IS NOT NULL
    OR to_regprocedure(${quote(sixArg)}) IS NOT NULL OR to_regprocedure(${quote(nineArg)}) IS NOT NULL THEN
    RAISE EXCEPTION 'knowledge_graph_k1_old_catalogue_present';
  END IF;
  IF has_table_privilege('service_role', 'public.graph_edges', 'INSERT')
    OR has_table_privilege('service_role', 'public.graph_edge_evidence', 'INSERT') THEN
    RAISE EXCEPTION 'knowledge_graph_k1_writer_acl_failed';
  END IF;

  INSERT INTO public.knowledge_units(id, claim, source_event_id, extractor_version,
    claim_key, knowledge_audience_id) VALUES (${quote(seed.unitId)}::uuid,
    'K1 writer reaches its immutable source.', ${quote(seed.eligibleSourceId)}::uuid,
    'k1-proof', 'writer-retrieval', v_audience);
  INSERT INTO public.graph_nodes(id, kind, authority_id, label) VALUES
    (${quote(seed.unitNodeId)}::uuid, 'knowledge_unit', ${quote(seed.unitId)}::uuid, 'K1 writer unit');
  INSERT INTO public.graph_node_grants(node_id, knowledge_audience_id, basis_kind,
    basis_id, basis_version, label_snapshot, granted_at) VALUES
    (${quote(seed.unitNodeId)}::uuid, v_audience, 'source_event',
      ${quote(seed.eligibleSourceId)}::uuid, 1, 'K1 writer unit', now());
  SELECT count(*) INTO v_grant_count FROM public.graph_node_grants;
  v_edge := public.canonical_graph_edge_id(${quote(seed.unitNodeId)}::uuid,
    'derived_from', v_source_node);
  INSERT INTO public.graph_edges(id, source_node_id, target_node_id, kind)
    VALUES (v_edge, ${quote(seed.unitNodeId)}::uuid, v_source_node, 'derived_from');
  INSERT INTO public.graph_edge_evidence(edge_id, evidence_event_id)
    VALUES (v_edge, ${quote(seed.eligibleSourceId)}::uuid);
  IF v_grant_count <> (SELECT count(*) FROM public.graph_node_grants) THEN
    RAISE EXCEPTION 'knowledge_graph_link_created_grant';
  END IF;
  SELECT claim INTO v_claim FROM public.retrieve_knowledge_graph_claims('message_event',
    ${quote(seed.eligibleTargetId)}::uuid, ${quote(seed.ownerId)}::uuid, true, 4)
  WHERE knowledge_unit_id = ${quote(seed.unitId)}::uuid;
  IF v_claim IS DISTINCT FROM 'K1 writer reaches its immutable source.' THEN
    RAISE EXCEPTION 'knowledge_graph_k1_write_retrieval_failed';
  END IF;
END
$knowledge_graph_k1$;
`
}
