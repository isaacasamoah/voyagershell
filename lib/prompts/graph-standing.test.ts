import { describe, expect, it } from "vitest";
import type { KnowledgeGraphFailureOutcome } from "@/lib/knowledge/kernel/boundary";
import { graphMemoryReachWarning } from "./graph-standing";

describe("standing graph-memory reach", () => {
  it.each<KnowledgeGraphFailureOutcome>([
    "invalid_request",
    "deadline_exceeded",
    "rpc_error",
    "exception",
  ])("warns the model when standing reach ends with %s", (outcome) => {
    expect(
      graphMemoryReachWarning({ outcome, claims: [], truncated: false }),
    ).toBe(
      `# Memory reach\nGraph memory reach was cut short (${outcome}). Do not infer that no graph memory exists.`,
    );
  });

  it("adds no warning after a successful empty read", () => {
    expect(
      graphMemoryReachWarning({
        outcome: "success",
        claims: [],
        truncated: false,
      }),
    ).toBeNull();
  });

  it("warns the model when successful reach is truncated", () => {
    expect(
      graphMemoryReachWarning({
        outcome: "success",
        claims: [],
        truncated: true,
      }),
    ).toBe(
      "# Memory reach\nGraph memory reach was partial because a traversal budget was reached. Do not treat it as a complete memory search.",
    );
  });
});
