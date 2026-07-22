-- Room membership is the live audience authority. Publish its transitions so
-- every affected client can replace stale roster UI immediately after an
-- invite, join, removal, leave, or re-entry. RLS still filters which rows each
-- authenticated subscriber may observe (051_privacy_rls_backstop.sql).
DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.space_members;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
