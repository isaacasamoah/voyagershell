import type { KnowledgeGraphFixture } from './contract'
import { canonicalGraphEdgeId, canonicalGraphNodeId, canonicalKnowledgeAudienceId } from './canonical-ids'
import { quote, uuid, uuidArray, valuesSql } from './sql'

interface MemberIds {
  readonly redB: string
  readonly redD: string
  readonly redSpaceB: string
  readonly redSpaceD: string
}

const TRANSITION = {
  absenceUnit: '71000000-0000-4000-8000-000000000005',
  postUnit: '71000000-0000-4000-8000-000000000006',
} as const

const renderTransitionSource = (
  fixture: KnowledgeGraphFixture,
  phase: 'absence' | 'post',
  members: readonly string[],
): string => {
  const scenario = fixture.authorityScenario
  const isAbsence = phase === 'absence'
  const eventId = isAbsence ? scenario.absenceEventId : scenario.postRejoinEventId
  const eventNode = isAbsence ? scenario.absenceNodeId : scenario.postRejoinNodeId
  const unit = isAbsence ? TRANSITION.absenceUnit : TRANSITION.postUnit
  const canonicalMembers = Array.from(new Set(members)).sort()
  const audience = canonicalKnowledgeAudienceId('source', 'space', scenario.redSpaceId, canonicalMembers)
  const unitNode = canonicalGraphNodeId('knowledge_unit', unit)
  const content = isAbsence ? 'This source was created while Isaac was absent.' : 'This source was created after Isaac rejoined.'
  const claim = isAbsence ? 'Absence source remains private to its creation snapshot.' : 'Post-rejoin source is visible to the rejoined member.'
  const personNode = fixture.nodes.find((node) => node.kind === 'person'
    && node.authorityId === scenario.crossScopePersonId)!
  const spaceNode = fixture.nodes.find((node) => node.kind === 'space'
    && node.authorityId === scenario.redSpaceId)!
  const edges = [
    [eventNode, personNode.id, 'authored_by'],
    [eventNode, spaceNode.id, 'posted_in'],
    [unitNode, eventNode, 'derived_from'],
  ] as const
  const edgeIds = edges.map(([source, target, kind]) => canonicalGraphEdgeId(source, kind, target))
  const grants = [
    [eventNode, `${phase} source`, 'source_event', eventId, null],
    [unitNode, `${phase} claim`, 'source_event', eventId, null],
    [personNode.id, 'Vanessa Hart', 'edge_evidence', edgeIds[0], eventId],
    [spaceNode.id, spaceNode.label, 'edge_evidence', edgeIds[1], eventId],
  ].map(([nodeId, label, basisKind, basisId, basisEventId]) => [
    uuid(nodeId!), uuid(audience), quote(basisKind!), uuid(basisId!), '1', quote(label!), 'now()',
    basisEventId ? uuid(basisEventId) : 'NULL::uuid',
  ].join(', '))
  return `
INSERT INTO public.knowledge_audiences(id, purpose, scope_kind, scope_authority_id, member_profile_ids)
VALUES (${uuid(audience)}, 'source', 'space', ${uuid(scenario.redSpaceId)}, ${uuidArray(canonicalMembers)});
INSERT INTO public.knowledge_events(id, event_type, user_id, voyage_slug, content, metadata,
  source_type, actor_type, participants, knowledge_audience_id, sequence_num)
VALUES (${uuid(eventId)}, 'message', ${uuid(scenario.crossScopePersonId)}, 'oru-319-red',
  ${quote(content)}, '{}'::jsonb, 'explicit', 'pipeline', NULL, ${uuid(audience)},
  ${isAbsence ? -319205 : -319206});
INSERT INTO public.knowledge_units(id, claim, source_event_id, extractor_version,
  claim_key, knowledge_audience_id) VALUES (${uuid(unit)}, ${quote(claim)}, ${uuid(eventId)},
  'fixture-v2', ${quote(`${phase}-transition`)}, ${uuid(audience)});
INSERT INTO public.graph_nodes(id, kind, authority_id, label) VALUES
  (${uuid(eventNode)}, 'message_event', ${uuid(eventId)}, ${quote(`${phase} source`)}),
  (${uuid(unitNode)}, 'knowledge_unit', ${uuid(unit)}, ${quote(`${phase} claim`)});
INSERT INTO public.graph_edges(id, source_node_id, target_node_id, kind) VALUES
${valuesSql(edges.map(([source, target, kind], index) =>
    [uuid(edgeIds[index]), uuid(source), uuid(target), `${quote(kind)}::public.graph_edge_kind`].join(', ')))};
INSERT INTO public.graph_edge_evidence(edge_id, evidence_event_id) VALUES
${valuesSql(edgeIds.map((id) => `${uuid(id)}, ${uuid(eventId)}`))};
INSERT INTO public.graph_node_grants(node_id, knowledge_audience_id, basis_kind,
  basis_id, basis_version, label_snapshot, granted_at, basis_event_id) VALUES
${valuesSql(grants)};
`
}

export const renderAuthorityScenarioAssertions = (
  fixture: KnowledgeGraphFixture,
  members: MemberIds,
): string => {
  const scenario = fixture.authorityScenario
  const ids = fixture.viewerProfileIds
  const personNode = fixture.nodes.find((node) => node.kind === 'person'
    && node.authorityId === scenario.crossScopePersonId)!
  const formerPersonNode = fixture.nodes.find((node) => node.kind === 'person'
    && node.authorityId === scenario.formerMemberId)!
  const newPersonNode = fixture.nodes.find((node) => node.kind === 'person'
    && node.authorityId === scenario.newMemberId)!
  const preleave = fixture.expected.sharedSourceEventId
  const oldRedAuthority = canonicalKnowledgeAudienceId('authority', 'voyage',
    scenario.redVoyageId, [ids.a, ids.b])
  return `
DO $authority_before_leave$
DECLARE v_node uuid;
BEGIN
  SELECT id INTO STRICT v_node FROM public.graph_nodes
  WHERE kind = 'person' AND authority_id = ${uuid(scenario.crossScopePersonId)};
  IF v_node <> ${uuid(personNode.id)} OR (SELECT count(*) FROM public.graph_nodes
      WHERE kind = 'person' AND authority_id = ${uuid(scenario.crossScopePersonId)}) <> 1 THEN
    RAISE EXCEPTION 'knowledge_graph_cross_scope_identity_duplicated'; END IF;
  IF (SELECT count(*) FROM public.graph_authority_edges edge
      WHERE edge.source_node_id = v_node AND edge.kind = 'member_of'
        AND public.graph_authority_edge_is_current(edge.id, ${uuid(ids.a)})) <> 4 THEN
    RAISE EXCEPTION 'knowledge_graph_cross_scope_projection_missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.retrieve_knowledge_graph_claims('person',
      ${uuid(scenario.crossScopePersonId)}, ${uuid(scenario.formerMemberId)}, true, 4)
      WHERE source_event_id = ${uuid(preleave)}) THEN
    RAISE EXCEPTION 'knowledge_graph_preleave_source_missing'; END IF;
END
$authority_before_leave$;

UPDATE public.voyage_members SET state = 'left'
WHERE id = ${uuid(members.redB)} AND state = 'active';
UPDATE public.profiles SET display_name = 'Vanessa Hart', username = 'northstar'
WHERE id = ${uuid(scenario.crossScopePersonId)};

DO $authority_after_leave$
DECLARE v_label text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.graph_authority_edges edge
      JOIN public.voyage_members member ON member.id = edge.authority_row_id
      WHERE edge.authority_kind = 'voyage_member' AND member.id = ${uuid(members.redB)}
        AND (edge.state <> member.state OR edge.authority_revision <> member.revision
          OR edge.effective_at <> member.state_changed_at OR edge.state <> 'left'))
    OR EXISTS (SELECT 1 FROM public.graph_authority_edges edge
      JOIN public.space_members member ON member.id = edge.authority_row_id
      WHERE edge.authority_kind = 'space_member' AND member.id = ${uuid(members.redSpaceB)}
        AND (edge.state <> member.state OR edge.authority_revision <> member.revision
          OR edge.effective_at <> member.state_changed_at OR edge.state <> 'left')) THEN
    RAISE EXCEPTION 'knowledge_graph_leave_projection_mismatch'; END IF;
  SELECT label INTO v_label FROM public.traverse_knowledge_graph(${uuid(personNode.id)},
    ${uuid(scenario.formerMemberId)}, 0);
  IF v_label IS DISTINCT FROM 'Vanessa Vale' THEN
    RAISE EXCEPTION 'knowledge_graph_historical_label_leak:%', v_label; END IF;
  SELECT label INTO v_label FROM public.traverse_knowledge_graph(${uuid(personNode.id)},
    ${uuid(scenario.blueOnlyViewerId)}, 0);
  IF v_label IS DISTINCT FROM 'Vanessa Hart' THEN
    RAISE EXCEPTION 'knowledge_graph_current_label_stale:%', v_label; END IF;
END
$authority_after_leave$;

INSERT INTO public.voyage_members(id, voyage_id, user_id, role)
VALUES (${uuid(members.redD)}, ${uuid(scenario.redVoyageId)}, ${uuid(scenario.newMemberId)}, 'crew');
INSERT INTO public.space_members(space_id, user_id, state)
VALUES (${uuid(scenario.redSpaceId)}, ${uuid(scenario.newMemberId)}, 'active');

DO $authority_new_member$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.traverse_knowledge_graph(${uuid(personNode.id)},
      ${uuid(scenario.newMemberId)}, 4) WHERE node_id = ${uuid(newPersonNode.id)}) THEN
    RAISE EXCEPTION 'knowledge_graph_new_member_missing_current_identity'; END IF;
  IF EXISTS (SELECT 1 FROM public.retrieve_knowledge_graph_claims('message_event',
      ${uuid(preleave)}, ${uuid(scenario.newMemberId)}, true, 4)) THEN
    RAISE EXCEPTION 'knowledge_graph_new_member_gained_old_source'; END IF;
END
$authority_new_member$;
${renderTransitionSource(fixture, 'absence', [ids.a, ids.d])}
UPDATE public.voyage_members SET state = 'active' WHERE id = ${uuid(members.redB)};
DO $authority_no_room_resurrection$ BEGIN
  IF EXISTS (SELECT 1 FROM public.space_members WHERE id = ${uuid(members.redSpaceB)}
      AND state <> 'left') THEN
    RAISE EXCEPTION 'knowledge_graph_voyage_rejoin_resurrected_room'; END IF;
END $authority_no_room_resurrection$;
UPDATE public.space_members SET state = 'invited' WHERE id = ${uuid(members.redSpaceB)};
UPDATE public.space_members SET state = 'active' WHERE id = ${uuid(members.redSpaceB)};

DO $authority_rejoin$
BEGIN
  IF EXISTS (SELECT 1 FROM public.retrieve_knowledge_graph_claims('message_event',
      ${uuid(scenario.absenceEventId)}, ${uuid(scenario.formerMemberId)}, true, 4)) THEN
    RAISE EXCEPTION 'knowledge_graph_rejoin_gained_absence_source'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.graph_authority_edges edge
      JOIN public.voyage_members member ON member.id = edge.authority_row_id
      WHERE member.id = ${uuid(members.redB)} AND edge.state = member.state
        AND edge.authority_revision = member.revision AND edge.effective_at = member.state_changed_at
        AND edge.state = 'active' AND member.revision = 3
        AND public.graph_authority_edge_is_current(edge.id, ${uuid(scenario.formerMemberId)})) THEN
    RAISE EXCEPTION 'knowledge_graph_rejoin_projection_mismatch'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.graph_authority_edges edge
      JOIN public.space_members member ON member.id = edge.authority_row_id
      WHERE member.id = ${uuid(members.redSpaceB)} AND edge.state = member.state
        AND edge.authority_revision = member.revision AND edge.effective_at = member.state_changed_at
        AND edge.state = 'active' AND member.revision = 4
        AND public.graph_authority_edge_is_current(edge.id, ${uuid(scenario.formerMemberId)})) THEN
    RAISE EXCEPTION 'knowledge_graph_space_rejoin_projection_mismatch'; END IF;
END
$authority_rejoin$;
${renderTransitionSource(fixture, 'post', [ids.a, ids.b, ids.d])}
DO $authority_post_rejoin$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.retrieve_knowledge_graph_claims('message_event',
      ${uuid(scenario.postRejoinEventId)}, ${uuid(scenario.formerMemberId)}, true, 4)
      WHERE knowledge_unit_id = ${uuid(TRANSITION.postUnit)}) THEN
    RAISE EXCEPTION 'knowledge_graph_post_rejoin_source_missing'; END IF;
  IF (SELECT id FROM public.graph_nodes WHERE kind = 'person'
      AND authority_id = ${uuid(scenario.crossScopePersonId)}) <> ${uuid(personNode.id)} THEN
    RAISE EXCEPTION 'knowledge_graph_person_id_changed'; END IF;
  BEGIN
    INSERT INTO public.graph_edges(id, source_node_id, target_node_id, kind) VALUES
      (public.canonical_graph_edge_id(${uuid(personNode.id)}, 'member_of',
        public.canonical_graph_node_id('voyage', ${uuid(scenario.redVoyageId)})),
        ${uuid(personNode.id)},
        public.canonical_graph_node_id('voyage', ${uuid(scenario.redVoyageId)}), 'member_of');
    RAISE EXCEPTION 'knowledge_graph_authority_link_insert_accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.graph_node_grants(node_id, knowledge_audience_id, basis_kind,
      basis_id, basis_version, label_snapshot, granted_at)
    SELECT ${uuid(formerPersonNode.id)}, ${uuid(oldRedAuthority)}, 'voyage_member',
      member.id, member.revision, node.label, member.state_changed_at
    FROM public.voyage_members member JOIN public.graph_nodes node
      ON node.id = ${uuid(formerPersonNode.id)} WHERE member.id = ${uuid(members.redB)};
    RAISE EXCEPTION 'knowledge_graph_stale_authority_grant_accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END
$authority_post_rejoin$;
`
}
