-- =============================================================================
-- Migration 039: room participants (the Room — communication primitives Ch.1)
-- =============================================================================
-- A session becomes a ROOM with a participant set:
--   room_people — humans added via +person (uuid[] of user_ids)
--   ai_present  — is Voyager in the room (responds)? default TRUE (talk to AI).
-- Adding a person defaults ai_present to FALSE in code (you've entered a human
-- thread); +voyager brings the AI back. Additive + defaulted → safe on the
-- shared DB; old code ignores these columns.
-- =============================================================================

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS room_people UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS ai_present BOOLEAN NOT NULL DEFAULT TRUE;
