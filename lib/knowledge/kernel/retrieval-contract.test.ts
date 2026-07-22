import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { GRAPH_EDGE_KINDS, GRAPH_NODE_KINDS } from "./contract";
import {
  knowledgeGraphFixture,
  validateKnowledgeGraphFixture,
} from "./fixture";
import { renderKnowledgeGraphSql } from "./generate-sql";

const readRepoFile = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), "utf8");
const retrievalMigration = (): string =>
  readRepoFile("supabase/migrations/056_knowledge_graph_retrieval.sql");

describe("K0 knowledge-graph retrieval contract", () => {
  it("requires the fixture to instantiate every edge kind", () => {
    expect(
      new Set(knowledgeGraphFixture.edges.map((edge) => edge.kind)),
    ).toEqual(new Set(GRAPH_EDGE_KINDS));
    const incomplete = structuredClone(knowledgeGraphFixture) as unknown as {
      edges: Array<{ kind: string }>;
    };
    incomplete.edges = incomplete.edges.filter(
      (edge) => edge.kind !== "supports",
    );
    expect(() => validateKnowledgeGraphFixture(incomplete)).toThrow(
      "all_edge_kinds_required",
    );
  });

  it("exposes only exact claim and source fields from the database boundary", () => {
    const migration = retrievalMigration();
    const result =
      migration.match(
        /\) RETURNS TABLE \(([\s\S]*?)\) LANGUAGE plpgsql/,
      )?.[1] ?? "";
    const columns = Array.from(
      result.matchAll(/^\s*([a-z_]+)\s+/gm),
      (match) => match[1],
    );

    expect(columns).toEqual([
      "knowledge_unit_id",
      "claim",
      "source_event_id",
      "source_content",
    ]);
    expect(result).not.toMatch(
      /result_count|traversal_path|knowledge_audience_id|edge_kind|elapsed_ms/,
    );
    expect(migration).toContain(
      "p_viewer_profile_id = ANY(unit_audience.member_profile_ids)",
    );
    expect(migration).toContain(
      "p_viewer_profile_id = ANY(event_audience.member_profile_ids)",
    );
    expect(migration).toContain(
      "unit.knowledge_audience_id = event.knowledge_audience_id",
    );
    expect(migration).toContain("p_graph_enabled IS TRUE");
  });

  it("keeps the RPC service-only and pads every database outcome", () => {
    const migration = retrievalMigration();

    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("PERFORM pg_sleep");
    expect(migration).toContain("0.075 - extract(epoch");
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("TO service_role");
    expect(migration).toContain("trg_knowledge_event_source_immutable");
    expect(migration).toContain("to_jsonb(NEW) - 'knowledge_audience_id'");
  });

  it("generates six-root, graph toggle, hidden bridge and timing assertions", () => {
    const sql = renderKnowledgeGraphSql();

    for (const kind of GRAPH_NODE_KINDS) {
      expect(sql).toContain(`'${kind}'::public.graph_node_kind`);
    }
    expect(sql).toContain("knowledge_graph_six_kind_retrieval_failed");
    expect(sql).toContain("knowledge_graph_off_retrieval_found_claim");
    expect(sql).toContain("knowledge_graph_on_retrieval_missed_claim");
    expect(sql).toContain("knowledge_graph_denied_root_returned_content");
    expect(sql).toContain("knowledge_graph_hidden_bridge_returned_provenance");
    expect(sql).toContain("knowledge_graph_denial_timing_class_failed");
    expect(sql).toContain("knowledge_graph_mutable_source_accepted");
  });

  it("leaves knowledge_events as the sole event-content ledger", () => {
    const combined = [
      retrievalMigration(),
      readRepoFile("lib/knowledge/kernel/boundary.ts"),
      readRepoFile("lib/knowledge/kernel/retrieval-assertions-sql.ts"),
    ].join("\n");

    expect(combined).not.toMatch(/CREATE TABLE public\.[a-z_]*events/);
    expect(combined).not.toContain("knowledge_current");
  });
});
