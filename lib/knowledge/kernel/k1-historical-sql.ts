import type { K1FixtureSeed } from './k1-fixture-seed'
import { quote, uuid } from './sql'

const members = (values: readonly string[]): string =>
  `public.normalize_knowledge_audience_members(ARRAY[${values.map(uuid).join(', ')}])`

export const renderK1HistoricalSetupSql = (seed: K1FixtureSeed): string => `
-- Historical room sources remain governed by their immutable event-time audience.
INSERT INTO auth.users(id, email, raw_user_meta_data, created_at) VALUES
  (${uuid(seed.childFormerId)}, ${quote(`child-${seed.childFormerId}@example.invalid`)},
    '{"display_name":"Child former"}', now()),
  (${uuid(seed.parentFormerId)}, ${quote(`parent-${seed.parentFormerId}@example.invalid`)},
    '{"display_name":"Parent former"}', now()),
  (${uuid(seed.laterMemberId)}, ${quote(`later-${seed.laterMemberId}@example.invalid`)},
    '{"display_name":"Later member"}', now());
INSERT INTO public.voyage_members(id, voyage_id, user_id, role) VALUES
  (${uuid(seed.childFormerVoyageMemberId)}, ${uuid(seed.voyageId)}, ${uuid(seed.childFormerId)}, 'crew'),
  (${uuid(seed.parentFormerVoyageMemberId)}, ${uuid(seed.voyageId)}, ${uuid(seed.parentFormerId)}, 'crew'),
  (${uuid(seed.laterVoyageMemberId)}, ${uuid(seed.voyageId)}, ${uuid(seed.laterMemberId)}, 'crew');
INSERT INTO public.space_members(space_id, user_id, state) VALUES
  (${uuid(seed.spaceId)}, ${uuid(seed.childFormerId)}, 'active'),
  (${uuid(seed.spaceId)}, ${uuid(seed.parentFormerId)}, 'active'),
  (${uuid(seed.spaceId)}, ${uuid(seed.laterMemberId)}, 'active');
INSERT INTO public.knowledge_events(id, event_type, user_id, voyage_slug, content,
  metadata, source_type, actor_type, participants, sequence_num) VALUES
  (${uuid(seed.childHistoricalEventId)}, 'message', ${uuid(seed.ownerId)},
    ${quote(`voyager-k1-${seed.voyageId}`)}, 'K1 child-left historical source',
    ${quote(JSON.stringify({ session_id: seed.sessionId }))}::jsonb, 'explicit', 'pipeline',
    ARRAY[${uuid(seed.ownerId)}, ${uuid(seed.childFormerId)}], -319311),
  (${uuid(seed.parentHistoricalEventId)}, 'message', ${uuid(seed.ownerId)},
    ${quote(`voyager-k1-${seed.voyageId}`)}, 'K1 parent-left historical source',
    ${quote(JSON.stringify({ session_id: seed.sessionId }))}::jsonb, 'explicit', 'pipeline',
    ARRAY[${uuid(seed.ownerId)}, ${uuid(seed.parentFormerId)}], -319312);
UPDATE public.space_members SET state = 'left'
WHERE id = ${uuid(seed.childFormerSpaceMemberId)};
UPDATE public.voyage_members SET state = 'left'
WHERE id = ${uuid(seed.parentFormerVoyageMemberId)};
`

export const renderK1HistoricalAssertionsSql = (seed: K1FixtureSeed): string => `
DO $k1_historical_membership$
DECLARE
  v_child_audience uuid;
  v_parent_audience uuid;
  v_child_created timestamptz;
  v_parent_created timestamptz;
BEGIN
  SELECT knowledge_audience_id, created_at INTO STRICT v_child_audience, v_child_created
    FROM public.knowledge_events
    WHERE id = ${uuid(seed.childHistoricalEventId)};
  SELECT knowledge_audience_id, created_at INTO STRICT v_parent_audience, v_parent_created
    FROM public.knowledge_events
    WHERE id = ${uuid(seed.parentHistoricalEventId)};
  IF v_child_audience IS NULL OR v_parent_audience IS NULL
    OR (SELECT member_profile_ids FROM public.knowledge_audiences
      WHERE id = v_child_audience) <> ${members([seed.ownerId, seed.childFormerId])}
    OR (SELECT member_profile_ids FROM public.knowledge_audiences
      WHERE id = v_parent_audience) <> ${members([seed.ownerId, seed.parentFormerId])}
    OR (SELECT state FROM public.space_members
      WHERE id = ${uuid(seed.childFormerSpaceMemberId)}) <> 'left'
    OR (SELECT state FROM public.voyage_members
      WHERE id = ${uuid(seed.childFormerVoyageMemberId)}) <> 'active'
    OR (SELECT state FROM public.voyage_members
      WHERE id = ${uuid(seed.parentFormerVoyageMemberId)}) <> 'left'
    OR (SELECT state FROM public.space_members
      WHERE id = ${uuid(seed.parentFormerSpaceMemberId)}) <> 'left' THEN
    RAISE EXCEPTION 'knowledge_graph_historical_cutover_state_failed';
  END IF;
  INSERT INTO public.knowledge_units(id, claim, source_event_id, extractor_version,
    claim_key, knowledge_audience_id) VALUES
    (${uuid(seed.childHistoricalUnitId)}, 'Child leave preserves event-time access.',
      ${uuid(seed.childHistoricalEventId)}, 'k1-history', 'child-left', v_child_audience),
    (${uuid(seed.parentHistoricalUnitId)}, 'Parent leave preserves event-time access.',
      ${uuid(seed.parentHistoricalEventId)}, 'k1-history', 'parent-left', v_parent_audience);
  INSERT INTO public.graph_nodes(id, kind, authority_id, label) VALUES
    (public.canonical_graph_node_id('knowledge_unit', ${uuid(seed.childHistoricalUnitId)}),
      'knowledge_unit', ${uuid(seed.childHistoricalUnitId)}, 'K1 child-left historical claim'),
    (public.canonical_graph_node_id('knowledge_unit', ${uuid(seed.parentHistoricalUnitId)}),
      'knowledge_unit', ${uuid(seed.parentHistoricalUnitId)}, 'K1 parent-left historical claim');
  INSERT INTO public.graph_node_grants(node_id, knowledge_audience_id, basis_kind,
    basis_id, basis_version, label_snapshot, granted_at) VALUES
    (public.canonical_graph_node_id('knowledge_unit', ${uuid(seed.childHistoricalUnitId)}),
      v_child_audience, 'source_event', ${uuid(seed.childHistoricalEventId)}, 1,
      'K1 child-left historical claim', v_child_created),
    (public.canonical_graph_node_id('knowledge_unit', ${uuid(seed.parentHistoricalUnitId)}),
      v_parent_audience, 'source_event', ${uuid(seed.parentHistoricalEventId)}, 1,
      'K1 parent-left historical claim', v_parent_created);
  INSERT INTO public.graph_edges(id, source_node_id, target_node_id, kind)
  SELECT public.canonical_graph_edge_id(unit_node, 'derived_from', event_node),
    unit_node, event_node, 'derived_from'::public.graph_edge_kind
  FROM (VALUES
    (public.canonical_graph_node_id('knowledge_unit', ${uuid(seed.childHistoricalUnitId)}),
      public.canonical_graph_node_id('message_event', ${uuid(seed.childHistoricalEventId)})),
    (public.canonical_graph_node_id('knowledge_unit', ${uuid(seed.parentHistoricalUnitId)}),
      public.canonical_graph_node_id('message_event', ${uuid(seed.parentHistoricalEventId)}))
  ) pair(unit_node, event_node);
  INSERT INTO public.graph_edge_evidence(edge_id, evidence_event_id) VALUES
    (public.canonical_graph_edge_id(
      public.canonical_graph_node_id('knowledge_unit', ${uuid(seed.childHistoricalUnitId)}),
      'derived_from',
      public.canonical_graph_node_id('message_event', ${uuid(seed.childHistoricalEventId)})),
      ${uuid(seed.childHistoricalEventId)}),
    (public.canonical_graph_edge_id(
      public.canonical_graph_node_id('knowledge_unit', ${uuid(seed.parentHistoricalUnitId)}),
      'derived_from',
      public.canonical_graph_node_id('message_event', ${uuid(seed.parentHistoricalEventId)})),
      ${uuid(seed.parentHistoricalEventId)});
  IF NOT EXISTS (SELECT 1 FROM public.retrieve_knowledge_graph_claims('message_event',
      ${uuid(seed.childHistoricalEventId)}, ${uuid(seed.childFormerId)}, true, 2)
      WHERE knowledge_unit_id = ${uuid(seed.childHistoricalUnitId)})
    OR NOT EXISTS (SELECT 1 FROM public.retrieve_knowledge_graph_claims('message_event',
      ${uuid(seed.parentHistoricalEventId)}, ${uuid(seed.parentFormerId)}, true, 2)
      WHERE knowledge_unit_id = ${uuid(seed.parentHistoricalUnitId)}) THEN
    RAISE EXCEPTION 'knowledge_graph_former_member_historical_source_missing';
  END IF;
  IF EXISTS (SELECT 1 FROM public.retrieve_knowledge_graph_claims('message_event',
      ${uuid(seed.childHistoricalEventId)}, ${uuid(seed.laterMemberId)}, true, 2))
    OR EXISTS (SELECT 1 FROM public.retrieve_knowledge_graph_claims('message_event',
      ${uuid(seed.parentHistoricalEventId)}, ${uuid(seed.laterMemberId)}, true, 2)) THEN
    RAISE EXCEPTION 'knowledge_graph_later_member_gained_historical_source';
  END IF;
END
$k1_historical_membership$;
`
