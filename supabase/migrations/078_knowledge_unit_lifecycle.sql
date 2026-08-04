-- K5a stage one: append-only lifecycle acts and per-viewer attention inputs.
-- Additive only. Migration 079 owns the selecting read and 081 owns cutover.
BEGIN;

DO $types$
BEGIN
  CREATE TYPE public.knowledge_unit_lifecycle_act_kind AS ENUM (
    'cited', 'retired'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END
$types$;

DO $types$
BEGIN
  CREATE TYPE public.knowledge_delivery_channel AS ENUM (
    'standing', 'reach', 'search'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END
$types$;

CREATE TABLE IF NOT EXISTS public.session_index (
  session_id text NOT NULL,
  user_id uuid NOT NULL,
  started_at timestamptz DEFAULT now(),
  event_count integer DEFAULT 0
);

-- The legacy key was session_id alone. A room session is shared by several
-- people, so distance must be indexed by the viewer as well as the session.
DO $session_primary_key$
DECLARE
  v_constraint text;
  v_columns text[];
BEGIN
  SELECT constraint_name, columns INTO v_constraint, v_columns
  FROM (
    SELECT con.conname AS constraint_name,
      array_agg(attribute.attname ORDER BY key.ordinality) AS columns
    FROM pg_catalog.pg_constraint con
    CROSS JOIN LATERAL unnest(con.conkey)
      WITH ORDINALITY key(attribute_number, ordinality)
    JOIN pg_catalog.pg_attribute attribute
      ON attribute.attrelid = con.conrelid
      AND attribute.attnum = key.attribute_number
    WHERE con.conrelid = 'public.session_index'::regclass
      AND con.contype = 'p'
    GROUP BY con.conname
  ) primary_key;
  IF v_columns IS DISTINCT FROM ARRAY['user_id', 'session_id']::text[] THEN
    IF v_constraint IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE public.session_index DROP CONSTRAINT %I', v_constraint
      );
    END IF;
    ALTER TABLE public.session_index
      ADD CONSTRAINT session_index_pkey PRIMARY KEY (user_id, session_id);
  END IF;
END
$session_primary_key$;

-- Migration 031 installed an older two-column index under this name. Replace
-- that shape in place so the deterministic six-session probe can stop inside
-- the index even when one person has a long session history.
DO $session_window_index$
DECLARE
  v_index regclass := to_regclass('public.idx_session_index_user_started');
BEGIN
  IF v_index IS NOT NULL
    AND pg_get_indexdef(v_index)
      NOT LIKE '%(user_id, started_at DESC, session_id DESC)%' THEN
    DROP INDEX public.idx_session_index_user_started;
  END IF;
END
$session_window_index$;
CREATE INDEX IF NOT EXISTS idx_session_index_user_started
  ON public.session_index(user_id, started_at DESC, session_id DESC);

-- The retired application writer stamped processing time. Effective distance
-- is defined from durable session start, so normalize the legacy rows before
-- any computed read can consume them.
UPDATE public.session_index index_row
SET started_at = session.created_at
FROM public.sessions session
WHERE session.id::text = index_row.session_id
  AND index_row.started_at IS DISTINCT FROM session.created_at;

CREATE TABLE IF NOT EXISTS public.knowledge_unit_citations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  knowledge_unit_id uuid NOT NULL
    REFERENCES public.knowledge_units(id) ON DELETE RESTRICT,
  person_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  act_kind public.knowledge_unit_lifecycle_act_kind NOT NULL DEFAULT 'cited',
  session_id text,
  delivery_channel public.knowledge_delivery_channel,
  actor_kind text NOT NULL CHECK (actor_kind IN ('person', 'system')),
  actor_profile_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  basis_kind text NOT NULL CHECK (length(btrim(basis_kind)) BETWEEN 1 AND 80),
  basis_id text NOT NULL CHECK (length(btrim(basis_id)) BETWEEN 1 AND 200),
  basis_version integer NOT NULL CHECK (basis_version > 0),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CONSTRAINT knowledge_unit_lifecycle_act_shape CHECK (
    (
      act_kind = 'cited'
      AND session_id IS NOT NULL AND length(btrim(session_id)) > 0
      AND delivery_channel IS NOT NULL
      AND actor_kind = 'person'
      AND actor_profile_id IS NOT NULL
      AND actor_profile_id = person_id
      AND basis_kind = 'delivery'
      AND basis_id = session_id
      AND basis_version = 1
    ) OR (
      act_kind = 'retired'
      AND session_id IS NULL
      AND delivery_channel IS NULL
      AND actor_kind = 'system'
      AND actor_profile_id IS NULL
      AND basis_kind = 'legacy-supersession-v0'
    )
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS knowledge_unit_citations_delivery_once
  ON public.knowledge_unit_citations(
    knowledge_unit_id, person_id, session_id, delivery_channel
  ) WHERE act_kind = 'cited';
CREATE UNIQUE INDEX IF NOT EXISTS knowledge_unit_retirements_basis_once
  ON public.knowledge_unit_citations(
    knowledge_unit_id, person_id, basis_kind, basis_id, basis_version
  ) WHERE act_kind = 'retired';
CREATE INDEX IF NOT EXISTS knowledge_unit_citations_viewer_session
  ON public.knowledge_unit_citations(
    person_id, session_id, knowledge_unit_id
  ) INCLUDE (delivery_channel) WHERE act_kind = 'cited';
CREATE INDEX IF NOT EXISTS knowledge_unit_retirements_lookup
  ON public.knowledge_unit_citations(
    knowledge_unit_id, person_id, recorded_at DESC
  ) WHERE act_kind = 'retired';

CREATE OR REPLACE FUNCTION public.reject_knowledge_unit_lifecycle_mutation()
RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'knowledge_unit_lifecycle_immutable' USING ERRCODE = '23514';
END
$$;
DROP TRIGGER IF EXISTS trg_knowledge_unit_citations_immutable
  ON public.knowledge_unit_citations;
CREATE TRIGGER trg_knowledge_unit_citations_immutable
  BEFORE UPDATE OR DELETE ON public.knowledge_unit_citations
  FOR EACH ROW EXECUTE FUNCTION public.reject_knowledge_unit_lifecycle_mutation();

CREATE OR REPLACE FUNCTION public.upsert_person_session_index(
  p_person_id uuid,
  p_session_id text,
  p_event_count integer DEFAULT 0
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
  v_started_at timestamptz;
BEGIN
  IF p_person_id IS NULL
    OR p_session_id IS NULL OR length(btrim(p_session_id)) = 0
    OR p_event_count IS NULL OR p_event_count < 0 THEN
    RAISE EXCEPTION 'person_session_index_input_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT session.created_at INTO v_started_at
  FROM public.sessions session
  WHERE session.id::text = p_session_id
    AND (
      session.user_id = p_person_id
      OR (
        session.space_id IS NOT NULL
        AND public.is_effective_space_member(session.space_id, p_person_id)
      )
    );
  IF v_started_at IS NULL THEN
    RAISE EXCEPTION 'person_session_index_access_denied' USING ERRCODE = '42501';
  END IF;
  INSERT INTO public.session_index(
    session_id, user_id, started_at, event_count
  ) VALUES (
    p_session_id, p_person_id, v_started_at, p_event_count
  )
  ON CONFLICT (user_id, session_id) DO UPDATE
  SET started_at = EXCLUDED.started_at,
    event_count = greatest(
      coalesce(public.session_index.event_count, 0), EXCLUDED.event_count
    );
END
$$;

CREATE OR REPLACE FUNCTION public.record_knowledge_unit_citations(
  p_person_id uuid,
  p_session_id text,
  p_channel public.knowledge_delivery_channel,
  p_unit_ids uuid[]
) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
  v_inserted integer;
  v_distinct_ids uuid[];
BEGIN
  IF p_person_id IS NULL
    OR p_session_id IS NULL OR length(btrim(p_session_id)) = 0
    OR p_channel IS NULL
    OR p_unit_ids IS NULL OR cardinality(p_unit_ids) NOT BETWEEN 1 AND 64
    OR array_position(p_unit_ids, NULL) IS NOT NULL THEN
    RAISE EXCEPTION 'knowledge_unit_citation_input_invalid' USING ERRCODE = '22023';
  END IF;
  SELECT array_agg(DISTINCT unit_id ORDER BY unit_id)
  INTO STRICT v_distinct_ids
  FROM unnest(p_unit_ids) unit_id;
  IF EXISTS (
    SELECT 1
    FROM unnest(v_distinct_ids) requested(unit_id)
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.knowledge_units unit
      JOIN public.knowledge_audiences audience
        ON audience.id = unit.knowledge_audience_id
      JOIN public.graph_nodes node
        ON node.kind = 'knowledge_unit' AND node.authority_id = unit.id
      WHERE unit.id = requested.unit_id
        AND p_person_id = ANY(audience.member_profile_ids)
        AND public.viewer_has_graph_node_grant(node.id, p_person_id)
    )
  ) THEN
    RAISE EXCEPTION 'knowledge_unit_citation_access_denied' USING ERRCODE = '42501';
  END IF;
  PERFORM public.upsert_person_session_index(p_person_id, p_session_id, 0);
  INSERT INTO public.knowledge_unit_citations(
    knowledge_unit_id, person_id, act_kind, session_id, delivery_channel,
    actor_kind, actor_profile_id, basis_kind, basis_id, basis_version
  )
  SELECT unit_id, p_person_id, 'cited', p_session_id, p_channel,
    'person', p_person_id, 'delivery', p_session_id, 1
  FROM unnest(v_distinct_ids) unit_id
  ON CONFLICT (
    knowledge_unit_id, person_id, session_id, delivery_channel
  ) WHERE act_kind = 'cited' DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END
$$;

CREATE OR REPLACE FUNCTION public.knowledge_unit_session_distance(
  p_knowledge_unit_id uuid,
  p_person_id uuid
) RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
  v_source_created_at timestamptz;
  v_distance integer;
BEGIN
  IF p_knowledge_unit_id IS NULL OR p_person_id IS NULL THEN
    RAISE EXCEPTION 'knowledge_unit_session_distance_input_invalid'
      USING ERRCODE = '22023';
  END IF;
  SELECT event.created_at INTO v_source_created_at
  FROM public.knowledge_units unit
  JOIN public.knowledge_events event ON event.id = unit.source_event_id
  JOIN public.knowledge_audiences audience
    ON audience.id = unit.knowledge_audience_id
  JOIN public.graph_nodes node
    ON node.kind = 'knowledge_unit' AND node.authority_id = unit.id
  WHERE unit.id = p_knowledge_unit_id
    AND p_person_id = ANY(audience.member_profile_ids)
    AND public.viewer_has_graph_node_grant(node.id, p_person_id);
  IF v_source_created_at IS NULL THEN
    RAISE EXCEPTION 'knowledge_unit_session_distance_access_denied'
      USING ERRCODE = '42501';
  END IF;
  SELECT count(*)::integer INTO v_distance
  FROM public.session_index session
  WHERE session.user_id = p_person_id
    AND session.started_at > v_source_created_at;
  RETURN v_distance;
END
$$;

CREATE OR REPLACE FUNCTION public.calculate_knowledge_unit_effective_attention(
  p_birth_attention real,
  p_knowledge_type text,
  p_session_distance integer,
  p_windowed_reach_citations integer,
  p_retired boolean DEFAULT false
) RETURNS real
LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE
SET search_path = pg_catalog AS $$
DECLARE
  v_raw_factor numeric;
  v_factor numeric;
  v_decayed numeric;
BEGIN
  IF p_birth_attention NOT BETWEEN 0 AND 1
    OR p_knowledge_type NOT IN ('domain', 'operational', 'preference')
    OR p_session_distance < 0
    OR p_windowed_reach_citations < 0 THEN
    RAISE EXCEPTION 'knowledge_unit_attention_input_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_retired THEN RETURN 0; END IF;
  v_raw_factor := CASE
    WHEN p_session_distance <= 0 THEN 1
    WHEN p_session_distance = 1 THEN 0.9
    WHEN p_session_distance = 2 THEN 0.75
    WHEN p_session_distance = 3 THEN 0.5
    WHEN p_session_distance = 4 THEN 0.4
    ELSE 0.3
  END;
  IF p_knowledge_type = 'preference' THEN
    v_decayed := p_birth_attention;
  ELSE
    v_factor := CASE WHEN p_knowledge_type = 'domain'
      THEN 1 - ((1 - v_raw_factor) * 0.5)
      ELSE v_raw_factor END;
    v_decayed := round((p_birth_attention::numeric * v_factor), 2);
    IF p_knowledge_type = 'domain'
      AND p_session_distance >= 5
      AND p_windowed_reach_citations = 0 THEN
      v_decayed := greatest(
        0,
        round(v_decayed - ((p_session_distance - 5 + 1) * 0.1), 2)
      );
    END IF;
  END IF;
  RETURN least(
    1,
    v_decayed + (0.05 * p_windowed_reach_citations)
  )::real;
END
$$;

CREATE OR REPLACE FUNCTION public.knowledge_unit_effective_attention(
  p_knowledge_unit_id uuid,
  p_person_id uuid
) RETURNS real
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
  v_unit public.knowledge_units;
  v_distance integer;
  v_citations integer;
  v_retired boolean;
  v_cutoff_started_at timestamptz;
  v_cutoff_session_id text;
BEGIN
  IF p_knowledge_unit_id IS NULL OR p_person_id IS NULL THEN
    RAISE EXCEPTION 'knowledge_unit_effective_attention_input_invalid'
      USING ERRCODE = '22023';
  END IF;
  SELECT unit.* INTO v_unit
  FROM public.knowledge_units unit
  JOIN public.knowledge_audiences audience
    ON audience.id = unit.knowledge_audience_id
  JOIN public.graph_nodes node
    ON node.kind = 'knowledge_unit' AND node.authority_id = unit.id
  WHERE unit.id = p_knowledge_unit_id
    AND p_person_id = ANY(audience.member_profile_ids)
    AND public.viewer_has_graph_node_grant(node.id, p_person_id);
  IF v_unit.id IS NULL THEN
    RAISE EXCEPTION 'knowledge_unit_effective_attention_access_denied'
      USING ERRCODE = '42501';
  END IF;
  IF v_unit.knowledge_type IS NULL OR v_unit.attention_score IS NULL THEN
    RAISE EXCEPTION 'knowledge_unit_effective_attention_physics_missing'
      USING ERRCODE = '23514';
  END IF;
  v_distance := public.knowledge_unit_session_distance(
    p_knowledge_unit_id, p_person_id
  );
  SELECT index_row.started_at, index_row.session_id
  INTO v_cutoff_started_at, v_cutoff_session_id
  FROM public.session_index index_row
  WHERE index_row.user_id = p_person_id
  ORDER BY index_row.started_at DESC, index_row.session_id DESC
  OFFSET 5 LIMIT 1;
  SELECT count(*)::integer INTO v_citations
  FROM (
    SELECT index_row.session_id
    FROM public.session_index index_row
    WHERE index_row.user_id = p_person_id
      AND (
        v_cutoff_started_at IS NULL
        OR index_row.started_at > v_cutoff_started_at
        OR (
          index_row.started_at = v_cutoff_started_at
          AND index_row.session_id >= v_cutoff_session_id
        )
      )
    ORDER BY index_row.started_at DESC, index_row.session_id DESC
    LIMIT 6
  ) recent
  JOIN public.knowledge_unit_citations citation
    ON citation.session_id = recent.session_id
  WHERE citation.knowledge_unit_id = p_knowledge_unit_id
    AND citation.person_id = p_person_id
    AND citation.act_kind = 'cited'
    AND citation.delivery_channel IN ('reach', 'search');
  SELECT EXISTS (
    SELECT 1 FROM public.knowledge_unit_citations act
    WHERE act.knowledge_unit_id = p_knowledge_unit_id
      AND act.person_id = p_person_id
      AND act.act_kind = 'retired'
  ) INTO v_retired;
  RETURN public.calculate_knowledge_unit_effective_attention(
    v_unit.attention_score, v_unit.knowledge_type,
    v_distance, v_citations, v_retired
  );
END
$$;

ALTER TABLE public.knowledge_unit_citations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_index ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.knowledge_unit_citations, public.session_index
FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.knowledge_unit_citations TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.session_index TO service_role;

REVOKE EXECUTE ON FUNCTION public.reject_knowledge_unit_lifecycle_mutation()
FROM PUBLIC, anon, authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.upsert_person_session_index(uuid, text, integer),
  public.record_knowledge_unit_citations(
    uuid, text, public.knowledge_delivery_channel, uuid[]
  ),
  public.knowledge_unit_session_distance(uuid, uuid),
  public.calculate_knowledge_unit_effective_attention(
    real, text, integer, integer, boolean
  ),
  public.knowledge_unit_effective_attention(uuid, uuid)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_person_session_index(uuid, text, integer),
  public.record_knowledge_unit_citations(
    uuid, text, public.knowledge_delivery_channel, uuid[]
  ),
  public.knowledge_unit_session_distance(uuid, uuid),
  public.calculate_knowledge_unit_effective_attention(
    real, text, integer, integer, boolean
  ),
  public.knowledge_unit_effective_attention(uuid, uuid)
TO service_role;

COMMIT;
