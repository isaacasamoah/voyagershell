-- K2 graph substrate. Additive: it installs the new registry beside the legacy
-- graph and reads nothing, so no runtime path changes until the cutover.
-- Product authority migrations 054-059 are prerequisites.
CREATE TYPE public.graph_node_kind AS ENUM (
  'person', 'voyager', 'voyage', 'space', 'message_event', 'knowledge_unit'
);
CREATE TYPE public.knowledge_audience_scope_kind AS ENUM ('voyage', 'space', 'private');
CREATE TYPE public.knowledge_audience_purpose AS ENUM ('source', 'authority');
CREATE TYPE public.graph_edge_kind AS ENUM (
  'authored_by', 'posted_in', 'reply_to', 'in_voyage', 'member_of',
  'companion_of', 'derived_from', 'generated_by', 'about', 'supports',
  'contradicts', 'supersedes', 'elaborates', 'relates_to', 'decided_by',
  'raised_by'
);

CREATE FUNCTION public.canonical_graph_node_id(
  p_kind public.graph_node_kind, p_authority_id uuid) RETURNS uuid
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path = pg_catalog AS $$
  SELECT md5(format('voyager-node:v2:%s:%s', p_kind, p_authority_id))::uuid
$$;
CREATE FUNCTION public.canonical_graph_edge_id(p_source_node_id uuid,
  p_kind public.graph_edge_kind, p_target_node_id uuid) RETURNS uuid
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path = pg_catalog AS $$
  SELECT md5(format('voyager-edge:v2:%s:%s:%s',
    CASE WHEN p_kind = 'relates_to' THEN least(p_source_node_id, p_target_node_id)
      ELSE p_source_node_id END, p_kind,
    CASE WHEN p_kind = 'relates_to' THEN greatest(p_source_node_id, p_target_node_id)
      ELSE p_target_node_id END))::uuid
$$;
CREATE FUNCTION public.canonical_graph_authority_edge_id(p_authority_kind text,
  p_authority_row_id uuid, p_kind public.graph_edge_kind) RETURNS uuid
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path = pg_catalog AS $$
  SELECT md5(format('voyager-authority-edge:v2:%s:%s:%s',
    p_authority_kind, p_authority_row_id, p_kind))::uuid
$$;

CREATE FUNCTION public.normalize_knowledge_audience_members(p_members uuid[])
RETURNS uuid[] LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
SET search_path = pg_catalog AS $$
  SELECT coalesce(array_agg(DISTINCT member ORDER BY member), '{}'::uuid[])
  FROM unnest(p_members) AS member WHERE member IS NOT NULL
$$;
CREATE FUNCTION public.canonical_knowledge_audience_id(p_purpose public.knowledge_audience_purpose,
  p_scope public.knowledge_audience_scope_kind, p_authority_id uuid, p_members uuid[]) RETURNS uuid
LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE SET search_path = pg_catalog AS $$
  SELECT md5(format('voyager-audience:v2:%s:%s:%s:%s', p_purpose, p_scope, p_authority_id,
    array_to_string(public.normalize_knowledge_audience_members(p_members), ',')))::uuid
$$;

CREATE TABLE public.knowledge_audiences (
  id uuid PRIMARY KEY,
  purpose public.knowledge_audience_purpose NOT NULL,
  scope_kind public.knowledge_audience_scope_kind NOT NULL,
  scope_authority_id uuid NOT NULL,
  member_profile_ids uuid[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT knowledge_audiences_source_nonempty CHECK (
    purpose = 'authority' OR cardinality(member_profile_ids) > 0),
  CONSTRAINT knowledge_audiences_canonical CHECK (
    member_profile_ids = public.normalize_knowledge_audience_members(member_profile_ids)
  ),
  CONSTRAINT knowledge_audiences_canonical_id CHECK (id = public.canonical_knowledge_audience_id(
    purpose, scope_kind, scope_authority_id, member_profile_ids)),
  UNIQUE (purpose, scope_kind, scope_authority_id, member_profile_ids)
);

ALTER TABLE public.knowledge_events
  ADD COLUMN knowledge_audience_id uuid
  REFERENCES public.knowledge_audiences(id) ON DELETE RESTRICT;
ALTER TABLE public.knowledge_events
  DROP CONSTRAINT knowledge_events_user_id_fkey,
  ADD CONSTRAINT knowledge_events_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE RESTRICT,
  DROP CONSTRAINT knowledge_events_actor_id_fkey,
  ADD CONSTRAINT knowledge_events_actor_id_fkey FOREIGN KEY (actor_id)
    REFERENCES auth.users(id) ON DELETE RESTRICT;
ALTER TABLE public.knowledge_current
  DROP CONSTRAINT knowledge_current_user_id_fkey,
  ADD CONSTRAINT knowledge_current_user_id_fkey FOREIGN KEY (user_id)
    REFERENCES auth.users(id) ON DELETE RESTRICT;

CREATE FUNCTION public.guard_knowledge_event_source()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_OP = 'DELETE' OR (to_jsonb(NEW) - 'knowledge_audience_id')
    IS DISTINCT FROM (to_jsonb(OLD) - 'knowledge_audience_id') THEN
    RAISE EXCEPTION 'knowledge_event_source_immutable' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END
$$;
CREATE TRIGGER trg_knowledge_event_source_immutable
  BEFORE UPDATE OR DELETE ON public.knowledge_events
  FOR EACH ROW EXECUTE FUNCTION public.guard_knowledge_event_source();

CREATE TABLE public.knowledge_units (
  id uuid PRIMARY KEY,
  claim text NOT NULL CHECK (length(btrim(claim)) > 0),
  source_event_id uuid NOT NULL REFERENCES public.knowledge_events(id) ON DELETE RESTRICT,
  extractor_version text NOT NULL CHECK (length(btrim(extractor_version)) > 0),
  claim_key text NOT NULL CHECK (length(btrim(claim_key)) > 0),
  knowledge_audience_id uuid NOT NULL REFERENCES public.knowledge_audiences(id),
  UNIQUE (source_event_id, extractor_version, claim_key)
);

CREATE TABLE public.graph_nodes (
  id uuid PRIMARY KEY,
  kind public.graph_node_kind NOT NULL,
  authority_id uuid NOT NULL,
  label text NOT NULL CHECK (length(btrim(label)) > 0),
  CONSTRAINT graph_nodes_canonical_id CHECK (
    id = public.canonical_graph_node_id(kind, authority_id)),
  UNIQUE (kind, authority_id)
);

CREATE TABLE public.graph_node_grants (
  node_id uuid NOT NULL REFERENCES public.graph_nodes(id) ON DELETE RESTRICT,
  knowledge_audience_id uuid NOT NULL REFERENCES public.knowledge_audiences(id),
  basis_kind text NOT NULL CHECK (basis_kind IN (
    'source_event', 'edge_evidence', 'voyage_member', 'space_member', 'profile', 'space')),
  basis_id uuid NOT NULL,
  basis_version bigint NOT NULL CHECK (basis_version > 0),
  label_snapshot text NOT NULL CHECK (length(btrim(label_snapshot)) > 0),
  granted_at timestamptz NOT NULL,
  basis_event_id uuid,
  PRIMARY KEY (node_id, knowledge_audience_id, basis_kind, basis_id, basis_version)
);

CREATE TABLE public.graph_edges (
  id uuid PRIMARY KEY,
  source_node_id uuid NOT NULL REFERENCES public.graph_nodes(id),
  target_node_id uuid NOT NULL REFERENCES public.graph_nodes(id),
  kind public.graph_edge_kind NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_node_id, target_node_id, kind),
  CONSTRAINT graph_edges_no_self_edge CHECK (source_node_id <> target_node_id),
  CONSTRAINT graph_edges_canonical_id CHECK (
    id = public.canonical_graph_edge_id(source_node_id, kind, target_node_id)),
  CONSTRAINT graph_edges_historical_kind CHECK (
    kind NOT IN ('member_of', 'in_voyage', 'companion_of'))
);
CREATE INDEX graph_edges_target_idx ON public.graph_edges(target_node_id);

CREATE TABLE public.graph_edge_evidence (
  edge_id uuid NOT NULL REFERENCES public.graph_edges(id) ON DELETE RESTRICT,
  evidence_event_id uuid NOT NULL REFERENCES public.knowledge_events(id) ON DELETE RESTRICT,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (edge_id, evidence_event_id)
);

CREATE TABLE public.graph_authority_edges (
  id uuid PRIMARY KEY,
  source_node_id uuid NOT NULL REFERENCES public.graph_nodes(id),
  target_node_id uuid NOT NULL REFERENCES public.graph_nodes(id),
  kind public.graph_edge_kind NOT NULL CHECK (
    kind IN ('member_of', 'in_voyage', 'companion_of')),
  authority_kind text NOT NULL CHECK (authority_kind IN (
    'voyage_member', 'space_member', 'space', 'profile')),
  authority_row_id uuid NOT NULL,
  authority_revision bigint NOT NULL CHECK (authority_revision > 0),
  state text NOT NULL,
  effective_at timestamptz NOT NULL,
  knowledge_audience_id uuid NOT NULL REFERENCES public.knowledge_audiences(id),
  projected_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT graph_authority_edges_basis_kind CHECK (
    (kind = 'member_of' AND authority_kind IN ('voyage_member', 'space_member'))
    OR (kind = 'in_voyage' AND authority_kind = 'space')
    OR (kind = 'companion_of' AND authority_kind = 'profile')),
  CONSTRAINT graph_authority_edges_canonical_id CHECK (
    id = public.canonical_graph_authority_edge_id(authority_kind, authority_row_id, kind)),
  UNIQUE (authority_kind, authority_row_id, kind)
);
CREATE INDEX graph_authority_edges_endpoint_idx
  ON public.graph_authority_edges(source_node_id, target_node_id);
CREATE INDEX graph_authority_edges_target_idx ON public.graph_authority_edges(target_node_id);
