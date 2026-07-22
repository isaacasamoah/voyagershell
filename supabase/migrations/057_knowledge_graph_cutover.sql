-- K1 clean cut: deterministically project eligible legacy events/edges, report
-- every rejected row, then remove the replaced graph catalogue.
CREATE TABLE public.knowledge_graph_backfill_rejections (
  source_kind text NOT NULL CHECK (source_kind IN ('knowledge_event', 'knowledge_edge')),
  source_id uuid NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  PRIMARY KEY (source_kind, source_id)
);
CREATE TRIGGER trg_knowledge_graph_backfill_rejections_immutable
  BEFORE UPDATE OR DELETE ON public.knowledge_graph_backfill_rejections
  FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_knowledge_graph_row();
ALTER TABLE public.knowledge_graph_backfill_rejections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.knowledge_graph_backfill_rejections FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.knowledge_graph_backfill_rejections TO service_role;
CREATE UNIQUE INDEX knowledge_audiences_canonical_identity_idx
  ON public.knowledge_audiences (scope_kind, scope_authority_id, member_profile_ids);

CREATE TEMP TABLE k1_event_map ON COMMIT DROP AS
WITH normalized AS (
  SELECT event.id, event.user_id, event.voyage_slug,
    public.normalize_knowledge_audience_members(
      coalesce(event.participants, '{}'::uuid[])) AS members,
    event.knowledge_audience_id,
    CASE WHEN event.metadata->>'session_id' ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN (event.metadata->>'session_id')::uuid END AS session_id
  FROM public.knowledge_events event
), resolved AS (
  SELECT source.*, profile.id AS owner_profile_id, voyage.id AS voyage_id,
    CASE WHEN space.voyage_id = voyage.id THEN space.id END AS space_id,
    NOT EXISTS (SELECT 1 FROM unnest(source.members) member_id
      WHERE NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = member_id)) AS members_resolve
  FROM normalized source
  LEFT JOIN public.profiles profile ON profile.id = source.user_id
  LEFT JOIN public.voyages voyage ON voyage.slug = source.voyage_slug
  LEFT JOIN public.sessions session ON session.id = source.session_id
  LEFT JOIN public.spaces space ON space.id = session.space_id
), classified AS (
  SELECT resolved.*,
    CASE
      WHEN knowledge_audience_id IS NOT NULL THEN 'audience_already_assigned'
      WHEN voyage_slug IS NULL AND owner_profile_id IS NULL THEN 'private_authority_unresolved'
      WHEN voyage_slug IS NULL AND members <> '{}'::uuid[]
        AND members <> ARRAY[user_id]::uuid[] THEN 'private_participants_conflict'
      WHEN voyage_slug IS NULL THEN NULL
      WHEN members = '{}'::uuid[] THEN 'voyage_audience_not_explicit'
      WHEN NOT members_resolve THEN 'audience_member_unresolved'
      WHEN user_id IS NOT NULL AND owner_profile_id IS NULL THEN 'voyage_user_unresolved'
      WHEN voyage_id IS NULL THEN 'voyage_authority_unresolved'
      ELSE NULL
    END AS rejection_reason,
    CASE WHEN voyage_slug IS NULL THEN 'private'::public.knowledge_audience_scope_kind
      WHEN space_id IS NOT NULL THEN 'space'::public.knowledge_audience_scope_kind
      ELSE 'voyage'::public.knowledge_audience_scope_kind END AS scope_kind,
    CASE WHEN voyage_slug IS NULL THEN user_id
      WHEN space_id IS NOT NULL THEN space_id ELSE voyage_id END AS scope_authority_id,
    CASE WHEN voyage_slug IS NULL THEN ARRAY[user_id]::uuid[]
      ELSE public.normalize_knowledge_audience_members(members ||
        CASE WHEN user_id IS NULL THEN '{}'::uuid[] ELSE ARRAY[user_id]::uuid[] END)
    END AS audience_members
  FROM resolved
)
SELECT classified.*,
  md5(format('voyager-audience:v1:%s:%s:%s', scope_kind, scope_authority_id,
    array_to_string(audience_members, ',')))::uuid AS audience_id,
  md5(format('voyager-node:v1:message_event:%s', id))::uuid AS node_id
FROM classified;

INSERT INTO public.knowledge_graph_backfill_rejections (source_kind, source_id, reason)
SELECT 'knowledge_event', id, rejection_reason FROM k1_event_map
WHERE rejection_reason IS NOT NULL;
INSERT INTO public.knowledge_audiences (id, scope_kind, scope_authority_id, member_profile_ids)
SELECT DISTINCT audience_id, scope_kind, scope_authority_id, audience_members
FROM k1_event_map WHERE rejection_reason IS NULL
ON CONFLICT (id) DO NOTHING;
UPDATE public.knowledge_events event SET knowledge_audience_id = mapped.audience_id
FROM k1_event_map mapped WHERE mapped.id = event.id AND mapped.rejection_reason IS NULL;
INSERT INTO public.graph_nodes (id, kind, authority_id, label, knowledge_audience_id)
SELECT node_id, 'message_event', id, format('message_event:%s', id), audience_id
FROM k1_event_map WHERE rejection_reason IS NULL
ON CONFLICT (kind, authority_id) DO NOTHING;

CREATE TEMP TABLE k1_edge_map ON COMMIT DROP AS
WITH endpoints AS (
  SELECT edge.id, edge.edge_type, source.node_id AS source_node_id,
    target.node_id AS target_node_id, source.scope_kind AS source_scope,
    target.scope_kind AS target_scope, source.audience_id AS source_audience,
    target.audience_id AS target_audience, source.audience_members AS source_members,
    target.audience_members AS target_members,
    public.intersect_knowledge_audience_members(
      source.audience_members, target.audience_members) AS common_members
  FROM public.knowledge_edges edge
  LEFT JOIN k1_event_map source ON source.id = edge.source_id
    AND source.rejection_reason IS NULL
  LEFT JOIN k1_event_map target ON target.id = edge.target_id
    AND target.rejection_reason IS NULL
), canonical AS (
  SELECT endpoints.*,
    least(source_node_id, target_node_id) AS final_source_node_id,
    greatest(source_node_id, target_node_id) AS final_target_node_id,
    count(*) FILTER (WHERE edge_type = 'relates_to' AND source_node_id IS NOT NULL
      AND target_node_id IS NOT NULL) OVER (PARTITION BY
        least(source_node_id, target_node_id), greatest(source_node_id, target_node_id))
      AS canonical_count
  FROM endpoints
)
SELECT canonical.*,
  CASE WHEN source_scope >= target_scope THEN source_audience ELSE target_audience END
    AS edge_audience_id,
  CASE
    WHEN edge_type <> 'relates_to' THEN 'edge_kind_not_exact'
    WHEN source_node_id IS NULL OR target_node_id IS NULL THEN 'edge_endpoint_unresolved'
    WHEN source_node_id = target_node_id THEN 'self_edge_rejected'
    WHEN canonical_count > 1 THEN 'canonical_edge_duplicate'
    WHEN source_scope = target_scope AND source_audience <> target_audience
      THEN 'equal_scope_audience_ambiguous'
    WHEN cardinality(common_members) = 0 THEN 'edge_audience_empty'
    WHEN common_members IS DISTINCT FROM CASE WHEN source_scope >= target_scope
      THEN source_members ELSE target_members END THEN 'edge_audience_not_exact'
    ELSE NULL
  END AS rejection_reason
FROM canonical;

INSERT INTO public.knowledge_graph_backfill_rejections (source_kind, source_id, reason)
SELECT 'knowledge_edge', id, rejection_reason FROM k1_edge_map
WHERE rejection_reason IS NOT NULL;
INSERT INTO public.graph_edges (source_node_id, target_node_id, kind, knowledge_audience_id)
SELECT final_source_node_id, final_target_node_id, 'relates_to', edge_audience_id
FROM k1_edge_map WHERE rejection_reason IS NULL
ON CONFLICT (source_node_id, target_node_id, kind) DO NOTHING;

DO $k1_parity$
BEGIN
  IF (SELECT count(*) FROM k1_event_map WHERE rejection_reason IS NULL) <>
    (SELECT count(*) FROM k1_event_map mapped JOIN public.graph_nodes node
      ON node.kind = 'message_event' AND node.authority_id = mapped.id
      AND node.knowledge_audience_id = mapped.audience_id WHERE mapped.rejection_reason IS NULL)
    OR (SELECT count(*) FROM k1_edge_map WHERE rejection_reason IS NULL) <>
    (SELECT count(*) FROM k1_edge_map mapped JOIN public.graph_edges edge
      ON edge.source_node_id = mapped.final_source_node_id
      AND edge.target_node_id = mapped.final_target_node_id AND edge.kind = 'relates_to'
      AND edge.knowledge_audience_id = mapped.edge_audience_id
      WHERE mapped.rejection_reason IS NULL) THEN
    RAISE EXCEPTION 'knowledge_graph_k1_backfill_parity_failed';
  END IF;
END
$k1_parity$;

DROP FUNCTION IF EXISTS public.graph_traverse(uuid, text, text, int, float, int);
DROP FUNCTION IF EXISTS public.graph_traverse(
  uuid, text, text, int, float, int, uuid, text, uuid[]);
DROP TABLE public.knowledge_edges;

CREATE FUNCTION public.write_knowledge_graph_edge(
  p_source_kind public.graph_node_kind, p_source_authority_id uuid,
  p_target_kind public.graph_node_kind, p_target_authority_id uuid,
  p_kind public.graph_edge_kind
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public AS $$
DECLARE
  v_source public.graph_nodes; v_target public.graph_nodes;
  v_source_scope public.knowledge_audience_scope_kind;
  v_target_scope public.knowledge_audience_scope_kind; v_audience_id uuid;
  v_source_node_id uuid; v_target_node_id uuid;
BEGIN
  SELECT * INTO STRICT v_source FROM public.graph_nodes
    WHERE kind = p_source_kind AND authority_id = p_source_authority_id;
  SELECT * INTO STRICT v_target FROM public.graph_nodes
    WHERE kind = p_target_kind AND authority_id = p_target_authority_id;
  SELECT scope_kind INTO v_source_scope FROM public.knowledge_audiences
    WHERE id = v_source.knowledge_audience_id;
  SELECT scope_kind INTO v_target_scope FROM public.knowledge_audiences
    WHERE id = v_target.knowledge_audience_id;
  v_audience_id := CASE WHEN v_source_scope >= v_target_scope
    THEN v_source.knowledge_audience_id ELSE v_target.knowledge_audience_id END;
  v_source_node_id := v_source.id; v_target_node_id := v_target.id;
  IF p_kind = 'relates_to' AND v_source_node_id > v_target_node_id THEN
    v_source_node_id := v_target.id; v_target_node_id := v_source.id;
  END IF;
  INSERT INTO public.graph_edges (source_node_id, target_node_id, kind, knowledge_audience_id)
  VALUES (v_source_node_id, v_target_node_id, p_kind, v_audience_id)
  ON CONFLICT (source_node_id, target_node_id, kind) DO NOTHING;
  RETURN true;
END
$$;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.graph_edges FROM service_role;
REVOKE EXECUTE ON FUNCTION public.write_knowledge_graph_edge(
  public.graph_node_kind, uuid, public.graph_node_kind, uuid, public.graph_edge_kind)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.write_knowledge_graph_edge(
  public.graph_node_kind, uuid, public.graph_node_kind, uuid, public.graph_edge_kind)
  TO service_role;
