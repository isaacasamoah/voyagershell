\set ON_ERROR_STOP on

DO $k5a_c1_c2$
DECLARE
  v_owner uuid := '72000000-0000-4000-8000-000000000001';
  v_member uuid := '72000000-0000-4000-8000-000000000002';
  v_shared_session text := '72000000-0000-4000-8000-000000000012';
  v_shared_unit uuid;
  v_private_unit uuid;
  v_source_created timestamptz;
  v_new_session uuid;
  v_before_digest text;
  v_after_digest text;
  v_inserted integer;
  v_owner_attention real;
  v_member_attention real;
  v_distance integer;
  v_row record;
  i integer;
BEGIN
  SELECT unit.id, event.created_at INTO STRICT v_shared_unit, v_source_created
  FROM public.knowledge_units unit
  JOIN public.knowledge_events event ON event.id = unit.source_event_id
  WHERE unit.claim = 'The quantum engines are stable.';
  SELECT unit.id INTO STRICT v_private_unit
  FROM public.knowledge_units unit
  WHERE unit.claim = 'The private telescope plan starts after midnight.';
  SELECT md5(string_agg(to_jsonb(unit)::text, '' ORDER BY unit.id))
  INTO v_before_digest FROM public.knowledge_units unit;

  IF EXISTS (
    SELECT 1 FROM public.session_index index_row
    JOIN public.sessions session ON session.id::text = index_row.session_id
    WHERE index_row.session_id = v_shared_session
      AND index_row.started_at IS DISTINCT FROM session.created_at
  ) THEN
    RAISE EXCEPTION 'k5a_legacy_session_timestamp_not_normalized';
  END IF;

  PERFORM public.upsert_person_session_index(v_owner, v_shared_session, 1);
  PERFORM public.upsert_person_session_index(v_member, v_shared_session, 1);
  IF (SELECT count(*) FROM public.session_index
      WHERE session_id = v_shared_session
        AND user_id IN (v_owner, v_member)) <> 2
    OR EXISTS (
      SELECT 1 FROM public.session_index index_row
      JOIN public.sessions session ON session.id::text = index_row.session_id
      WHERE index_row.session_id = v_shared_session
        AND index_row.started_at IS DISTINCT FROM session.created_at
    ) THEN
    RAISE EXCEPTION 'k5a_per_person_session_upsert_failed';
  END IF;

  SELECT public.record_knowledge_unit_citations(
    v_owner, v_shared_session, 'standing', ARRAY[v_shared_unit]
  ) INTO STRICT v_inserted;
  IF v_inserted <> 1 THEN RAISE EXCEPTION 'k5a_first_standing_citation_missing'; END IF;
  FOR i IN 1..2 LOOP
    SELECT public.record_knowledge_unit_citations(
      v_owner, v_shared_session, 'standing', ARRAY[v_shared_unit, v_shared_unit]
    ) INTO STRICT v_inserted;
    IF v_inserted <> 0 THEN RAISE EXCEPTION 'k5a_citation_replay_duplicated'; END IF;
  END LOOP;
  IF public.record_knowledge_unit_citations(
      v_owner, v_shared_session, 'reach', ARRAY[v_shared_unit]
    ) <> 1
    OR public.record_knowledge_unit_citations(
      v_owner, v_shared_session, 'search', ARRAY[v_shared_unit]
    ) <> 1
    OR public.record_knowledge_unit_citations(
      v_member, v_shared_session, 'standing', ARRAY[v_shared_unit]
    ) <> 1 THEN
    RAISE EXCEPTION 'k5a_channelled_citation_insert_failed';
  END IF;
  IF (SELECT count(*) FROM public.knowledge_unit_citations
      WHERE knowledge_unit_id = v_shared_unit AND person_id = v_owner) <> 3
    OR (SELECT count(*) FROM public.knowledge_unit_citations
      WHERE knowledge_unit_id = v_shared_unit AND person_id = v_member) <> 1 THEN
    RAISE EXCEPTION 'k5a_citation_key_or_privacy_failed';
  END IF;
  BEGIN
    INSERT INTO public.knowledge_unit_citations(
      knowledge_unit_id, person_id, act_kind, session_id, delivery_channel,
      actor_kind, actor_profile_id, basis_kind, basis_id, basis_version
    ) VALUES (
      v_shared_unit, v_owner, 'cited', v_shared_session, 'standing',
      'person', NULL, 'delivery', v_shared_session, 1
    );
    RAISE EXCEPTION 'k5a_null_citation_actor_accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  v_owner_attention := public.knowledge_unit_effective_attention(
    v_shared_unit, v_owner
  );
  v_member_attention := public.knowledge_unit_effective_attention(
    v_shared_unit, v_member
  );
  IF abs(v_owner_attention - 0.9) > 0.001
    OR abs(v_member_attention - 0.8) > 0.001 THEN
    RAISE EXCEPTION 'k5a_channel_eligibility_or_person_isolation_failed:%:%',
      v_owner_attention, v_member_attention;
  END IF;

  v_new_session := '78000000-0000-4000-8000-000000000088';
  INSERT INTO public.sessions(id, user_id, title, created_at, updated_at)
  VALUES (
    v_new_session, v_member, 'K5a member distance',
    v_source_created + interval '1 second',
    v_source_created + interval '1 second'
  );
  PERFORM public.upsert_person_session_index(v_member, v_new_session::text, 0);
  v_distance := public.knowledge_unit_session_distance(v_shared_unit, v_member);
  IF v_distance <> 1
    OR public.knowledge_unit_session_distance(v_shared_unit, v_owner) <> 0 THEN
    RAISE EXCEPTION 'k5a_viewer_session_distance_failed:%', v_distance;
  END IF;

  FOR v_row IN
    SELECT * FROM (VALUES
      (0.8::real, 'operational', 0, 0, false, 0.8::real),
      (0.8::real, 'operational', 1, 0, false, 0.72::real),
      (0.8::real, 'operational', 2, 2, false, 0.70::real),
      (0.8::real, 'domain', 1, 0, false, 0.76::real),
      (0.8::real, 'domain', 5, 0, false, 0.42::real),
      (0.8::real, 'domain', 5, 2, false, 0.62::real),
      (0.8::real, 'preference', 5, 2, false, 0.90::real),
      (0.95::real, 'preference', 0, 10, false, 1.0::real),
      (0.8::real, 'domain', 0, 2, true, 0.0::real)
    ) fixture(birth, kind, distance, citations, retired, expected)
  LOOP
    IF abs(public.calculate_knowledge_unit_effective_attention(
      v_row.birth, v_row.kind, v_row.distance, v_row.citations, v_row.retired
    ) - v_row.expected) > 0.001 THEN
      RAISE EXCEPTION 'k5a_effective_attention_fixture_failed:%', to_jsonb(v_row);
    END IF;
  END LOOP;
  IF public.calculate_knowledge_unit_effective_attention(
      0.6, 'operational', 6, 0, false
    ) <= 0
    OR public.calculate_knowledge_unit_effective_attention(
      0.6, 'operational', 6, 0, true
    ) <> 0 THEN
    RAISE EXCEPTION 'k5a_terminal_zero_divergence_not_named';
  END IF;

  -- Seven newer sessions leave exactly the newest six reach citations inside
  -- the promotion window. The two original reach/search acts age out together.
  FOR i IN 1..7 LOOP
    v_new_session := (
      '78000000-0000-4000-8000-' || lpad((100 + i)::text, 12, '0')
    )::uuid;
    INSERT INTO public.sessions(id, user_id, title, created_at, updated_at)
    VALUES (
      v_new_session, v_owner, format('K5a owner window %s', i),
      v_source_created + make_interval(secs => i),
      v_source_created + make_interval(secs => i)
    );
    IF public.record_knowledge_unit_citations(
      v_owner, v_new_session::text, 'reach', ARRAY[v_shared_unit]
    ) <> 1 THEN
      RAISE EXCEPTION 'k5a_window_citation_missing:%', i;
    END IF;
  END LOOP;
  v_owner_attention := public.knowledge_unit_effective_attention(
    v_shared_unit, v_owner
  );
  IF public.knowledge_unit_session_distance(v_shared_unit, v_owner) <> 7
    OR abs(v_owner_attention - 0.82) > 0.001 THEN
    RAISE EXCEPTION 'k5a_citation_window_failed:%', v_owner_attention;
  END IF;

  BEGIN
    PERFORM public.record_knowledge_unit_citations(
      v_member, v_shared_session, 'reach', ARRAY[v_private_unit]
    );
    RAISE EXCEPTION 'k5a_private_unit_citation_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF EXISTS (
    SELECT 1 FROM public.knowledge_unit_citations
    WHERE knowledge_unit_id = v_private_unit AND person_id = v_member
  ) THEN
    RAISE EXCEPTION 'k5a_denied_citation_left_residue';
  END IF;

  INSERT INTO public.knowledge_unit_citations(
    knowledge_unit_id, person_id, act_kind,
    actor_kind, actor_profile_id, basis_kind, basis_id, basis_version
  ) VALUES (
    v_shared_unit, v_owner, 'retired',
    'system', NULL, 'legacy-supersession-v0', v_shared_unit::text, 1
  );
  IF public.knowledge_unit_effective_attention(v_shared_unit, v_owner) <> 0
    OR public.knowledge_unit_effective_attention(v_shared_unit, v_member) = 0 THEN
    RAISE EXCEPTION 'k5a_retirement_not_person_scoped';
  END IF;
  BEGIN
    UPDATE public.knowledge_unit_citations SET basis_version = 2
    WHERE knowledge_unit_id = v_shared_unit AND person_id = v_owner;
    RAISE EXCEPTION 'k5a_lifecycle_update_accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
  BEGIN
    DELETE FROM public.knowledge_unit_citations
    WHERE knowledge_unit_id = v_shared_unit AND person_id = v_owner;
    RAISE EXCEPTION 'k5a_lifecycle_delete_accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;

  SELECT md5(string_agg(to_jsonb(unit)::text, '' ORDER BY unit.id))
  INTO v_after_digest FROM public.knowledge_units unit;
  IF v_after_digest IS DISTINCT FROM v_before_digest THEN
    RAISE EXCEPTION 'k5a_attention_or_citation_mutated_unit';
  END IF;
END
$k5a_c1_c2$;

-- K5A-PERF: prove the production window probe remains proportional to the
-- six-session physics window rather than the viewer's lifetime history.
DO $k5a_recent_window_plan$
DECLARE
  v_owner uuid := '72000000-0000-4000-8000-000000000001';
  v_cutoff_started_at timestamptz;
  v_cutoff_session_id text;
  v_plan jsonb;
  v_shared_blocks integer;
BEGIN
  INSERT INTO public.session_index(session_id, user_id, started_at, event_count)
  SELECT format('k5a-perf-%s', lpad(series::text, 5, '0')), v_owner,
    '2040-01-01T00:00:00Z'::timestamptz + make_interval(secs => series), 0
  FROM generate_series(1, 8000) series
  ON CONFLICT (user_id, session_id) DO NOTHING;
  ANALYZE public.session_index;

  SELECT index_row.started_at, index_row.session_id
  INTO STRICT v_cutoff_started_at, v_cutoff_session_id
  FROM public.session_index index_row
  WHERE index_row.user_id = v_owner
  ORDER BY index_row.started_at DESC, index_row.session_id DESC
  OFFSET 5 LIMIT 1;

  EXECUTE $plan$
    EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON)
    SELECT index_row.session_id
    FROM public.session_index index_row
    WHERE index_row.user_id = $1
      AND (
        index_row.started_at > $2
        OR (
          index_row.started_at = $2
          AND index_row.session_id >= $3
        )
      )
    ORDER BY index_row.started_at DESC, index_row.session_id DESC
    LIMIT 6
  $plan$ INTO STRICT v_plan
  USING v_owner, v_cutoff_started_at, v_cutoff_session_id;

  v_shared_blocks :=
    coalesce((v_plan #>> '{0,Plan,Shared Hit Blocks}')::integer, 0)
    + coalesce((v_plan #>> '{0,Plan,Shared Read Blocks}')::integer, 0);
  IF v_plan::text NOT LIKE '%idx_session_index_user_started%'
    OR v_plan::text LIKE '%"Node Type": "Seq Scan"%'
    OR (v_plan #>> '{0,Plan,Actual Rows}')::integer > 6
    OR v_shared_blocks > 64 THEN
    RAISE EXCEPTION 'k5a_recent_window_plan_unbounded:%:%',
      v_shared_blocks, v_plan;
  END IF;
END
$k5a_recent_window_plan$;

DO $k5a_catalogue$
DECLARE
  v_primary_columns text[];
BEGIN
  SELECT array_agg(attribute.attname ORDER BY key.ordinality)
  INTO v_primary_columns
  FROM pg_catalog.pg_constraint con
  CROSS JOIN LATERAL unnest(con.conkey)
    WITH ORDINALITY key(attribute_number, ordinality)
  JOIN pg_catalog.pg_attribute attribute
    ON attribute.attrelid = con.conrelid
    AND attribute.attnum = key.attribute_number
  WHERE con.conrelid = 'public.session_index'::regclass
    AND con.contype = 'p';
  IF v_primary_columns IS DISTINCT FROM ARRAY['user_id', 'session_id']::text[]
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_indexes
      WHERE schemaname = 'public'
        AND indexname = 'knowledge_unit_citations_delivery_once'
    )
    OR NOT EXISTS (
      SELECT 1 FROM pg_catalog.pg_indexes
      WHERE schemaname = 'public'
        AND indexname = 'knowledge_unit_citations_viewer_session'
    )
    OR has_table_privilege('authenticated', 'public.knowledge_unit_citations', 'SELECT')
    OR has_function_privilege(
      'authenticated',
      'public.record_knowledge_unit_citations(uuid,text,public.knowledge_delivery_channel,uuid[])',
      'EXECUTE'
    ) THEN
    RAISE EXCEPTION 'k5a_lifecycle_catalogue_failed';
  END IF;
END
$k5a_catalogue$;

SET ROLE authenticated;
DO $k5a_authenticated_denial$
BEGIN
  BEGIN
    PERFORM count(*) FROM public.knowledge_unit_citations;
    RAISE EXCEPTION 'k5a_authenticated_citation_read_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.record_knowledge_unit_citations(
      '72000000-0000-4000-8000-000000000002',
      '72000000-0000-4000-8000-000000000012',
      'standing', ARRAY['76000000-0000-4000-8000-000000000001']::uuid[]
    );
    RAISE EXCEPTION 'k5a_authenticated_citation_write_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.knowledge_unit_effective_attention(
      '76000000-0000-4000-8000-000000000001',
      '72000000-0000-4000-8000-000000000002'
    );
    RAISE EXCEPTION 'k5a_authenticated_attention_read_accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END
$k5a_authenticated_denial$;
RESET ROLE;

SELECT 'CARTOGRAPHER_K5A_C1_C2_ASSERTIONS_GREEN';
