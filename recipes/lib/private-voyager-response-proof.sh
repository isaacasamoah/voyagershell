#!/usr/bin/env bash

# Called by atomic-ingress-exactly-once.sh after its private psql_run helper and
# fail function exist. Proves response audience inheritance and graph shape.
prove_private_voyager_response() {
  local actor="$1"
  local session="$2"
  local private_source response_status response_shape response_replay invalid_key

  private_source="$(psql_run -v ON_ERROR_STOP=1 -c "
    SELECT event_id FROM public.claim_source_message_ingress(
      '$actor', 'chat', 'c7-private-source', NULL, 'c7-voyage',
      'private question', 'conversation', 'conversation', 'user',
      ARRAY['$actor']::uuid[], '{}'::uuid[],
      jsonb_build_object('session_id', '$session', 'source', 'aside'),
      jsonb_build_object('conversation_id', '$session', 'role', 'user'))")"
  [ -n "$private_source" ] || fail 'private source ingress returned no event'

  response_status="$(psql_run -v ON_ERROR_STOP=1 -c "
    SELECT status FROM public.claim_source_message_ingress(
      '$actor', 'agent', 'reply:$private_source', NULL, 'c7-voyage',
      'private answer', 'conversation', 'conversation', 'voyager',
      ARRAY['$actor']::uuid[], '{}'::uuid[],
      jsonb_build_object('session_id', '$session',
        'reply_to_event_id', '$private_source'),
      jsonb_build_object('conversation_id', '$session', 'role', 'assistant'))")"
  [ "$response_status" = 'created' ] \
    || fail "expected one created Voyager response; observed $response_status"

  response_shape="$(psql_run -v ON_ERROR_STOP=1 -c "
    WITH source AS (
      SELECT id, knowledge_audience_id FROM public.knowledge_events
      WHERE id = '$private_source'),
    response AS (
      SELECT event.id, event.knowledge_audience_id
      FROM public.knowledge_events event
      WHERE event.content = 'private answer' AND event.actor_type = 'voyager'),
    node AS (
      SELECT graph.id FROM public.graph_nodes graph JOIN response
        ON graph.kind = 'message_event' AND graph.authority_id = response.id)
    SELECT (SELECT count(*) FROM response JOIN source
        ON response.knowledge_audience_id = source.knowledge_audience_id)::text || '/' ||
      (SELECT count(*) FROM node)::text || '/' ||
      (SELECT count(*) FROM public.graph_node_grants grant_row
        JOIN node ON node.id = grant_row.node_id)::text || '/' ||
      (SELECT count(*) FROM public.graph_edges edge_row
        JOIN node ON node.id = edge_row.source_node_id
        WHERE edge_row.kind = 'generated_by')::text || '/' ||
      (SELECT count(*) FROM public.graph_edges edge_row
        JOIN node ON node.id = edge_row.source_node_id
        WHERE edge_row.kind = 'authored_by')::text || '/' ||
      (SELECT count(*) FROM public.message_deliveries delivery
        JOIN response ON response.id = delivery.event_id)::text")"
  [ "$response_shape" = '1/1/1/1/0/0' ] \
    || fail "Voyager response did not inherit audience/node/grant/generated_by with no authored_by/delivery; observed $response_shape"

  response_replay="$(psql_run -v ON_ERROR_STOP=1 -c "
    SELECT status FROM public.claim_source_message_ingress(
      '$actor', 'agent', 'reply:$private_source', NULL, 'c7-voyage',
      'private answer', 'conversation', 'conversation', 'voyager',
      ARRAY['$actor']::uuid[], '{}'::uuid[],
      jsonb_build_object('session_id', '$session',
        'reply_to_event_id', '$private_source'),
      jsonb_build_object('conversation_id', '$session', 'role', 'assistant'))")"
  [ "$response_replay" = 'replayed' ] \
    || fail "Voyager response replay was not exactly-once; observed $response_replay"

  invalid_key="$(psql_run -v ON_ERROR_STOP=1 -c "
    SELECT status FROM public.claim_source_message_ingress(
      '$actor', 'agent', 'arbitrary-response-key', NULL, 'c7-voyage',
      'second private answer', 'conversation', 'conversation', 'voyager',
      ARRAY['$actor']::uuid[], '{}'::uuid[],
      jsonb_build_object('session_id', '$session',
        'reply_to_event_id', '$private_source'),
      jsonb_build_object('conversation_id', '$session', 'role', 'assistant'))" 2>&1 || true)"
  case "$invalid_key" in
    *voyager_response_key_invalid*) : ;;
    *) fail "non-canonical Voyager response key was not rejected" ;;
  esac
}
