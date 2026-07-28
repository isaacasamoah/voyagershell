import { requireAuth } from "@/lib/auth";
import { getKnowledgeGraphCandidateClient } from "./candidate-client";
import { GRAPH_NODE_KINDS, type GraphNodeKind } from "./contract";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const RPC_DEADLINE_MS = 500;
const RESPONSE_FLOOR_MS = 550;

export interface KnowledgeGraphRoot {
  readonly kind: GraphNodeKind;
  readonly authorityId: string;
}

export interface KnowledgeGraphClaim {
  readonly knowledgeUnitId: string;
  readonly claim: string;
  readonly sourceEventId: string;
  readonly sourceContent: string;
  readonly knowledgeType: "domain" | "operational" | "preference";
  readonly attentionScore: number;
}

export interface KnowledgeGraphRetrievalOptions {
  readonly graphEnabled?: boolean;
  readonly maxDepth?: number;
  readonly excludeUnitIds?: readonly string[];
  readonly nodeBudget?: number;
  readonly frontierBudget?: number;
}

export interface KnowledgeGraphResult {
  readonly claims: readonly KnowledgeGraphClaim[];
  readonly truncated: boolean;
}

interface ClaimRow {
  readonly knowledgeUnitId: unknown;
  readonly claim: unknown;
  readonly sourceEventId: unknown;
  readonly sourceContent: unknown;
  readonly knowledgeType: unknown;
  readonly attentionScore: unknown;
}

const wait = async (milliseconds: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
};

const isUuid = (value: unknown): value is string =>
  typeof value === "string" && UUID_PATTERN.test(value);

const isRoot = (root: KnowledgeGraphRoot): boolean =>
  GRAPH_NODE_KINDS.includes(root.kind) && isUuid(root.authorityId);

const normalizeDepth = (depth: number | undefined): number => {
  if (!Number.isInteger(depth)) return 4;
  return Math.min(Math.max(depth ?? 4, 0), 8);
};

const toClaim = (value: unknown): KnowledgeGraphClaim | null => {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    return null;
  const row = value as ClaimRow;
  if (!isUuid(row.knowledgeUnitId) || !isUuid(row.sourceEventId))
    return null;
  if (typeof row.claim !== "string" || row.claim.length === 0) return null;
  if (typeof row.sourceContent !== "string" || row.sourceContent.length === 0)
    return null;
  if (!["domain", "operational", "preference"].includes(String(row.knowledgeType)))
    return null;
  if (typeof row.attentionScore !== "number" || row.attentionScore < 0 || row.attentionScore > 1)
    return null;
  return {
    knowledgeUnitId: row.knowledgeUnitId,
    claim: row.claim,
    sourceEventId: row.sourceEventId,
    sourceContent: row.sourceContent,
    knowledgeType: row.knowledgeType as KnowledgeGraphClaim["knowledgeType"],
    attentionScore: row.attentionScore,
  };
};

export const retrieveKnowledgeGraphClaims = async (
  root: KnowledgeGraphRoot,
  options: KnowledgeGraphRetrievalOptions = {},
): Promise<KnowledgeGraphResult> => {
  const startedAt = performance.now();
  const empty = { claims: [], truncated: false } as const;
  try {
    if (!isRoot(root) || root.kind !== "person") return empty;
    const viewerProfileId = await requireAuth();
    if (!isUuid(viewerProfileId)) return empty;
    const admin = getKnowledgeGraphCandidateClient();
    const rpcCall = Promise.resolve(
      admin.rpc("retrieve_knowledge_graph_claims_v2", {
        p_root_authority_id: root.authorityId,
        p_viewer_profile_id: viewerProfileId,
        p_exclude_unit_ids: (options.excludeUnitIds ?? []).filter(isUuid),
        p_max_depth: normalizeDepth(options.maxDepth),
        p_node_budget: options.nodeBudget ?? 512,
        p_frontier_budget: options.frontierBudget ?? 128,
      }),
    ).catch(() => null);
    const remainingRpcBudget = Math.max(
      0,
      RPC_DEADLINE_MS - (performance.now() - startedAt),
    );
    const outcome = await Promise.race([
      rpcCall,
      wait(remainingRpcBudget).then(() => null),
    ]);
    if (!outcome) return empty;
    const { data, error } = outcome;
    if (error || data === null || typeof data !== "object" || Array.isArray(data)) return empty;
    const envelope = data as { claims?: unknown; truncated?: unknown };
    if (!Array.isArray(envelope.claims) || typeof envelope.truncated !== "boolean") return empty;
    const claims = envelope.claims.flatMap((row) => {
      const claim = toClaim(row);
      return claim ? [claim] : [];
    });
    return { claims, truncated: envelope.truncated };
  } catch {
    return empty;
  } finally {
    const remaining = RESPONSE_FLOOR_MS - (performance.now() - startedAt);
    if (remaining > 0) await wait(remaining);
  }
};
