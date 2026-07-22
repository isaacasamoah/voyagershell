import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { renderKnowledgeGraphSql } from "./generate-sql";
import { renderK1CutoverAssertionsSql, renderK1LegacySetupSql } from "./k1-sql";

const readRepoFile = (path: string): string =>
  readFileSync(resolve(process.cwd(), path), "utf8");
const migrationPath = "supabase/migrations/057_knowledge_graph_cutover.sql";
const migration = (): string => readRepoFile(migrationPath);
const oldTable = ["knowledge", "edges"].join("_");
const oldRpc = ["graph", "traverse"].join("_");

describe("K1 knowledge-graph cutover contract", () => {
  it("maps only explicit canonical event audiences and reports every rejection", () => {
    const sql = migration();

    expect(sql).toContain("WHEN voyage_slug IS NULL THEN 'private'");
    expect(sql).toContain(
      "WHEN members = '{}'::uuid[] THEN 'voyage_audience_not_explicit'",
    );
    expect(sql).toContain("THEN 'private_participants_conflict'");
    expect(sql).toContain("THEN 'voyage_user_unresolved'");
    expect(sql).toContain("public.normalize_knowledge_audience_members");
    expect(sql).toContain("members ||");
    expect(sql).toContain("md5(format('voyager-audience:v1:%s:%s:%s'");
    expect(sql).toContain("md5(format('voyager-node:v1:message_event:%s'");
    expect(sql).toContain("knowledge_audiences_canonical_identity_idx");
    expect(sql).toContain(
      "(scope_kind, scope_authority_id, member_profile_ids)",
    );
    expect(sql).toContain("knowledge_graph_backfill_rejections");
    expect(sql).toContain("trg_knowledge_graph_backfill_rejections_immutable");
  });

  it("gives only exact one-to-one legacy relations entry to the final graph", () => {
    const sql = migration();

    expect(sql).toContain(
      "WHEN edge_type <> 'relates_to' THEN 'edge_kind_not_exact'",
    );
    expect(sql).toContain(
      "WHEN canonical_count > 1 THEN 'canonical_edge_duplicate'",
    );
    expect(sql).toContain("THEN 'edge_endpoint_unresolved'");
    expect(sql).toContain("THEN 'edge_audience_not_exact'");
    expect(sql).toContain("knowledge_graph_k1_backfill_parity_failed");
    expect(sql).toContain(`FROM public.${oldTable} edge`);
    expect(sql).toContain(`DROP TABLE public.${oldTable}`);
    expect(
      sql.match(new RegExp(`DROP FUNCTION IF EXISTS public\\.${oldRpc}`, "g")),
    ).toHaveLength(2);
  });

  it("exposes one service-only writer and removes direct service writes", () => {
    const sql = migration();
    const signature = [
      "p_source_kind public.graph_node_kind",
      "p_source_authority_id uuid",
      "p_target_kind public.graph_node_kind",
      "p_target_authority_id uuid",
      "p_kind public.graph_edge_kind",
    ];

    expect(sql).toContain("CREATE FUNCTION public.write_knowledge_graph_edge");
    for (const argument of signature) expect(sql).toContain(argument);
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("ON public.graph_edges FROM service_role");
    expect(sql).toContain("FROM PUBLIC, anon, authenticated");
    expect(sql).toContain("TO service_role");
    expect(sql).toContain("IF p_kind = 'relates_to'");
  });

  it("seeds eligible and unresolved controls and proves write-through retrieval", () => {
    const setup = renderK1LegacySetupSql();
    const assertions = renderK1CutoverAssertionsSql();

    expect(setup).toContain(`INSERT INTO public.${oldTable}`);
    expect(setup.match(/'relates_to', 'k1-proof'/g)).toHaveLength(2);
    expect(setup).toContain("'oru-319-unattested-voyage'");
    expect(setup).toContain("'oru-319-k1-backfill'");
    expect(setup).toContain("INSERT INTO public.spaces");
    expect(setup).toContain("INSERT INTO public.sessions");
    expect(assertions).toContain(
      "knowledge_graph_k1_eligible_edge_parity_failed",
    );
    expect(assertions).toContain(
      "knowledge_graph_k1_unresolved_event_entered_graph",
    );
    expect(assertions).toContain("knowledge_graph_k1_old_catalogue_present");
    expect(assertions).toContain("public.write_knowledge_graph_edge");
    expect(assertions).toContain("public.retrieve_knowledge_graph_claims");
    expect(assertions).toContain("knowledge_graph_k1_write_retrieval_failed");
    expect(assertions).toContain("knowledge_graph_k1_voyage_mapping_failed");
    expect(assertions).toContain("knowledge_graph_k1_space_mapping_failed");
  });

  it("keeps K0 fixture assertions bounded after hosted backfill", () => {
    const generated = renderKnowledgeGraphSql();
    const assertions = readRepoFile("lib/knowledge/kernel/assertions-sql.ts");
    const hashes = readRepoFile("lib/knowledge/kernel/sql.ts");

    expect(assertions).toContain("fixtureNodeIds");
    expect(assertions).toContain("fixtureUnitIds");
    expect(assertions).toContain("fixtureAudienceIds");
    expect(hashes).toContain("fixture.nodes.map");
    expect(hashes).toContain("fixture.units.map");
    expect(generated).toContain("knowledge_graph_canonical_counts_failed");
  });

  it("orders hosted DDL inside one rollback and compares the full catalogue", () => {
    const recipe = readRepoFile("recipes/knowledge-graph-poc.sh");
    const transaction = recipe.slice(recipe.indexOf("{\n  printf 'BEGIN;\\n'"));

    expect(recipe).toContain("printf 'BEGIN;\\n'");
    expect(recipe).toContain("printf 'ROLLBACK;\\n'");
    expect(recipe).toContain("SET LOCAL lock_timeout = '3s'");
    expect(recipe).toContain("SET LOCAL statement_timeout = '30s'");
    expect(recipe).toContain("pg_try_advisory_xact_lock");
    expect(transaction.indexOf("k1-setup.sql")).toBeLessThan(
      transaction.indexOf("$CUTOVER"),
    );
    expect(transaction.indexOf("$CUTOVER")).toBeLessThan(
      transaction.indexOf("generated-proof.sql"),
    );
    expect(transaction.indexOf("generated-proof.sql")).toBeLessThan(
      transaction.indexOf("k1-assertions.sql"),
    );
    expect(recipe).toContain("catalog-before.sorted.json");
    expect(recipe).toContain("catalog-after.sorted.json");
    expect(recipe).toContain("legacy_names=");
    expect(recipe).toContain("knowledge_audiences_canonical_identity_idx");
    expect(recipe).toContain(`'${oldTable}'`);
    expect(recipe).toContain(`'${oldRpc}'`);
  });

  it("does not create another event-content ledger", () => {
    const combined = [
      migration(),
      renderK1LegacySetupSql(),
      renderK1CutoverAssertionsSql(),
    ].join("\n");
    expect(combined).not.toMatch(/CREATE TABLE public\.[a-z_]*events/);
    expect(combined).not.toContain("knowledge_current");
  });

  it("declares the Zod schema version used by the locked AI tool stack", () => {
    const manifest = JSON.parse(readRepoFile("package.json"));
    const lock = JSON.parse(readRepoFile("package-lock.json"));

    expect(manifest.dependencies.zod).toBe("^3.25.76");
    expect(lock.packages[""].dependencies.zod).toBe("^3.25.76");
    expect(lock.packages["node_modules/zod"].version).toBe("3.25.76");
  });

  it("runs active 051 privacy proofs without deleted graph objects", () => {
    const runner = readRepoFile("recipes/privacy-backstop-proof.sh");
    const proofs = [
      readRepoFile("supabase/tests/051_privacy_backstop_proof.sql"),
      readRepoFile("supabase/tests/051_space_privacy_proof.sql"),
    ].join("\n");
    const executableProofs = proofs
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*--.*$/gm, "");
    const retainedPrivacyFailures = [
      "retrieval_events leaked A to B",
      "retrieval_events hid B from B",
      "service retrieval path regressed",
      "forged search identity accepted",
      "honest self search rejected",
      "service search path regressed",
      "non-member voyage search accepted",
      "member voyage search rejected",
      "anon search execute accepted",
      "space leaked to non-member",
      "space hidden from member",
      "roster leaked to non-member",
      "roster hidden from member",
      "invite leaked to non-captain",
      "invite hidden from captain",
    ];

    expect(runner).toContain("051_privacy_backstop_proof.sql");
    expect(runner).toContain("051_space_privacy_proof.sql");
    expect(executableProofs.match(/^BEGIN;$/gm)).toHaveLength(2);
    expect(executableProofs.match(/^ROLLBACK;$/gm)).toHaveLength(2);
    expect(executableProofs.match(/^DO \$proof\$$/gm)).toHaveLength(2);
    expect(executableProofs.match(/^\s*IF NOT ok THEN RAISE EXCEPTION/gm)).toHaveLength(2);
    for (const failure of retainedPrivacyFailures) {
      expect(executableProofs).toMatch(
        new RegExp(
          `^\\s*IF [^;]+ THEN ok := FALSE; RAISE WARNING '${failure}'; END IF;$`,
          "m",
        ),
      );
    }
    expect(proofs).not.toContain(oldTable);
    expect(proofs).not.toContain(oldRpc);
  });
});
