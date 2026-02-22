-- reset-test-data.sql
-- Clean slate for first-time experience testing.
--
-- Preserves: test user's profile and personal voyage
-- Deletes:   test user's conversations, knowledge, agent tasks
-- Deletes:   ALL other users' data (profiles cascade handles most)
-- Does NOT:  touch auth.users — delete non-test users manually via Supabase Dashboard
--
-- Usage: Run via Supabase Management API or SQL Editor
--   1. Run this script
--   2. Go to Supabase Dashboard → Authentication → Users
--   3. Delete all users EXCEPT the test email
--   4. Verify: SELECT count(*) FROM profiles; -- should be 1

-- ============================================================================
-- Step 0: Identify test user
-- ============================================================================
-- Test user is identified by email convention, not a schema flag.
-- Replace the email below with the designated test email.

DO $$
DECLARE
  test_user_id UUID;
  test_email TEXT := 'isaac.asamoah@gmail.com';
BEGIN

  SELECT id INTO test_user_id FROM profiles WHERE email = test_email;

  IF test_user_id IS NULL THEN
    RAISE NOTICE 'Test user not found (email: %). Nothing to preserve.', test_email;
  ELSE
    RAISE NOTICE 'Test user found: % (%)', test_user_id, test_email;
  END IF;

  -- ==========================================================================
  -- Step 1: Delete ALL data for non-test users
  -- ==========================================================================
  -- Most cascades from profiles, but some tables need explicit cleanup.

  -- Explicit deletes (no FK cascade from profiles)
  DELETE FROM retrieval_events WHERE user_id != test_user_id OR test_user_id IS NULL;
  DELETE FROM knowledge_events WHERE user_id != test_user_id OR test_user_id IS NULL;
  -- knowledge_current cascades from knowledge_events via event_id FK

  -- learning_signals: user_id is SET NULL (not CASCADE) from auth.users
  DELETE FROM learning_signals
    WHERE user_id IS NULL
       OR user_id != test_user_id
       OR test_user_id IS NULL;

  -- Profiles cascade handles: sessions → messages, user_memory, agent_tasks, voyage_members
  DELETE FROM profiles WHERE id != test_user_id OR test_user_id IS NULL;

  -- ==========================================================================
  -- Step 2: Clean orphan voyages
  -- ==========================================================================
  -- voyages.created_by has NO CASCADE — orphans survive profile deletion
  DELETE FROM voyages
    WHERE (created_by != test_user_id OR test_user_id IS NULL)
      AND id NOT IN (SELECT voyage_id FROM voyage_members);

  -- ==========================================================================
  -- Step 3: Delete test user's CONVERSATION data (preserve profile + voyage)
  -- ==========================================================================
  IF test_user_id IS NOT NULL THEN
    -- Sessions cascade to messages
    DELETE FROM sessions WHERE user_id = test_user_id;

    -- Explicit cleanup for non-cascading tables
    DELETE FROM agent_tasks WHERE user_id = test_user_id;
    DELETE FROM knowledge_events WHERE user_id = test_user_id;
    -- knowledge_current cascades from knowledge_events
    DELETE FROM retrieval_events WHERE user_id = test_user_id;
    DELETE FROM user_memory WHERE user_id = test_user_id;
    DELETE FROM learning_signals WHERE user_id = test_user_id;

    RAISE NOTICE 'Test user conversation data cleared. Profile and voyage preserved.';
  END IF;

  -- ==========================================================================
  -- Step 4: Verify
  -- ==========================================================================
  RAISE NOTICE '--- Verification ---';
  PERFORM (SELECT count(*) FROM profiles);
  RAISE NOTICE 'Profiles remaining: %', (SELECT count(*) FROM profiles);
  RAISE NOTICE 'Sessions remaining: %', (SELECT count(*) FROM sessions);
  RAISE NOTICE 'Messages remaining: %', (SELECT count(*) FROM messages);
  RAISE NOTICE 'Knowledge events remaining: %', (SELECT count(*) FROM knowledge_events);
  RAISE NOTICE 'Agent tasks remaining: %', (SELECT count(*) FROM agent_tasks);

END $$;

-- After running:
-- 1. Go to Supabase Dashboard → Authentication → Users
-- 2. Delete all users EXCEPT isaac.asamoah@gmail.com
-- 3. Test: fresh magic link → chat → "seeya" → landing
