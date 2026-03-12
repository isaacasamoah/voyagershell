-- Cartographer v2: Schema additions for competitive promotion/demotion (F3)
-- and retrieval feedback loop (F4).

-- Feature 3: Preference superseding
-- When a new preference supersedes an old one (cosine >= 0.85),
-- the old preference's attention drops to 0.0 and this field is populated.
ALTER TABLE knowledge_current ADD COLUMN IF NOT EXISTS superseded_by UUID;

-- Feature 3: Base attention — original Stage 1 score, never decayed.
-- Decay computes: attention_score = base_attention * decay_factor.
-- This makes decay idempotent — running Cartographer twice at the same distance = same result.
ALTER TABLE knowledge_current ADD COLUMN IF NOT EXISTS base_attention FLOAT;

-- Feature 4: Retrieval feedback
-- Incremented when retrieval finds this event but it wasn't in the prompt window.
-- Effective attention = base_attention + (0.05 * promotion_count), capped at 1.0.
ALTER TABLE knowledge_current ADD COLUMN IF NOT EXISTS promotion_count INTEGER DEFAULT 0;

-- Backfill: set base_attention = attention_score for all existing enriched events
UPDATE knowledge_current SET base_attention = attention_score WHERE base_attention IS NULL AND attention_score IS NOT NULL;

-- Feature 3: Session index for session distance computation
-- Lightweight table tracking session ordering for decay calculation.
-- Populated by Cartographer on each run (upsert).
CREATE TABLE IF NOT EXISTS session_index (
  session_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  event_count INTEGER DEFAULT 0
);

-- Index for user-scoped session lookups (decay needs recent sessions per user)
CREATE INDEX IF NOT EXISTS idx_session_index_user_started
  ON session_index (user_id, started_at DESC);

-- Feature 4: Atomic increment for promotion_count
CREATE OR REPLACE FUNCTION increment_promotion_count(p_event_id UUID)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  UPDATE knowledge_current
  SET promotion_count = COALESCE(promotion_count, 0) + 1,
      updated_at = NOW()
  WHERE event_id = p_event_id;
$$;
