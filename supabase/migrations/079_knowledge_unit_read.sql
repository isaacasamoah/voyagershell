-- K5a stage 1b: assertion-person-keyed annotation projection.
--
-- The selecting read may enumerate only the viewer's own relation assertions.
-- This append-only companion gives that rule a bounded physical access path:
-- one oriented row per assertion endpoint, written in the assertion transaction.

BEGIN;

CREATE TABLE IF NOT EXISTS public.knowledge_relation_annotation_index (
  endpoint_unit_id uuid NOT NULL
    REFERENCES public.knowledge_units(id) ON DELETE RESTRICT,
  partner_unit_id uuid NOT NULL
    REFERENCES public.knowledge_units(id) ON DELETE RESTRICT,
  assertion_person_id uuid NOT NULL
    REFERENCES public.profiles(id) ON DELETE RESTRICT,
  edge_id uuid NOT NULL,
  assertion_attempt_id uuid NOT NULL,
  edge_kind public.graph_edge_kind NOT NULL CHECK (
    edge_kind IN ('contradicts', 'supersedes')
  ),
  endpoint_is_source boolean NOT NULL,
  repair_priority smallint NOT NULL CHECK (
    (edge_kind = 'supersedes' AND NOT endpoint_is_source AND repair_priority = 0)
    OR (edge_kind = 'contradicts' AND repair_priority = 1)
    OR (edge_kind = 'supersedes' AND endpoint_is_source AND repair_priority = 2)
  ),
  input_unit_ids uuid[] NOT NULL CHECK (cardinality(input_unit_ids) >= 2),
  assertion_recorded_at timestamptz NOT NULL,
  PRIMARY KEY (
    endpoint_unit_id, assertion_person_id, edge_id, assertion_attempt_id
  ),
  CONSTRAINT knowledge_relation_annotation_index_distinct_endpoints CHECK (
    endpoint_unit_id <> partner_unit_id
  ),
  CONSTRAINT knowledge_relation_annotation_index_assertion_fkey
    FOREIGN KEY (edge_id, assertion_attempt_id)
    REFERENCES public.knowledge_relation_assertions(edge_id, attempt_id)
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS knowledge_relation_annotation_own_lookup
  ON public.knowledge_relation_annotation_index(
    endpoint_unit_id, assertion_person_id, repair_priority,
    assertion_recorded_at DESC, edge_id, assertion_attempt_id
  ) INCLUDE (
    partner_unit_id, edge_kind, endpoint_is_source, input_unit_ids
  );

CREATE OR REPLACE FUNCTION public.project_knowledge_relation_annotation()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
  v_attempt public.knowledge_relation_attempts;
  v_edge public.graph_edges;
  v_source_unit_id uuid;
  v_target_unit_id uuid;
BEGIN
  SELECT * INTO STRICT v_attempt
  FROM public.knowledge_relation_attempts
  WHERE id = NEW.attempt_id;
  SELECT * INTO STRICT v_edge
  FROM public.graph_edges
  WHERE id = NEW.edge_id;
  IF v_edge.kind NOT IN ('contradicts', 'supersedes') THEN
    RAISE EXCEPTION 'knowledge_relation_annotation_edge_kind_invalid'
      USING ERRCODE = '23514';
  END IF;
  SELECT authority_id INTO STRICT v_source_unit_id
  FROM public.graph_nodes
  WHERE id = v_edge.source_node_id AND kind = 'knowledge_unit';
  SELECT authority_id INTO STRICT v_target_unit_id
  FROM public.graph_nodes
  WHERE id = v_edge.target_node_id AND kind = 'knowledge_unit';
  IF v_source_unit_id = v_target_unit_id
    OR NOT v_source_unit_id = ANY(NEW.input_unit_ids)
    OR NOT v_target_unit_id = ANY(NEW.input_unit_ids) THEN
    RAISE EXCEPTION 'knowledge_relation_annotation_input_shape_invalid'
      USING ERRCODE = '23514';
  END IF;

  INSERT INTO public.knowledge_relation_annotation_index(
    endpoint_unit_id, partner_unit_id, assertion_person_id,
    edge_id, assertion_attempt_id, edge_kind, endpoint_is_source,
    repair_priority, input_unit_ids, assertion_recorded_at
  ) VALUES
    (v_source_unit_id, v_target_unit_id, v_attempt.person_id,
      NEW.edge_id, NEW.attempt_id, v_edge.kind, true,
      CASE WHEN v_edge.kind = 'contradicts' THEN 1 ELSE 2 END,
      NEW.input_unit_ids, NEW.recorded_at),
    (v_target_unit_id, v_source_unit_id, v_attempt.person_id,
      NEW.edge_id, NEW.attempt_id, v_edge.kind, false,
      CASE WHEN v_edge.kind = 'contradicts' THEN 1 ELSE 0 END,
      NEW.input_unit_ids, NEW.recorded_at)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS trg_knowledge_relation_annotation_project
  ON public.knowledge_relation_assertions;
CREATE TRIGGER trg_knowledge_relation_annotation_project
  AFTER INSERT ON public.knowledge_relation_assertions
  FOR EACH ROW EXECUTE FUNCTION public.project_knowledge_relation_annotation();

-- Existing assertions are projected with the same orientation and priority as
-- future trigger writes. Re-running the migration is safe and fills only gaps.
INSERT INTO public.knowledge_relation_annotation_index(
  endpoint_unit_id, partner_unit_id, assertion_person_id,
  edge_id, assertion_attempt_id, edge_kind, endpoint_is_source,
  repair_priority, input_unit_ids, assertion_recorded_at
)
SELECT oriented.endpoint_unit_id, oriented.partner_unit_id, attempt.person_id,
  assertion.edge_id, assertion.attempt_id, edge.kind,
  oriented.endpoint_is_source, oriented.repair_priority,
  assertion.input_unit_ids, assertion.recorded_at
FROM public.knowledge_relation_assertions assertion
JOIN public.knowledge_relation_attempts attempt
  ON attempt.id = assertion.attempt_id
JOIN public.graph_edges edge ON edge.id = assertion.edge_id
JOIN public.graph_nodes source_node
  ON source_node.id = edge.source_node_id
  AND source_node.kind = 'knowledge_unit'
JOIN public.graph_nodes target_node
  ON target_node.id = edge.target_node_id
  AND target_node.kind = 'knowledge_unit'
CROSS JOIN LATERAL (VALUES
  (source_node.authority_id, target_node.authority_id, true,
    CASE WHEN edge.kind = 'contradicts' THEN 1 ELSE 2 END),
  (target_node.authority_id, source_node.authority_id, false,
    CASE WHEN edge.kind = 'contradicts' THEN 1 ELSE 0 END)
) oriented(
  endpoint_unit_id, partner_unit_id, endpoint_is_source, repair_priority
)
WHERE edge.kind IN ('contradicts', 'supersedes')
  AND source_node.authority_id <> target_node.authority_id
  AND source_node.authority_id = ANY(assertion.input_unit_ids)
  AND target_node.authority_id = ANY(assertion.input_unit_ids)
ON CONFLICT DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.knowledge_relation_assertions assertion
    JOIN public.knowledge_relation_attempts attempt
      ON attempt.id = assertion.attempt_id
    WHERE (
      SELECT count(*)
      FROM public.knowledge_relation_annotation_index annotation
      WHERE annotation.edge_id = assertion.edge_id
        AND annotation.assertion_attempt_id = assertion.attempt_id
        AND annotation.assertion_person_id = attempt.person_id
    ) <> 2
  ) THEN
    RAISE EXCEPTION 'knowledge_relation_annotation_backfill_incomplete';
  END IF;
END
$$;

DROP TRIGGER IF EXISTS trg_knowledge_relation_annotation_index_immutable
  ON public.knowledge_relation_annotation_index;
CREATE TRIGGER trg_knowledge_relation_annotation_index_immutable
  BEFORE UPDATE OR DELETE ON public.knowledge_relation_annotation_index
  FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_knowledge_graph_row();

ALTER TABLE public.knowledge_relation_annotation_index ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.knowledge_relation_annotation_index
FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.knowledge_relation_annotation_index TO service_role;

REVOKE EXECUTE ON FUNCTION public.project_knowledge_relation_annotation()
FROM PUBLIC, anon, authenticated, service_role;

COMMIT;
