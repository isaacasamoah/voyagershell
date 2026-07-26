-- K2 step 3 · atomic source ingress.
--
-- A client can send the same message twice — a retry, a double tap, a reconnect.
-- So one RPC owns everything an ingress commits: it takes the claim FIRST and
-- then, in the same transaction, writes the source audience, the immutable
-- event, the canonical event node, its grants, its structural edges and the
-- delivery outbox. A second attempt cannot get past the claim, so it cannot
-- produce a second event, a second graph fragment or a second delivery.
--
-- The classifier below is the single home of the audience rules. Migration 064
-- carries the one-shot historical form of the same rules and 069 reuses this
-- one for recovery; the C7 proof asserts this function reproduces 064's binding
-- for every event it bound, so the three cannot drift apart unnoticed.

-- ── One classifier ──────────────────────────────────────────────────────────
-- For each event: the audience it belongs to, or the exact reason it cannot be
-- attested. NULL rejection_reason means the row is safe to bind.
CREATE FUNCTION public.classify_knowledge_event_authority(p_event_ids uuid[])
RETURNS TABLE (
  id uuid, rejection_reason text, audience_id uuid, node_id uuid,
  scope_kind public.knowledge_audience_scope_kind,
  scope_authority_id uuid, audience_members uuid[]
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
WITH normalized AS (
  SELECT event.id, event.user_id, event.voyage_slug,
    public.normalize_knowledge_audience_members(coalesce(event.participants, '{}'::uuid[])) members,
    event.knowledge_audience_id, event.metadata->>'session_id' session_ref,
    CASE WHEN event.metadata->>'session_id' ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN (event.metadata->>'session_id')::uuid END session_id
  FROM public.knowledge_events event
  WHERE p_event_ids IS NULL OR event.id = ANY(p_event_ids)
), resolved AS (
  SELECT source.*, profile.id owner_id, voyage.id voyage_id,
    session.id resolved_session_id, session.voyage_id session_voyage_id, session.space_id session_space_id,
    space.id resolved_space_id, space.voyage_id space_voyage_id,
    NOT EXISTS (SELECT 1 FROM unnest(source.members) member_id
      WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = member_id)) members_resolve
  FROM normalized source
  LEFT JOIN public.profiles profile ON profile.id = source.user_id
  LEFT JOIN public.voyages voyage ON voyage.slug = source.voyage_slug
  LEFT JOIN public.sessions session ON session.id = source.session_id
  LEFT JOIN public.spaces space ON space.id = session.space_id
), classified AS (
  SELECT resolved.*,
    CASE WHEN session_ref IS NOT NULL AND session_id IS NULL THEN 'session_authority_malformed'
      WHEN session_id IS NOT NULL AND resolved_session_id IS NULL THEN 'session_authority_unresolved'
      WHEN voyage_slug IS NOT NULL AND session_id IS NOT NULL
        AND session_voyage_id IS DISTINCT FROM voyage_id THEN 'session_voyage_mismatch'
      WHEN session_space_id IS NOT NULL AND resolved_space_id IS NULL THEN 'space_authority_unresolved'
      WHEN session_space_id IS NOT NULL
        AND space_voyage_id IS DISTINCT FROM session_voyage_id THEN 'space_voyage_mismatch'
      WHEN session_space_id IS NULL AND voyage_slug IS NULL AND owner_id IS NULL
        THEN 'private_authority_unresolved'
      WHEN session_space_id IS NULL AND voyage_slug IS NULL
        AND members NOT IN ('{}'::uuid[], ARRAY[user_id]::uuid[])
        THEN 'private_participants_conflict'
      WHEN session_space_id IS NULL AND voyage_slug IS NULL THEN NULL
      WHEN members = '{}'::uuid[] THEN 'source_audience_not_explicit'
      WHEN NOT members_resolve THEN 'audience_member_unresolved'
      WHEN user_id IS NOT NULL AND owner_id IS NULL THEN 'source_author_unresolved'
      WHEN user_id IS NOT NULL AND NOT user_id = ANY(members) THEN 'source_author_not_attested'
      WHEN session_space_id IS NULL AND voyage_slug IS NOT NULL AND voyage_id IS NULL
        THEN 'voyage_authority_unresolved' ELSE NULL END rejection_reason,
    CASE WHEN session_space_id IS NOT NULL THEN 'space'::public.knowledge_audience_scope_kind
      WHEN voyage_slug IS NULL THEN 'private'::public.knowledge_audience_scope_kind
      ELSE 'voyage'::public.knowledge_audience_scope_kind END scope_kind,
    CASE WHEN session_space_id IS NOT NULL THEN resolved_space_id WHEN voyage_slug IS NULL THEN user_id
      ELSE voyage_id END scope_authority_id,
    CASE WHEN session_space_id IS NOT NULL THEN members
      WHEN voyage_slug IS NULL THEN ARRAY[user_id]::uuid[] ELSE members END audience_members
  FROM resolved)
SELECT classified.id, classified.rejection_reason,
  public.canonical_knowledge_audience_id('source', scope_kind, scope_authority_id, audience_members),
  public.canonical_graph_node_id('message_event', classified.id),
  classified.scope_kind, classified.scope_authority_id, classified.audience_members
FROM classified
$$;

-- One structural pair: the edge, the evidence that authorises it, and the
-- endpoint grant that lets a member of the source audience see the far end.
-- Written in that order because each validation depends on the row before it.
CREATE FUNCTION public.attest_ingress_structural_edge(
  p_event_node_id uuid, p_target_node_id uuid, p_kind public.graph_edge_kind,
  p_event_id uuid, p_audience_id uuid, p_created_at timestamptz
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE v_edge uuid;
  v_label text;
BEGIN
  SELECT node.label INTO v_label FROM public.graph_nodes node WHERE node.id = p_target_node_id;
  IF v_label IS NULL THEN
    RAISE EXCEPTION 'source_ingress_endpoint_node_missing' USING ERRCODE = '23503';
  END IF;
  v_edge := public.canonical_graph_edge_id(p_event_node_id, p_kind, p_target_node_id);
  INSERT INTO public.graph_edges(id, source_node_id, target_node_id, kind)
  VALUES (v_edge, p_event_node_id, p_target_node_id, p_kind) ON CONFLICT DO NOTHING;
  INSERT INTO public.graph_edge_evidence(edge_id, evidence_event_id)
  VALUES (v_edge, p_event_id) ON CONFLICT DO NOTHING;
  INSERT INTO public.graph_node_grants(node_id, knowledge_audience_id, basis_kind,
    basis_id, basis_version, label_snapshot, granted_at, basis_event_id)
  VALUES (p_target_node_id, p_audience_id, 'edge_evidence', v_edge, 1,
    v_label, p_created_at, p_event_id)
  ON CONFLICT DO NOTHING;
END $$;

-- ── The one ingress writer ──────────────────────────────────────────────────
-- Called after the caller has authenticated the actor and resolved the audience,
-- and before any model call or fan-out. Returns the winning event id and whether
-- this caller created it. A same-key/different-payload attempt raises and commits
-- nothing, so the caller must not proceed.
CREATE FUNCTION public.claim_source_message_ingress(
  p_actor_id uuid,
  p_transport text,
  p_client_message_id text,
  p_space_id uuid,
  p_voyage_slug text,
  p_content text,
  p_event_type text,
  p_source_type text,
  p_actor_type text,
  p_audience_member_ids uuid[],
  p_recipient_ids uuid[],
  p_metadata jsonb,
  p_source_ref jsonb
) RETURNS TABLE (event_id uuid, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
-- The OUT columns are named for the caller (event_id, status). Inside the body
-- every bare name is a column: the outbox insert conflicts on the real
-- message_deliveries.event_id, never on the return value. Locals carry the
-- v_ prefix precisely so nothing here depends on that resolution by accident.
#variable_conflict use_column
DECLARE
  v_scope public.knowledge_audience_scope_kind;
  v_authority uuid;
  v_members uuid[];
  v_audience uuid;
  v_hash bytea;
  v_event uuid := pg_catalog.gen_random_uuid();
  v_claimed uuid;
  v_status text;
  v_created_at timestamptz;
  v_node uuid;
  v_label text;
BEGIN
  IF p_actor_id IS NULL OR p_content IS NULL OR btrim(p_content) = '' THEN
    RAISE EXCEPTION 'source_ingress_incomplete' USING ERRCODE = '22004';
  END IF;

  -- Audience resolution uses the same rules the cutover applies to history, so a
  -- live event and a backfilled one are never scoped differently.
  IF p_space_id IS NOT NULL THEN
    v_scope := 'space';
    v_authority := p_space_id;
    v_members := public.normalize_knowledge_audience_members(
      coalesce(p_audience_member_ids, ARRAY[p_actor_id]::uuid[]));
  ELSIF p_voyage_slug IS NOT NULL THEN
    v_scope := 'voyage';
    SELECT voyage.id INTO v_authority FROM public.voyages voyage WHERE voyage.slug = p_voyage_slug;
    IF v_authority IS NULL THEN
      RAISE EXCEPTION 'source_ingress_voyage_unresolved' USING ERRCODE = '23503';
    END IF;
    v_members := public.normalize_knowledge_audience_members(
      coalesce(p_audience_member_ids, ARRAY[p_actor_id]::uuid[]));
  ELSE
    v_scope := 'private';
    v_authority := p_actor_id;
    v_members := ARRAY[p_actor_id]::uuid[];
  END IF;
  IF NOT p_actor_id = ANY(v_members) THEN
    RAISE EXCEPTION 'source_ingress_author_not_attested' USING ERRCODE = '23514';
  END IF;

  v_audience := public.canonical_knowledge_audience_id('source', v_scope, v_authority, v_members);
  -- The digest binds the resolved audience as well as the text, so the same
  -- client message id arriving for a DIFFERENT audience is a conflict rather
  -- than a silent replay into the wrong room.
  v_hash := public.canonical_source_payload_hash(p_transport, v_audience::text, p_content);

  SELECT claim.event_id, claim.status INTO v_claimed, v_status
  FROM public.claim_source_intent(
    p_actor_id, p_transport, p_client_message_id, v_hash, v_event) claim;

  IF v_status IS DISTINCT FROM 'created' THEN
    RETURN QUERY SELECT v_claimed, v_status;
    RETURN;
  END IF;

  INSERT INTO public.knowledge_audiences(
    id, purpose, scope_kind, scope_authority_id, member_profile_ids)
  VALUES (v_audience, 'source', v_scope, v_authority, v_members)
  ON CONFLICT DO NOTHING;

  INSERT INTO public.knowledge_events(
    id, user_id, voyage_slug, event_type, content, metadata, source_type,
    source_ref, actor_id, actor_type, participants, knowledge_audience_id)
  VALUES (v_event, p_actor_id, p_voyage_slug, p_event_type, p_content,
    coalesce(p_metadata, '{}'::jsonb), p_source_type, p_source_ref,
    p_actor_id, p_actor_type, v_members, v_audience)
  RETURNING knowledge_events.created_at INTO v_created_at;

  v_label := format('message_event:%s', v_event);
  v_node := public.canonical_graph_node_id('message_event', v_event);
  INSERT INTO public.graph_nodes(id, kind, authority_id, label)
  VALUES (v_node, 'message_event', v_event, v_label);
  INSERT INTO public.graph_node_grants(node_id, knowledge_audience_id, basis_kind,
    basis_id, basis_version, label_snapshot, granted_at)
  VALUES (v_node, v_audience, 'source_event', v_event, 1, v_label, v_created_at);

  PERFORM public.attest_ingress_structural_edge(
    v_node, public.canonical_graph_node_id('person', p_actor_id),
    'authored_by', v_event, v_audience, v_created_at);
  IF p_space_id IS NOT NULL THEN
    PERFORM public.attest_ingress_structural_edge(
      v_node, public.canonical_graph_node_id('space', p_space_id),
      'posted_in', v_event, v_audience, v_created_at);
  END IF;

  INSERT INTO public.message_deliveries(event_id, recipient_user_id)
  SELECT v_event, recipient
  FROM unnest(coalesce(p_recipient_ids, '{}'::uuid[])) recipient
  WHERE recipient IS DISTINCT FROM p_actor_id
  ON CONFLICT (event_id, recipient_user_id) DO NOTHING;

  RETURN QUERY SELECT v_event, 'created'::text;
END $$;

REVOKE ALL ON FUNCTION public.classify_knowledge_event_authority(uuid[]),
  public.attest_ingress_structural_edge(uuid, uuid, public.graph_edge_kind, uuid, uuid, timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.claim_source_message_ingress(
  uuid, text, text, uuid, text, text, text, text, text, uuid[], uuid[], jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_source_message_ingress(
  uuid, text, text, uuid, text, text, text, text, text, uuid[], uuid[], jsonb, jsonb)
  TO service_role;

COMMENT ON FUNCTION public.claim_source_message_ingress(
  uuid, text, text, uuid, text, text, text, text, text, uuid[], uuid[], jsonb, jsonb) IS
  'The single ingress writer: claim first, then audience, event, node, grants, structural edges and delivery outbox in one transaction.';
