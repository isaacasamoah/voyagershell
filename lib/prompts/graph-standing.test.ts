import { describe, expect, it } from "vitest";
import type { KnowledgeGraphFailureOutcome } from "@/lib/knowledge/kernel/boundary";
import {
  graphMemoryReachWarning,
  mergeGraphStandingPreferences,
} from "./graph-standing";

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

  it("labels a viewer-visible standing tension without another read", () => {
    const merged = mergeGraphStandingPreferences(
      {
        preferences: [], operational: [], domainHeadlines: [],
        totalTokens: 0, evictedCount: 0,
      },
      {
        outcome: "success",
        claims: [
          {
            knowledgeUnitId: "71000000-0000-4000-8000-000000000001",
            claim: "Use the old address.",
            sourceEventId: "71000000-0000-4000-8000-000000000011",
            sourceContent: "Use the old address.",
            knowledgeType: "preference",
            attentionScore: 0.9,
            tensions: [{
              withUnitId: "71000000-0000-4000-8000-000000000002",
              relativeRecency: "older",
            }],
          },
          {
            knowledgeUnitId: "71000000-0000-4000-8000-000000000002",
            claim: "Use the new address.",
            sourceEventId: "71000000-0000-4000-8000-000000000012",
            sourceContent: "Use the new address.",
            knowledgeType: "operational",
            attentionScore: 0.4,
            tensions: [],
          },
        ],
        truncated: false,
      },
    );

    expect(merged.preferences[0].content).toContain("Memory tension")
    expect(merged.preferences[0].content).toContain("Use the new address.")
    expect(merged.preferences[0].content).toContain("this claim is older")
  });
});
