import type { KnowledgeGraphFixture } from './contract'
import { hashExpression, quote, textArray, uuid, uuidArray } from './sql'

const graphKinds = (fixture: KnowledgeGraphFixture): string =>
  fixture.nodes
    .map((node) => node.kind)
    .filter((kind, index, kinds) => kinds.indexOf(kind) === index)
    .map(quote)
    .join(', ')

const renderNegativeAssertions = (
  fixture: KnowledgeGraphFixture,
  audiences: Map<string, KnowledgeGraphFixture['audiences'][number]>,
  personA: KnowledgeGraphFixture['nodes'][number],
  privateMessage: KnowledgeGraphFixture['events'][number],
  privateUnit: KnowledgeGraphFixture['units'][number],
): string => {
  const expected = fixture.expected
  const negative = fixture.negativeSourceEvent
  return `
DO $knowledge_graph_negative$
BEGIN
  BEGIN
    INSERT INTO public.knowledge_audiences
      (id, scope_kind, scope_authority_id, member_profile_ids)
    VALUES ('12000000-0000-4000-8000-000000000001', 'voyage',
      ${uuid(fixture.nodes.find((node) => node.kind === 'voyage')!.authorityId)}, NULL);
    RAISE EXCEPTION 'knowledge_graph_null_members_accepted';
  EXCEPTION WHEN not_null_violation OR check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.graph_nodes (id, kind, authority_id, label, knowledge_audience_id)
    VALUES ('72000000-0000-4000-8000-000000000001', 'knowledge_unit',
      '72000000-0000-4000-8000-000000000011', 'invalid', NULL);
    RAISE EXCEPTION 'knowledge_graph_null_audience_accepted';
  EXCEPTION WHEN not_null_violation OR check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.knowledge_units
      (id, claim, source_event_id, extractor_version, claim_key, knowledge_audience_id)
    VALUES ('72000000-0000-4000-8000-000000000002', 'wrong audience',
      ${uuid(privateMessage.id)}, 'fixture-v1', 'wrong-audience',
      ${uuid(audiences.get(expected.sharedAudienceKey)!.id)});
    RAISE EXCEPTION 'knowledge_graph_mismatched_provenance_accepted';
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
    INSERT INTO public.graph_edges (source_node_id, target_node_id, kind, knowledge_audience_id)
    VALUES (${uuid(personA.id)}, ${uuid(fixture.events[0].nodeId)}, 'authored_by',
      ${uuid(audiences.get(expected.sharedAudienceKey)!.id)});
    RAISE EXCEPTION 'knowledge_graph_reversed_edge_accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.graph_edges (source_node_id, target_node_id, kind, knowledge_audience_id)
    VALUES (${uuid(privateUnit.nodeId)}, ${uuid(personA.id)}, 'relates_to',
      ${uuid(audiences.get(privateUnit.audienceKey)!.id)});
    RAISE EXCEPTION 'knowledge_graph_nondeterministic_symmetric_edge_accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  INSERT INTO public.knowledge_events
    (id, event_type, user_id, voyage_slug, content, metadata, source_type,
      actor_type, participants, knowledge_audience_id)
  VALUES (${uuid(negative.id)}, 'message', NULL, 'oru-319-knowledge-graph-fixture',
    ${quote(negative.content)}, '{}'::jsonb, 'explicit', 'pipeline',
    ${uuidArray([fixture.viewerProfileIds.a, fixture.viewerProfileIds.b])}, NULL);
  BEGIN
    INSERT INTO public.graph_nodes (id, kind, authority_id, label, knowledge_audience_id)
    VALUES (${uuid(negative.attemptedNodeId)}, 'message_event', ${uuid(negative.id)},
      'must fail closed', ${uuid(audiences.get(expected.sharedAudienceKey)!.id)});
    RAISE EXCEPTION 'knowledge_graph_null_source_audience_accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  IF EXISTS (SELECT 1 FROM public.graph_nodes WHERE authority_id = ${uuid(negative.id)})
    OR EXISTS (SELECT 1 FROM public.traverse_knowledge_graph(
      ${uuid(negative.attemptedNodeId)}, ${uuid(fixture.viewerProfileIds.a)}, 4)) THEN
    RAISE EXCEPTION 'knowledge_graph_null_source_entered_traversal';
  END IF;
END
$knowledge_graph_negative$;
`
}

export const renderKnowledgeGraphAssertions = (fixture: KnowledgeGraphFixture): string => {
  const expected = fixture.expected
  const audiences = new Map(fixture.audiences.map((audience) => [audience.key, audience]))
  const personA = fixture.nodes.find(
    (node) => node.kind === 'person' && node.authorityId === fixture.viewerProfileIds.a,
  )!
  const sharedMessage = fixture.events.find((event) => event.id === expected.sharedSourceEventId)!
  const privateMessage = fixture.events.find((event) => event.id !== expected.sharedSourceEventId)!
  const privateUnit = fixture.units.find((unit) => unit.nodeId !== expected.sharedUnitNodeId)!
  const bridgeKinds = `ARRAY['reply_to', 'about']::public.graph_edge_kind[]`
  const allKinds = `ARRAY[${graphKinds(fixture)}]::public.graph_node_kind[]`
  const identity = `format('%s:%s', kind, authority_id)`

  return `
DO $knowledge_graph_assert$
DECLARE v_actual text[]; v_source uuid; v_claim text; v_audience uuid;
BEGIN
  IF (SELECT count(*) FROM public.graph_nodes) <> ${expected.nodeCount}
    OR (SELECT count(*) FROM public.graph_edges) <> ${expected.edgeCount}
    OR (SELECT count(*) FROM public.knowledge_units) <> ${fixture.units.length}
    OR (SELECT count(*) FROM public.knowledge_audiences) <> ${expected.audienceCount} THEN
    RAISE EXCEPTION 'knowledge_graph_canonical_counts_failed';
  END IF;
  IF (SELECT events_hash FROM knowledge_graph_projection_snapshot) IS DISTINCT FROM ${hashExpression('events', fixture)}
    OR (SELECT units_hash FROM knowledge_graph_projection_snapshot) IS DISTINCT FROM ${hashExpression('units', fixture)}
    OR (SELECT nodes_hash FROM knowledge_graph_projection_snapshot) IS DISTINCT FROM ${hashExpression('nodes', fixture)}
    OR (SELECT edges_hash FROM knowledge_graph_projection_snapshot) IS DISTINCT FROM ${hashExpression('edges', fixture)} THEN
    RAISE EXCEPTION 'knowledge_graph_idempotent_projection_failed';
  END IF;
  IF (SELECT array_agg(DISTINCT kind ORDER BY kind) FROM public.graph_nodes)
    IS DISTINCT FROM ${allKinds} THEN RAISE EXCEPTION 'knowledge_graph_six_kinds_failed'; END IF;
  IF (SELECT count(*) FROM public.knowledge_events
    WHERE id = ANY(${uuidArray(fixture.events.map((event) => event.id))})
      AND knowledge_audience_id IS NOT NULL AND participants IS NULL) <> 2 THEN
    RAISE EXCEPTION 'knowledge_graph_existing_ledger_rows_invalid';
  END IF;

  SELECT array_agg(${identity} ORDER BY depth, kind, authority_id) INTO v_actual
  FROM public.traverse_knowledge_graph(${uuid(personA.id)}, ${uuid(fixture.viewerProfileIds.a)}, 4);
  IF v_actual IS DISTINCT FROM ${textArray(expected.viewerAAllGraphIdentities)} THEN
    RAISE EXCEPTION 'knowledge_graph_owner_matrix_failed: %', v_actual; END IF;
  SELECT array_agg(${identity} ORDER BY depth, kind, authority_id) INTO v_actual
  FROM public.traverse_knowledge_graph(${uuid(personA.id)}, ${uuid(fixture.viewerProfileIds.b)}, 4);
  IF v_actual IS DISTINCT FROM ${textArray(expected.viewerBAllGraphIdentities)} THEN
    RAISE EXCEPTION 'knowledge_graph_victim_matrix_failed: %', v_actual; END IF;
  IF EXISTS (SELECT 1 FROM public.traverse_knowledge_graph(
    ${uuid(personA.id)}, ${uuid(fixture.viewerProfileIds.b)}, 4)
    WHERE node_id = ANY(${uuidArray(expected.privateNodeIds)})) THEN
    RAISE EXCEPTION 'knowledge_graph_victim_private_leak'; END IF;

  SELECT array_agg(${identity} ORDER BY depth, kind, authority_id) INTO v_actual
  FROM public.traverse_knowledge_graph(${uuid(sharedMessage.nodeId)},
    ${uuid(fixture.viewerProfileIds.a)}, 2, ${bridgeKinds});
  IF v_actual IS DISTINCT FROM ${textArray(expected.ownerBridgeIdentities)} THEN
    RAISE EXCEPTION 'knowledge_graph_owner_bridge_control_failed: %', v_actual; END IF;
  SELECT array_agg(${identity} ORDER BY depth, kind, authority_id) INTO v_actual
  FROM public.traverse_knowledge_graph(${uuid(sharedMessage.nodeId)},
    ${uuid(fixture.viewerProfileIds.b)}, 2, ${bridgeKinds});
  IF v_actual IS DISTINCT FROM ${textArray(expected.victimBridgeIdentities)} THEN
    RAISE EXCEPTION 'knowledge_graph_hidden_bridge_leaked: %', v_actual; END IF;
  SELECT coalesce(array_agg(${identity} ORDER BY depth, kind, authority_id), ARRAY[]::text[])
    INTO v_actual FROM public.traverse_knowledge_graph(${uuid(privateMessage.nodeId)},
      ${uuid(fixture.viewerProfileIds.b)}, 4);
  IF v_actual IS DISTINCT FROM ${textArray(expected.rootDeniedIdentities)} THEN
    RAISE EXCEPTION 'knowledge_graph_root_denial_failed: %', v_actual; END IF;

  SELECT u.source_event_id, u.claim, u.knowledge_audience_id INTO v_source, v_claim, v_audience
  FROM public.traverse_knowledge_graph(${uuid(personA.id)}, ${uuid(fixture.viewerProfileIds.b)}, 4) t
  JOIN public.knowledge_units u ON u.id = t.authority_id
  WHERE t.node_id = ${uuid(expected.sharedUnitNodeId)};
  IF v_source IS DISTINCT FROM ${uuid(expected.sharedSourceEventId)}
    OR v_claim IS DISTINCT FROM ${quote(expected.sharedClaim)}
    OR v_audience IS DISTINCT FROM ${uuid(audiences.get(expected.sharedAudienceKey)!.id)} THEN
    RAISE EXCEPTION 'knowledge_graph_on_provenance_failed'; END IF;
  SELECT array_agg(${identity} ORDER BY kind, authority_id) INTO v_actual
  FROM public.traverse_knowledge_graph(${uuid(personA.id)}, ${uuid(fixture.viewerProfileIds.a)}, 4,
    ARRAY[]::public.graph_edge_kind[]);
  IF v_actual IS DISTINCT FROM ${textArray(expected.graphOffIdentities)} THEN
    RAISE EXCEPTION 'knowledge_graph_off_control_failed'; END IF;
  IF EXISTS (SELECT 1 FROM public.traverse_knowledge_graph(
    ${uuid(personA.id)}, NULL::uuid, 4)) THEN RAISE EXCEPTION 'knowledge_graph_null_viewer_leak'; END IF;
END
$knowledge_graph_assert$;
${renderNegativeAssertions(fixture, audiences, personA, privateMessage, privateUnit)}
`
}
