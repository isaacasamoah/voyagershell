-- Handles RLS: the table is an addressing index, not public data. Lock it so a
-- browser client can read only ITS OWN handles (for the composer badge / self
-- identity) — never the whole handle→owner map. All writes go through the
-- service-role admin client (set_username / name_voyager), which bypasses RLS,
-- so there is deliberately no client INSERT/UPDATE policy: claiming a handle
-- stays server-side behind set_username-style validation.
ALTER TABLE public.handles ENABLE ROW LEVEL SECURITY;

CREATE POLICY handles_select_own ON public.handles
  FOR SELECT
  TO authenticated
  USING (owner_user_id = (SELECT auth.uid()));
