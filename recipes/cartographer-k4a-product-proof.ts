import { execFileSync } from "node:child_process";
import { createKnowledgeRetrievalTools } from "@/lib/retrieval/knowledge-retrieval-tools";
import type {
  KnowledgeGraphRetrievalOptions,
  KnowledgeGraphResult,
  KnowledgeGraphRoot,
} from "@/lib/knowledge/kernel/boundary";
import { mergeGraphStandingPreferences } from "@/lib/prompts";
import { formatCuratedWindow } from "@/lib/prompts/format/user";

const container = process.env.K4A_POSTGRES_CONTAINER;
const database = process.env.K4A_POSTGRES_DATABASE;
const actor = "72000000-0000-4000-8000-000000000001";

if (!container || !database)
  throw new Error("missing disposable PostgreSQL identity");

interface GraphToolResult {
  claims: Array<{ unitId: string; claim: string; type: string }>;
  truncated: boolean;
  presentation: string;
}

const sqlLiteral = (values: readonly string[]): string =>
  values.length === 0
    ? "'{}'::uuid[]"
    : `ARRAY[${values.map((value) => `'${value}'::uuid`).join(",")}]`;

const retrieve = async (
  root: KnowledgeGraphRoot,
  options: KnowledgeGraphRetrievalOptions = {},
): Promise<KnowledgeGraphResult> => {
  const query =
    `SELECT public.retrieve_knowledge_graph_claims_v2(` +
    `'${root.authorityId}'::uuid,'${actor}'::uuid,` +
    `${sqlLiteral(options.excludeUnitIds ?? [])},${options.maxDepth ?? 4},` +
    `${options.nodeBudget ?? 512},${options.frontierBudget ?? 128})::text;`;
  const output = execFileSync(
    "docker",
    [
      "exec",
      container,
      "psql",
      "-X",
      "-Atq",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      database,
      "-c",
      query,
    ],
    { encoding: "utf8" },
  ).trim();
  return JSON.parse(output) as KnowledgeGraphResult;
};

const executeGraphMemory = async (
  input: { maxDepth: number; nodeBudget: number; frontierBudget: number },
  workingMemoryUnitIds: string[] = [],
) => {
  const registered = createKnowledgeRetrievalTools(
    { userId: actor, workingMemoryUnitIds },
    retrieve,
  ).graph_memory;
  if (!registered.execute)
    throw new Error("graph_memory product tool is not executable");
  const result = await registered.execute(input, {
    toolCallId: "k4a-product-proof",
    messages: [],
  });
  if (Symbol.asyncIterator in result) {
    throw new Error("graph_memory product tool unexpectedly streamed");
  }
  return result satisfies GraphToolResult;
};

const assertPartial = async (
  name: string,
  input: { maxDepth: number; nodeBudget: number; frontierBudget: number },
) => {
  const result = await executeGraphMemory(input);
  if (
    !result.truncated ||
    result.claims.length === 0 ||
    !result.presentation.startsWith("Partial graph reach:")
  ) {
    throw new Error(`${name}_overflow_was_not_useful_honest_partial`);
  }
};

const main = async (): Promise<void> => {
  await assertPartial("depth", {
    maxDepth: 1,
    nodeBudget: 512,
    frontierBudget: 128,
  });
  await assertPartial("node", {
    maxDepth: 8,
    nodeBudget: 3,
    frontierBudget: 128,
  });
  await assertPartial("frontier", {
    maxDepth: 8,
    nodeBudget: 512,
    frontierBudget: 2,
  });

  const complete = await executeGraphMemory({
    maxDepth: 8,
    nodeBudget: 512,
    frontierBudget: 128,
  });
  const domain = complete.claims.find(
    (claim) => claim.claim === "Quantum engines use constrained plasma.",
  );
  const preference = complete.claims.find(
    (claim) => claim.claim === "Stop drinking coffee after 2pm.",
  );
  if (!domain || !preference)
    throw new Error("product_graph_tool_missing_committed_units");

  const excluded = await executeGraphMemory(
    {
      maxDepth: 8,
      nodeBudget: 512,
      frontierBudget: 128,
    },
    [preference.unitId],
  );
  if (excluded.claims.some((claim) => claim.unitId === preference.unitId)) {
    throw new Error("product_graph_tool_working_memory_exclusion_failed");
  }

  const graphMemory = await retrieve(
    { kind: "person", authorityId: actor },
    { maxDepth: 8, nodeBudget: 512, frontierBudget: 128 },
  );
  const merged = mergeGraphStandingPreferences(
    {
      preferences: [],
      operational: [],
      domainHeadlines: [],
      totalTokens: 0,
      evictedCount: 0,
    },
    graphMemory,
  );
  const section = formatCuratedWindow(merged);
  if (!section.includes("Stop drinking coffee after 2pm.")) {
    throw new Error("graph_preference_missing_from_composed_context");
  }
  if (section.includes("Quantum engines use constrained plasma.")) {
    throw new Error("graph_domain_entered_standing_injection");
  }

  process.stdout.write("CARTOGRAPHER_K4A_PRODUCT_GREEN\n");
};

void main();
