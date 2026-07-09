-- =============================================================================
-- Migration 040: Event-stream feed audience normalization
-- =============================================================================
--
-- Cut 0.5 displays knowledge_events directly with audience scope:
-- participants @> ARRAY[viewer]. Conversation events created before this cut
-- were author-only in practice but had participants NULL, so backfill them to
-- the author audience used by the new feed.

UPDATE public.knowledge_events
SET participants = ARRAY[user_id]::UUID[]
WHERE event_type = 'conversation'
  AND participants IS NULL
  AND user_id IS NOT NULL;

-- Keep knowledge_current in sync for retrieval surfaces that read the
-- denormalized participant copy.
UPDATE public.knowledge_current kc
SET participants = ke.participants
FROM public.knowledge_events ke
WHERE kc.event_id = ke.id
  AND ke.event_type = 'conversation'
  AND ke.participants IS NOT NULL
  AND kc.participants IS DISTINCT FROM ke.participants;

-- Realtime: the feed listens for conversation events directly. Message
-- delivery rows remain the durable receipt/live catch-up lane.
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.knowledge_events;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
