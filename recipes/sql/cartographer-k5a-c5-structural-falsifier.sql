\set ON_ERROR_STOP on

BEGIN;

-- Migration 080 will widen these two predicates together. Exercise that
-- intended shape transactionally here without authoring or installing 080.
CREATE OR REPLACE FUNCTION public.validate_knowledge_extraction_job()
RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (
    TG_OP = 'UPDATE'
    AND (
      NEW.source_event_id,
      NEW.extractor_version,
      NEW.knowledge_audience_id,
      NEW.created_at
    ) IS DISTINCT FROM (
      OLD.source_event_id,
      OLD.extractor_version,
      OLD.knowledge_audience_id,
      OLD.created_at
    )
  ) THEN
    RAISE EXCEPTION 'knowledge_extraction_job_identity_immutable'
      USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.knowledge_events event
    JOIN public.knowledge_audiences audience
      ON audience.id = event.knowledge_audience_id
    WHERE event.id = NEW.source_event_id
      AND event.actor_type = 'user'
      AND event.event_type IN (
        'conversation', 'message', 'document',
        'slack_message', 'jira_update', 'explicit'
      )
      AND audience.purpose = 'source'
      AND event.knowledge_audience_id = NEW.knowledge_audience_id
  ) THEN
    RAISE EXCEPTION 'knowledge_extraction_job_source_invalid'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.enqueue_human_knowledge_extraction()
RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog, public AS $$
DECLARE v_version text;
BEGIN
  IF NEW.actor_type = 'user'
    AND NEW.event_type IN (
      'conversation', 'message', 'document',
      'slack_message', 'jira_update', 'explicit'
    ) THEN
    SELECT extractor_version INTO STRICT v_version
    FROM public.knowledge_extractor_contract_active
    WHERE singleton
    FOR SHARE;
    INSERT INTO public.knowledge_extraction_jobs(
      source_event_id, extractor_version, knowledge_audience_id
    ) VALUES (
      NEW.id, v_version, NEW.knowledge_audience_id
    );
  END IF;
  RETURN NEW;
END
$$;

CREATE TEMP TABLE k5a_c5_expected_sources (
  shape text PRIMARY KEY,
  event_id uuid NOT NULL,
  expected_scope public.knowledge_audience_scope_kind NOT NULL,
  expected_authority_id uuid NOT NULL,
  expected_member_ids uuid[] NOT NULL
) ON COMMIT DROP;

DO $$
DECLARE
  v_author uuid := '72000000-0000-4000-8000-000000000001';
  v_room_member uuid := '72000000-0000-4000-8000-000000000002';
  v_space uuid := '72000000-0000-4000-8000-000000000011';
  v_session uuid := '72000000-0000-4000-8000-000000000012';
  v_private_event uuid;
  v_room_event uuid;
  v_explicit_event uuid;
  v_voyager_event uuid;
  v_attempt record;
  v_completion record;
  v_expected record;
BEGIN
  SELECT event_id INTO STRICT v_private_event
  FROM public.claim_source_message_ingress(
    v_author,
    'chat',
    'k5a-c5-private-message',
    NULL,
    NULL,
    'The deployment guide lives in the handbook.',
    'conversation',
    'conversation',
    'user',
    ARRAY[v_author],
    '{}'::uuid[],
    jsonb_build_object('session_id', v_session),
    jsonb_build_object('conversation_id', v_session, 'role', 'user')
  );

  SELECT event_id INTO STRICT v_room_event
  FROM public.claim_source_message_ingress(
    v_author,
    'chat',
    'k5a-c5-room-message',
    v_space,
    NULL,
    'Page the incident lead before changing production flags.',
    'message',
    'conversation',
    'user',
    ARRAY[v_author, v_room_member],
    ARRAY[v_room_member],
    jsonb_build_object('session_id', v_session),
    jsonb_build_object('conversation_id', v_session, 'role', 'user')
  );

  SELECT event_id INTO STRICT v_explicit_event
  FROM public.claim_source_message_ingress(
    v_author,
    'chat',
    'k5a-c5-explicit-memory',
    NULL,
    NULL,
    'Remember this: I prefer concise incident summaries.',
    'explicit',
    'conversation',
    'user',
    ARRAY[v_author],
    '{}'::uuid[],
    jsonb_build_object('session_id', v_session),
    jsonb_build_object('conversation_id', v_session, 'role', 'user')
  );

  SELECT event_id INTO STRICT v_voyager_event
  FROM public.claim_source_message_ingress(
    v_author,
    'agent',
    format('reply:%s', v_private_event),
    NULL,
    NULL,
    'I will remember that.',
    'conversation',
    'conversation',
    'voyager',
    ARRAY[v_author],
    '{}'::uuid[],
    jsonb_build_object(
      'session_id', v_session,
      'reply_to_event_id', v_private_event
    ),
    jsonb_build_object('conversation_id', v_session, 'role', 'assistant')
  );

  INSERT INTO k5a_c5_expected_sources(
    shape, event_id, expected_scope, expected_authority_id,
    expected_member_ids
  ) VALUES
    ('private-message', v_private_event, 'private', v_author, ARRAY[v_author]),
    (
      'room-message', v_room_event, 'space', v_space,
      ARRAY[v_author, v_room_member]
    ),
    ('explicit-memory', v_explicit_event, 'private', v_author, ARRAY[v_author]);

  IF (
    SELECT count(*)
    FROM public.knowledge_extraction_jobs job
    WHERE job.source_event_id IN (
      v_private_event, v_room_event, v_explicit_event
    )
  ) <> 3 THEN
    RAISE EXCEPTION 'k5a_c5_human_enqueue_incomplete';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.knowledge_extraction_jobs job
    WHERE job.source_event_id = v_voyager_event
  ) THEN
    RAISE EXCEPTION 'k5a_c5_voyager_response_enqueued';
  END IF;

  FOR v_expected IN
    SELECT * FROM k5a_c5_expected_sources ORDER BY shape
  LOOP
    SELECT * INTO STRICT v_attempt
    FROM public.begin_knowledge_extraction_attempt(
      v_author,
      'k5a-structural',
      'deterministic-v1',
      'audience-lineage',
      v_expected.event_id,
      120
    );

    SELECT * INTO STRICT v_completion
    FROM public.complete_v4_knowledge_extraction_attempt(
      v_attempt.attempt_id,
      v_attempt.lease_token,
      'succeeded',
      jsonb_build_object(
        'claim', format('C5 audience lineage for %s', v_expected.shape),
        'aboutPersonId', NULL,
        'knowledgeType', 'domain',
        'attentionScore', 0.5,
        'topics', '[]'::jsonb
      ),
      format('C5 audience lineage for %s', v_expected.shape),
      NULL,
      'domain',
      0.5,
      array_fill(0.01::real, ARRAY[1536])::vector,
      '[]'::jsonb,
      '[]'::jsonb,
      NULL,
      1,
      1
    );
    IF v_completion.outcome IS DISTINCT FROM 'succeeded'
      OR v_completion.unit_id IS NULL THEN
      RAISE EXCEPTION 'k5a_c5_structural_completion_failed:%',
        v_expected.shape;
    END IF;
  END LOOP;
END
$$;

DO $$
DECLARE v_count integer;
BEGIN
  SELECT count(*) INTO v_count
  FROM k5a_c5_expected_sources expected
  JOIN public.knowledge_events event ON event.id = expected.event_id
  JOIN public.knowledge_audiences audience
    ON audience.id = event.knowledge_audience_id
  JOIN public.knowledge_extraction_jobs job
    ON job.source_event_id = event.id
  JOIN public.knowledge_extraction_attempts attempt
    ON attempt.source_event_id = job.source_event_id
    AND attempt.extractor_version = job.extractor_version
  JOIN public.knowledge_extraction_attempt_outcomes outcome
    ON outcome.attempt_id = attempt.id
  JOIN public.knowledge_units unit
    ON unit.source_event_id = event.id
    AND unit.extractor_version = attempt.extractor_version
  JOIN public.graph_nodes unit_node
    ON unit_node.kind = 'knowledge_unit'
    AND unit_node.authority_id = unit.id
  JOIN public.graph_node_grants unit_grant
    ON unit_grant.node_id = unit_node.id
    AND unit_grant.basis_kind = 'source_event'
    AND unit_grant.basis_id = event.id
  WHERE audience.scope_kind = expected.expected_scope
    AND audience.scope_authority_id = expected.expected_authority_id
    AND audience.member_profile_ids =
      public.normalize_knowledge_audience_members(expected.expected_member_ids)
    AND job.state = 'succeeded'
    AND job.knowledge_audience_id = event.knowledge_audience_id
    AND attempt.knowledge_audience_id = event.knowledge_audience_id
    AND outcome.knowledge_audience_id = event.knowledge_audience_id
    AND unit.knowledge_audience_id = event.knowledge_audience_id
    AND unit_grant.knowledge_audience_id = event.knowledge_audience_id;
  IF v_count <> 3 THEN
    RAISE EXCEPTION 'k5a_c5_audience_lineage_mismatch:%', v_count;
  END IF;
END
$$;

ROLLBACK;

SELECT 'CARTOGRAPHER_K5A_C5_STRUCTURAL_GREEN';
