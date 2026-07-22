-- Additive knowledge-graph foundation. knowledge_events remains the only
-- content ledger; knowledge_edges remains untouched until the K1 cutover.
CREATE TYPE public.graph_node_kind AS ENUM (
  'person', 'voyager', 'voyage', 'space', 'message_event', 'knowledge_unit'
);
CREATE TYPE public.knowledge_audience_scope_kind AS ENUM ('voyage', 'space', 'private');
CREATE TYPE public.graph_edge_kind AS ENUM (
  'authored_by', 'posted_in', 'reply_to', 'in_voyage', 'member_of',
  'companion_of', 'derived_from', 'generated_by', 'about', 'supports',
  'contradicts', 'supersedes', 'elaborates', 'relates_to', 'decided_by',
  'raised_by'
);

CREATE FUNCTION public.normalize_knowledge_audience_members(p_members uuid[])
RETURNS uuid[] LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE
SET search_path = pg_catalog AS $$
  SELECT coalesce(array_agg(DISTINCT member ORDER BY member), '{}'::uuid[])
  FROM unnest(p_members) AS member WHERE member IS NOT NULL
$$;

CREATE TABLE public.knowledge_audiences (
  id uuid PRIMARY KEY,
  scope_kind public.knowledge_audience_scope_kind NOT NULL,
  scope_authority_id uuid NOT NULL,
  member_profile_ids uuid[] NOT NULL,
  CONSTRAINT knowledge_audiences_nonempty CHECK (cardinality(member_profile_ids) > 0),
  CONSTRAINT knowledge_audiences_canonical CHECK (
    member_profile_ids = public.normalize_knowledge_audience_members(member_profile_ids)
  )
);

ALTER TABLE public.knowledge_events
  ADD COLUMN knowledge_audience_id uuid
  REFERENCES public.knowledge_audiences(id) ON DELETE RESTRICT;

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
  knowledge_audience_id uuid NOT NULL REFERENCES public.knowledge_audiences(id),
  UNIQUE (kind, authority_id)
);

CREATE TABLE public.graph_edges (
  source_node_id uuid NOT NULL REFERENCES public.graph_nodes(id),
  target_node_id uuid NOT NULL REFERENCES public.graph_nodes(id),
  kind public.graph_edge_kind NOT NULL,
  knowledge_audience_id uuid NOT NULL REFERENCES public.knowledge_audiences(id),
  PRIMARY KEY (source_node_id, target_node_id, kind),
  CONSTRAINT graph_edges_no_self_edge CHECK (source_node_id <> target_node_id)
);
CREATE INDEX graph_edges_target_idx ON public.graph_edges(target_node_id);
