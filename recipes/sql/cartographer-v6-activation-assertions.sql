-- Post-apply assertions for migration 084 (v5 -> v6 context-contract activation).
--
-- These read the live catalog, not the migration file. A file grep proves what
-- was written; only pg_get_functiondef proves what the database actually has.
DO $v6_activation_assertions$
DECLARE
  v_active text;
  v_definition text;
  v_guard record;
BEGIN
  -- 1. Both contract rows exist. v5 is registered; v4 is NOT removed, because
  --    units stamped v4 must keep a live foreign key to their contract.
  IF NOT EXISTS (
    SELECT 1 FROM public.knowledge_extractor_contracts
    WHERE extractor_version = 'cartographer-single-claim-v6'
      AND embedding_model = 'text-embedding-3-small'
      AND embedding_dimensions = 1536
      -- Cast the literal: topic_similarity_threshold is real, and comparing
      -- real to an unqualified numeric goes via float8, where 0.2::real is
      -- 0.20000000298 and never equals 0.2.
      AND topic_similarity_threshold = 0.2::real
      AND topic_candidate_limit = 8
      AND topic_matcher_version = 'topic-retrieval-v4'
  ) THEN
    RAISE EXCEPTION 'v6_contract_row_missing_or_wrong_parameters';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.knowledge_extractor_contracts
    WHERE extractor_version = 'cartographer-single-claim-v4'
  ) THEN
    RAISE EXCEPTION 'v4_contract_row_was_removed';
  END IF;
  -- v5 must survive: it is the artifact the v4-vs-v5 A/B measured, and
  -- reverting the context work must land on v5 rather than back on v4.
  IF NOT EXISTS (
    SELECT 1 FROM public.knowledge_extractor_contracts
    WHERE extractor_version = 'cartographer-single-claim-v5'
  ) THEN
    RAISE EXCEPTION 'v5_contract_row_was_removed';
  END IF;

  -- 2. Exactly one active row, and it points at v5.
  IF (SELECT count(*) FROM public.knowledge_extractor_contract_active) <> 1 THEN
    RAISE EXCEPTION 'active_pointer_is_not_a_singleton';
  END IF;
  SELECT extractor_version INTO STRICT v_active
  FROM public.knowledge_extractor_contract_active WHERE singleton;
  IF v_active <> 'cartographer-single-claim-v6' THEN
    RAISE EXCEPTION 'active_pointer_not_v6:%', v_active;
  END IF;

  -- 3. The topic-identity outcome contract admits both versions.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.knowledge_topic_identity_outcomes'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%cartographer-single-claim-v4%'
      AND pg_get_constraintdef(oid) LIKE '%cartographer-single-claim-v6%'
  ) THEN
    RAISE EXCEPTION 'topic_identity_outcome_contract_not_widened';
  END IF;

  -- 4. Every version-pinned guard admits v5 in the INSTALLED definition.
  --    A guard left v4-only would either reject v5 outright or silently route
  --    it down the generic path and bypass the claim-blocked completion.
  --    Checked per OVERLOAD, not per name: these functions accumulated
  --    signatures across 072-076, and a stale v4-only overload sitting beside
  --    a widened one is exactly the half-migrated state this guards against.
  FOR v_guard IN
    SELECT proname, oid::regprocedure AS signature, pg_get_functiondef(oid) AS definition
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname IN (
        'resolve_knowledge_topic',
        'write_v4_knowledge_unit_topics',
        'complete_knowledge_extraction_attempt',
        'complete_v4_knowledge_extraction_attempt',
        'write_knowledge_topic_identity_backfill',
        'list_knowledge_topic_backfill_jobs',
        'list_knowledge_topic_backfill_units',
        'assert_knowledge_topic_backfill_complete'
      )
  LOOP
    IF v_guard.definition LIKE '%cartographer-single-claim-v4%'
      AND v_guard.definition NOT LIKE '%cartographer-single-claim-v6%' THEN
      RAISE EXCEPTION 'guard_still_v4_only:%', v_guard.signature;
    END IF;
  END LOOP;

  -- Each guarded name must have at least one overload that admits v5, so a
  -- silently-absent function cannot pass the loop above by vacuous truth.
  IF (
    SELECT count(DISTINCT proname) FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND pg_get_functiondef(oid) LIKE '%cartographer-single-claim-v6%'
      AND proname IN (
        'resolve_knowledge_topic',
        'write_v4_knowledge_unit_topics',
        'complete_knowledge_extraction_attempt',
        'complete_v4_knowledge_extraction_attempt',
        'write_knowledge_topic_identity_backfill',
        'list_knowledge_topic_backfill_jobs',
        'list_knowledge_topic_backfill_units',
        'assert_knowledge_topic_backfill_complete'
      )
  ) <> 8 THEN
    RAISE EXCEPTION 'not_every_guard_name_admits_v6';
  END IF;

  -- 5. Activation resolves to v5 through the function the backfill calls.
  IF public.activate_knowledge_topic_contract() <> 'cartographer-single-claim-v6' THEN
    RAISE EXCEPTION 'activation_function_does_not_return_v6';
  END IF;

  -- 6. The backfill re-derivation still STAMPS v4. Backfilled units really were
  --    derived under the v4 topic contract; restamping them v5 would claim a
  --    judgement v5 never made.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname = 'write_knowledge_topic_identity_backfill'
      AND pg_get_functiondef(oid) LIKE '%cartographer-single-claim-v6%'
      AND pg_get_functiondef(oid)
        LIKE '%VALUES (p_unit_id, ''cartographer-single-claim-v4'', p_raw_output)%'
  ) THEN
    RAISE EXCEPTION 'backfill_outcome_stamp_no_longer_v4';
  END IF;
END $v6_activation_assertions$;

SELECT 'CARTOGRAPHER_V6_ACTIVATION_GREEN';
