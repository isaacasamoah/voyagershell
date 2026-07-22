import { beforeEach, describe, expect, it, vi } from "vitest";
import { GRAPH_NODE_KINDS } from "./contract";
import { knowledgeGraphFixture } from "./fixture";

const { requireAuthMock, rpcMock } = vi.hoisted(() => ({
  requireAuthMock: vi.fn(),
  rpcMock: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: requireAuthMock }));
vi.mock("@/lib/supabase/admin", () => ({
  getAdminClient: () => ({ rpc: rpcMock }),
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
    const audience = knowledgeGraphFixture.audiences.find(
      (item) => item.key === candidate.audienceKey,
    );
    return candidate.kind === kind && audience?.memberProfileIds.includes(OWNER_ID);
  });
  if (!node) throw new Error(`missing_test_root:${kind}`);
  return node;
});
const AUTHORIZED_ROW = {
  knowledge_unit_id: "71000000-0000-4000-8000-000000000001",
  claim: "Vanessa keeps the amber notebook behind the blue atlas.",
  source_event_id: AUTHORITY_ID,
  source_content: "I left the amber notebook behind the blue atlas.",
  knowledge_audience_id: "private-metadata-must-not-cross",
  edge_kind: "derived_from",
  path: ["private-node"],
  result_count: 1,
  elapsed_ms: 1,
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
    rpcMock.mockResolvedValue({ data: [AUTHORIZED_ROW], error: null });
  });

  it("binds all six stable root kinds to the authenticated viewer", async () => {
    for (const root of ROOTS) {
      await settle(
        retrieveKnowledgeGraphClaims({
          kind: root.kind,
          authorityId: root.authorityId,
        }),
      );
    }

    expect(rpcMock).toHaveBeenCalledTimes(6);
    ROOTS.forEach((root, index) => {
      expect(rpcMock.mock.calls[index]).toEqual([
        "retrieve_knowledge_graph_claims",
        {
          p_root_kind: root.kind,
          p_root_authority_id: root.authorityId,
          p_viewer_profile_id: OWNER_ID,
          p_graph_enabled: true,
          p_max_depth: 4,
        },
      ]);
    });
  });

  it("returns only the authorized exact claim and immutable source", async () => {
    const result = await settle(
      retrieveKnowledgeGraphClaims({
        kind: "message_event",
        authorityId: AUTHORITY_ID,
      }),
    );

    expect(result).toEqual([
      {
        knowledgeUnitId: AUTHORIZED_ROW.knowledge_unit_id,
        claim: AUTHORIZED_ROW.claim,
        sourceEventId: AUTHORIZED_ROW.source_event_id,
        sourceContent: AUTHORIZED_ROW.source_content,
      },
    ]);
    expect(Object.keys(result[0])).toEqual([
      "knowledgeUnitId",
      "claim",
      "sourceEventId",
      "sourceContent",
    ]);
  });

  it("passes graph-on and graph-off through the same RPC boundary", async () => {
    const personRoot = ROOTS.find((root) => root.kind === "person")!;
    await settle(
      retrieveKnowledgeGraphClaims(
        { kind: "person", authorityId: personRoot.authorityId },
        { graphEnabled: false, maxDepth: 99 },
      ),
    );

    expect(rpcMock).toHaveBeenCalledWith("retrieve_knowledge_graph_claims", {
      p_root_kind: "person",
      p_root_authority_id: personRoot.authorityId,
      p_viewer_profile_id: OWNER_ID,
      p_graph_enabled: false,
      p_max_depth: 8,
    });
  });

  it("collapses denied, absent and database-error outcomes to one padded empty shape", async () => {
    requireAuthMock.mockResolvedValue(VICTIM_ID);
    rpcMock
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({
        data: null,
        error: { message: "private detail" },
      });
    const denied = retrieveKnowledgeGraphClaims({
      kind: "message_event",
      authorityId: PRIVATE_AUTHORITY_ID,
    });
    const failed = retrieveKnowledgeGraphClaims({
      kind: "message_event",
      authorityId: PRIVATE_AUTHORITY_ID,
    });
    const states: boolean[] = [];
    void denied.then(() => states.push(true));
    void failed.then(() => states.push(true));

    await vi.advanceTimersByTimeAsync(549);
    expect(states).toEqual([]);
    await vi.advanceTimersByTimeAsync(1);
    expect(await denied).toEqual([]);
    expect(await failed).toEqual([]);
  });

  it("returns the same empty shape at the hard deadline when the RPC runs long", async () => {
    rpcMock.mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ data: [AUTHORIZED_ROW], error: null }), 800),
        ),
    );
    const result = retrieveKnowledgeGraphClaims({
      kind: "message_event",
      authorityId: PRIVATE_AUTHORITY_ID,
    });
    let settled = false;
    void result.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(549);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toEqual([]);
  });

  it("accepts a hosted-style RPC response after the database timing floor", async () => {
    rpcMock.mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ data: [AUTHORIZED_ROW], error: null }), 125),
        ),
    );
    const result = retrieveKnowledgeGraphClaims({
      kind: "message_event",
      authorityId: AUTHORITY_ID,
    });

    await vi.advanceTimersByTimeAsync(600);
    expect(await result).toEqual([
      {
        knowledgeUnitId: AUTHORIZED_ROW.knowledge_unit_id,
        claim: AUTHORIZED_ROW.claim,
        sourceEventId: AUTHORIZED_ROW.source_event_id,
        sourceContent: AUTHORIZED_ROW.source_content,
      },
    ]);
  });

  it("counts authentication time inside the hard deadline", async () => {
    requireAuthMock.mockImplementationOnce(
      () => new Promise((resolve) => setTimeout(() => resolve(OWNER_ID), 30)),
    );
    rpcMock.mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ data: [AUTHORIZED_ROW], error: null }), 800),
        ),
    );
    const result = retrieveKnowledgeGraphClaims({
      kind: "message_event",
      authorityId: PRIVATE_AUTHORITY_ID,
    });
    let settled = false;
    void result.then(() => {
      settled = true;
    });

    await vi.advanceTimersByTimeAsync(549);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await result).toEqual([]);
  });

  it("fails closed before the RPC for an invalid root without changing the response shape", async () => {
    const result = await settle(
      retrieveKnowledgeGraphClaims({
        kind: "message_event",
        authorityId: "not-a-uuid",
      }),
    );

    expect(result).toEqual([]);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
