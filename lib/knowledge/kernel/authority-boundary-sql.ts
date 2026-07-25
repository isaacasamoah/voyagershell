import type { K1FixtureSeed } from './k1-fixture-seed'
import { quote, uuid, uuidArray } from './sql'

export const renderAuthorityGapSetupSql = (seed: K1FixtureSeed): string => `
-- This commits logically after 057 but before trigger activation in the rollback transaction.
INSERT INTO auth.users(id, email, raw_user_meta_data, created_at) VALUES
  (${uuid(seed.gapUserId)}, ${quote(`oru-319-gap-${seed.gapUserId}@example.invalid`)},
    '{"display_name":"Gap Before"}'::jsonb, now());
INSERT INTO public.voyages(id, slug, name, created_by) VALUES
  (${uuid(seed.gapVoyageId)}, ${quote(`oru-319-gap-${seed.gapVoyageId}`)},
    'Gap Voyage Before', ${uuid(seed.gapUserId)});
INSERT INTO public.voyage_members(id, voyage_id, user_id, role) VALUES
  (${uuid(seed.gapVoyageMemberId)}, ${uuid(seed.gapVoyageId)}, ${uuid(seed.gapUserId)}, 'crew');
INSERT INTO public.spaces(id, voyage_id, created_by) VALUES
  (${uuid(seed.gapVoyageSpaceId)}, ${uuid(seed.gapVoyageId)}, ${uuid(seed.gapUserId)}),
  (${uuid(seed.gapDeleteSpaceId)}, NULL, ${uuid(seed.gapUserId)}),
  (${uuid(seed.gapProfileSpaceId)}, NULL, ${uuid(seed.gapUserId)});
INSERT INTO public.space_members(space_id, user_id, state) VALUES
  (${uuid(seed.gapVoyageSpaceId)}, ${uuid(seed.gapUserId)}, 'active'),
  (${uuid(seed.gapDeleteSpaceId)}, ${uuid(seed.gapUserId)}, 'active'),
  (${uuid(seed.gapProfileSpaceId)}, ${uuid(seed.gapUserId)}, 'active');
`

export const renderAuthorityBoundaryAssertionsSql = (seed: K1FixtureSeed): string => `
DO $authority_boundary$
DECLARE v_grants bigint; v_member_projected timestamptz; v_space_projected timestamptz;
  v_basis uuid[] := ${uuidArray([
    seed.gapUserId, seed.gapVoyageMemberId, seed.gapVoyageSpaceId,
    seed.gapVoyageSpaceMemberId, seed.gapDeleteSpaceId, seed.gapDeleteSpaceMemberId,
    seed.gapProfileSpaceId, seed.gapProfileSpaceMemberId,
  ])};
BEGIN
  IF (SELECT count(*) FROM pg_catalog.pg_constraint constraint_row
      WHERE constraint_row.conname IN ('knowledge_events_user_id_fkey',
        'knowledge_events_actor_id_fkey', 'knowledge_current_user_id_fkey')
        AND constraint_row.confdeltype = 'r') <> 3 THEN
    RAISE EXCEPTION 'knowledge_graph_account_retention_constraint_missing'; END IF;
  BEGIN
    DELETE FROM auth.users WHERE id = ${uuid(seed.ownerId)};
    RAISE EXCEPTION 'knowledge_graph_referenced_account_delete_accepted';
  EXCEPTION WHEN foreign_key_violation THEN NULL; END;
  IF NOT EXISTS (SELECT 1 FROM public.graph_nodes WHERE kind = 'person'
      AND authority_id = ${uuid(seed.gapUserId)})
    OR NOT EXISTS (SELECT 1 FROM public.graph_nodes WHERE kind = 'voyage'
      AND authority_id = ${uuid(seed.gapVoyageId)})
    OR (SELECT count(*) FROM public.graph_nodes WHERE kind = 'space' AND authority_id IN
      (${uuid(seed.gapVoyageSpaceId)}, ${uuid(seed.gapDeleteSpaceId)},
        ${uuid(seed.gapProfileSpaceId)})) <> 3
    OR NOT EXISTS (SELECT 1 FROM public.graph_authority_edges WHERE authority_kind = 'voyage_member'
      AND authority_row_id = ${uuid(seed.gapVoyageMemberId)} AND state = 'active')
    OR (SELECT count(*) FROM public.graph_authority_edges WHERE authority_kind = 'space_member'
      AND authority_row_id IN (${uuid(seed.gapVoyageSpaceMemberId)},
        ${uuid(seed.gapDeleteSpaceMemberId)}, ${uuid(seed.gapProfileSpaceMemberId)})) <> 3 THEN
    RAISE EXCEPTION 'knowledge_graph_activation_catchup_failed'; END IF;

  SELECT projected_at INTO STRICT v_member_projected FROM public.graph_authority_edges
  WHERE authority_kind = 'voyage_member' AND authority_row_id = ${uuid(seed.gapVoyageMemberId)};
  SELECT projected_at INTO STRICT v_space_projected FROM public.graph_authority_edges
  WHERE authority_kind = 'space' AND authority_row_id = ${uuid(seed.gapVoyageSpaceId)};
  UPDATE public.profiles SET display_name = 'Gap Profile After' WHERE id = ${uuid(seed.gapUserId)};
  UPDATE public.voyages SET name = 'Gap Voyage After' WHERE id = ${uuid(seed.gapVoyageId)};
  UPDATE public.voyage_members SET nickname = 'no stale label' WHERE id = ${uuid(seed.gapVoyageMemberId)};
  UPDATE public.spaces SET ai_present = NOT ai_present WHERE id = ${uuid(seed.gapVoyageSpaceId)};
  IF v_member_projected IS DISTINCT FROM (SELECT projected_at FROM public.graph_authority_edges
      WHERE authority_kind = 'voyage_member' AND authority_row_id = ${uuid(seed.gapVoyageMemberId)})
    OR v_space_projected IS DISTINCT FROM (SELECT projected_at FROM public.graph_authority_edges
      WHERE authority_kind = 'space' AND authority_row_id = ${uuid(seed.gapVoyageSpaceId)}) THEN
    RAISE EXCEPTION 'knowledge_graph_non_authority_update_reprojected'; END IF;
  UPDATE public.space_members SET state = 'left' WHERE id = ${uuid(seed.gapProfileSpaceMemberId)};
  UPDATE public.space_members SET state = 'active' WHERE id = ${uuid(seed.gapProfileSpaceMemberId)};
  IF (SELECT label FROM public.graph_nodes WHERE kind = 'person'
      AND authority_id = ${uuid(seed.gapUserId)}) <> 'Gap Profile After'
    OR (SELECT label FROM public.graph_nodes WHERE kind = 'voyage'
      AND authority_id = ${uuid(seed.gapVoyageId)}) <> 'Gap Voyage After' THEN
    RAISE EXCEPTION 'knowledge_graph_stale_projector_overwrote_label'; END IF;

  SELECT count(*) INTO v_grants FROM public.graph_node_grants WHERE basis_id = ANY(v_basis);
  IF v_grants = 0 THEN RAISE EXCEPTION 'knowledge_graph_parent_delete_grant_fixture_missing'; END IF;
  DELETE FROM public.spaces WHERE id = ${uuid(seed.gapDeleteSpaceId)};
  IF EXISTS (SELECT 1 FROM public.graph_authority_edges WHERE authority_row_id IN
      (${uuid(seed.gapDeleteSpaceId)}, ${uuid(seed.gapDeleteSpaceMemberId)})) THEN
    RAISE EXCEPTION 'knowledge_graph_space_delete_left_current_edges'; END IF;
  DELETE FROM public.voyages WHERE id = ${uuid(seed.gapVoyageId)};
  IF EXISTS (SELECT 1 FROM public.graph_authority_edges WHERE authority_row_id IN
      (${uuid(seed.gapVoyageMemberId)}, ${uuid(seed.gapVoyageSpaceId)},
        ${uuid(seed.gapVoyageSpaceMemberId)})) THEN
    RAISE EXCEPTION 'knowledge_graph_voyage_delete_left_current_edges'; END IF;
  DELETE FROM public.profiles WHERE id = ${uuid(seed.gapUserId)};
  IF EXISTS (SELECT 1 FROM public.graph_authority_edges WHERE authority_row_id IN
      (${uuid(seed.gapUserId)}, ${uuid(seed.gapProfileSpaceMemberId)})) THEN
    RAISE EXCEPTION 'knowledge_graph_profile_delete_left_current_edges'; END IF;
  IF v_grants <> (SELECT count(*) FROM public.graph_node_grants WHERE basis_id = ANY(v_basis)) THEN
    RAISE EXCEPTION 'knowledge_graph_parent_delete_removed_grants'; END IF;
END
$authority_boundary$;
`
