import { canonicalKnowledgeAudienceId } from './canonical-ids'
import type { KnowledgeGraphFixture } from './contract'
import { uuid } from './sql'

export const renderGraphAclAssertionsSql = (fixture: KnowledgeGraphFixture): string => {
  const scenario = fixture.authorityScenario
  const ids = fixture.viewerProfileIds
  const personNode = fixture.nodes.find((node) => node.kind === 'person'
    && node.authorityId === scenario.crossScopePersonId)!
  const postAudience = canonicalKnowledgeAudienceId('source', 'space', scenario.redSpaceId,
    [ids.a, ids.b, ids.d])
  return `
SET LOCAL ROLE service_role;
DO $allowed_writer$
DECLARE v_written boolean;
BEGIN
  v_written := public.write_knowledge_graph_edge('message_event',
    ${uuid(fixture.expected.sharedSourceEventId)}, 'person',
    ${uuid(scenario.crossScopePersonId)}, 'authored_by');
  IF v_written IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'knowledge_graph_service_writer_returned_false'; END IF;
END
$allowed_writer$;
DO $authority_tamper$
DECLARE v_table text; v_privilege text;
BEGIN
  FOR v_table IN SELECT unnest(ARRAY['knowledge_audiences', 'knowledge_units', 'graph_nodes',
      'graph_node_grants', 'graph_edges', 'graph_edge_evidence', 'graph_authority_edges',
      'knowledge_graph_backfill_rejections']) LOOP
    FOREACH v_privilege IN ARRAY ARRAY['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] LOOP
      IF has_table_privilege('service_role', format('public.%I', v_table), v_privilege) THEN
        RAISE EXCEPTION 'knowledge_graph_service_mutation_privilege:%:%', v_table, v_privilege; END IF;
    END LOOP;
  END LOOP;
  BEGIN PERFORM public.project_profile_graph_authority(${uuid(scenario.crossScopePersonId)});
    RAISE EXCEPTION 'knowledge_graph_projection_function_execute_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.graph_authority_edges SET authority_revision = authority_revision + 99;
    RAISE EXCEPTION 'knowledge_graph_authority_tamper_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.graph_nodes SET label = 'forged registry label' WHERE id = ${uuid(personNode.id)};
    RAISE EXCEPTION 'knowledge_graph_registry_label_tamper_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN INSERT INTO public.graph_node_grants(node_id, knowledge_audience_id, basis_kind,
      basis_id, basis_version, label_snapshot, granted_at) VALUES
    (${uuid(personNode.id)}, ${uuid(postAudience)}, 'source_event',
      ${uuid(scenario.postRejoinEventId)}, 99, 'forged', now());
    RAISE EXCEPTION 'knowledge_graph_grant_tamper_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM public.graph_edges; RAISE EXCEPTION 'knowledge_graph_service_delete_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN TRUNCATE public.graph_edges; RAISE EXCEPTION 'knowledge_graph_service_truncate_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN TRUNCATE public.graph_edges CASCADE;
    RAISE EXCEPTION 'knowledge_graph_service_truncate_cascade_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$authority_tamper$;
RESET ROLE;
`
}
