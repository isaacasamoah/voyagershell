-- =============================================================================
-- Migration 041b: shared spaces for room participants
-- =============================================================================
-- Additive only. Dev and prod currently share one Supabase database, and prod
-- still reads sessions.room_people / sessions.ai_present until Cut 1 ships to
-- main. The old columns are intentionally left in place here.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.spaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL DEFAULT 'room',
  voyage_id UUID REFERENCES public.voyages(id) ON DELETE CASCADE,
  ai_present BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.space_members (
  space_id UUID NOT NULL REFERENCES public.spaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  state TEXT NOT NULL DEFAULT 'active' CHECK (state IN ('invited', 'active', 'left')),
  added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (space_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_spaces_voyage ON public.spaces(voyage_id);
CREATE INDEX IF NOT EXISTS idx_space_members_user ON public.space_members(user_id);
CREATE INDEX IF NOT EXISTS idx_space_members_active
  ON public.space_members(space_id, user_id)
  WHERE state = 'active';

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS space_id UUID REFERENCES public.spaces(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_sessions_space ON public.sessions(space_id);

DO $$
DECLARE
  session_row RECORD;
  new_space_id UUID;
BEGIN
  FOR session_row IN
    SELECT id, user_id, voyage_id, room_people, ai_present
    FROM public.sessions
    WHERE space_id IS NULL
      AND COALESCE(array_length(room_people, 1), 0) > 0
  LOOP
    INSERT INTO public.spaces (voyage_id, ai_present, created_by)
    VALUES (session_row.voyage_id, COALESCE(session_row.ai_present, TRUE), session_row.user_id)
    RETURNING id INTO new_space_id;

    INSERT INTO public.space_members (space_id, user_id, state)
    SELECT new_space_id, member_id, 'active'
    FROM (
      SELECT session_row.user_id AS member_id
      UNION
      SELECT unnest(session_row.room_people) AS member_id
    ) members
    WHERE member_id IS NOT NULL
    ON CONFLICT (space_id, user_id)
    DO UPDATE SET state = 'active';

    UPDATE public.sessions
    SET space_id = new_space_id
    WHERE id = session_row.id;
  END LOOP;
END $$;
