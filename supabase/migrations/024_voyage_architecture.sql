-- =============================================================================
-- Migration 024: Voyage Architecture Foundation (Voyage 1)
-- =============================================================================
--
-- Clean the foundation before building on it:
--   1. Add participants UUID[] to knowledge_events + knowledge_current
--   2. Rename sessions.community_id → sessions.voyage_id
--   3. Add nickname to voyage_members
--   4. Drop is_personal from voyages (IF EXISTS — 022 was skipped on live)
--   5. Slim voyage_role enum to captain + crew
--   6. Drop dead columns from knowledge_current (is_active, is_pinned, importance)
--   7. Rewrite apply_knowledge_event trigger (propagate participants, drop dead columns)
--   8. Rewrite search_knowledge RPC (drop dead columns, add participants param)
--   9. Clean up 022 artifacts (IF EXISTS — may not exist on live)
--
-- =============================================================================

-- =============================================================================
-- STEP 1: Add participants column to knowledge_events + knowledge_current
-- =============================================================================

ALTER TABLE public.knowledge_events
  ADD COLUMN IF NOT EXISTS participants UUID[] DEFAULT NULL;

ALTER TABLE public.knowledge_current
  ADD COLUMN IF NOT EXISTS participants UUID[] DEFAULT NULL;

-- GIN indexes for array containment queries: participants @> ARRAY[user_id]
CREATE INDEX IF NOT EXISTS idx_knowledge_events_participants
  ON public.knowledge_events USING GIN (participants);

CREATE INDEX IF NOT EXISTS idx_knowledge_current_participants
  ON public.knowledge_current USING GIN (participants);

COMMENT ON COLUMN public.knowledge_events.participants IS 'NULL = public (everyone in voyage sees it). UUID array = scoped to listed participants.';
COMMENT ON COLUMN public.knowledge_current.participants IS 'Propagated from knowledge_events via trigger. NULL = public.';

-- =============================================================================
-- STEP 2: Rename sessions.community_id → sessions.voyage_id
-- =============================================================================

ALTER TABLE public.sessions
  RENAME COLUMN community_id TO voyage_id;

-- =============================================================================
-- STEP 3: Add nickname to voyage_members
-- =============================================================================

ALTER TABLE public.voyage_members
  ADD COLUMN IF NOT EXISTS nickname TEXT DEFAULT NULL;

COMMENT ON COLUMN public.voyage_members.nickname IS 'Per-voyage display name override for @mention resolution.';

-- =============================================================================
-- STEP 4: Drop is_personal from voyages (022 may have been skipped)
-- =============================================================================

ALTER TABLE public.voyages
  DROP COLUMN IF EXISTS is_personal;

-- =============================================================================
-- STEP 5: Slim voyage_role enum to captain + crew
-- =============================================================================

-- First migrate any navigator/observer rows to crew
UPDATE public.voyage_members
  SET role = 'crew'
  WHERE role::text IN ('navigator', 'observer');

-- Postgres can't drop enum values, so rename → recreate → retype → drop old
-- Must drop column default + RLS policies that reference the enum type first

-- Drop policies that cast to voyage_role (blocks ALTER TYPE)
DROP POLICY IF EXISTS "Captains can update voyages" ON public.voyages;
DROP POLICY IF EXISTS "Captains can manage members" ON public.voyage_members;

-- Drop column default (references old enum type)
ALTER TABLE public.voyage_members ALTER COLUMN role DROP DEFAULT;

-- Drop functions that return/use voyage_role (blocks DROP TYPE)
DROP FUNCTION IF EXISTS public.get_voyage_role(TEXT, UUID);
DROP FUNCTION IF EXISTS public.get_user_voyages(UUID);

ALTER TYPE voyage_role RENAME TO voyage_role_old;

CREATE TYPE voyage_role AS ENUM ('captain', 'crew');

ALTER TABLE public.voyage_members
  ALTER COLUMN role TYPE voyage_role
  USING role::text::voyage_role;

ALTER TABLE public.voyage_members ALTER COLUMN role SET DEFAULT 'crew'::voyage_role;

DROP TYPE voyage_role_old;

-- Recreate get_voyage_role with new enum type
CREATE FUNCTION public.get_voyage_role(p_voyage_slug TEXT, p_user_id UUID)
RETURNS voyage_role
LANGUAGE SQL STABLE
AS $$
  SELECT vm.role
  FROM voyage_members vm
  JOIN voyages v ON v.id = vm.voyage_id
  WHERE v.slug = p_voyage_slug AND vm.user_id = p_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_voyage_role TO authenticated;

-- Recreate the captain policies with new enum type
CREATE POLICY "Captains can update voyages" ON public.voyages
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM voyage_members vm
      WHERE vm.voyage_id = voyages.id
        AND vm.user_id = auth.uid()
        AND vm.role = 'captain'::voyage_role
    )
  );

CREATE POLICY "Captains can manage members" ON public.voyage_members
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM voyage_members vm
      WHERE vm.voyage_id = voyage_members.voyage_id
        AND vm.user_id = auth.uid()
        AND vm.role = 'captain'::voyage_role
    )
  );

-- =============================================================================
-- STEP 6: Drop dead columns from knowledge_current
-- =============================================================================
-- is_active, is_pinned, importance are dead since Mach 2 (migration 020).
-- attention_score replaced all of these. NOT dropping connected_to — actively used.

ALTER TABLE public.knowledge_current
  DROP COLUMN IF EXISTS is_active,
  DROP COLUMN IF EXISTS is_pinned,
  DROP COLUMN IF EXISTS importance;

-- =============================================================================
-- STEP 7: Rewrite apply_knowledge_event trigger
-- =============================================================================
-- Changes from migration 021 version:
--   + Propagates NEW.participants into knowledge_current
--   - Removes is_active, is_pinned, importance from source event INSERT
--   - Removes quieted/activated/pinned/unpinned/importance_changed branches
--     (dead — no application code creates these event types; attention_score
--      is written directly by Cartographer)

CREATE OR REPLACE FUNCTION public.apply_knowledge_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target_id UUID;
  v_classifications TEXT[];
  v_entities TEXT[];
  v_topics TEXT[];
  v_session_id TEXT;
BEGIN
  -- ==========================================================================
  -- SOURCE EVENTS: Create knowledge_current row (the content IS the knowledge)
  -- ==========================================================================
  IF NEW.event_type IN ('message', 'document', 'slack_message', 'jira_update', 'explicit') THEN
    -- Parse classifications from metadata
    SELECT COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(NEW.metadata->'classifications')),
      '{}'::TEXT[]
    ) INTO v_classifications;

    SELECT COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(NEW.metadata->'entities')),
      '{}'::TEXT[]
    ) INTO v_entities;

    SELECT COALESCE(
      ARRAY(SELECT jsonb_array_elements_text(NEW.metadata->'topics')),
      '{}'::TEXT[]
    ) INTO v_topics;

    -- Extract session_id from metadata (nullable)
    v_session_id := NEW.metadata->>'session_id';

    INSERT INTO public.knowledge_current (
      event_id, user_id, voyage_slug, content,
      classifications, entities, topics,
      participants, session_id,
      source_created_at, updated_at
    ) VALUES (
      NEW.id, NEW.user_id, NEW.voyage_slug, NEW.content,
      v_classifications, v_entities, v_topics,
      NEW.participants, v_session_id,
      NEW.created_at, NOW()
    );

  -- ==========================================================================
  -- UNDERSTANDING EVENTS: Update graph connections
  -- ==========================================================================
  ELSIF NEW.event_type = 'connection' THEN
    -- Add bidirectional connection
    UPDATE public.knowledge_current
    SET connected_to = array_append(
          array_remove(connected_to, (NEW.metadata->>'to_id')::UUID),
          (NEW.metadata->>'to_id')::UUID
        ),
        updated_at = NOW()
    WHERE event_id = (NEW.metadata->>'from_id')::UUID;

    -- Also add reverse connection
    UPDATE public.knowledge_current
    SET connected_to = array_append(
          array_remove(connected_to, (NEW.metadata->>'from_id')::UUID),
          (NEW.metadata->>'from_id')::UUID
        ),
        updated_at = NOW()
    WHERE event_id = (NEW.metadata->>'to_id')::UUID;

  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.apply_knowledge_event IS 'Computes knowledge_current state from event stream. Propagates participants for scoped visibility.';

-- =============================================================================
-- STEP 8: Rewrite search_knowledge RPC
-- =============================================================================
-- Changes from migration 020 version:
--   - Drops is_active, is_pinned, importance from RETURNS
--   - Removes p_include_quiet parameter and kc.is_active WHERE clause
--   - Adds p_participants UUID[] parameter (wired in V2, accepted but unused here)
--   - Adds participants UUID[] to RETURNS
--
-- Must DROP first since RETURNS clause changes.

DROP FUNCTION IF EXISTS public.search_knowledge(
  vector(1536), UUID, TEXT, BOOLEAN, TEXT[], FLOAT, INT, TEXT, FLOAT
);

CREATE FUNCTION public.search_knowledge(
  query_embedding vector(1536),
  p_user_id UUID DEFAULT NULL,
  p_voyage_slug TEXT DEFAULT NULL,
  p_classifications TEXT[] DEFAULT NULL,
  p_match_threshold FLOAT DEFAULT 0.7,
  p_match_count INT DEFAULT 10,
  p_knowledge_type TEXT DEFAULT NULL,
  p_min_attention FLOAT DEFAULT 0.0,
  p_participants UUID[] DEFAULT NULL
)
RETURNS TABLE (
  event_id UUID,
  content TEXT,
  classifications TEXT[],
  entities TEXT[],
  topics TEXT[],
  connected_to UUID[],
  participants UUID[],
  source_created_at TIMESTAMPTZ,
  similarity FLOAT,
  knowledge_type TEXT,
  attention_score REAL,
  context_snippet TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    kc.event_id,
    kc.content,
    kc.classifications,
    kc.entities,
    kc.topics,
    kc.connected_to,
    kc.participants,
    kc.source_created_at,
    (1 - (kc.embedding <=> query_embedding))::FLOAT AS similarity,
    kc.knowledge_type,
    kc.attention_score,
    kc.context_snippet
  FROM public.knowledge_current kc
  WHERE
    -- Scope filter (personal or voyage)
    (
      (p_user_id IS NOT NULL AND kc.user_id = p_user_id) OR
      (p_voyage_slug IS NOT NULL AND kc.voyage_slug = p_voyage_slug)
    )
    -- Attention score filter (replaces old is_active/p_include_quiet)
    AND kc.attention_score >= p_min_attention
    -- Knowledge type filter
    AND (p_knowledge_type IS NULL OR kc.knowledge_type = p_knowledge_type)
    -- Classification filter (optional)
    AND (p_classifications IS NULL OR kc.classifications && p_classifications)
    -- Embedding must exist
    AND kc.embedding IS NOT NULL
    -- Similarity threshold
    AND (1 - (kc.embedding <=> query_embedding)) > p_match_threshold
  ORDER BY
    kc.attention_score DESC,
    (1 - (kc.embedding <=> query_embedding)) DESC
  LIMIT p_match_count;
END;
$$;

COMMENT ON FUNCTION public.search_knowledge IS 'Semantic search over knowledge. attention_score is the single sort/filter field. p_participants accepted for V2 wiring.';

GRANT EXECUTE ON FUNCTION public.search_knowledge TO authenticated;

-- =============================================================================
-- STEP 9: Clean up get_user_voyages RPC
-- =============================================================================
-- Migration 022 may or may not have been applied. Drop and recreate without
-- is_personal in RETURNS.

DROP FUNCTION IF EXISTS public.get_user_voyages(UUID);

CREATE FUNCTION public.get_user_voyages(p_user_id UUID)
RETURNS TABLE (
  voyage_id UUID,
  slug TEXT,
  name TEXT,
  role voyage_role,
  joined_at TIMESTAMPTZ
) AS $$
  SELECT v.id, v.slug, v.name, vm.role, vm.joined_at
  FROM voyages v
  JOIN voyage_members vm ON vm.voyage_id = v.id
  WHERE vm.user_id = p_user_id
  ORDER BY vm.joined_at DESC;
$$ LANGUAGE SQL STABLE;

GRANT EXECUTE ON FUNCTION public.get_user_voyages TO authenticated;

-- =============================================================================
-- STEP 10: Clean up 022 artifacts (IF EXISTS — may not exist on live)
-- =============================================================================

DROP FUNCTION IF EXISTS public.create_personal_voyage(UUID, TEXT);
DROP INDEX IF EXISTS idx_voyages_personal;

-- =============================================================================
-- STEP 11: Update RLS policies that reference sessions.community_id
-- =============================================================================
-- Three policies from migration 010 reference sessions.community_id in subqueries.
-- After the rename in Step 2, these must be recreated with sessions.voyage_id.

-- Policy 1: knowledge_events SELECT
DROP POLICY IF EXISTS "Users can view own knowledge events" ON public.knowledge_events;

CREATE POLICY "Users can view own knowledge events"
  ON public.knowledge_events FOR SELECT
  USING (
    user_id = auth.uid()
    OR
    voyage_slug IN (
      SELECT DISTINCT s.voyage_id::text
      FROM public.sessions s
      WHERE s.user_id = auth.uid() AND s.voyage_id IS NOT NULL
    )
  );

-- Policy 2: knowledge_events INSERT
DROP POLICY IF EXISTS "Users can create own knowledge events" ON public.knowledge_events;

CREATE POLICY "Users can create own knowledge events"
  ON public.knowledge_events FOR INSERT
  WITH CHECK (
    actor_id = auth.uid() AND (
      user_id = auth.uid() OR
      voyage_slug IN (
        SELECT DISTINCT s.voyage_id::text
        FROM public.sessions s
        WHERE s.user_id = auth.uid() AND s.voyage_id IS NOT NULL
      )
    )
  );

-- Policy 3: knowledge_current SELECT
DROP POLICY IF EXISTS "Users can view own current knowledge" ON public.knowledge_current;

CREATE POLICY "Users can view own current knowledge"
  ON public.knowledge_current FOR SELECT
  USING (
    user_id = auth.uid()
    OR
    voyage_slug IN (
      SELECT DISTINCT s.voyage_id::text
      FROM public.sessions s
      WHERE s.user_id = auth.uid() AND s.voyage_id IS NOT NULL
    )
  );
