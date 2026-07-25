-- K2 · source intent — the exactly-once claim that runs AFTER auth and audience
-- resolution and BEFORE any model call or fan-out (claim C7).
--
-- The key is deliberately (actor, transport, client_message_id) WITHOUT the
-- payload hash. Putting the hash in the key would let the same key carrying a
-- DIFFERENT payload insert a second row and succeed, which is precisely the
-- case C7 requires to fail. The hash is therefore a non-key column that the
-- claim compares: identical payload replays the winner's event, a different
-- payload raises. One retry can never produce a second event, a second delivery
-- set, or a second model call.
--
-- The event FK is DEFERRABLE INITIALLY DEFERRED so the claim can be taken
-- before the event row exists — the same ordering migration 053 already proved
-- for share promotion — without ever committing an orphan.

CREATE TABLE public.knowledge_source_intents (
  actor_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  transport text NOT NULL CHECK (transport IN ('chat', 'room', 'share', 'agent')),
  client_message_id text NOT NULL CHECK (
    length(btrim(client_message_id)) > 0 AND length(client_message_id) <= 200),
  payload_hash bytea NOT NULL CHECK (octet_length(payload_hash) = 32),
  event_id uuid NOT NULL UNIQUE,
  claimed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, transport, client_message_id),
  CONSTRAINT knowledge_source_intents_event_fkey FOREIGN KEY (event_id)
    REFERENCES public.knowledge_events(id) ON DELETE RESTRICT
    DEFERRABLE INITIALLY DEFERRED
);

ALTER TABLE public.knowledge_source_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.knowledge_source_intents FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.knowledge_source_intents TO service_role;

COMMENT ON TABLE public.knowledge_source_intents IS
  'Server-private exactly-once claim for one ingress intent: actor + transport + client message id, with the payload hash as conflict evidence.';

-- The canonical payload digest. One derivation shared by the claim and by every
-- caller, so a client and the database can never disagree about whether two
-- requests carry the same payload.
CREATE FUNCTION public.canonical_source_payload_hash(
  p_transport text, p_scope_ref text, p_content text) RETURNS bytea
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path = pg_catalog AS $$
  SELECT sha256(convert_to(
    format('voyager-intent:v1:%s:%s:%s', p_transport, p_scope_ref, p_content), 'UTF8'))
$$;

-- Claim one intent. Returns the winning event id and whether this caller
-- created it or replayed an existing claim. A same-key/different-payload
-- attempt raises 23505 and commits nothing — the caller must not proceed to a
-- model call or a fan-out.
CREATE FUNCTION public.claim_source_intent(
  p_actor_id uuid, p_transport text, p_client_message_id text,
  p_payload_hash bytea, p_event_id uuid)
RETURNS TABLE (event_id uuid, status text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  v_claimed uuid;
  v_existing_event uuid;
  v_existing_hash bytea;
BEGIN
  IF p_actor_id IS NULL OR p_event_id IS NULL OR p_payload_hash IS NULL THEN
    RAISE EXCEPTION 'source_intent_incomplete' USING ERRCODE = '22004';
  END IF;

  INSERT INTO public.knowledge_source_intents AS intent (
    actor_id, transport, client_message_id, payload_hash, event_id)
  VALUES (p_actor_id, p_transport, p_client_message_id, p_payload_hash, p_event_id)
  ON CONFLICT (actor_id, transport, client_message_id) DO NOTHING
  RETURNING intent.event_id INTO v_claimed;

  IF v_claimed IS NOT NULL THEN
    RETURN QUERY SELECT v_claimed, 'created'::text;
    RETURN;
  END IF;

  -- A concurrent winner already holds this key. Take a share lock on its row so
  -- the comparison cannot race a rollback, then decide on the payload alone.
  SELECT intent.event_id, intent.payload_hash
  INTO v_existing_event, v_existing_hash
  FROM public.knowledge_source_intents intent
  WHERE intent.actor_id = p_actor_id
    AND intent.transport = p_transport
    AND intent.client_message_id = p_client_message_id
  FOR SHARE;

  IF v_existing_event IS NULL THEN
    RAISE EXCEPTION 'source_intent_claim_vanished' USING ERRCODE = '40001';
  END IF;
  IF v_existing_hash IS DISTINCT FROM p_payload_hash THEN
    RAISE EXCEPTION 'source_intent_payload_conflict' USING ERRCODE = '23505';
  END IF;

  RETURN QUERY SELECT v_existing_event, 'replayed'::text;
END $$;

REVOKE ALL ON FUNCTION public.canonical_source_payload_hash(text, text, text),
  public.claim_source_intent(uuid, text, text, bytea, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.canonical_source_payload_hash(text, text, text),
  public.claim_source_intent(uuid, text, text, bytea, uuid) TO service_role;
