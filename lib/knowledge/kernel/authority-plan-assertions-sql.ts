export const renderAuthorityTargetPlanAssertionsSql = (): string => `
INSERT INTO auth.users(id, email, raw_user_meta_data, created_at)
SELECT md5(format('oru-319-plan-user:%s', item))::uuid,
  format('oru-319-plan-%s@example.invalid', item),
  jsonb_build_object('display_name', format('Plan Person %s', item)), now()
FROM generate_series(1, 256) item;
ANALYZE public.graph_authority_edges;
DO $authority_target_plan$
DECLARE v_plan json; v_row record;
BEGIN
  SET LOCAL enable_seqscan = off;
  FOR v_row IN EXECUTE format(
    'EXPLAIN (FORMAT JSON, COSTS OFF) SELECT id FROM public.graph_authority_edges WHERE target_node_id = %L::uuid',
    public.canonical_graph_node_id('person', md5('oru-319-plan-user:128')::uuid)) LOOP
    v_plan := v_row."QUERY PLAN"; END LOOP;
  IF v_plan::text NOT LIKE '%graph_authority_edges_target_idx%' THEN
    RAISE EXCEPTION 'knowledge_graph_authority_target_index_plan_missing:%', v_plan; END IF;
END
$authority_target_plan$;
`
