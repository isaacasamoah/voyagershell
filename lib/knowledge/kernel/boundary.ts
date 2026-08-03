import { requireAuth } from "@/lib/auth";
import { getKnowledgeGraphCandidateClient } from "./candidate-client";
import { GRAPH_NODE_KINDS, type GraphNodeKind } from "./contract";
import { markKnowledgeGraphBoundaryTiming } from "./boundary-timing";
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
// The walk is capped at eight hops and 512 nodes. Eight seconds leaves more
// than fifteen times the observed 516 ms small-walk latency while keeping a
// resumed turn bounded even when every permitted hop needs authorization.
const RPC_DEADLINE_MS = 8_000;
const RESPONSE_FLOOR_MS = 556;
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
  readonly tensions: readonly KnowledgeGraphTension[];
}

export interface KnowledgeGraphTension {
  readonly withUnitId: string;
  readonly relativeRecency: "newer" | "older" | "same";
}
export interface KnowledgeGraphRetrievalOptions {
  readonly maxDepth?: number;
  readonly excludeUnitIds?: readonly string[];
  readonly nodeBudget?: number;
  readonly frontierBudget?: number;
  readonly claimBudget?: number;
  readonly perClaimPartnerCap?: number;
  readonly annotationCheckBudget?: number;
  readonly closureBudget?: number;
}

export interface KnowledgeGraphSuccess {
  readonly outcome: "success";
  readonly claims: readonly KnowledgeGraphClaim[];
  readonly truncated: boolean;
}
export type KnowledgeGraphFailureOutcome =
  | "invalid_request"
  | "deadline_exceeded"
  | "rpc_error"
  | "exception";

export interface KnowledgeGraphFailure {
  readonly outcome: KnowledgeGraphFailureOutcome;
  readonly claims: readonly [];
  readonly truncated: false;
}

export type KnowledgeGraphResult =
  | KnowledgeGraphSuccess
  | KnowledgeGraphFailure;

interface ClaimRow {
  readonly knowledgeUnitId: unknown;
  readonly claim: unknown;
  readonly sourceEventId: unknown;
  readonly sourceContent: unknown;
  readonly knowledgeType: unknown;
  readonly attentionScore: unknown;
  readonly tensions: unknown;
}

const wait = async (milliseconds: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
};

const failure = (
  outcome: KnowledgeGraphFailureOutcome,
): KnowledgeGraphFailure => ({ outcome, claims: [], truncated: false });

const isUuid = (value: unknown): value is string =>
  typeof value === "string" && UUID_PATTERN.test(value);

const isRoot = (root: KnowledgeGraphRoot): boolean =>
  GRAPH_NODE_KINDS.includes(root.kind) && isUuid(root.authorityId);

const normalizeDepth = (depth: number | undefined): number => {
  if (!Number.isInteger(depth)) return 4;
  return Math.min(Math.max(depth ?? 4, 0), 8);
};

const normalizeBudget = (
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number => Number.isInteger(value)
  ? Math.min(Math.max(value ?? fallback, minimum), maximum)
  : fallback;

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
  if (!Array.isArray(row.tensions)) return null;
  const tensions = row.tensions.flatMap((value) => {
    if (value === null || typeof value !== "object" || Array.isArray(value))
      return [];
    const tension = value as Record<string, unknown>;
    if (!isUuid(tension.withUnitId)) return [];
    if (!["newer", "older", "same"].includes(String(tension.relativeRecency)))
      return [];
    return [{
      withUnitId: tension.withUnitId,
      relativeRecency:
        tension.relativeRecency as KnowledgeGraphTension["relativeRecency"],
    }];
  });
  if (tensions.length !== row.tensions.length) return null;
  return {
    knowledgeUnitId: row.knowledgeUnitId,
    claim: row.claim,
    sourceEventId: row.sourceEventId,
    sourceContent: row.sourceContent,
    knowledgeType: row.knowledgeType as KnowledgeGraphClaim["knowledgeType"],
    attentionScore: row.attentionScore,
    tensions,
  };
};

export const retrieveKnowledgeGraphClaims = async (
  root: KnowledgeGraphRoot,
  options: KnowledgeGraphRetrievalOptions = {},
): Promise<KnowledgeGraphResult> => {
  const startedAt = performance.now();
  let authMs = 0;
  let clientAcquisitionMs = 0;
  let transportMs = 0;
  let parseMs = 0;
  let resultOutcome: KnowledgeGraphResult["outcome"] = "exception";
  const complete = <Result extends KnowledgeGraphResult>(
    result: Result,
  ): Result => {
    resultOutcome = result.outcome;
    return result;
  };
  try {
    if (!isRoot(root) || root.kind !== "person")
      return complete(failure("invalid_request"));
    const authStartedAt = performance.now();
    const viewerProfileId = await requireAuth();
    authMs = performance.now() - authStartedAt;
    if (!isUuid(viewerProfileId))
      return complete(failure("invalid_request"));
    const annotationCheckBudget = normalizeBudget(
      options.annotationCheckBudget, 64, 1, 4096,
    );
    const closureBudget = normalizeBudget(
      options.closureBudget, 16, 0, Math.min(64, annotationCheckBudget),
    );
    const clientStartedAt = performance.now();
    const admin = getKnowledgeGraphCandidateClient();
    clientAcquisitionMs = performance.now() - clientStartedAt;
    const transportStartedAt = performance.now();
    const rpcCall = Promise.resolve(
      admin.rpc("retrieve_knowledge_graph_claims_v3", {
        p_root_authority_id: root.authorityId,
        p_viewer_profile_id: viewerProfileId,
        p_exclude_unit_ids: (options.excludeUnitIds ?? []).filter(isUuid),
        p_claim_budget: normalizeBudget(options.claimBudget, 8, 1, 64),
        p_per_claim_partner_cap: normalizeBudget(
          options.perClaimPartnerCap, 8, 1, 16,
        ),
        p_annotation_check_budget: annotationCheckBudget,
        p_closure_budget: closureBudget,
        p_max_depth: normalizeDepth(options.maxDepth),
        p_node_budget: options.nodeBudget ?? 512,
        p_frontier_budget: options.frontierBudget ?? 128,
      }),
    ).then(
      (value) => ({ kind: "rpc" as const, value }),
      () => ({ kind: "exception" as const }),
    );
    const remainingRpcBudget = Math.max(
      0,
      RPC_DEADLINE_MS - (performance.now() - startedAt),
    );
    const outcome = await Promise.race([
      rpcCall,
      wait(remainingRpcBudget).then(() => ({ kind: "deadline" as const })),
    ]);
    transportMs = performance.now() - transportStartedAt;
    if (outcome.kind === "deadline")
      return complete(failure("deadline_exceeded"));
    if (outcome.kind === "exception")
      return complete(failure("exception"));
    const parseStartedAt = performance.now();
    const { data, error } = outcome.value;
    if (
      error ||
      data === null ||
      typeof data !== "object" ||
      Array.isArray(data)
    ) {
      parseMs = performance.now() - parseStartedAt;
      return complete(failure("rpc_error"));
    }
    const envelope = data as { claims?: unknown; truncated?: unknown };
    if (
      !Array.isArray(envelope.claims) ||
      typeof envelope.truncated !== "boolean"
    ) {
      parseMs = performance.now() - parseStartedAt;
      return complete(failure("rpc_error"));
    }
    const claims = envelope.claims.flatMap((row) => {
      const claim = toClaim(row);
      return claim ? [claim] : [];
    });
    parseMs = performance.now() - parseStartedAt;
    return complete({
      outcome: "success",
      claims,
      truncated: envelope.truncated,
    });
  } catch {
    return complete(failure("exception"));
  } finally {
    const beforeFloorMs = performance.now() - startedAt;
    const remaining = RESPONSE_FLOOR_MS - beforeFloorMs;
    const floorStartedAt = performance.now();
    if (remaining > 0) await wait(remaining);
    const floorWaitMs = performance.now() - floorStartedAt;
    markKnowledgeGraphBoundaryTiming({
      outcome: resultOutcome, authMs, clientAcquisitionMs, transportMs, parseMs,
      beforeFloorMs, floorWaitMs, totalMs: performance.now() - startedAt,
    });
  }
};
