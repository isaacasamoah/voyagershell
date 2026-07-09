-- =============================================================================
-- Migration 041: participant-aware RLS on knowledge_events (Realtime safety)
-- =============================================================================
-- Migration 040 added knowledge_events to the supabase_realtime publication so
-- the feed can receive live inserts. The existing SELECT policy gated on
-- user_id OR a voyage clause — but the voyage clause is DEAD CODE (compares a
-- slug string `voyage_slug` to `voyage_id::text`, a UUID — never matches), so
-- RLS silently collapsed to owner-only. That's safe today ONLY by accident:
-- the moment anyone "fixes" the voyage comparison, Realtime would broadcast
-- every voyage member's private conversation turns + message bodies.
--
-- Replace it with a PARTICIPANT-aware policy: you see an event iff you authored
-- it (user_id) OR you're in its audience (participants @> [you]). This is the
-- same audience the /api/feed query uses — RLS now matches the app filter, and
-- Realtime privacy no longer depends on a bug.
-- =============================================================================

DROP POLICY IF EXISTS "Users can view own knowledge events" ON public.knowledge_events;

CREATE POLICY "Users can view own knowledge events"
  ON public.knowledge_events
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR participants @> ARRAY[auth.uid()]
  );
