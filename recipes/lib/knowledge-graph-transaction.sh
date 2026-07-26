#!/usr/bin/env bash

compose_knowledge_graph_transaction() {
  {
    cat <<'SQL'
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '30s';
DO $rollback_lock$
BEGIN
  IF NOT pg_catalog.pg_try_advisory_xact_lock(
    pg_catalog.hashtext('voyager-knowledge-graph-poc')
  ) THEN
    RAISE EXCEPTION 'knowledge_graph_proof_busy';
  END IF;
END
$rollback_lock$;
CREATE TEMP TABLE knowledge_graph_sequence_guard(
  initialized boolean NOT NULL,
  value bigint
);
DO $sequence_before$
BEGIN
  BEGIN
    INSERT INTO knowledge_graph_sequence_guard
    VALUES (
      true,
      currval(pg_get_serial_sequence('public.knowledge_events', 'sequence_num')::regclass)
    );
  EXCEPTION WHEN object_not_in_prerequisite_state THEN
    INSERT INTO knowledge_graph_sequence_guard VALUES (false, NULL);
  END;
END
$sequence_before$;
SQL
    sed -n '1,$p' "$TEMP_DIR/k1-legacy.sql"
    for migration in "${PRODUCT_MIGRATIONS[@]}"; do
      sed -n '1,$p' "$migration"
    done
    sed -n '1,$p' "$INSTALLED_POSTCONDITION"
    for migration in "${MIGRATIONS[@]}"; do
      sed -n '1,$p' "$migration"
    done
    sed -n '1,$p' "$TEMP_DIR/k1-historical.sql"
    sed -n '1,$p' "$CUTOVER"
    for migration in "${PROJECTIONS[@]}"; do
      sed -n '1,$p' "$migration"
    done
    sed -n '1,$p' "$TEMP_DIR/gap-setup.sql"
    sed -n '1,$p' "$ACTIVATION"
    for migration in "${INGRESS[@]}"; do
      sed -n '1,$p' "$migration"
    done
    sed -n '1,$p' "$CARTOGRAPHER"
    sed -n '1,$p' "$TEMP_DIR/generated-proof.sql"
    sed -n '1,$p' "$TEMP_DIR/k1-assertions.sql"
    sed -n '1,$p' "$TEMP_DIR/boundary-assertions.sql"
    cat <<'SQL'
DO $sequence_after$
DECLARE
  guard knowledge_graph_sequence_guard;
  v_now bigint;
BEGIN
  SELECT *
  INTO STRICT guard
  FROM knowledge_graph_sequence_guard;

  IF guard.initialized THEN
    v_now := currval(
      pg_get_serial_sequence('public.knowledge_events', 'sequence_num')::regclass
    );
    IF v_now IS DISTINCT FROM guard.value THEN
      RAISE EXCEPTION 'knowledge_graph_proof_advanced_event_sequence';
    END IF;
  ELSE
    BEGIN
      PERFORM currval(
        pg_get_serial_sequence('public.knowledge_events', 'sequence_num')::regclass
      );
      RAISE EXCEPTION 'knowledge_graph_proof_initialized_event_sequence';
    EXCEPTION WHEN object_not_in_prerequisite_state THEN
      NULL;
    END;
  END IF;
END
$sequence_after$;
ROLLBACK;
SELECT 'KNOWLEDGE_GRAPH_SQL_GREEN' AS verdict;
SQL
  } > "$TEMP_DIR/transaction.sql"
}
