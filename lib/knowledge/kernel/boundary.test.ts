import { beforeEach, describe, expect, it, vi } from "vitest";
import { knowledgeGraphFixture } from "./fixture";

const { requireAuthMock, rpcMock } = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: requireAuthMock }));
vi.mock("./candidate-client", () => ({
  getKnowledgeGraphCandidateClient: () => ({ rpc: rpcMock }),
}));

import { retrieveKnowledgeGraphClaims } from "./boundary";

const OWNER_ID = knowledgeGraphFixture.viewerProfileIds.a;
const VICTIM_ID = knowledgeGraphFixture.viewerProfileIds.b;
const AUTHORITY_ID = knowledgeGraphFixture.expected.sharedSourceEventId;
const AUTHORIZED_ROW = {
  // PostgreSQL accepts UUID-shaped identifiers without RFC version/variant bits.
  knowledgeUnitId: "71000000-0000-7000-6000-000000000001",
  claim: "Vanessa keeps the amber notebook behind the blue atlas.",
  sourceEventId: AUTHORITY_ID,
  sourceContent: "I left the amber notebook behind the blue atlas.",
  knowledgeType: "domain",
  attentionScore: 0.8,
  tensions: [],
};

const settle = async <T>(promise: Promise<T>): Promise<T> => {
  await vi.advanceTimersByTimeAsync(600);
  return promise;
};

describe("knowledge-graph application boundary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue(OWNER_ID);
    rpcMock.mockResolvedValue({
      data: { claims: [AUTHORIZED_ROW], truncated: false }, error: null,
    });
  });

  it("binds the speaking Person root and working-memory exclusions", async () => {
    await settle(retrieveKnowledgeGraphClaims(
      { kind: "person", authorityId: OWNER_ID },
      { excludeUnitIds: [AUTHORIZED_ROW.knowledgeUnitId] },
    ));
    expect(rpcMock).toHaveBeenCalledWith("retrieve_knowledge_graph_claims_v3", {
      p_root_authority_id: OWNER_ID,
      p_viewer_profile_id: OWNER_ID,
      p_exclude_unit_ids: [AUTHORIZED_ROW.knowledgeUnitId],
      p_claim_budget: 8,
      p_per_claim_partner_cap: 8,
      p_annotation_check_budget: 64,
      p_closure_budget: 16,
      p_max_depth: 4,
      p_node_budget: 512,
      p_frontier_budget: 128,
    });
  });

  it("returns only the authorized exact claim and immutable source", async () => {
    const result = await settle(
      retrieveKnowledgeGraphClaims({
        kind: "person",
        authorityId: OWNER_ID,
      }),
    );

    expect(result).toEqual({
      outcome: "success",
      claims: [AUTHORIZED_ROW],
      truncated: false,
    });
  });

  it("keeps genuine authorized empty distinct from an RPC error", async () => {
    requireAuthMock.mockResolvedValue(VICTIM_ID);
    rpcMock
      .mockResolvedValueOnce({ data: { claims: [], truncated: false }, error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { message: "private detail" },
      });
    const denied = retrieveKnowledgeGraphClaims({
      kind: "person",
      authorityId: VICTIM_ID,
    });
    const failed = retrieveKnowledgeGraphClaims({
      kind: "person",
      authorityId: VICTIM_ID,
    });
    const states: boolean[] = [];
    void denied.then(() => states.push(true));
    void failed.then(() => states.push(true));

    await vi.advanceTimersByTimeAsync(549);
    expect(states).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(await denied).toEqual({
      outcome: "success",
      claims: [],
      truncated: false,
    });
    expect(await failed).toEqual({
      outcome: "rpc_error",
      claims: [],
      truncated: false,
    });
  });

  it("reports deadline expiry instead of successful empty", async () => {
    rpcMock.mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({
            data: { claims: [AUTHORIZED_ROW], truncated: false }, error: null,
          }), 8_500),
        ),
    );
    const result = retrieveKnowledgeGraphClaims({
      kind: "person",
      authorityId: OWNER_ID,
    });
    let settled = false;
    void result.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(7_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toEqual({
      outcome: "deadline_exceeded",
      claims: [],
      truncated: false,
    });
  });

  it("accepts a hosted-style RPC response after the database timing floor", async () => {
    rpcMock.mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({
            data: { claims: [AUTHORIZED_ROW], truncated: true }, error: null,
          }), 125),
        ),
    );
    const result = retrieveKnowledgeGraphClaims({
      kind: "person",
      authorityId: OWNER_ID,
    });

    await vi.advanceTimersByTimeAsync(600);
    expect(await result).toEqual({
      outcome: "success",
      claims: [AUTHORIZED_ROW],
      truncated: true,
    });
  });

  it("counts authentication time inside the hard deadline", async () => {
    requireAuthMock.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve(OWNER_ID), 30)),
    );
    rpcMock.mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({
            data: { claims: [AUTHORIZED_ROW], truncated: false }, error: null,
          }), 8_500),
        ),
    );
    const result = retrieveKnowledgeGraphClaims({
      kind: "person",
      authorityId: OWNER_ID,
    });
    let settled = false;
    void result.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(7_999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toEqual({
      outcome: "deadline_exceeded",
      claims: [],
      truncated: false,
    });
  });

  it("reports invalid input before calling the RPC", async () => {
    const result = await settle(
      retrieveKnowledgeGraphClaims({
        kind: "person",
        authorityId: "not-a-uuid",
      }),
    );

    expect(result).toEqual({
      outcome: "invalid_request",
      claims: [],
      truncated: false,
    });
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("reports a rejected RPC as an exception", async () => {
    rpcMock.mockRejectedValueOnce(new Error("private detail"));

    const result = await settle(
      retrieveKnowledgeGraphClaims({
        kind: "person",
        authorityId: OWNER_ID,
      }),
    );

    expect(result).toEqual({
      outcome: "exception",
      claims: [],
      truncated: false,
    });
  });

  it("reports a synchronously thrown RPC as an exception", async () => {
    rpcMock.mockImplementationOnce(() => {
      throw new Error("private detail");
    });

    const result = await settle(
      retrieveKnowledgeGraphClaims({
        kind: "person",
        authorityId: OWNER_ID,
      }),
    );

    expect(result).toEqual({
      outcome: "exception",
      claims: [],
      truncated: false,
    });
  });
});
