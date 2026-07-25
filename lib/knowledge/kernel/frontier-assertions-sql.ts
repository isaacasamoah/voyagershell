import type { KnowledgeGraphFixture } from './contract'
import { quote, uuid } from './sql'

export const renderFrontierAssertionsSql = (fixture: KnowledgeGraphFixture): string => `
DO $knowledge_graph_dense_frontier$
DECLARE v_event uuid := ${uuid(fixture.expected.sharedSourceEventId)};
  v_audience uuid; v_created timestamptz; v_units uuid[] := '{}'::uuid[];
  v_unit uuid; v_root uuid; v_i integer; v_j integer; v_count integer; v_unique integer;
BEGIN
  SELECT knowledge_audience_id, created_at INTO STRICT v_audience, v_created
  FROM public.knowledge_events WHERE id = v_event;
  FOR v_i IN 1..12 LOOP
    v_unit := md5('oru-319-dense-frontier-unit:' || v_i::text)::uuid;
    v_units := array_append(v_units, v_unit);
    INSERT INTO public.knowledge_units(id, claim, source_event_id, extractor_version,
      claim_key, knowledge_audience_id) VALUES (v_unit,
      ${quote('Dense frontier claim ')} || v_i::text, v_event, 'frontier-proof',
      v_i::text, v_audience);
    INSERT INTO public.graph_nodes(id, kind, authority_id, label) VALUES
      (public.canonical_graph_node_id('knowledge_unit', v_unit), 'knowledge_unit',
        v_unit, ${quote('Dense frontier node ')} || v_i::text);
    INSERT INTO public.graph_node_grants(node_id, knowledge_audience_id, basis_kind,
      basis_id, basis_version, label_snapshot, granted_at) VALUES
      (public.canonical_graph_node_id('knowledge_unit', v_unit), v_audience,
        'source_event', v_event, 1, ${quote('Dense frontier node ')} || v_i::text, v_created);
  END LOOP;
  FOR v_i IN 1..11 LOOP
    FOR v_j IN (v_i + 1)..12 LOOP
      PERFORM public.write_knowledge_graph_edge('knowledge_unit', v_units[v_i],
        'knowledge_unit', v_units[v_j], 'relates_to');
    END LOOP;
  END LOOP;
  v_root := public.canonical_graph_node_id('knowledge_unit', v_units[1]);
  PERFORM set_config('statement_timeout', '750ms', true);
  SELECT count(*), count(DISTINCT traversed.node_id) INTO v_count, v_unique
  FROM public.traverse_knowledge_graph(v_root, ${uuid(fixture.viewerProfileIds.a)},
    8, ARRAY['relates_to']::public.graph_edge_kind[], 64, 32) traversed;
  IF v_count <> 12 OR v_unique <> 12 THEN
    RAISE EXCEPTION 'knowledge_graph_dense_frontier_not_unique:%:%', v_count, v_unique;
  END IF;
  BEGIN
    PERFORM 1 FROM public.traverse_knowledge_graph(v_root,
      ${uuid(fixture.viewerProfileIds.a)}, 8,
      ARRAY['relates_to']::public.graph_edge_kind[], 64, 4);
    RAISE EXCEPTION 'knowledge_graph_frontier_budget_not_enforced';
  EXCEPTION WHEN program_limit_exceeded THEN NULL;
  END;
  PERFORM set_config('statement_timeout', '90s', true);
END
$knowledge_graph_dense_frontier$;
`
