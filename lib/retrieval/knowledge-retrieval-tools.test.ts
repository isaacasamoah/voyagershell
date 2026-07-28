import { describe, expect, it } from "vitest";
import type {
  KnowledgeGraphFailureOutcome,
  KnowledgeGraphResult,
} from "@/lib/knowledge/kernel/boundary";
import { createKnowledgeRetrievalTools } from "./knowledge-retrieval-tools";

const executeGraphMemory = async (result: KnowledgeGraphResult) => {
  const registered = createKnowledgeRetrievalTools(
    { userId: "71000000-0000-4000-8000-000000000001" },
    async () => result,
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
});
