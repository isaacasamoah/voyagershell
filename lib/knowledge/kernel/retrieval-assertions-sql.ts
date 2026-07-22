import { GRAPH_NODE_KINDS, type KnowledgeGraphFixture } from "./contract";
import { quote, uuid, valuesSql } from "./sql";

const renderAuthorizedRoots = (fixture: KnowledgeGraphFixture): string => {
  const viewerId = fixture.viewerProfileIds.a;
  const audiences = new Map(
    fixture.audiences.map((audience) => [audience.key, audience]),
  );
  return valuesSql(
    GRAPH_NODE_KINDS.map((kind) => {
      const node = fixture.nodes.find(
        (candidate) =>
          candidate.kind === kind &&
          audiences
            .get(candidate.audienceKey)
            ?.memberProfileIds.includes(viewerId),
      );
      if (!node)
        throw new Error(`knowledge_graph_authorized_root_missing:${kind}`);
      return [
        `${quote(kind)}::public.graph_node_kind`,
        uuid(node.authorityId),
        uuid(viewerId),
      ].join(", ");
    }),
  );
};

export const renderKnowledgeGraphRetrievalAssertions = (
  fixture: KnowledgeGraphFixture,
): string => {
  const expected = fixture.expected;
  const privateEvent = fixture.events.find(
    (event) => event.id !== expected.sharedSourceEventId,
  )!;
  const privateNode = fixture.nodes.find(
    (node) => node.id === privateEvent.nodeId,
  )!;
  const sharedNode = fixture.nodes.find(
    (node) => node.authorityId === expected.sharedSourceEventId,
  )!;
  const personNode = fixture.nodes.find(
    (node) =>
      node.kind === "person" && node.authorityId === fixture.viewerProfileIds.a,
  )!;
  const roots = renderAuthorizedRoots(fixture);

  return `
DO $knowledge_graph_retrieval$
DECLARE
  v_root record; v_sample integer; v_started_at timestamptz;
  v_denied_ms numeric; v_absent_ms numeric;
BEGIN
  FOR v_root IN SELECT * FROM (VALUES
${roots}
  ) roots(kind, authority_id, viewer_id) LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.retrieve_knowledge_graph_claims(
        v_root.kind, v_root.authority_id, v_root.viewer_id, true, 4)
      WHERE knowledge_unit_id = ${uuid(fixture.units[0].id)}
        AND claim = ${quote(expected.sharedClaim)}
        AND source_event_id = ${uuid(expected.sharedSourceEventId)}
        AND source_content = ${quote(fixture.events[0].content)}
    ) THEN RAISE EXCEPTION 'knowledge_graph_six_kind_retrieval_failed:%', v_root.kind; END IF;
    IF EXISTS (SELECT 1 FROM public.retrieve_knowledge_graph_claims(
      v_root.kind, v_root.authority_id, v_root.viewer_id, false, 4)) THEN
      RAISE EXCEPTION 'knowledge_graph_off_retrieval_found_claim:%', v_root.kind; END IF;
  END LOOP;

  IF NOT EXISTS (SELECT 1 FROM public.retrieve_knowledge_graph_claims(
    'person', ${uuid(personNode.authorityId)}, ${uuid(fixture.viewerProfileIds.a)}, true, 4)
    WHERE claim = ${quote(expected.sharedClaim)} AND source_event_id = ${uuid(expected.sharedSourceEventId)}) THEN
    RAISE EXCEPTION 'knowledge_graph_on_retrieval_missed_claim'; END IF;

  FOR v_sample IN 1..5 LOOP
    v_started_at := clock_timestamp();
    PERFORM 1 FROM public.retrieve_knowledge_graph_claims(
      'message_event', ${uuid(privateNode.authorityId)}, ${uuid(fixture.viewerProfileIds.b)}, true, 4);
    v_denied_ms := extract(epoch FROM clock_timestamp() - v_started_at) * 1000;
    v_started_at := clock_timestamp();
    PERFORM 1 FROM public.retrieve_knowledge_graph_claims(
      'message_event', '61000000-0000-4000-8000-000000000099',
      ${uuid(fixture.viewerProfileIds.b)}, true, 4);
    v_absent_ms := extract(epoch FROM clock_timestamp() - v_started_at) * 1000;
    IF v_denied_ms < 70 OR v_absent_ms < 70 OR abs(v_denied_ms - v_absent_ms) > 30 THEN
      RAISE EXCEPTION 'knowledge_graph_denial_timing_class_failed:%:%', v_denied_ms, v_absent_ms;
    END IF;
  END LOOP;

  BEGIN
    UPDATE public.knowledge_events SET content = 'mutated source'
    WHERE id = ${uuid(expected.sharedSourceEventId)};
    RAISE EXCEPTION 'knowledge_graph_mutable_source_accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;

  IF EXISTS (SELECT 1 FROM public.retrieve_knowledge_graph_claims(
    'message_event', ${uuid(privateNode.authorityId)}, ${uuid(fixture.viewerProfileIds.b)}, true, 4)) THEN
    RAISE EXCEPTION 'knowledge_graph_denied_root_returned_content'; END IF;
  IF EXISTS (SELECT 1 FROM public.retrieve_knowledge_graph_claims(
    'message_event', ${uuid(sharedNode.authorityId)}, ${uuid(fixture.viewerProfileIds.b)}, true, 4)
    WHERE source_event_id = ${uuid(privateEvent.id)}) THEN
    RAISE EXCEPTION 'knowledge_graph_hidden_bridge_returned_provenance'; END IF;
END
$knowledge_graph_retrieval$;
`;
};
