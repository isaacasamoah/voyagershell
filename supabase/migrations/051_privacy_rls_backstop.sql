-- =============================================================================
-- Migration 051: database-layer privacy backstop  (ORU-450)
-- =============================================================================
-- The app gates families apart at the QUERY layer, but several tables and one
-- SECURITY DEFINER function had NO row-level security. A direct authenticated
-- Supabase REST/RPC call (bypassing the app) therefore read across every
-- family. This migration installs the DB-layer backstop so privacy no longer
-- depends on the app being the only caller.
--
-- KEY FACT that makes this pure-additive for the app: every legitimate app path
-- to these tables/functions goes through the service-role client
-- (lib/supabase/admin.ts → SUPABASE_SECRET_KEY), and service_role has BYPASSRLS.
-- Enabling RLS closes the authenticated-REST leak WITHOUT touching any app path.
--
-- PROOF-OF-CONCEPT SLICE (ORU-450 spec phase): this file currently contains the
-- two load-bearing shapes —
--   (1) retrieval_events RLS  — the cleanest owner-only backstop, and
--   (2) the search_knowledge auth.uid() gate — the riskiest claim (a
--       SECURITY DEFINER function GRANTed to `authenticated` that trusted a
--       caller-supplied p_user_id / p_participants).
-- Build GROWS this same migration through the work list: RLS on spaces,
-- space_members and voyage_invites, plus graph_traverse scoping.
-- =============================================================================


-- ---------------------------------------------------------------------------
-- (1) retrieval_events — owner-only SELECT.
--     Every row is one user's query text + the node ids retrieved for them.
--     Writes happen via the service-role app path (lib/retrieval/logging.ts),
--     which bypasses RLS; authenticated REST callers get owner-only reads and
--     (absent an INSERT policy) no direct writes.
-- ---------------------------------------------------------------------------
ALTER TABLE public.retrieval_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "retrieval_events owner read" ON public.retrieval_events;
CREATE POLICY "retrieval_events owner read"
  ON public.retrieval_events
  FOR SELECT
  USING (user_id = auth.uid());


-- ---------------------------------------------------------------------------
-- (2) search_knowledge — auth.uid() gate on a SECURITY DEFINER RPC.
--
--     The function is GRANTed to `authenticated` and runs as its definer, so it
--     reads knowledge_current with RLS bypassed and returns whatever the
--     caller-supplied p_user_id / p_participants select. An authenticated
--     REST caller could forge p_user_id to read a victim's L1 personal
--     knowledge, or forge p_participants to read L4 participant messages.
--
--     THE GATE (and the reason it must be conditional): the app itself calls
--     this RPC through the service-role client (lib/knowledge/search.ts →
--     getClientForUser → getClientForContext with no JWT → getAdminClient()),
--     so for the trusted app path auth.uid() is NULL. We therefore restrict
--     ONLY authenticated callers (auth.uid() IS NOT NULL) to searching as
--     themselves, and derive p_participants server-side. The service-role path
--     — which already scopes every call in application code — is left intact,
--     so there is no app regression. `authenticated` is the only non-service
--     role GRANTed EXECUTE; `anon` cannot call it at all.
--
--     Signature + body below are byte-for-byte migration 045's, with only the
--     guard block added — a clean in-place replacement (grants survive REPLACE;
--     re-affirmed at the end).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_knowledge(
  query_embedding vector,
  p_user_id uuid DEFAULT NULL::uuid,
  p_voyage_slug text DEFAULT NULL::text,
  p_classifications text[] DEFAULT NULL::text[],
  p_match_threshold double precision DEFAULT 0.7,
  p_match_count integer DEFAULT 10,
  p_knowledge_type text DEFAULT NULL::text,
  p_min_attention double precision DEFAULT 0.0,
  p_participants uuid[] DEFAULT NULL::uuid[]
)
 RETURNS TABLE(event_id uuid, content text, classifications text[], entities text[], topics text[], connected_to uuid[], participants uuid[], source_created_at timestamp with time zone, similarity double precision, knowledge_type text, attention_score real, context_snippet text, sender_display_name text, sender_user_id uuid, event_type text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_caller UUID := auth.uid();
BEGIN
  -- Gate: authenticated callers may only search as themselves.
  -- v_caller IS NULL for the trusted service-role app path — left unrestricted.
  IF v_caller IS NOT NULL THEN
    IF p_user_id IS DISTINCT FROM v_caller THEN
      RAISE EXCEPTION 'search_knowledge: p_user_id must equal auth.uid()'
        USING ERRCODE = '42501';  -- insufficient_privilege
    END IF;
    -- Never trust a caller-supplied audience: derive it server-side.
    p_participants := ARRAY[v_caller];
  END IF;

  RETURN QUERY
  SELECT
    kc.event_id, kc.content, kc.classifications, kc.entities, kc.topics,
    kc.connected_to, kc.participants, kc.source_created_at,
    (1 - (kc.embedding <=> query_embedding))::FLOAT AS similarity,
    kc.knowledge_type, kc.attention_score, kc.context_snippet,
    kc.sender_display_name, kc.sender_user_id, kc.event_type
  FROM public.knowledge_current kc
  WHERE
    knowledge_in_scope(kc.user_id, kc.voyage_slug, kc.event_type, kc.knowledge_type, kc.participants, p_user_id, p_voyage_slug, p_participants)
    AND kc.attention_score >= p_min_attention
    AND (p_knowledge_type IS NULL OR kc.knowledge_type = p_knowledge_type)
    AND (p_classifications IS NULL OR kc.classifications && p_classifications)
    AND kc.embedding IS NOT NULL
    AND (1 - (kc.embedding <=> query_embedding)) > p_match_threshold
  ORDER BY kc.attention_score DESC, (1 - (kc.embedding <=> query_embedding)) DESC
  LIMIT p_match_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.search_knowledge TO authenticated;


-- ---------------------------------------------------------------------------
-- Membership helper — SECURITY DEFINER so the space_members SELECT policy can
-- ask "is the caller an active member of this space?" WITHOUT recursing into
-- its own RLS. A plain query against space_members inside a space_members
-- policy triggers "infinite recursion detected in policy"; running the check
-- as the function's definer (which bypasses RLS) breaks that loop. STABLE +
-- fixed search_path; owned by the migration role.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_active_space_member(p_space_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.space_members sm
    WHERE sm.space_id = p_space_id
      AND sm.user_id = p_user_id
      AND sm.state = 'active'
  );
$$;


-- ---------------------------------------------------------------------------
-- (3) spaces — a private room is visible only to its members (and its creator).
--     Writes stay on the service-role app path (feed.ts, room.ts, invites.ts),
--     which bypasses RLS; authenticated REST callers get member-scoped reads
--     and no direct writes.
-- ---------------------------------------------------------------------------
ALTER TABLE public.spaces ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "spaces member read" ON public.spaces;
CREATE POLICY "spaces member read"
  ON public.spaces
  FOR SELECT
  USING (
    created_by = auth.uid()
    OR public.is_active_space_member(spaces.id, auth.uid())
  );


-- ---------------------------------------------------------------------------
-- (4) space_members — "who is in this room" is visible only to co-members.
--     You always see your own membership row; you see the rest of a space's
--     roster only when you are yourself an active member of that space. The
--     roster check goes through is_active_space_member() to avoid RLS
--     self-recursion.
-- ---------------------------------------------------------------------------
ALTER TABLE public.space_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "space_members co-member read" ON public.space_members;
CREATE POLICY "space_members co-member read"
  ON public.space_members
  FOR SELECT
  USING (
    user_id = auth.uid()
    OR public.is_active_space_member(space_members.space_id, auth.uid())
  );


-- ---------------------------------------------------------------------------
-- (5) voyage_invites — invitee emails are visible only to the voyage's
--     captain. Reuses the existing is_voyage_captain(slug, user) helper,
--     joining voyage_id → slug. Writes stay on the service-role app path
--     (voyage/index.ts); authenticated REST callers get captain-scoped reads.
-- ---------------------------------------------------------------------------
ALTER TABLE public.voyage_invites ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "voyage_invites captain read" ON public.voyage_invites;
CREATE POLICY "voyage_invites captain read"
  ON public.voyage_invites
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.voyages v
      WHERE v.id = voyage_invites.voyage_id
        AND public.is_voyage_captain(v.slug, auth.uid())
    )
  );


-- ---------------------------------------------------------------------------
-- (6) graph_traverse — scope the knowledge graph to the caller.
--
--     graph_traverse runs on the service-role admin client (lib/retrieval/
--     tools.ts), so RLS cannot reach it — its privacy must live inside the
--     query. Migration 030's signature had NO scope params and its final
--     SELECT read knowledge_current unscoped: a traversal could surface any
--     family's nodes reachable by an edge. We add p_user_id / p_voyage_slug /
--     p_participants and apply the canonical knowledge_in_scope() predicate in
--     BOTH the base-case node discovery (so the walk only roots on nodes the
--     caller may see) AND the final SELECT (so every emitted node is in scope).
--
--     CLEAN TRANSITION (spec WL7): the old 6-arg signature is DROPPed in the
--     SAME migration, immediately before the re-CREATE. No wrapper, no parallel
--     signature. The sole caller (tools.ts) is updated in the same commit to
--     pass the new scope args. With all three scope args NULL, knowledge_in_scope
--     denies every row — an unscoped call now safely returns nothing rather than
--     leaking, so the deny-by-default posture holds if a caller ever forgets.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.graph_traverse(uuid, text, text, int, float, int);

CREATE OR REPLACE FUNCTION public.graph_traverse(
  p_node_id UUID,
  p_edge_type TEXT DEFAULT NULL,
  p_direction TEXT DEFAULT 'both',
  p_depth INT DEFAULT 1,
  p_min_attention FLOAT DEFAULT 0.3,
  p_max_nodes INT DEFAULT 50,
  p_user_id UUID DEFAULT NULL,
  p_voyage_slug TEXT DEFAULT NULL,
  p_participants UUID[] DEFAULT NULL
)
RETURNS TABLE (
  event_id UUID,
  content TEXT,
  source_created_at TIMESTAMPTZ,
  knowledge_type TEXT,
  attention_score FLOAT,
  context_snippet TEXT,
  edge_type TEXT,
  edge_direction TEXT,
  hop INT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE traversal AS (
    -- Base case: direct edges from/to the start node, restricted to nodes the
    -- caller is allowed to see (knowledge_in_scope on the discovered node).
    SELECT
      CASE
        WHEN p_direction IN ('outgoing', 'both') AND e.source_id = p_node_id THEN e.target_id
        WHEN p_direction IN ('incoming', 'both') AND e.target_id = p_node_id THEN e.source_id
      END AS node_id,
      e.edge_type AS e_type,
      CASE
        WHEN e.source_id = p_node_id THEN 'outgoing'
        ELSE 'incoming'
      END AS e_direction,
      1 AS depth
    FROM knowledge_edges e
    WHERE (
      (p_direction IN ('outgoing', 'both') AND e.source_id = p_node_id)
      OR (p_direction IN ('incoming', 'both') AND e.target_id = p_node_id)
    )
    AND (p_edge_type IS NULL OR e.edge_type = p_edge_type)
    AND EXISTS (
      SELECT 1 FROM knowledge_current kc0
      WHERE kc0.event_id = CASE
          WHEN p_direction IN ('outgoing', 'both') AND e.source_id = p_node_id THEN e.target_id
          WHEN p_direction IN ('incoming', 'both') AND e.target_id = p_node_id THEN e.source_id
        END
        AND knowledge_in_scope(kc0.user_id, kc0.voyage_slug, kc0.event_type, kc0.knowledge_type, kc0.participants, p_user_id, p_voyage_slug, p_participants)
    )

    UNION

    -- Recursive case: follow edges from discovered nodes
    SELECT
      CASE
        WHEN e.source_id = t.node_id THEN e.target_id
        ELSE e.source_id
      END AS node_id,
      e.edge_type AS e_type,
      CASE
        WHEN e.source_id = t.node_id THEN 'outgoing'
        ELSE 'incoming'
      END AS e_direction,
      t.depth + 1 AS depth
    FROM knowledge_edges e
    INNER JOIN traversal t ON (
      (e.source_id = t.node_id AND p_direction IN ('outgoing', 'both'))
      OR (e.target_id = t.node_id AND p_direction IN ('incoming', 'both'))
    )
    WHERE t.depth < p_depth
      AND (p_edge_type IS NULL OR e.edge_type = p_edge_type)
      -- Prevent cycles: don't revisit the start node
      AND CASE
        WHEN e.source_id = t.node_id THEN e.target_id
        ELSE e.source_id
      END != p_node_id
  )
  SELECT DISTINCT ON (kc.event_id)
    kc.event_id,
    kc.content,
    kc.source_created_at,
    kc.knowledge_type,
    kc.attention_score,
    kc.context_snippet,
    t.e_type AS edge_type,
    t.e_direction AS edge_direction,
    t.depth AS hop
  FROM traversal t
  INNER JOIN knowledge_current kc ON kc.event_id = t.node_id
  WHERE kc.attention_score >= p_min_attention
    AND t.node_id IS NOT NULL
    -- Final backstop: every emitted node must be in the caller's scope.
    AND knowledge_in_scope(kc.user_id, kc.voyage_slug, kc.event_type, kc.knowledge_type, kc.participants, p_user_id, p_voyage_slug, p_participants)
  ORDER BY kc.event_id, t.depth ASC
  LIMIT p_max_nodes;
END;
$$;
