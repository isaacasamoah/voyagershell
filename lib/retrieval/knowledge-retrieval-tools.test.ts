import { describe, expect, it, vi } from "vitest";
import type {
  KnowledgeGraphClaim,
  KnowledgeGraphFailureOutcome,
  KnowledgeGraphResult,
} from "@/lib/knowledge/kernel/boundary";
import type {
  CitationRecordingInput,
  CitationRecordingResult,
} from "@/lib/knowledge/lifecycle/citations";
import { createKnowledgeRetrievalTools } from "./knowledge-retrieval-tools";

const PERSON_ID = "71000000-0000-4000-8000-000000000001";
const SESSION_ID = "71000000-0000-4000-8000-000000000002";
const UNIT_ID = "71000000-0000-4000-8000-000000000003";
const EVENT_ID = "71000000-0000-4000-8000-000000000004";
const claim: KnowledgeGraphClaim = {
  knowledgeUnitId: UNIT_ID,
  claim: "The captain prefers concise reports.",
  sourceEventId: EVENT_ID,
  sourceContent: "Please keep reports concise.",
  knowledgeType: "preference",
  attentionScore: 0.9,
};

const executeGraphMemory = async (
  result: KnowledgeGraphResult,
  citationRecorder: (
    input: CitationRecordingInput,
  ) => Promise<CitationRecordingResult> = async () => ({
    outcome: "recorded",
    inserted: result.claims.length,
  }),
) => {
  const registered = createKnowledgeRetrievalTools(
    { userId: PERSON_ID, conversationId: SESSION_ID },
    async () => result,
    citationRecorder,
  ).graph_memory;
  if (!registered.execute) throw new Error("graph_memory_not_executable");
  const output = await registered.execute(
    { maxDepth: 4, nodeBudget: 512, frontierBudget: 128 },
    { toolCallId: "graph-memory-test", messages: [] },
  );
  if (Symbol.asyncIterator in output)
    throw new Error("graph_memory_unexpectedly_streamed");
  return output;
};

describe("graph_memory presentation", () => {
  it.each<KnowledgeGraphFailureOutcome>([
    "invalid_request",
    "deadline_exceeded",
    "rpc_error",
    "exception",
  ])("warns the model when reach ends with %s", async (outcome) => {
    const result = await executeGraphMemory({
      outcome,
      claims: [],
      truncated: false,
    });

    expect(result).toEqual({
      outcome,
      claims: [],
      truncated: false,
      presentation: `Graph reach was cut short (${outcome}); do not infer that no memory exists.`,
    });
  });

  it("presents genuine empty as a completed read", async () => {
    const result = await executeGraphMemory({
      outcome: "success",
      claims: [],
      truncated: false,
    });

    expect(result.presentation).toBe("Complete within the requested graph budgets.");
  });

  it("presents budget overflow as partial reach", async () => {
    const result = await executeGraphMemory({
      outcome: "success",
      claims: [],
      truncated: true,
    });

    expect(result.presentation).toBe(
      "Partial graph reach: do not present this as a complete memory search.",
    );
  });

  it("records reach citations before delivering claims", async () => {
    const citationRecorder = vi.fn(async () => ({
      outcome: "recorded" as const,
      inserted: 1,
    }));
    const result = await executeGraphMemory(
      { outcome: "success", claims: [claim], truncated: false },
      citationRecorder,
    );

    expect(citationRecorder).toHaveBeenCalledWith({
      personId: PERSON_ID,
      sessionId: SESSION_ID,
      channel: "reach",
      knowledgeUnitIds: [UNIT_ID],
    });
    expect(result).toMatchObject({
      outcome: "success",
      claims: [{ unitId: UNIT_ID }],
    });
  });

  it("withholds claims when their reach citation cannot be recorded", async () => {
    const result = await executeGraphMemory(
      { outcome: "success", claims: [claim], truncated: true },
      async () => ({ outcome: "failed", inserted: 0 }),
    );

    expect(result).toEqual({
      outcome: "exception",
      claims: [],
      truncated: false,
      presentation:
        "Graph reach was cut short (exception); do not infer that no memory exists.",
    });
  });
});
