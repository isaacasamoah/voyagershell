import type { KnowledgeGraphFixture } from "./contract";

export const quote = (value: string): string =>
  `'${value.replaceAll("'", "''")}'`;
export const uuid = (value: string): string => `${quote(value)}::uuid`;
export const textArray = (values: readonly string[]): string =>
  `ARRAY[${values.map(quote).join(", ")}]::text[]`;
export const uuidArray = (values: readonly string[]): string =>
  `ARRAY[${values.map(uuid).join(", ")}]::uuid[]`;
export const valuesSql = (rows: readonly string[]): string =>
  rows.map((row) => `  (${row})`).join(",\n");

export const hashExpression = (
  table: "events" | "units" | "nodes" | "edges",
  fixture: KnowledgeGraphFixture,
): string => {
  if (table === "events") {
    return `(SELECT md5(coalesce(string_agg(format('%s|%s|%s|%s', id, content,
      participants, knowledge_audience_id), ',' ORDER BY id), '')) FROM public.knowledge_events
      WHERE id = ANY(${uuidArray(fixture.events.map((event) => event.id))}))`;
  }
  if (table === "units") {
    return `(SELECT md5(coalesce(string_agg(format('%s|%s|%s|%s|%s|%s', id, claim,
      source_event_id, extractor_version, claim_key, knowledge_audience_id), ',' ORDER BY id), ''))
      FROM public.knowledge_units
      WHERE id = ANY(${uuidArray(fixture.units.map((unit) => unit.id))}))`;
  }
  if (table === "nodes") {
    return `(SELECT md5(coalesce(string_agg(format('%s|%s|%s|%s', id, kind,
      authority_id, knowledge_audience_id), ',' ORDER BY id), '')) FROM public.graph_nodes
      WHERE id = ANY(${uuidArray(fixture.nodes.map((node) => node.id))}))`;
  }
  return `(SELECT md5(coalesce(string_agg(format('%s|%s|%s|%s', source_node_id, kind,
    target_node_id, knowledge_audience_id), ',' ORDER BY source_node_id, kind, target_node_id), ''))
    FROM public.graph_edges
    WHERE source_node_id = ANY(${uuidArray(fixture.nodes.map((node) => node.id))})
      AND target_node_id = ANY(${uuidArray(fixture.nodes.map((node) => node.id))}))`;
};
