import { GRAPH_EDGE_KINDS, GRAPH_NODE_KINDS, type KnowledgeGraphFixture } from './contract'
import { hashExpression, quote, uuid, uuidArray } from './sql'

export const renderKnowledgeGraphAssertions = (fixture: KnowledgeGraphFixture): string => {
  const expected = fixture.expected
  const audiences = new Map(fixture.audiences.map((audience) => [audience.key, audience]))
  const nodeIds = uuidArray(fixture.nodes.map((node) => node.id))
  const edgeIds = uuidArray(fixture.edges.map((edge) => edge.id))
  const audienceIds = uuidArray(fixture.audiences.map((audience) => audience.id))
  const personA = fixture.nodes.find((node) => node.kind === 'person'
    && node.authorityId === fixture.viewerProfileIds.a)!
  const redMessage = fixture.events.find((event) => event.id === expected.sharedSourceEventId)!
  const privateMessage = fixture.events.find((event) => event.audienceKey === 'private-a')!
  const blueMessage = fixture.events.find((event) => event.audienceKey === 'blue-source')!
  const privateUnit = fixture.units.find((unit) => unit.audienceKey === 'private-a')!
  const negative = fixture.negativeSourceEvent
  const allNodeKinds = GRAPH_NODE_KINDS.map(quote).join(', ')
  const allEdgeKinds = GRAPH_EDGE_KINDS.map(quote).join(', ')
  return `
DO $knowledge_graph_base$
BEGIN
  IF (SELECT count(*) FROM public.graph_nodes WHERE id = ANY(${nodeIds})) <> ${expected.nodeCount}
    OR (SELECT count(*) FROM public.graph_edges WHERE id = ANY(${edgeIds})) <> ${expected.historicalEdgeCount}
    OR (SELECT count(*) FROM public.graph_edge_evidence WHERE edge_id = ANY(${edgeIds})) <>
      ${fixture.edges.reduce((count, edge) => count + edge.evidenceEventIds.length, 0)}
    OR (SELECT count(*) FROM public.knowledge_audiences WHERE id = ANY(${audienceIds})) <>
      ${expected.sourceAudienceCount} THEN
    RAISE EXCEPTION 'knowledge_graph_canonical_counts_failed'; END IF;
  IF EXISTS (SELECT 1 FROM public.graph_edges edge WHERE edge.id = ANY(${edgeIds})
      AND NOT EXISTS (SELECT 1 FROM public.graph_edge_evidence evidence WHERE evidence.edge_id = edge.id)) THEN
    RAISE EXCEPTION 'knowledge_graph_edge_without_evidence'; END IF;
  IF EXISTS (SELECT 1 FROM public.space_members member WHERE member.space_id IN
      (${uuid(fixture.authorityScenario.redSpaceId)}, ${uuid(fixture.authorityScenario.blueSpaceId)})
      AND member.id IS DISTINCT FROM public.canonical_space_member_id(
        member.space_id, member.user_id)) THEN
    RAISE EXCEPTION 'knowledge_graph_space_member_id_not_canonical'; END IF;
  IF EXISTS (SELECT 1 FROM public.graph_authority_edges edge
      WHERE edge.id <> public.canonical_graph_authority_edge_id(
        edge.authority_kind, edge.authority_row_id, edge.kind)) THEN
    RAISE EXCEPTION 'knowledge_graph_authority_edge_id_not_canonical'; END IF;
  IF (SELECT events_hash FROM knowledge_graph_projection_snapshot) IS DISTINCT FROM ${hashExpression('events', fixture)}
    OR (SELECT units_hash FROM knowledge_graph_projection_snapshot) IS DISTINCT FROM ${hashExpression('units', fixture)}
    OR (SELECT nodes_hash FROM knowledge_graph_projection_snapshot) IS DISTINCT FROM ${hashExpression('nodes', fixture)}
    OR (SELECT edges_hash FROM knowledge_graph_projection_snapshot) IS DISTINCT FROM ${hashExpression('edges', fixture)}
    OR (SELECT grants_hash FROM knowledge_graph_projection_snapshot) IS DISTINCT FROM ${hashExpression('grants', fixture)}
    OR (SELECT authority_edges_hash FROM knowledge_graph_projection_snapshot)
      IS DISTINCT FROM ${hashExpression('authorityEdges', fixture)} THEN
    RAISE EXCEPTION 'knowledge_graph_idempotent_projection_failed'; END IF;
  IF (SELECT array_agg(DISTINCT kind ORDER BY kind) FROM public.graph_nodes WHERE id = ANY(${nodeIds}))
      IS DISTINCT FROM ARRAY[${allNodeKinds}]::public.graph_node_kind[] THEN
    RAISE EXCEPTION 'knowledge_graph_six_kinds_failed'; END IF;
  IF (SELECT array_agg(DISTINCT kind ORDER BY kind) FROM (
      SELECT kind FROM public.graph_edges WHERE id = ANY(${edgeIds})
      UNION ALL SELECT kind FROM public.graph_authority_edges) kinds)
      IS DISTINCT FROM ARRAY[${allEdgeKinds}]::public.graph_edge_kind[] THEN
    RAISE EXCEPTION 'knowledge_graph_sixteen_kinds_failed'; END IF;
  IF EXISTS (SELECT 1 FROM public.knowledge_events event
    JOIN public.knowledge_audiences audience ON audience.id = event.knowledge_audience_id
    WHERE event.id = ANY(${uuidArray(fixture.events.map((event) => event.id))})
      AND (event.participants IS NOT NULL OR audience.purpose <> 'source')) THEN
    RAISE EXCEPTION 'knowledge_graph_ledger_or_source_audience_invalid'; END IF;

  IF EXISTS (SELECT 1 FROM public.traverse_knowledge_graph(${uuid(personA.id)},
      ${uuid(fixture.viewerProfileIds.b)}, 8) WHERE node_id IN
      (${uuid(blueMessage.nodeId)}, ${uuid(fixture.nodes.find((node) => node.kind === 'space'
        && node.authorityId === fixture.authorityScenario.blueSpaceId)!.id)})) THEN
    RAISE EXCEPTION 'knowledge_graph_red_viewer_blue_leak'; END IF;
  IF EXISTS (SELECT 1 FROM public.traverse_knowledge_graph(${uuid(personA.id)},
      ${uuid(fixture.viewerProfileIds.c)}, 8) WHERE node_id IN
      (${uuid(redMessage.nodeId)}, ${uuid(fixture.nodes.find((node) => node.kind === 'space'
        && node.authorityId === fixture.authorityScenario.redSpaceId)!.id)})) THEN
    RAISE EXCEPTION 'knowledge_graph_blue_viewer_red_leak'; END IF;
  IF EXISTS (SELECT 1 FROM public.traverse_knowledge_graph(${uuid(redMessage.nodeId)},
      ${uuid(fixture.viewerProfileIds.b)}, 3, ARRAY['reply_to']::public.graph_edge_kind[])
      WHERE node_id = ${uuid(privateMessage.nodeId)}) THEN
    RAISE EXCEPTION 'knowledge_graph_hidden_bridge_leaked'; END IF;
  IF EXISTS (SELECT 1 FROM public.traverse_knowledge_graph(${uuid(privateMessage.nodeId)},
      ${uuid(fixture.viewerProfileIds.b)}, 8)) THEN
    RAISE EXCEPTION 'knowledge_graph_root_denial_failed'; END IF;
  IF EXISTS (SELECT 1 FROM public.traverse_knowledge_graph(${uuid(personA.id)}, NULL::uuid, 8)) THEN
    RAISE EXCEPTION 'knowledge_graph_null_viewer_leak'; END IF;
END
$knowledge_graph_base$;

DO $knowledge_graph_negative$
BEGIN
  BEGIN
    INSERT INTO public.space_members(id, space_id, user_id, state) VALUES
      ('93000000-0000-4000-8000-000000000001', ${uuid(fixture.authorityScenario.redSpaceId)},
        ${uuid(fixture.viewerProfileIds.a)}, 'active');
    RAISE EXCEPTION 'knowledge_graph_explicit_space_member_id_accepted';
  EXCEPTION WHEN SQLSTATE '428C9' THEN NULL; END;
  BEGIN
    INSERT INTO public.knowledge_audiences(id, purpose, scope_kind, scope_authority_id,
      member_profile_ids) VALUES ('12000000-0000-4000-8000-000000000002', 'source', 'private',
      ${uuid(fixture.viewerProfileIds.a)}, ARRAY[${uuid(fixture.viewerProfileIds.a)}]);
    RAISE EXCEPTION 'knowledge_graph_nondeterministic_audience_accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.knowledge_events(id, event_type, user_id, voyage_slug, content,
      metadata, source_type, actor_type, participants, knowledge_audience_id, sequence_num)
    VALUES ('61000000-0000-4000-8000-000000000007', 'message',
      ${uuid(fixture.viewerProfileIds.a)}, 'oru-319-red', 'canonical node negative control',
      '{}'::jsonb, 'explicit', 'pipeline', NULL,
      ${uuid(audiences.get(expected.sharedAudienceKey)!.id)}, -319198);
    INSERT INTO public.graph_nodes(id, kind, authority_id, label) VALUES
      ('62000000-0000-4000-8000-000000000001', 'message_event',
        '61000000-0000-4000-8000-000000000007', 'wrong physical id');
    RAISE EXCEPTION 'knowledge_graph_nondeterministic_node_accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.knowledge_audiences(id, purpose, scope_kind, scope_authority_id, member_profile_ids)
    VALUES ('12000000-0000-4000-8000-000000000001', 'source', 'space',
      ${uuid(fixture.authorityScenario.redSpaceId)}, NULL);
    RAISE EXCEPTION 'knowledge_graph_null_members_accepted';
  EXCEPTION WHEN not_null_violation OR check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.knowledge_units(id, claim, source_event_id, extractor_version,
      claim_key, knowledge_audience_id) VALUES
      ('72000000-0000-4000-8000-000000000002', 'wrong audience', ${uuid(privateMessage.id)},
      'fixture-v2', 'wrong-audience', ${uuid(audiences.get(expected.sharedAudienceKey)!.id)});
    RAISE EXCEPTION 'knowledge_graph_mismatched_provenance_accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.graph_node_grants(node_id, knowledge_audience_id, basis_kind,
      basis_id, basis_version, label_snapshot, granted_at) VALUES
      (${uuid(personA.id)}, ${uuid(audiences.get(expected.sharedAudienceKey)!.id)}, 'source_event',
        ${uuid(redMessage.id)}, 1, 'Vanessa Vale', now());
    RAISE EXCEPTION 'knowledge_graph_structural_source_grant_accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.graph_node_grants(node_id, knowledge_audience_id, basis_kind,
      basis_id, basis_version, label_snapshot, granted_at) VALUES
      (${uuid(redMessage.nodeId)}, ${uuid(audiences.get(expected.sharedAudienceKey)!.id)}, 'source_event',
        ${uuid(privateMessage.id)}, 1, 'Red pre-leave source', now());
    RAISE EXCEPTION 'knowledge_graph_content_event_mismatch_accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.graph_node_grants(node_id, knowledge_audience_id, basis_kind,
      basis_id, basis_version, label_snapshot, granted_at, basis_event_id) VALUES
      (${uuid(redMessage.nodeId)}, ${uuid(audiences.get(expected.sharedAudienceKey)!.id)},
        'edge_evidence', ${uuid(fixture.edges.find((edge) => edge.kind === 'authored_by'
          && edge.evidenceEventIds.includes(redMessage.id))!.id)}, 1,
        'Red pre-leave source', now(), ${uuid(redMessage.id)});
    RAISE EXCEPTION 'knowledge_graph_content_edge_evidence_grant_accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.graph_node_grants(node_id, knowledge_audience_id, basis_kind,
      basis_id, basis_version, label_snapshot, granted_at, basis_event_id) VALUES
      (${uuid(personA.id)}, ${uuid(audiences.get(expected.sharedAudienceKey)!.id)}, 'edge_evidence',
        ${uuid(fixture.edges.find((edge) => edge.evidenceEventIds.includes(blueMessage.id)
          && [edge.sourceNodeId, edge.targetNodeId].includes(personA.id))!.id)}, 1,
        'Vanessa Vale', now(), ${uuid(blueMessage.id)});
    RAISE EXCEPTION 'knowledge_graph_cross_audience_evidence_grant_accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.graph_edge_evidence(edge_id, evidence_event_id) VALUES
      (${uuid(fixture.edges.find((edge) => edge.kind === 'authored_by'
        && edge.evidenceEventIds.includes(redMessage.id))!.id)}, ${uuid(blueMessage.id)});
    RAISE EXCEPTION 'knowledge_graph_unbound_edge_evidence_accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.knowledge_units SET source_event_id = ${uuid(privateMessage.id)}
    WHERE id = ${uuid(fixture.units.find((unit) => unit.nodeId === expected.sharedUnitNodeId)!.id)};
    RAISE EXCEPTION 'knowledge_graph_mutable_provenance_accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE public.knowledge_audiences SET member_profile_ids = ARRAY[${uuid(fixture.viewerProfileIds.a)}]
    WHERE id = ${uuid(audiences.get(expected.sharedAudienceKey)!.id)};
    RAISE EXCEPTION 'knowledge_graph_mutable_audience_accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.graph_edges(id, source_node_id, target_node_id, kind)
    VALUES (public.canonical_graph_edge_id(${uuid(personA.id)}, 'authored_by',
      ${uuid(redMessage.nodeId)}), ${uuid(personA.id)}, ${uuid(redMessage.nodeId)}, 'authored_by');
    RAISE EXCEPTION 'knowledge_graph_reversed_edge_accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.graph_edges(id, source_node_id, target_node_id, kind)
    VALUES ('82000000-0000-4000-8000-000000000002', ${uuid(privateUnit.nodeId)},
      ${uuid(personA.id)}, 'relates_to');
    RAISE EXCEPTION 'knowledge_graph_nondeterministic_edge_accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  INSERT INTO public.knowledge_events(id, event_type, user_id, voyage_slug, content,
    metadata, source_type, actor_type, participants, knowledge_audience_id, sequence_num)
  VALUES (${uuid(negative.id)}, 'message', NULL, 'oru-319-red', ${quote(negative.content)},
    '{}'::jsonb, 'explicit', 'pipeline', NULL, NULL, -319199);
  BEGIN
    INSERT INTO public.graph_nodes(id, kind, authority_id, label)
    VALUES (${uuid(negative.attemptedNodeId)}, 'message_event', ${uuid(negative.id)}, 'must fail closed');
    RAISE EXCEPTION 'knowledge_graph_null_source_audience_accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF EXISTS (SELECT 1 FROM public.graph_nodes WHERE authority_id = ${uuid(negative.id)}) THEN
    RAISE EXCEPTION 'knowledge_graph_null_source_entered_graph'; END IF;
END
$knowledge_graph_negative$;
`
}
