CREATE INDEX IF NOT EXISTS idx_space_members_invited
  ON public.space_members(user_id) WHERE state = 'invited';
