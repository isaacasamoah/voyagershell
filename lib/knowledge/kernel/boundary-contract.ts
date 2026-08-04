import { GRAPH_NODE_KINDS, type GraphNodeKind } from "./contract";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface KnowledgeGraphRoot {
  readonly kind: GraphNodeKind;
  readonly authorityId: string;
}

export interface KnowledgeGraphClaim {
  readonly knowledgeUnitId: string;
  readonly claim: string;
  readonly sourceEventId: string;
  readonly sourceContent: string;
  readonly sourceCreatedAt?: string;
  readonly sessionId?: string | null;
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
  | "exception"
  | "skipped";

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
  readonly sourceCreatedAt: unknown;
  readonly sessionId: unknown;
  readonly knowledgeType: unknown;
  readonly attentionScore: unknown;
  readonly tensions: unknown;
}

export const knowledgeGraphFailure = (
  outcome: KnowledgeGraphFailureOutcome,
): KnowledgeGraphFailure => ({ outcome, claims: [], truncated: false });

export const isKnowledgeGraphUuid = (value: unknown): value is string =>
  typeof value === "string" && UUID_PATTERN.test(value);

export const isKnowledgeGraphRoot = (root: KnowledgeGraphRoot): boolean =>
  GRAPH_NODE_KINDS.includes(root.kind) &&
  isKnowledgeGraphUuid(root.authorityId);

export const normalizeKnowledgeGraphDepth = (
  depth: number | undefined,
): number => {
  if (!Number.isInteger(depth)) return 4;
  return Math.min(Math.max(depth ?? 4, 0), 8);
};

export const normalizeKnowledgeGraphBudget = (
  value: number | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number =>
  Number.isInteger(value)
    ? Math.min(Math.max(value ?? fallback, minimum), maximum)
    : fallback;

const parseTensions = (
  value: unknown,
): readonly KnowledgeGraphTension[] | null => {
  if (!Array.isArray(value)) return null;
  const tensions = value.flatMap((candidate) => {
    if (
      candidate === null ||
      typeof candidate !== "object" ||
      Array.isArray(candidate)
    ) {
      return [];
    }
    const tension = candidate as Record<string, unknown>;
    if (!isKnowledgeGraphUuid(tension.withUnitId)) return [];
    if (!["newer", "older", "same"].includes(String(tension.relativeRecency))) {
      return [];
    }
    return [
      {
        withUnitId: tension.withUnitId,
        relativeRecency:
          tension.relativeRecency as KnowledgeGraphTension["relativeRecency"],
      },
    ];
  });
  return tensions.length === value.length ? tensions : null;
};

const parseClaim = (value: unknown): KnowledgeGraphClaim | null => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const row = value as ClaimRow;
  if (
    !isKnowledgeGraphUuid(row.knowledgeUnitId) ||
    !isKnowledgeGraphUuid(row.sourceEventId) ||
    typeof row.claim !== "string" ||
    row.claim.length === 0 ||
    typeof row.sourceContent !== "string" ||
    row.sourceContent.length === 0 ||
    typeof row.sourceCreatedAt !== "string" ||
    Number.isNaN(Date.parse(row.sourceCreatedAt)) ||
    (row.sessionId !== null && typeof row.sessionId !== "string") ||
    !["domain", "operational", "preference"].includes(
      String(row.knowledgeType),
    ) ||
    typeof row.attentionScore !== "number" ||
    row.attentionScore < 0 ||
    row.attentionScore > 1
  ) {
    return null;
  }
  const tensions = parseTensions(row.tensions);
  if (!tensions) return null;
  return {
    knowledgeUnitId: row.knowledgeUnitId,
    claim: row.claim,
    sourceEventId: row.sourceEventId,
    sourceContent: row.sourceContent,
    sourceCreatedAt: row.sourceCreatedAt,
    sessionId: row.sessionId as string | null,
    knowledgeType: row.knowledgeType as KnowledgeGraphClaim["knowledgeType"],
    attentionScore: row.attentionScore,
    tensions,
  };
};

export const parseKnowledgeGraphEnvelope = (
  data: unknown,
): KnowledgeGraphSuccess | null => {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return null;
  }
  const envelope = data as { claims?: unknown; truncated?: unknown };
  if (
    !Array.isArray(envelope.claims) ||
    typeof envelope.truncated !== "boolean"
  ) {
    return null;
  }
  const claims = envelope.claims.flatMap((row) => {
    const claim = parseClaim(row);
    return claim ? [claim] : [];
  });
  return { outcome: "success", claims, truncated: envelope.truncated };
};
