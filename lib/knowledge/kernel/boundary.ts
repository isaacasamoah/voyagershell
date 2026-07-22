import { requireAuth } from "@/lib/auth";
import { getAdminClient } from "@/lib/supabase/admin";
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
}

export interface KnowledgeGraphRetrievalOptions {
  readonly graphEnabled?: boolean;
  readonly maxDepth?: number;
}

interface ClaimRow {
  readonly knowledge_unit_id: unknown;
  readonly claim: unknown;
  readonly source_event_id: unknown;
  readonly source_content: unknown;
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
  if (!isUuid(row.knowledge_unit_id) || !isUuid(row.source_event_id))
    return null;
  if (typeof row.claim !== "string" || row.claim.length === 0) return null;
  if (typeof row.source_content !== "string" || row.source_content.length === 0)
    return null;
  return {
    knowledgeUnitId: row.knowledge_unit_id,
    claim: row.claim,
    sourceEventId: row.source_event_id,
    sourceContent: row.source_content,
  };
};

export const retrieveKnowledgeGraphClaims = async (
  root: KnowledgeGraphRoot,
  options: KnowledgeGraphRetrievalOptions = {},
): Promise<readonly KnowledgeGraphClaim[]> => {
  const startedAt = performance.now();
  try {
    if (!isRoot(root)) return [];
    const viewerProfileId = await requireAuth();
    if (!isUuid(viewerProfileId)) return [];
    const admin = getAdminClient();
    const rpcCall = Promise.resolve(
      (admin.rpc as Function)("retrieve_knowledge_graph_claims", {
        p_root_kind: root.kind,
        p_root_authority_id: root.authorityId,
        p_viewer_profile_id: viewerProfileId,
        p_graph_enabled: options.graphEnabled ?? true,
        p_max_depth: normalizeDepth(options.maxDepth),
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
    if (!outcome) return [];
    const { data, error } = outcome;
    if (error || !Array.isArray(data)) return [];
    return data.flatMap((row) => {
      const claim = toClaim(row);
      return claim ? [claim] : [];
    });
  } catch {
    return [];
  } finally {
    const remaining = RESPONSE_FLOOR_MS - (performance.now() - startedAt);
    if (remaining > 0) await wait(remaining);
  }
};
