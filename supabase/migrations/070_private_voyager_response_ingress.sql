-- K2 step 4 · private Voyager response ingress.
--
-- A Voyager response is not a second, independently scoped source fact. It is
-- generated from one claimed human event and must inherit that event's exact
-- immutable audience. This replaces the ingress writer in place so source and
-- response events still have one transactional boundary and one recovery path.
--
-- Synthetic auto-sent welcomes have no human source. They remain permitted
-- only as owner-private conversation events with no recipients.

CREATE OR REPLACE FUNCTION public.claim_source_message_ingress(
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
  v_reply_to uuid;
  v_source record;
BEGIN
  IF p_actor_id IS NULL OR p_content IS NULL OR btrim(p_content) = '' THEN
    RAISE EXCEPTION 'source_ingress_incomplete' USING ERRCODE = '22004';
  END IF;
  IF p_actor_type NOT IN ('user', 'voyager') THEN
    RAISE EXCEPTION 'source_ingress_actor_type_unsupported' USING ERRCODE = '23514';
  END IF;

  IF p_actor_type = 'voyager' THEN
    -- A Voyager can write only the private assistant shape. The audience is
    -- inherited below when a human source exists; these checks prevent caller
    -- arguments from widening it or creating a delivery outbox.
    IF p_space_id IS NOT NULL
      OR p_event_type IS DISTINCT FROM 'conversation'
      OR p_source_type IS DISTINCT FROM 'conversation'
      OR coalesce(p_source_ref->>'role', '') IS DISTINCT FROM 'assistant'
      OR coalesce(p_metadata->>'session_id', '') = ''
      OR coalesce(p_source_ref->>'conversation_id', '')
        IS DISTINCT FROM coalesce(p_metadata->>'session_id', '')
      OR coalesce(array_length(p_recipient_ids, 1), 0) <> 0
      OR public.normalize_knowledge_audience_members(
        coalesce(p_audience_member_ids, '{}'::uuid[]))
        IS DISTINCT FROM ARRAY[p_actor_id]::uuid[]
    THEN
      RAISE EXCEPTION 'voyager_response_not_private' USING ERRCODE = '23514';
    END IF;

    IF p_metadata->>'reply_to_event_id' IS NOT NULL THEN
      IF p_metadata->>'reply_to_event_id' !~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN
        RAISE EXCEPTION 'voyager_response_source_malformed' USING ERRCODE = '22023';
      END IF;
      v_reply_to := (p_metadata->>'reply_to_event_id')::uuid;

      SELECT event.id, event.user_id, event.actor_id, event.actor_type,
        event.event_type, event.source_type, event.voyage_slug,
        event.participants, event.metadata, event.source_ref,
        audience.id audience_id, audience.scope_kind,
        audience.scope_authority_id, audience.member_profile_ids
      INTO v_source
      FROM public.knowledge_events event
      JOIN public.knowledge_audiences audience
        ON audience.id = event.knowledge_audience_id
      WHERE event.id = v_reply_to
        AND event.actor_type = 'user';

      IF NOT FOUND THEN
        RAISE EXCEPTION 'voyager_response_source_unresolved' USING ERRCODE = '23503';
      END IF;
      IF v_source.user_id IS DISTINCT FROM p_actor_id
        OR v_source.actor_id IS DISTINCT FROM p_actor_id
        OR v_source.event_type IS DISTINCT FROM 'conversation'
        OR v_source.source_type IS DISTINCT FROM 'conversation'
        OR v_source.voyage_slug IS DISTINCT FROM p_voyage_slug
        OR coalesce(v_source.metadata->>'session_id',
          v_source.source_ref->>'conversation_id', '')
          IS DISTINCT FROM p_metadata->>'session_id'
        OR public.normalize_knowledge_audience_members(
          coalesce(v_source.participants, '{}'::uuid[]))
          IS DISTINCT FROM ARRAY[p_actor_id]::uuid[]
        OR public.normalize_knowledge_audience_members(
          coalesce(v_source.member_profile_ids, '{}'::uuid[]))
          IS DISTINCT FROM ARRAY[p_actor_id]::uuid[]
      THEN
        RAISE EXCEPTION 'voyager_response_source_not_private' USING ERRCODE = '23514';
      END IF;

      v_scope := v_source.scope_kind;
      v_authority := v_source.scope_authority_id;
      v_members := public.normalize_knowledge_audience_members(
        v_source.member_profile_ids);
      v_audience := v_source.audience_id;
    ELSE
      -- Synthetic welcomes have no source event to inherit. Preserve their old
      -- one-member voyage/private scope, but never accept a wider audience.
      v_members := ARRAY[p_actor_id]::uuid[];
      IF p_voyage_slug IS NOT NULL THEN
        v_scope := 'voyage';
        SELECT voyage.id INTO v_authority
        FROM public.voyages voyage WHERE voyage.slug = p_voyage_slug;
        IF v_authority IS NULL THEN
          RAISE EXCEPTION 'source_ingress_voyage_unresolved' USING ERRCODE = '23503';
        END IF;
      ELSE
        v_scope := 'private';
        v_authority := p_actor_id;
      END IF;
      v_audience := public.canonical_knowledge_audience_id(
        'source', v_scope, v_authority, v_members);
    END IF;
  ELSE
    -- Human source events retain the audience resolution installed by 068.
    IF p_space_id IS NOT NULL THEN
      v_scope := 'space';
      v_authority := p_space_id;
      v_members := public.normalize_knowledge_audience_members(
        coalesce(p_audience_member_ids, ARRAY[p_actor_id]::uuid[]));
    ELSIF p_voyage_slug IS NOT NULL THEN
      v_scope := 'voyage';
      SELECT voyage.id INTO v_authority
      FROM public.voyages voyage WHERE voyage.slug = p_voyage_slug;
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
    v_audience := public.canonical_knowledge_audience_id(
      'source', v_scope, v_authority, v_members);
  END IF;

  v_hash := public.canonical_source_payload_hash(
    p_transport, v_audience::text, p_content);
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

  IF p_actor_type = 'voyager' THEN
    PERFORM public.attest_ingress_structural_edge(
      v_node, public.canonical_graph_node_id('voyager', p_actor_id),
      'generated_by', v_event, v_audience, v_created_at);
  ELSE
    PERFORM public.attest_ingress_structural_edge(
      v_node, public.canonical_graph_node_id('person', p_actor_id),
      'authored_by', v_event, v_audience, v_created_at);
  END IF;
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

REVOKE ALL ON FUNCTION public.claim_source_message_ingress(
  uuid, text, text, uuid, text, text, text, text, text, uuid[], uuid[], jsonb, jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_source_message_ingress(
  uuid, text, text, uuid, text, text, text, text, text, uuid[], uuid[], jsonb, jsonb)
  TO service_role;

COMMENT ON FUNCTION public.claim_source_message_ingress(
  uuid, text, text, uuid, text, text, text, text, text, uuid[], uuid[], jsonb, jsonb) IS
  'The single ingress writer: human sources resolve an audience; Voyager replies inherit their human source audience; both commit event and graph structure atomically.';
