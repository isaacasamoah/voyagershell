-- 035_manual_edges.sql
-- Slice 4B: extend the knowledge_edges.edge_type CHECK to allow 'manual'
-- edges created by a voyage captain through the graph editing API.
--
-- The existing constraint is created inline by migration 030 on CREATE TABLE,
-- so Postgres auto-names it knowledge_edges_edge_type_check. We drop and
-- recreate with the same name plus the new 'manual' member.
--
-- Reversible: re-running 030 would recreate the old 8-member constraint.
-- No data changes.

ALTER TABLE knowledge_edges
  DROP CONSTRAINT IF EXISTS knowledge_edges_edge_type_check;

ALTER TABLE knowledge_edges
  ADD CONSTRAINT knowledge_edges_edge_type_check
  CHECK (edge_type IN (
    'supersedes',
    'supports',
    'contradicts',
    'elaborates',
    'triggered_by',
    'relates_to',
    'decided_by',
    'raised_by',
    'manual'
  ));
