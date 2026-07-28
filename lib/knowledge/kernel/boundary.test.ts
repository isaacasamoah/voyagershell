import { beforeEach, describe, expect, it, vi } from "vitest";
import { GRAPH_NODE_KINDS } from "./contract";
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
const PRIVATE_AUTHORITY_ID = knowledgeGraphFixture.events.find(
  (event) => event.id !== AUTHORITY_ID,
)!.id;
const ROOTS = GRAPH_NODE_KINDS.map((kind) => {
  const node = knowledgeGraphFixture.nodes.find((candidate) => {
    if (candidate.kind !== kind) return false;
    if (kind === "person" || kind === "voyager") return candidate.authorityId === OWNER_ID;
    if (kind === "voyage") {
      return candidate.authorityId === knowledgeGraphFixture.authorityScenario.redVoyageId;
    }
    if (kind === "space") {
      return candidate.authorityId === knowledgeGraphFixture.authorityScenario.redSpaceId;
    }
    if (kind === "message_event") return candidate.authorityId === AUTHORITY_ID;
    return candidate.id === knowledgeGraphFixture.expected.sharedUnitNodeId;
  });
  if (!node) throw new Error(`missing_test_root:${kind}`);
  return node;
});
const AUTHORIZED_ROW = {
  knowledgeUnitId: "71000000-0000-4000-8000-000000000001",
  claim: "Vanessa keeps the amber notebook behind the blue atlas.",
  sourceEventId: AUTHORITY_ID,
  sourceContent: "I left the amber notebook behind the blue atlas.",
  knowledgeType: "domain",
  attentionScore: 0.8,
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
    expect(rpcMock).toHaveBeenCalledWith("retrieve_knowledge_graph_claims_v2", {
      p_root_authority_id: OWNER_ID,
      p_viewer_profile_id: OWNER_ID,
      p_exclude_unit_ids: [AUTHORIZED_ROW.knowledgeUnitId],
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

    expect(result).toEqual({ claims: [AUTHORIZED_ROW], truncated: false });
  });

  it("collapses denied, absent and database-error outcomes to one padded empty shape", async () => {
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
    expect(await denied).toEqual({ claims: [], truncated: false });
    expect(await failed).toEqual({ claims: [], truncated: false });
  });

  it("returns the same empty shape at the hard deadline when the RPC runs long", async () => {
    rpcMock.mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({
            data: { claims: [AUTHORIZED_ROW], truncated: false }, error: null,
          }), 800),
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

    await vi.advanceTimersByTimeAsync(549);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toEqual({ claims: [], truncated: false });
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
    expect(await result).toEqual({ claims: [AUTHORIZED_ROW], truncated: true });
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
          }), 800),
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

    await vi.advanceTimersByTimeAsync(549);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toEqual({ claims: [], truncated: false });
  });

  it("fails closed before the RPC for an invalid root without changing the response shape", async () => {
    const result = await settle(
      retrieveKnowledgeGraphClaims({
        kind: "person",
        authorityId: "not-a-uuid",
      }),
    );

    expect(result).toEqual({ claims: [], truncated: false });
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
