-- K2 step 3 · recovery for the deployment gap.
--
-- A database migrates before an application deploys. Between the cutover
-- landing and the new ingress going live, the OLD code path keeps inserting
-- knowledge_events with no audience — invisible to the new substrate. That gap
-- is bounded but real, so it gets a recovery function rather than a hope.
--
-- Recovery uses the one classifier from 068, so a recovered event is scoped
-- exactly as a claimed one would have been, and it gives the event the same
-- shape: audience, node, grant and structural edges.

-- ── Deployment-gap recovery ─────────────────────────────────────────────────
-- Every event the old ingress wrote after the cutover landed and before the new
-- ingress went live. Bind it to its audience, give it its node, grant and
-- structural edges; record the exact reason for anything that cannot be
-- attested. Idempotent — running it twice recovers nothing the second time.
CREATE FUNCTION public.recover_knowledge_graph_deployment_gap()
RETURNS TABLE (recovered bigint, rejected bigint)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE v_recovered bigint := 0;
  v_rejected bigint := 0;
  v_row record;
  v_created_at timestamptz;
  v_label text;
  v_space uuid;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('voyager-knowledge-graph-deployment-gap', 0));

  CREATE TEMP TABLE knowledge_graph_gap_map ON COMMIT DROP AS
  SELECT classified.* FROM public.classify_knowledge_event_authority(
    (SELECT coalesce(array_agg(event.id), '{}'::uuid[]) FROM public.knowledge_events event
      WHERE event.knowledge_audience_id IS NULL)) classified;

  INSERT INTO public.knowledge_graph_backfill_rejections(
    source_kind, source_id, reason, source_digest)
  SELECT 'message_event', mapped.id, mapped.rejection_reason, md5(jsonb_build_array(
    'message_event:v1', event.id, event.sequence_num, event.user_id, event.voyage_slug,
    event.event_type, event.source_type, event.actor_id, event.actor_type,
    public.normalize_knowledge_audience_members(coalesce(event.participants, '{}'::uuid[])),
    extract(epoch FROM event.created_at))::text)
  FROM knowledge_graph_gap_map mapped
  JOIN public.knowledge_events event ON event.id = mapped.id
  WHERE mapped.rejection_reason IS NOT NULL
  ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_rejected = ROW_COUNT;

  INSERT INTO public.knowledge_audiences(
    id, purpose, scope_kind, scope_authority_id, member_profile_ids)
  SELECT DISTINCT mapped.audience_id, 'source'::public.knowledge_audience_purpose,
    mapped.scope_kind, mapped.scope_authority_id, mapped.audience_members
  FROM knowledge_graph_gap_map mapped WHERE mapped.rejection_reason IS NULL
  ON CONFLICT DO NOTHING;

  UPDATE public.knowledge_events event SET knowledge_audience_id = mapped.audience_id
  FROM knowledge_graph_gap_map mapped
  WHERE mapped.id = event.id AND mapped.rejection_reason IS NULL;
  GET DIAGNOSTICS v_recovered = ROW_COUNT;

  FOR v_row IN SELECT mapped.id, mapped.node_id, mapped.audience_id, mapped.scope_kind,
      mapped.scope_authority_id, event.actor_id, event.user_id, event.created_at
    FROM knowledge_graph_gap_map mapped
    JOIN public.knowledge_events event ON event.id = mapped.id
    WHERE mapped.rejection_reason IS NULL ORDER BY mapped.id
  LOOP
    v_label := format('message_event:%s', v_row.id);
    v_created_at := v_row.created_at;
    INSERT INTO public.graph_nodes(id, kind, authority_id, label)
    VALUES (v_row.node_id, 'message_event', v_row.id, v_label)
    ON CONFLICT (kind, authority_id) DO NOTHING;
    INSERT INTO public.graph_node_grants(node_id, knowledge_audience_id, basis_kind,
      basis_id, basis_version, label_snapshot, granted_at)
    VALUES (v_row.node_id, v_row.audience_id, 'source_event', v_row.id, 1, v_label, v_created_at)
    ON CONFLICT DO NOTHING;

    IF coalesce(v_row.actor_id, v_row.user_id) IS NOT NULL THEN
      PERFORM public.attest_ingress_structural_edge(v_row.node_id,
        public.canonical_graph_node_id('person', coalesce(v_row.actor_id, v_row.user_id)),
        'authored_by', v_row.id, v_row.audience_id, v_created_at);
    END IF;
    IF v_row.scope_kind = 'space' THEN
      v_space := v_row.scope_authority_id;
      PERFORM public.attest_ingress_structural_edge(v_row.node_id,
        public.canonical_graph_node_id('space', v_space),
        'posted_in', v_row.id, v_row.audience_id, v_created_at);
    END IF;
  END LOOP;

  DROP TABLE knowledge_graph_gap_map;
  RETURN QUERY SELECT v_recovered, v_rejected;
END $$;

REVOKE ALL ON FUNCTION public.recover_knowledge_graph_deployment_gap()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recover_knowledge_graph_deployment_gap() TO service_role;
