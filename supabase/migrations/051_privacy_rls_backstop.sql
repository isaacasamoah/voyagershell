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
