-- K5a C7/G9 cutover. 080 must have drained the deployment-window v4 surface
-- before the event-native authority replaces the retired projection.
BEGIN;

DO $cutover_precondition$
DECLARE v_marker_count integer; v_undrained integer;
BEGIN
  SELECT count(*) INTO v_marker_count
  FROM public.knowledge_extraction_coverage_backfill_markers
  WHERE extractor_version = 'cartographer-single-claim-v4';
  IF v_marker_count <> 1 THEN
    RAISE EXCEPTION 'k5a_081_backfill_marker_missing:%', v_marker_count;
  END IF;
  SELECT count(*) INTO v_undrained
  FROM public.knowledge_extraction_jobs job
  JOIN public.knowledge_events event ON event.id = job.source_event_id
  JOIN public.knowledge_audiences audience ON audience.id = event.knowledge_audience_id
  WHERE job.extractor_version = 'cartographer-single-claim-v4'
    AND job.state NOT IN ('succeeded', 'no_claim')
    AND event.actor_type = 'user'
    AND event.event_type IN ('conversation', 'message')
    AND audience.purpose = 'source';
  IF v_undrained <> 0 THEN
    RAISE EXCEPTION 'k5a_081_backfill_undrained:%', v_undrained;
  END IF;
END $cutover_precondition$;

-- The deployment-window trigger is no longer an authority. New ingress writes
-- the immutable event plus its graph audience through the claim RPC instead.
DROP TRIGGER IF EXISTS on_knowledge_event_insert ON public.knowledge_events;
DROP FUNCTION IF EXISTS public.apply_knowledge_event();

-- Promotion remains atomic, but the event insert is now the sole durable write;
-- the old knowledge_current UPDATE is deliberately gone.
CREATE OR REPLACE FUNCTION public.promote_private_voyager_reply(
  p_source_event_id uuid, p_conversation_id uuid, p_user_id uuid
) RETURNS TABLE(shared_event_id uuid, status text, shared_content text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_space_id uuid; v_voyage_id uuid; v_voyage_slug text;
  v_source_content text; v_existing uuid; v_new uuid := gen_random_uuid();
  v_claimed uuid; v_participants uuid[]; v_recipients uuid[]; v_sender_name text;
BEGIN
  SELECT session.space_id, session.voyage_id, voyage.slug INTO v_space_id, v_voyage_id, v_voyage_slug
  FROM public.sessions session JOIN public.spaces space ON space.id = session.space_id
  LEFT JOIN public.voyages voyage ON voyage.id = session.voyage_id
  WHERE session.id = p_conversation_id AND session.user_id = p_user_id
    AND space.voyage_id IS NOT DISTINCT FROM session.voyage_id FOR SHARE OF session, space;
  IF NOT FOUND THEN RAISE EXCEPTION 'share_session_access_denied' USING ERRCODE = '42501'; END IF;
  IF v_voyage_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.voyage_members member WHERE member.voyage_id = v_voyage_id
      AND member.user_id = p_user_id AND member.state = 'active')
  THEN RAISE EXCEPTION 'share_session_access_denied' USING ERRCODE = '42501'; END IF;
  SELECT event.content INTO v_source_content FROM public.knowledge_events event
  WHERE event.id = p_source_event_id AND event.event_type = 'conversation'
    AND event.actor_type = 'voyager' AND event.user_id = p_user_id
    AND event.participants = ARRAY[p_user_id]::uuid[]
    AND event.metadata->>'session_id' = p_conversation_id::text
    AND event.source_ref->>'conversation_id' = p_conversation_id::text
    AND event.source_ref->>'role' = 'assistant'
    AND event.voyage_slug IS NOT DISTINCT FROM v_voyage_slug
    AND nullif(btrim(event.content), '') IS NOT NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'share_source_not_shareable' USING ERRCODE = '42501'; END IF;
  IF v_voyage_id IS NULL THEN
    SELECT array_agg(member.user_id ORDER BY member.user_id) INTO v_participants
    FROM public.space_members member WHERE member.space_id = v_space_id AND member.state = 'active'
    FOR UPDATE;
  ELSE
    SELECT array_agg(child.user_id ORDER BY child.user_id) INTO v_participants
    FROM public.voyage_members parent JOIN public.space_members child ON child.user_id = parent.user_id
    WHERE parent.voyage_id = v_voyage_id AND parent.state = 'active'
      AND child.space_id = v_space_id AND child.state = 'active' FOR UPDATE;
  END IF;
  IF NOT p_user_id = ANY(coalesce(v_participants, ARRAY[]::uuid[]))
  THEN RAISE EXCEPTION 'share_not_active_in_room' USING ERRCODE = '42501'; END IF;
  SELECT promotion.shared_event_id INTO v_existing FROM public.private_reply_promotions promotion
  WHERE promotion.source_event_id = p_source_event_id AND promotion.sharer_user_id = p_user_id
    AND promotion.destination_space_id = v_space_id;
  IF v_existing IS NOT NULL THEN RETURN QUERY SELECT v_existing, 'replayed'::text, v_source_content; RETURN; END IF;
  v_recipients := array_remove(v_participants, p_user_id);
  IF coalesce(cardinality(v_recipients), 0) = 0
  THEN RAISE EXCEPTION 'share_room_has_no_audience' USING ERRCODE = 'P0001'; END IF;
  SELECT coalesce(profile.display_name, profile.username, 'Someone') INTO v_sender_name
  FROM public.profiles profile WHERE profile.id = p_user_id;
  INSERT INTO public.private_reply_promotions(source_event_id, sharer_user_id, destination_space_id, shared_event_id)
  VALUES (p_source_event_id, p_user_id, v_space_id, v_new)
  ON CONFLICT (source_event_id, sharer_user_id, destination_space_id) DO NOTHING
  RETURNING private_reply_promotions.shared_event_id INTO v_claimed;
  IF v_claimed IS NULL THEN
    SELECT promotion.shared_event_id INTO v_existing FROM public.private_reply_promotions promotion
    WHERE promotion.source_event_id = p_source_event_id AND promotion.sharer_user_id = p_user_id
      AND promotion.destination_space_id = v_space_id;
    RETURN QUERY SELECT v_existing, 'replayed'::text, v_source_content; RETURN;
  END IF;
  INSERT INTO public.knowledge_events(
    id, event_type, user_id, voyage_slug, participants, content, metadata, source_type, source_ref,
    actor_id, actor_type
  ) VALUES (
    v_new, 'message', p_user_id, v_voyage_slug, v_participants, v_source_content,
    jsonb_build_object('classifications', '[]'::jsonb, 'entities', '[]'::jsonb, 'topics', '[]'::jsonb,
      'addressed_to', to_jsonb(v_recipients), 'source', 'shared-voyager',
      'sender_display_name', v_sender_name, 'sender_user_id', p_user_id),
    'conversation', NULL, p_user_id, 'user');
  INSERT INTO public.message_deliveries(event_id, recipient_user_id)
  SELECT v_new, recipient FROM unnest(v_recipients) recipient
  ON CONFLICT (event_id, recipient_user_id) DO NOTHING;
  UPDATE public.sessions SET last_message_at = now(), updated_at = now() WHERE id = p_conversation_id;
  RETURN QUERY SELECT v_new, 'created'::text, v_source_content;
END $$;

-- Re-home direct-message reads on immutable events and graph grants. No
-- caller-scope helper or knowledge_current projection remains on this path.
DROP FUNCTION IF EXISTS public.get_voyage_messages(uuid, text, timestamptz, integer);
CREATE FUNCTION public.get_voyage_messages(
  p_user_id uuid, p_voyage_slug text, p_since timestamptz, p_max_count integer
) RETURNS TABLE(event_id uuid, content text, source_created_at timestamptz,
  sender_display_name text, sender_user_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT event.id, event.content, event.created_at,
    event.metadata->>'sender_display_name', (event.metadata->>'sender_user_id')::uuid
  FROM public.knowledge_events event
  JOIN public.voyages voyage ON voyage.slug = event.voyage_slug
  JOIN public.voyage_members member ON member.voyage_id = voyage.id
    AND member.user_id = p_user_id AND member.state = 'active'
  JOIN public.graph_nodes node ON node.kind = 'message_event' AND node.authority_id = event.id
  WHERE p_voyage_slug IS NOT NULL AND event.event_type = 'message'
    AND event.voyage_slug = p_voyage_slug AND event.created_at >= p_since
    AND (event.metadata->>'sender_user_id')::uuid IS DISTINCT FROM p_user_id
    AND event.metadata->'addressed_to' @> to_jsonb(ARRAY[p_user_id]::uuid[])
    AND public.viewer_has_graph_node_grant(node.id, p_user_id)
  ORDER BY event.created_at DESC LIMIT least(greatest(p_max_count, 1), 50)
$$;

DROP FUNCTION IF EXISTS public.knowledge_in_scope(uuid, text, text, text, uuid[], uuid, text, uuid[]);
DROP FUNCTION IF EXISTS public.authorize_knowledge_scope(text, uuid, text);
DROP FUNCTION IF EXISTS public.search_knowledge(vector, uuid, text, text[], double precision, integer, text, double precision);
DROP FUNCTION IF EXISTS public.keyword_search(text, uuid, text, text, double precision, integer);
DROP FUNCTION IF EXISTS public.keyword_search(text, uuid, text, text, double precision, integer, uuid[]);
DROP FUNCTION IF EXISTS public.scoped_knowledge_fetch(uuid, text, text, text, boolean, timestamptz, timestamptz, double precision, integer, uuid);
DROP FUNCTION IF EXISTS public.get_knowledge_by_ids(uuid[], uuid, text);
DROP FUNCTION IF EXISTS public.graph_traverse(uuid, uuid, text, text, text, integer, double precision, integer);
DROP FUNCTION IF EXISTS public.update_knowledge_embedding(uuid, vector);
DROP FUNCTION IF EXISTS public.increment_promotion_count(uuid);

-- The old projection is retired last. CASCADE removes only its historical
-- trigger/index/policy dependencies; 079's unit-native reads do not depend on it.
DROP TABLE IF EXISTS public.knowledge_current CASCADE;

-- Native v3 is the only graph claim retrieval function after this boundary.
DROP FUNCTION IF EXISTS public.retrieve_knowledge_graph_claims_v2(uuid, uuid, uuid[], integer, integer, integer);

COMMIT;
