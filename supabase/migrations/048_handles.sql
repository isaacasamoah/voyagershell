-- Handles: ONE uniqueness namespace over humans + voyagers.
-- `@wren` and `@tom` resolve in a single lookup with zero human/agent ambiguity
-- — the "symbol grammar is navigation infrastructure" bet. `#channel` / `!voyage`
-- handles land here later for free.
CREATE TABLE IF NOT EXISTS public.handles (
  handle         TEXT PRIMARY KEY,
  kind           TEXT NOT NULL CHECK (kind IN ('human', 'voyager')),
  owner_user_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Case-insensitive uniqueness across the WHOLE namespace — a human and a
-- voyager can never claim the same handle in different case.
CREATE UNIQUE INDEX IF NOT EXISTS idx_handles_lower ON public.handles (lower(handle));
CREATE INDEX IF NOT EXISTS idx_handles_owner ON public.handles (owner_user_id);

COMMENT ON TABLE public.handles IS
  'Shared addressing namespace. kind=human is a person''s username; kind=voyager is their agent''s name (default <username>.voyager). owner_user_id is the human owner in both cases.';

-- Backfill every existing human username as a kind=human handle.
INSERT INTO public.handles (handle, kind, owner_user_id)
SELECT lower(p.username), 'human', p.id
FROM public.profiles p
WHERE p.username IS NOT NULL
ON CONFLICT (handle) DO NOTHING;

-- Derive each such user's default voyager handle `<username>.voyager`.
-- (deriveVoyagerHandle() in lib/messaging/address.ts is the runtime twin of
-- this expression — one derivation, two call sites, no drift.)
INSERT INTO public.handles (handle, kind, owner_user_id)
SELECT lower(p.username) || '.voyager', 'voyager', p.id
FROM public.profiles p
WHERE p.username IS NOT NULL
ON CONFLICT (handle) DO NOTHING;
