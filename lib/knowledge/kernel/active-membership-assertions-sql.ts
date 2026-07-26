import type { K1FixtureSeed } from './k1-fixture-seed'
import { quote, uuid } from './sql'

export const renderActiveMembershipAssertionsSql = (seed: K1FixtureSeed): string => {
  const voyageSlug = `oru-319-k1-${seed.voyageId}`
  return `
DO $active_membership$
DECLARE v_member_id uuid; v_revision bigint; v_invite text; v_joined uuid;
  v_original_sub text := current_setting('request.jwt.claim.sub', true);
  v_original_claims text := current_setting('request.jwt.claims', true);
BEGIN
  SELECT id, revision INTO STRICT v_member_id, v_revision FROM public.voyage_members
  WHERE voyage_id = ${uuid(seed.voyageId)} AND user_id = ${uuid(seed.recipientId)};
  UPDATE public.voyage_members SET role = 'captain' WHERE id = v_member_id;
  UPDATE public.voyage_members SET state = 'left' WHERE id = v_member_id;
  IF public.is_voyage_captain(${quote(voyageSlug)}, ${uuid(seed.recipientId)})
    OR public.get_voyage_role(${quote(voyageSlug)}, ${uuid(seed.recipientId)}) IS NOT NULL
    OR EXISTS (SELECT 1 FROM public.get_user_voyages(${uuid(seed.recipientId)})
      WHERE voyage_id = ${uuid(seed.voyageId)})
    OR public.regenerate_voyage_invite(${uuid(seed.voyageId)}, ${uuid(seed.recipientId)})
      IS NOT NULL THEN RAISE EXCEPTION 'knowledge_graph_left_member_product_access'; END IF;
  PERFORM set_config('request.jwt.claim.sub', ${quote(seed.recipientId)}, true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', ${quote(seed.recipientId)})::text, true);
  IF public.knowledge_in_scope(${uuid(seed.ownerId)}, ${quote(voyageSlug)}, 'explicit',
      'domain', ARRAY[${uuid(seed.ownerId)}, ${uuid(seed.recipientId)}],
      ${uuid(seed.recipientId)}, ${quote(voyageSlug)}, ARRAY[${uuid(seed.ownerId)}]) THEN
    RAISE EXCEPTION 'knowledge_graph_left_member_legacy_graph_scope_accepted'; END IF;
  PERFORM public.search_knowledge(NULL::vector, ${uuid(seed.recipientId)}, NULL);
  PERFORM public.keyword_search('K1', ${uuid(seed.recipientId)}, NULL);
  PERFORM public.scoped_knowledge_fetch(${uuid(seed.recipientId)}, NULL);
  BEGIN PERFORM public.search_knowledge(NULL::vector, ${uuid(seed.recipientId)}, ${quote(voyageSlug)});
    RAISE EXCEPTION 'knowledge_graph_left_member_search_accepted';
  EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM <>
    'search_knowledge: caller is not an active voyage member' THEN RAISE; END IF; END;
  BEGIN PERFORM public.keyword_search('K1', ${uuid(seed.recipientId)}, ${quote(voyageSlug)});
    RAISE EXCEPTION 'knowledge_graph_left_member_keyword_accepted';
  EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM <>
    'keyword_search: caller is not an active voyage member' THEN RAISE; END IF; END;
  BEGIN PERFORM public.scoped_knowledge_fetch(${uuid(seed.recipientId)}, ${quote(voyageSlug)});
    RAISE EXCEPTION 'knowledge_graph_left_member_scoped_accepted';
  EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM <>
    'scoped_knowledge_fetch: caller is not an active voyage member' THEN RAISE; END IF; END;
  BEGIN PERFORM public.search_knowledge(NULL::vector, ${uuid(seed.ownerId)}, ${quote(voyageSlug)});
    RAISE EXCEPTION 'knowledge_graph_forged_search_user_accepted';
  EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM <>
    'search_knowledge: p_user_id must equal auth.uid()' THEN RAISE; END IF; END;
  BEGIN PERFORM public.keyword_search('K1', ${uuid(seed.ownerId)}, ${quote(voyageSlug)});
    RAISE EXCEPTION 'knowledge_graph_forged_keyword_user_accepted';
  EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM <>
    'keyword_search: p_user_id must equal auth.uid()' THEN RAISE; END IF; END;
  BEGIN PERFORM public.scoped_knowledge_fetch(${uuid(seed.ownerId)}, ${quote(voyageSlug)});
    RAISE EXCEPTION 'knowledge_graph_forged_scoped_user_accepted';
  EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM <>
    'scoped_knowledge_fetch: p_user_id must equal auth.uid()' THEN RAISE; END IF; END;
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{}', true);
  BEGIN PERFORM public.search_knowledge(NULL::vector, ${uuid(seed.recipientId)}, ${quote(voyageSlug)});
    RAISE EXCEPTION 'knowledge_graph_left_member_admin_search_accepted';
  EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM <>
    'search_knowledge: caller is not an active voyage member' THEN RAISE; END IF; END;
  BEGIN PERFORM public.keyword_search('K1', ${uuid(seed.recipientId)}, ${quote(voyageSlug)});
    RAISE EXCEPTION 'knowledge_graph_left_member_admin_keyword_accepted';
  EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM <>
    'keyword_search: caller is not an active voyage member' THEN RAISE; END IF; END;
  BEGIN PERFORM public.scoped_knowledge_fetch(${uuid(seed.recipientId)}, ${quote(voyageSlug)});
    RAISE EXCEPTION 'knowledge_graph_left_member_admin_scoped_accepted';
  EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM <>
    'scoped_knowledge_fetch: caller is not an active voyage member' THEN RAISE; END IF; END;
  BEGIN
    PERFORM public.promote_private_voyager_reply(${uuid(seed.eligibleSourceId)},
      ${uuid(seed.recipientSessionId)}, ${uuid(seed.recipientId)});
    RAISE EXCEPTION 'knowledge_graph_left_member_promotion_accepted';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'share_session_access_denied' THEN RAISE; END IF;
  END;
  SELECT invite_code INTO STRICT v_invite FROM public.voyages WHERE id = ${uuid(seed.voyageId)};
  v_joined := public.join_voyage_by_code(v_invite, ${uuid(seed.recipientId)});
  IF v_joined IS DISTINCT FROM ${uuid(seed.voyageId)} OR NOT EXISTS (
      SELECT 1 FROM public.voyage_members WHERE id = v_member_id AND state = 'active'
        AND role = 'crew' AND revision = v_revision + 2)
    OR public.get_voyage_role(${quote(voyageSlug)}, ${uuid(seed.recipientId)})
      IS DISTINCT FROM 'crew'
    OR NOT EXISTS (SELECT 1 FROM public.get_user_voyages(${uuid(seed.recipientId)})
      WHERE voyage_id = ${uuid(seed.voyageId)}) THEN
    RAISE EXCEPTION 'knowledge_graph_invite_rejoin_failed'; END IF;
  IF public.is_effective_space_member(${uuid(seed.spaceId)}, ${uuid(seed.recipientId)})
    OR NOT EXISTS (SELECT 1 FROM public.space_members
      WHERE id = ${uuid(seed.recipientSpaceMemberId)} AND state = 'left') THEN
    RAISE EXCEPTION 'knowledge_graph_voyage_rejoin_resurrected_room'; END IF;
  UPDATE public.space_members SET state = 'invited' WHERE id = ${uuid(seed.recipientSpaceMemberId)};
  UPDATE public.space_members SET state = 'active' WHERE id = ${uuid(seed.recipientSpaceMemberId)};
  IF NOT public.is_effective_space_member(${uuid(seed.spaceId)}, ${uuid(seed.recipientId)}) THEN
    RAISE EXCEPTION 'knowledge_graph_fresh_room_invite_failed'; END IF;
  PERFORM set_config('request.jwt.claim.sub', ${quote(seed.recipientId)}, true);
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', ${quote(seed.recipientId)})::text, true);
  PERFORM public.search_knowledge(NULL::vector, ${uuid(seed.recipientId)}, ${quote(voyageSlug)});
  PERFORM public.keyword_search('K1', ${uuid(seed.recipientId)}, ${quote(voyageSlug)});
  PERFORM public.scoped_knowledge_fetch(${uuid(seed.recipientId)}, ${quote(voyageSlug)});
  IF NOT public.knowledge_in_scope(${uuid(seed.ownerId)}, ${quote(voyageSlug)}, 'explicit',
      'domain', ARRAY[${uuid(seed.ownerId)}, ${uuid(seed.recipientId)}],
      ${uuid(seed.recipientId)}, ${quote(voyageSlug)}, ARRAY[${uuid(seed.ownerId)}]) THEN
    RAISE EXCEPTION 'knowledge_graph_rejoined_domain_scope_denied'; END IF;
  IF public.knowledge_in_scope(${uuid(seed.ownerId)}, ${quote(voyageSlug)}, 'explicit',
      'preference', ARRAY[${uuid(seed.ownerId)}, ${uuid(seed.recipientId)}],
      ${uuid(seed.recipientId)}, ${quote(voyageSlug)}, ARRAY[${uuid(seed.ownerId)}]) THEN
    RAISE EXCEPTION 'knowledge_graph_rejoined_preference_scope_leaked'; END IF;
  IF (SELECT count(*) FROM pg_catalog.pg_proc procedure
      JOIN pg_catalog.pg_namespace namespace ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = 'public' AND procedure.proname = 'scoped_knowledge_fetch') <> 1 THEN
    RAISE EXCEPTION 'knowledge_graph_scoped_overload_residue'; END IF;
  BEGIN
    PERFORM public.promote_private_voyager_reply(${uuid(seed.eligibleSourceId)},
      ${uuid(seed.recipientSessionId)}, ${uuid(seed.recipientId)});
    RAISE EXCEPTION 'knowledge_graph_rejoin_promotion_source_check_missing';
  EXCEPTION WHEN insufficient_privilege THEN
    IF SQLERRM <> 'share_source_not_shareable' THEN RAISE; END IF;
  END;
  PERFORM set_config('request.jwt.claim.sub', coalesce(v_original_sub, ''), true);
  PERFORM set_config('request.jwt.claims', coalesce(v_original_claims, ''), true);
END
$active_membership$;
SET LOCAL ROLE authenticated;
DO $membership_direct_dml$
BEGIN
  BEGIN INSERT INTO public.voyage_members(id, voyage_id, user_id, role) VALUES
    ('93000000-0000-4000-8000-000000000010', ${uuid(seed.voyageId)}, ${uuid(seed.ownerId)}, 'captain');
    RAISE EXCEPTION 'knowledge_graph_direct_voyage_insert_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN UPDATE public.voyage_members SET role = 'captain' WHERE id = ${uuid(seed.voyageMemberId)};
    RAISE EXCEPTION 'knowledge_graph_direct_voyage_update_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN DELETE FROM public.voyage_members WHERE id = ${uuid(seed.voyageMemberId)};
    RAISE EXCEPTION 'knowledge_graph_direct_voyage_delete_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$membership_direct_dml$;
RESET ROLE;
SET LOCAL ROLE service_role;
DO $membership_service_delete$
BEGIN
  BEGIN DELETE FROM public.space_members WHERE id = ${uuid(seed.spaceMemberId)};
    RAISE EXCEPTION 'knowledge_graph_service_space_member_delete_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END
$membership_service_delete$;
RESET ROLE;
`
}
