-- APPLY ONLY AT PROD PROMOTION — prod still reads these until Cut 1 ships to main.

ALTER TABLE public.sessions
  DROP COLUMN IF EXISTS room_people,
  DROP COLUMN IF EXISTS ai_present;
