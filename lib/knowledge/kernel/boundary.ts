import { requireAuth } from "@/lib/auth";
import { markKnowledgeGraphBoundaryTiming } from "./boundary-timing";
import {
  isKnowledgeGraphRoot,
  isKnowledgeGraphUuid,
  knowledgeGraphFailure,
  normalizeKnowledgeGraphBudget,
  normalizeKnowledgeGraphDepth,
  parseKnowledgeGraphEnvelope,
  type KnowledgeGraphResult,
  type KnowledgeGraphRetrievalOptions,
  type KnowledgeGraphRoot,
} from "./boundary-contract";
import { getKnowledgeGraphCandidateClient } from "./candidate-client";

export type {
  KnowledgeGraphClaim,
  KnowledgeGraphFailure,
  KnowledgeGraphFailureOutcome,
  KnowledgeGraphResult,
  KnowledgeGraphRetrievalOptions,
  KnowledgeGraphRoot,
  KnowledgeGraphSuccess,
  KnowledgeGraphTension,
} from "./boundary-contract";

// The walk is capped at eight hops and 512 nodes. Eight seconds leaves more
// than fifteen times the observed 516 ms small-walk latency while keeping a
// resumed turn bounded even when every permitted hop needs authorization.
const RPC_DEADLINE_MS = 8_000;
const RESPONSE_FLOOR_MS = 556;

const wait = async (milliseconds: number): Promise<void> => {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
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
    if (!isKnowledgeGraphRoot(root) || root.kind !== "person") {
      return complete(knowledgeGraphFailure("invalid_request"));
    }
    const authStartedAt = performance.now();
    const viewerProfileId = await requireAuth();
    authMs = performance.now() - authStartedAt;
    if (!isKnowledgeGraphUuid(viewerProfileId)) {
      return complete(knowledgeGraphFailure("invalid_request"));
    }

    const annotationCheckBudget = normalizeKnowledgeGraphBudget(
      options.annotationCheckBudget,
      64,
      1,
      4096,
    );
    const closureBudget = normalizeKnowledgeGraphBudget(
      options.closureBudget,
      16,
      0,
      Math.min(64, annotationCheckBudget),
    );
    const clientStartedAt = performance.now();
    const admin = getKnowledgeGraphCandidateClient();
    clientAcquisitionMs = performance.now() - clientStartedAt;
    const transportStartedAt = performance.now();
    const rpcCall = Promise.resolve(
      admin.rpc("retrieve_knowledge_graph_claims_v3", {
        p_root_authority_id: root.authorityId,
        p_viewer_profile_id: viewerProfileId,
        p_exclude_unit_ids: (options.excludeUnitIds ?? []).filter(
          isKnowledgeGraphUuid,
        ),
        p_claim_budget: normalizeKnowledgeGraphBudget(
          options.claimBudget,
          8,
          1,
          64,
        ),
        p_per_claim_partner_cap: normalizeKnowledgeGraphBudget(
          options.perClaimPartnerCap,
          8,
          1,
          16,
        ),
        p_annotation_check_budget: annotationCheckBudget,
        p_closure_budget: closureBudget,
        p_max_depth: normalizeKnowledgeGraphDepth(options.maxDepth),
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
    if (outcome.kind === "deadline") {
      return complete(knowledgeGraphFailure("deadline_exceeded"));
    }
    if (outcome.kind === "exception") {
      return complete(knowledgeGraphFailure("exception"));
    }

    const parseStartedAt = performance.now();
    const { data, error } = outcome.value;
    const parsed = error ? null : parseKnowledgeGraphEnvelope(data);
    parseMs = performance.now() - parseStartedAt;
    return complete(parsed ?? knowledgeGraphFailure("rpc_error"));
  } catch {
    return complete(knowledgeGraphFailure("exception"));
  } finally {
    const beforeFloorMs = performance.now() - startedAt;
    const remaining = RESPONSE_FLOOR_MS - beforeFloorMs;
    const floorStartedAt = performance.now();
    if (remaining > 0) await wait(remaining);
    const floorWaitMs = performance.now() - floorStartedAt;
    markKnowledgeGraphBoundaryTiming({
      outcome: resultOutcome,
      authMs,
      clientAcquisitionMs,
      transportMs,
      parseMs,
      beforeFloorMs,
      floorWaitMs,
      totalMs: performance.now() - startedAt,
    });
  }
};
