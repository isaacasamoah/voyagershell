ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_username
  ON public.profiles (lower(username))
  WHERE username IS NOT NULL;

UPDATE public.profiles AS profile
SET username = profile.display_name
WHERE profile.username IS NULL
  AND profile.display_name IS NOT NULL
  AND lower(profile.display_name) IN (
    SELECT lower(display_name)
    FROM public.profiles
    WHERE display_name IS NOT NULL
    GROUP BY lower(display_name)
    HAVING count(*) = 1
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.profiles AS claimed
    WHERE claimed.username IS NOT NULL
      AND lower(claimed.username) = lower(profile.display_name)
  );

COMMENT ON COLUMN public.profiles.username IS
  'Global addressing handle; display_name is the message label.';

-- Backfill hygiene: only pattern-valid handles survive; others claim via set_username.
UPDATE public.profiles
SET username = NULL
WHERE username IS NOT NULL
  AND username !~ '^[a-z0-9][a-z0-9_.-]{1,30}$';
