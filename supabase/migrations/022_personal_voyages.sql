-- Migration: 022_personal_voyages.sql
-- Adds personal voyage support: is_personal column, auto-creation function, backfill

-- =============================================================================
-- ADD is_personal COLUMN
-- =============================================================================

ALTER TABLE voyages ADD COLUMN IF NOT EXISTS is_personal BOOLEAN NOT NULL DEFAULT false;

-- Index for quick personal voyage lookup per user
CREATE INDEX IF NOT EXISTS idx_voyages_personal
  ON voyages(created_by) WHERE is_personal = true;

-- =============================================================================
-- CREATE PERSONAL VOYAGE FUNCTION
-- =============================================================================

-- Idempotent function to create a personal voyage for a user.
-- Returns existing personal voyage ID if one already exists.
CREATE OR REPLACE FUNCTION create_personal_voyage(
  p_user_id UUID,
  p_slug TEXT
)
RETURNS UUID AS $$
DECLARE
  v_voyage_id UUID;
BEGIN
  -- Check if personal voyage already exists
  SELECT id INTO v_voyage_id
  FROM voyages
  WHERE created_by = p_user_id AND is_personal = true;

  IF v_voyage_id IS NOT NULL THEN
    RETURN v_voyage_id;
  END IF;

  -- Create the personal voyage
  INSERT INTO voyages (name, slug, description, created_by, is_personal, is_public)
  VALUES ('Personal', p_slug, 'Your private knowledge space', p_user_id, true, false)
  RETURNING id INTO v_voyage_id;

  -- Add user as captain
  INSERT INTO voyage_members (voyage_id, user_id, role)
  VALUES (v_voyage_id, p_user_id, 'captain');

  RETURN v_voyage_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION create_personal_voyage TO authenticated;

-- =============================================================================
-- UPDATE get_user_voyages TO RETURN is_personal
-- =============================================================================

CREATE OR REPLACE FUNCTION get_user_voyages(p_user_id UUID)
RETURNS TABLE (
  voyage_id UUID,
  slug TEXT,
  name TEXT,
  role voyage_role,
  is_personal BOOLEAN,
  joined_at TIMESTAMPTZ
) AS $$
  SELECT v.id, v.slug, v.name, vm.role, v.is_personal, vm.joined_at
  FROM voyages v
  JOIN voyage_members vm ON vm.voyage_id = v.id
  WHERE vm.user_id = p_user_id
  ORDER BY v.is_personal DESC, vm.joined_at DESC;
$$ LANGUAGE SQL STABLE;

-- =============================================================================
-- BACKFILL: Create personal voyages for existing users without one
-- =============================================================================

DO $$
DECLARE
  r RECORD;
  v_voyage_id UUID;
BEGIN
  FOR r IN
    SELECT DISTINCT p.id AS user_id
    FROM profiles p
    WHERE NOT EXISTS (
      SELECT 1 FROM voyages v
      WHERE v.created_by = p.id AND v.is_personal = true
    )
  LOOP
    PERFORM create_personal_voyage(
      r.user_id,
      'personal-' || substr(r.user_id::text, 1, 8)
    );
  END LOOP;
END;
$$;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON COLUMN voyages.is_personal IS 'True for auto-created personal voyages (one per user, undeletable)';
COMMENT ON FUNCTION create_personal_voyage IS 'Idempotent: creates personal voyage for user or returns existing ID';
