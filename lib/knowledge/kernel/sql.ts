import type { KnowledgeGraphFixture } from './contract'

export const quote = (value: string): string => `'${value.replaceAll("'", "''")}'`
export const uuid = (value: string): string => `${quote(value)}::uuid`
export const uuidArray = (values: readonly string[]): string =>
  `ARRAY[${values.map(uuid).join(', ')}]::uuid[]`
export const valuesSql = (rows: readonly string[]): string =>
  rows.map((row) => `  (${row})`).join(',\n')

export const hashExpression = (
  table: 'events' | 'units' | 'nodes' | 'edges' | 'grants' | 'authorityEdges',
  fixture: KnowledgeGraphFixture,
): string => {
  if (table === 'events') {
    return `(SELECT md5(coalesce(string_agg(format('%s|%s|%s', id, content,
      knowledge_audience_id), ',' ORDER BY id), '')) FROM public.knowledge_events
      WHERE id = ANY(${uuidArray(fixture.events.map((event) => event.id))}))`
  }
  if (table === 'units') {
    return `(SELECT md5(coalesce(string_agg(format('%s|%s|%s|%s|%s|%s', id, claim,
      source_event_id, extractor_version, claim_key, knowledge_audience_id), ',' ORDER BY id), ''))
      FROM public.knowledge_units
      WHERE id = ANY(${uuidArray(fixture.units.map((unit) => unit.id))}))`
  }
  if (table === 'nodes') {
    return `(SELECT md5(coalesce(string_agg(format('%s|%s|%s', id, kind,
      authority_id), ',' ORDER BY id), '')) FROM public.graph_nodes
      WHERE id = ANY(${uuidArray(fixture.nodes.map((node) => node.id))}))`
  }
  if (table === 'edges') return `(SELECT md5(coalesce(string_agg(format('%s|%s|%s|%s', id, source_node_id,
    kind, target_node_id), ',' ORDER BY id), '')) FROM public.graph_edges
    WHERE id = ANY(${uuidArray(fixture.edges.map((edge) => edge.id))}))`
  if (table === 'grants') return `(SELECT md5(coalesce(string_agg(format(
    '%s|%s|%s|%s|%s|%s', node_id, knowledge_audience_id, basis_kind, basis_id,
    basis_version, coalesce(basis_event_id::text, '')), ',' ORDER BY node_id, knowledge_audience_id,
    basis_kind, basis_id, basis_version), '')) FROM public.graph_node_grants
    WHERE node_id = ANY(${uuidArray(fixture.nodes.map((node) => node.id))}))`
  return `(SELECT md5(coalesce(string_agg(format('%s|%s|%s|%s|%s|%s|%s', id,
    source_node_id, target_node_id, kind, authority_row_id, authority_revision, state),
    ',' ORDER BY id), '')) FROM public.graph_authority_edges
    WHERE source_node_id = ANY(${uuidArray(fixture.nodes.map((node) => node.id))})
      OR target_node_id = ANY(${uuidArray(fixture.nodes.map((node) => node.id))}))`
}
