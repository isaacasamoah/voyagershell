-- Migration 033: Make resume_session callable from admin/server context
--
-- The original resume_session(p_session_id UUID) uses auth.uid() for ownership
-- verification. This works for client-side calls (authenticated JWT) but fails
-- when called from the server with the service_role key (auth.uid() = NULL).
--
-- This migration adds an optional p_user_id parameter. When provided (server path),
-- ownership is verified against the supplied ID. When NULL (client path), falls
-- back to auth.uid() for backwards compatibility.
--
-- COALESCE(p_user_id, auth.uid()) covers both call patterns atomically.

DROP FUNCTION IF EXISTS public.resume_session(UUID);

CREATE OR REPLACE FUNCTION public.resume_session(
  p_session_id UUID,
  p_user_id    UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_effective_user_id UUID;
  v_target_user_id    UUID;
  v_target_status     session_status;
BEGIN
  -- Resolve user: explicit arg (server path) takes precedence over JWT claim (client path)
  v_effective_user_id := COALESCE(p_user_id, auth.uid());

  IF v_effective_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Verify ownership and get target session info
  SELECT user_id, status INTO v_target_user_id, v_target_status
  FROM public.sessions
  WHERE id = p_session_id
    AND user_id = v_effective_user_id;

  -- Session not found or not owned by user
  IF v_target_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Can't resume archived sessions
  IF v_target_status = 'archived' THEN
    RETURN FALSE;
  END IF;

  -- Already active, nothing to do
  IF v_target_status = 'active' THEN
    RETURN TRUE;
  END IF;

  -- Archive current active session (if any)
  UPDATE public.sessions
  SET status = 'historical',
      updated_at = NOW()
  WHERE user_id = v_effective_user_id
    AND status = 'active';

  -- Make target session active
  UPDATE public.sessions
  SET status = 'active',
      updated_at = NOW()
  WHERE id = p_session_id;

  RETURN TRUE;
END;
$$;

-- Re-grant to both roles (SECURITY DEFINER function needs explicit grants)
GRANT EXECUTE ON FUNCTION public.resume_session(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resume_session(UUID, UUID) TO service_role;

COMMENT ON FUNCTION public.resume_session IS
  'Activates a historical session, archiving the current active session atomically. '
  'p_user_id: explicit user ID for server-side (admin client) calls; '
  'omit or pass NULL to use auth.uid() for client-side (authenticated JWT) calls.';
