LOCK TABLE public.knowledge_edges IN ACCESS EXCLUSIVE MODE;
CREATE TABLE public.knowledge_graph_backfill_rejections (
  source_kind text NOT NULL CHECK (source_kind IN ('person', 'voyager', 'voyage', 'space', 'message_event', 'knowledge_edge')),
  source_id uuid NOT NULL,
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  source_digest text NOT NULL CHECK (source_digest ~ '^[0-9a-f]{32}$'),
  PRIMARY KEY (source_kind, source_id)
);
CREATE TRIGGER trg_knowledge_graph_backfill_rejections_immutable
  BEFORE UPDATE OR DELETE ON public.knowledge_graph_backfill_rejections
  FOR EACH ROW EXECUTE FUNCTION public.reject_immutable_knowledge_graph_row();
ALTER TABLE public.knowledge_graph_backfill_rejections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.knowledge_graph_backfill_rejections FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.knowledge_graph_backfill_rejections TO service_role;
CREATE TEMP TABLE k1_event_map ON COMMIT DROP AS
WITH normalized AS (
  SELECT event.id, event.user_id, event.voyage_slug,
    public.normalize_knowledge_audience_members(coalesce(event.participants, '{}'::uuid[])) members,
    event.knowledge_audience_id, event.metadata->>'session_id' session_ref,
    CASE WHEN event.metadata->>'session_id' ~*
      '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      THEN (event.metadata->>'session_id')::uuid END session_id
  FROM public.knowledge_events event
), resolved AS (
  SELECT source.*, profile.id owner_id, voyage.id voyage_id,
    session.id resolved_session_id, session.voyage_id session_voyage_id, session.space_id session_space_id,
    space.id resolved_space_id, space.voyage_id space_voyage_id,
    NOT EXISTS (SELECT 1 FROM unnest(source.members) member_id
      WHERE NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = member_id)) members_resolve
  FROM normalized source
  LEFT JOIN public.profiles profile ON profile.id = source.user_id
  LEFT JOIN public.voyages voyage ON voyage.slug = source.voyage_slug
  LEFT JOIN public.sessions session ON session.id = source.session_id
  LEFT JOIN public.spaces space ON space.id = session.space_id
), classified AS (
  SELECT resolved.*,
    CASE WHEN knowledge_audience_id IS NOT NULL THEN 'audience_already_assigned'
      WHEN session_ref IS NOT NULL AND session_id IS NULL THEN 'session_authority_malformed'
      WHEN session_id IS NOT NULL AND resolved_session_id IS NULL THEN 'session_authority_unresolved'
      WHEN voyage_slug IS NOT NULL AND session_id IS NOT NULL
        AND session_voyage_id IS DISTINCT FROM voyage_id THEN 'session_voyage_mismatch'
      WHEN session_space_id IS NOT NULL AND resolved_space_id IS NULL THEN 'space_authority_unresolved'
      WHEN session_space_id IS NOT NULL
        AND space_voyage_id IS DISTINCT FROM session_voyage_id THEN 'space_voyage_mismatch'
      WHEN session_space_id IS NULL AND voyage_slug IS NULL AND owner_id IS NULL
        THEN 'private_authority_unresolved'
      WHEN session_space_id IS NULL AND voyage_slug IS NULL
        AND members NOT IN ('{}'::uuid[], ARRAY[user_id]::uuid[])
        THEN 'private_participants_conflict'
      WHEN session_space_id IS NULL AND voyage_slug IS NULL THEN NULL
      WHEN members = '{}'::uuid[] THEN 'source_audience_not_explicit'
      WHEN NOT members_resolve THEN 'audience_member_unresolved'
      WHEN user_id IS NOT NULL AND owner_id IS NULL THEN 'source_author_unresolved'
      WHEN user_id IS NOT NULL AND NOT user_id = ANY(members) THEN 'source_author_not_attested'
      WHEN session_space_id IS NULL AND voyage_slug IS NOT NULL AND voyage_id IS NULL
        THEN 'voyage_authority_unresolved' ELSE NULL END rejection_reason,
    CASE WHEN session_space_id IS NOT NULL THEN 'space'::public.knowledge_audience_scope_kind
      WHEN voyage_slug IS NULL THEN 'private'::public.knowledge_audience_scope_kind
      ELSE 'voyage'::public.knowledge_audience_scope_kind END scope_kind,
    CASE WHEN session_space_id IS NOT NULL THEN resolved_space_id WHEN voyage_slug IS NULL THEN user_id
      ELSE voyage_id END scope_authority_id,
    CASE WHEN session_space_id IS NOT NULL THEN members
      WHEN voyage_slug IS NULL THEN ARRAY[user_id]::uuid[] ELSE members END audience_members
  FROM resolved)
SELECT classified.*, public.canonical_knowledge_audience_id(
  'source', scope_kind, scope_authority_id, audience_members) audience_id,
  public.canonical_graph_node_id('message_event', id) node_id
FROM classified;
INSERT INTO public.knowledge_graph_backfill_rejections(source_kind, source_id, reason, source_digest)
SELECT 'message_event', mapped.id, mapped.rejection_reason, md5(jsonb_build_array(
  'message_event:v1', event.id, event.sequence_num, event.user_id, event.voyage_slug, event.event_type,
  event.source_type, event.actor_id, event.actor_type, public.normalize_knowledge_audience_members(
    coalesce(event.participants, '{}'::uuid[])), extract(epoch FROM event.created_at))::text)
  FROM k1_event_map mapped JOIN public.knowledge_events event ON event.id = mapped.id
WHERE mapped.rejection_reason IS NOT NULL;
INSERT INTO public.knowledge_audiences(id, purpose, scope_kind, scope_authority_id, member_profile_ids)
SELECT DISTINCT audience_id, 'source'::public.knowledge_audience_purpose, scope_kind, scope_authority_id, audience_members
FROM k1_event_map WHERE rejection_reason IS NULL ON CONFLICT DO NOTHING;
UPDATE public.knowledge_events event SET knowledge_audience_id = mapped.audience_id
FROM k1_event_map mapped WHERE mapped.id = event.id AND mapped.rejection_reason IS NULL;
INSERT INTO public.knowledge_audiences(id, purpose, scope_kind, scope_authority_id, member_profile_ids)
SELECT public.canonical_knowledge_audience_id('authority', 'private', id, ARRAY[id]),
  'authority'::public.knowledge_audience_purpose, 'private'::public.knowledge_audience_scope_kind,
  id, ARRAY[id] FROM public.profiles ON CONFLICT DO NOTHING;
INSERT INTO public.knowledge_audiences(id, purpose, scope_kind, scope_authority_id, member_profile_ids)
SELECT public.canonical_knowledge_audience_id('authority', 'voyage', voyage_id,
    public.normalize_knowledge_audience_members(array_agg(user_id))),
  'authority'::public.knowledge_audience_purpose, 'voyage'::public.knowledge_audience_scope_kind, voyage_id,
  public.normalize_knowledge_audience_members(array_agg(user_id))
FROM public.voyage_members WHERE state = 'active' GROUP BY voyage_id ON CONFLICT DO NOTHING;
INSERT INTO public.knowledge_audiences(id, purpose, scope_kind, scope_authority_id, member_profile_ids)
SELECT public.canonical_knowledge_audience_id('authority', 'space', space_id,
    public.normalize_knowledge_audience_members(array_agg(user_id))),
  'authority'::public.knowledge_audience_purpose, 'space'::public.knowledge_audience_scope_kind, space_id,
  public.normalize_knowledge_audience_members(array_agg(user_id))
FROM public.space_members WHERE public.is_effective_space_member(space_id, user_id)
GROUP BY space_id ON CONFLICT DO NOTHING;
INSERT INTO public.graph_nodes(id, kind, authority_id, label)
SELECT public.canonical_graph_node_id('person', id), 'person'::public.graph_node_kind, id,
  coalesce(nullif(display_name, ''), nullif(username, ''), format('person:%s', id)) FROM public.profiles
UNION ALL SELECT public.canonical_graph_node_id('voyager', id), 'voyager'::public.graph_node_kind, id,
  coalesce(nullif(username, ''), nullif(display_name, ''), format('voyager:%s', id)) FROM public.profiles
UNION ALL SELECT public.canonical_graph_node_id('voyage', id), 'voyage'::public.graph_node_kind, id, name FROM public.voyages
UNION ALL SELECT public.canonical_graph_node_id('space', id), 'space'::public.graph_node_kind, id, format('space:%s', id)
  FROM public.spaces
UNION ALL SELECT node_id, 'message_event'::public.graph_node_kind, id, format('message_event:%s', id)
  FROM k1_event_map WHERE rejection_reason IS NULL ON CONFLICT (kind, authority_id) DO NOTHING;
INSERT INTO public.graph_node_grants
  (node_id, knowledge_audience_id, basis_kind, basis_id, basis_version, label_snapshot, granted_at)
SELECT node.id, audience.id, 'profile', profile.id, 1, node.label, profile.created_at
FROM public.profiles profile JOIN public.graph_nodes node ON node.authority_id = profile.id
  AND node.kind IN ('person', 'voyager')
JOIN public.knowledge_audiences audience ON audience.purpose = 'authority'
  AND audience.scope_kind = 'private' AND audience.scope_authority_id = profile.id
ON CONFLICT DO NOTHING;
INSERT INTO public.graph_node_grants
SELECT node.id, event.knowledge_audience_id, 'source_event', event.id, 1, node.label, event.created_at
FROM k1_event_map mapped JOIN public.knowledge_events event ON event.id = mapped.id
JOIN public.graph_nodes node ON node.kind = 'message_event' AND node.authority_id = event.id
WHERE mapped.rejection_reason IS NULL ON CONFLICT DO NOTHING;
INSERT INTO public.graph_node_grants
SELECT node.id, audience.id, 'voyage_member', member.id, member.revision, node.label,
  member.state_changed_at FROM public.voyage_members member
JOIN public.knowledge_audiences audience ON audience.purpose = 'authority'
  AND audience.scope_kind = 'voyage' AND audience.scope_authority_id = member.voyage_id
JOIN public.graph_nodes node ON (node.kind = 'person' AND node.authority_id = member.user_id)
  OR (node.kind = 'voyage' AND node.authority_id = member.voyage_id)
WHERE member.state = 'active' ON CONFLICT DO NOTHING;
INSERT INTO public.graph_node_grants
SELECT node.id, audience.id, 'space_member', member.id, member.revision, node.label,
  member.state_changed_at FROM public.space_members member
JOIN public.knowledge_audiences audience ON audience.purpose = 'authority'
  AND audience.scope_kind = 'space' AND audience.scope_authority_id = member.space_id
JOIN public.graph_nodes node ON (node.kind = 'person' AND node.authority_id = member.user_id)
  OR (node.kind = 'space' AND node.authority_id = member.space_id)
WHERE public.is_effective_space_member(member.space_id, member.user_id) ON CONFLICT DO NOTHING;
INSERT INTO public.graph_authority_edges(id, source_node_id, target_node_id, kind,
  authority_kind, authority_row_id, authority_revision, state, effective_at, knowledge_audience_id)
SELECT public.canonical_graph_authority_edge_id('profile', profile.id, 'companion_of'),
  public.canonical_graph_node_id('voyager', profile.id), public.canonical_graph_node_id('person', profile.id),
  'companion_of'::public.graph_edge_kind, 'profile', profile.id, 1, 'active', profile.created_at, audience.id
FROM public.profiles profile JOIN public.knowledge_audiences audience
  ON audience.purpose = 'authority' AND audience.scope_kind = 'private'
  AND audience.scope_authority_id = profile.id ON CONFLICT DO NOTHING;
INSERT INTO public.graph_authority_edges(id, source_node_id, target_node_id, kind,
  authority_kind, authority_row_id, authority_revision, state, effective_at, knowledge_audience_id)
SELECT public.canonical_graph_authority_edge_id('voyage_member', member.id, 'member_of'),
  public.canonical_graph_node_id('person', member.user_id), public.canonical_graph_node_id('voyage', member.voyage_id),
  'member_of'::public.graph_edge_kind, 'voyage_member', member.id, member.revision,
  member.state, member.state_changed_at, audience.id
FROM public.voyage_members member JOIN public.knowledge_audiences audience
  ON audience.purpose = 'authority' AND audience.scope_kind = 'voyage'
  AND audience.scope_authority_id = member.voyage_id ON CONFLICT DO NOTHING;
INSERT INTO public.graph_authority_edges(id, source_node_id, target_node_id, kind,
  authority_kind, authority_row_id, authority_revision, state, effective_at, knowledge_audience_id)
SELECT public.canonical_graph_authority_edge_id('space_member', member.id, 'member_of'),
  public.canonical_graph_node_id('person', member.user_id), public.canonical_graph_node_id('space', member.space_id),
  'member_of'::public.graph_edge_kind, 'space_member', member.id, member.revision,
  member.state, member.state_changed_at, audience.id
FROM public.space_members member JOIN public.knowledge_audiences audience
  ON audience.purpose = 'authority' AND audience.scope_kind = 'space'
  AND audience.scope_authority_id = member.space_id ON CONFLICT DO NOTHING;
INSERT INTO public.graph_authority_edges(id, source_node_id, target_node_id, kind,
  authority_kind, authority_row_id, authority_revision, state, effective_at, knowledge_audience_id)
SELECT public.canonical_graph_authority_edge_id('space', space.id, 'in_voyage'),
  public.canonical_graph_node_id('space', space.id), public.canonical_graph_node_id('voyage', space.voyage_id),
  'in_voyage'::public.graph_edge_kind, 'space', space.id, 1, 'active', space.created_at, audience.id
FROM public.spaces space JOIN public.knowledge_audiences audience
  ON audience.purpose = 'authority' AND audience.scope_kind = 'space'
  AND audience.scope_authority_id = space.id WHERE space.voyage_id IS NOT NULL ON CONFLICT DO NOTHING;
INSERT INTO public.knowledge_graph_backfill_rejections(source_kind, source_id, reason, source_digest)
SELECT 'knowledge_edge', edge.id, 'legacy_edge_unattested', md5(jsonb_build_array('knowledge_edge:v1',
  edge.id, edge.source_id, edge.target_id, edge.edge_type, edge.created_by, extract(epoch FROM edge.created_at))::text)
FROM public.knowledge_edges edge;
DO $k1_parity$ BEGIN
  IF (SELECT count(*) FROM k1_event_map WHERE rejection_reason IS NULL) <>
      (SELECT count(*) FROM k1_event_map m JOIN public.graph_nodes n
        ON n.kind = 'message_event' AND n.authority_id = m.id WHERE m.rejection_reason IS NULL)
    OR (SELECT count(*) FROM public.knowledge_edges) <> (SELECT count(*)
      FROM public.knowledge_graph_backfill_rejections
      WHERE source_kind = 'knowledge_edge' AND reason = 'legacy_edge_unattested')
    OR EXISTS (SELECT 1 FROM public.knowledge_edges edge
      LEFT JOIN public.knowledge_graph_backfill_rejections rejection
        ON rejection.source_kind = 'knowledge_edge' AND rejection.source_id = edge.id
      WHERE rejection.source_digest IS DISTINCT FROM md5(jsonb_build_array('knowledge_edge:v1',
        edge.id, edge.source_id, edge.target_id, edge.edge_type, edge.created_by, extract(epoch FROM edge.created_at))::text)) THEN
    RAISE EXCEPTION 'knowledge_graph_k1_backfill_parity_failed';
  END IF;
END $k1_parity$;
DROP FUNCTION IF EXISTS public.graph_traverse(uuid, text, text, int, float, int);
DROP FUNCTION IF EXISTS public.graph_traverse(uuid, text, text, int, float, int, uuid, text, uuid[]);
DROP FUNCTION IF EXISTS public.graph_traverse(
  uuid, uuid, text, text, text, integer, double precision, integer);
DROP TABLE public.knowledge_edges;
ALTER TABLE public.knowledge_audiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graph_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graph_node_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graph_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graph_edge_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graph_authority_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_graph_backfill_rejections ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.knowledge_audiences, public.knowledge_units, public.graph_nodes,
  public.graph_node_grants, public.graph_edges, public.graph_edge_evidence,
  public.graph_authority_edges, public.knowledge_graph_backfill_rejections
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.knowledge_audiences, public.knowledge_units, public.graph_nodes,
  public.graph_node_grants, public.graph_edges, public.graph_edge_evidence,
  public.graph_authority_edges, public.knowledge_graph_backfill_rejections TO service_role;
CREATE FUNCTION public.write_knowledge_graph_edge(
  p_source_kind public.graph_node_kind, p_source_authority_id uuid,
  p_target_kind public.graph_node_kind, p_target_authority_id uuid,
  p_kind public.graph_edge_kind
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_source public.graph_nodes;
  v_target public.graph_nodes;
  v_swap public.graph_nodes;
  v_event uuid;
  v_edge uuid;
BEGIN
  IF p_kind IN ('member_of', 'in_voyage', 'companion_of') THEN
    RAISE EXCEPTION 'authority_edge_requires_product_trigger' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO STRICT v_source FROM public.graph_nodes
    WHERE kind = p_source_kind AND authority_id = p_source_authority_id;
  SELECT * INTO STRICT v_target FROM public.graph_nodes
    WHERE kind = p_target_kind AND authority_id = p_target_authority_id;
  v_event := CASE v_source.kind WHEN 'message_event' THEN v_source.authority_id
    WHEN 'knowledge_unit' THEN (SELECT source_event_id FROM public.knowledge_units
      WHERE id = v_source.authority_id) END;
  IF v_event IS NULL THEN
    RAISE EXCEPTION 'edge_evidence_source_required' USING ERRCODE = '23514';
  END IF;
  IF p_kind = 'relates_to' AND v_source.id > v_target.id THEN
    v_swap := v_source;
    v_source := v_target;
    v_target := v_swap;
  END IF;
  v_edge := public.canonical_graph_edge_id(v_source.id, p_kind, v_target.id);
  INSERT INTO public.graph_edges(id, source_node_id, target_node_id, kind)
  VALUES (v_edge, v_source.id, v_target.id, p_kind) ON CONFLICT DO NOTHING;
  SELECT id INTO STRICT v_edge FROM public.graph_edges WHERE source_node_id = v_source.id
    AND target_node_id = v_target.id AND kind = p_kind;
  INSERT INTO public.graph_edge_evidence(edge_id, evidence_event_id)
  VALUES (v_edge, v_event) ON CONFLICT DO NOTHING;
  RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION public.write_knowledge_graph_edge(public.graph_node_kind, uuid, public.graph_node_kind, uuid, public.graph_edge_kind) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.write_knowledge_graph_edge(public.graph_node_kind, uuid, public.graph_node_kind, uuid, public.graph_edge_kind) TO service_role;
