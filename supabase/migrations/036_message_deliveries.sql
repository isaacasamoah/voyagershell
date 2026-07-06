-- =============================================================================
-- Migration 036: message_deliveries — the Ledger's receipts facet (M0.1)
-- =============================================================================
--
-- Delivery ≠ awareness: delivery is pure code on its own clock. This table IS
-- that clock's state — one row per recipient per message, written at send time
-- (fan-out on write). It is the single delivery truth:
--   * Realtime-friendly: postgres_changes can filter eq(recipient_user_id)
--     (array containment on addressed_to[] cannot be filtered).
--   * Durable: offline recipients catch up on login from undelivered rows.
--   * Honest receipts: sent (row exists) → delivered_at → seen_at.
--
-- Clean-cut trajectory (messaging-m0 design doc): this REPLACES the pull-era
-- delivery state — voyage_members.last_seen_at and knowledge_current
-- delivery lifecycle columns (027) migrate here across M0/M1 and are then
-- dropped. One delivery truth, never two.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.message_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The message (a knowledge event with event_type='message')
  event_id UUID NOT NULL REFERENCES public.knowledge_events(id) ON DELETE CASCADE,

  -- Who this copy is for
  recipient_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- Receipt lifecycle: row exists = sent; delivered = reached a client;
  -- seen = actually viewed by the human. NULLs are honest.
  delivered_at TIMESTAMPTZ DEFAULT NULL,
  seen_at TIMESTAMPTZ DEFAULT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (event_id, recipient_user_id)
);

-- Recipient's pending pile (the welcome-brief query): undelivered/unseen first
CREATE INDEX IF NOT EXISTS idx_message_deliveries_recipient_pending
  ON public.message_deliveries (recipient_user_id, created_at DESC)
  WHERE seen_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_message_deliveries_event
  ON public.message_deliveries (event_id);

-- RLS: recipients read + update (receipts) their own rows. Inserts are
-- server-side only (service role fan-out) — no INSERT policy on purpose.
ALTER TABLE public.message_deliveries ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS message_deliveries_recipient_select ON public.message_deliveries;
CREATE POLICY message_deliveries_recipient_select ON public.message_deliveries
  FOR SELECT USING (auth.uid() = recipient_user_id);

DROP POLICY IF EXISTS message_deliveries_recipient_update ON public.message_deliveries;
CREATE POLICY message_deliveries_recipient_update ON public.message_deliveries
  FOR UPDATE USING (auth.uid() = recipient_user_id)
  WITH CHECK (auth.uid() = recipient_user_id);

-- Receipts are update-only in two columns: recipients may stamp delivered_at
-- and seen_at, never re-point a receipt at a different message or user
-- (RLS WITH CHECK covers recipient_user_id; this trigger closes event_id).
CREATE OR REPLACE FUNCTION public.message_deliveries_immutable_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF NEW.event_id IS DISTINCT FROM OLD.event_id
     OR NEW.recipient_user_id IS DISTINCT FROM OLD.recipient_user_id
     OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
    RAISE EXCEPTION 'message_deliveries: identity and ordering columns are immutable';
  END IF;
  -- Receipts only move forward: a stamped delivered_at/seen_at can be
  -- updated but never cleared (no un-seeing).
  IF (OLD.delivered_at IS NOT NULL AND NEW.delivered_at IS NULL)
     OR (OLD.seen_at IS NOT NULL AND NEW.seen_at IS NULL) THEN
    RAISE EXCEPTION 'message_deliveries: receipts cannot be cleared';
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_message_deliveries_immutable ON public.message_deliveries;
CREATE TRIGGER trg_message_deliveries_immutable
  BEFORE UPDATE ON public.message_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.message_deliveries_immutable_identity();

-- Offline catch-up access pattern (recipient + not-yet-delivered): the
-- seen_at partial index does NOT cover delivered_at IS NULL queries.
CREATE INDEX IF NOT EXISTS idx_message_deliveries_recipient_undelivered
  ON public.message_deliveries (recipient_user_id, created_at DESC)
  WHERE delivered_at IS NULL;

-- Realtime: the client's live wire subscribes to INSERTs on this table.
-- M0.2 client contract: subscribe on an AUTHENTICATED channel (RLS applies to
-- postgres_changes) AND filter recipient_user_id=eq.<userId> server-side.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.message_deliveries;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON TABLE public.message_deliveries IS
  'Ledger receipts facet: one row per recipient per message. Single delivery truth (replaces last_seen_at + knowledge_current delivery lifecycle). sent=row, delivered_at=reached a client, seen_at=human saw it.';
