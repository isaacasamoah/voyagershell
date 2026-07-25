# Agent-selected Retrieval Telemetry

**Status:** Future proposal — unbuilt and outside K0/K1
**Created:** 2026-01-06
**Last Updated:** 2026-07-24

## Goal

Explore an optional telemetry layer that could support retrieval-quality analysis
and a later DSPy experiment without changing retrieval behavior or authority.
This document is not an approved schema or implementation plan.

## Current Context

Primary-model, agent-selected retrieval is current. The model chooses among the
registered semantic, keyword, anchored, temporal, node, graph, web, and
background retrieval tools according to the question. It can also answer
without a tool when its current context is sufficient. See
[agentic-retrieval.md](./agentic-retrieval.md).

K0/K1 hardens the memory kernel and installed authorized retrieval surfaces.
Optional retrieval telemetry and DSPy optimization are not K0/K1 deliverables.
They must not expand that work or become a promotion condition for it.

The repository contains legacy `retrieval_events` logging around knowledge
prefetched during prompt composition. That path does not observe the primary
model's ordered tool choices, retries, background work, or tool results. Its
presence is not evidence that the telemetry proposed here has been built, and
its old fixed-pipeline shape is not the design baseline.

## Requirements for a Future Design

Before implementation, a new design must:

- model a turn and its ordered retrieval attempts, rather than assume one fixed
  query-to-node pipeline;
- distinguish prefetched context, continuity retrieval, primary-model tool
  calls, and background retrieval;
- preserve the same user, voyage, conversation, source-audience, and per-hop
  authorization boundaries as the retrieval being observed;
- keep denial, empty-result, and inaccessible-content distinctions from
  becoming an information leak;
- define explicit retention, access, deletion, consent, and redaction rules
  before storing queries, results, or responses;
- treat citations, paraphrase overlap, repeated questions, and later user
  feedback as separately sourced signals with stated confidence, not automatic
  ground truth;
- remain non-blocking so telemetry failure cannot change retrieval or response
  behavior; and
- keep dataset export and DSPy optimization as separately approved consumers,
  not automatic consequences of collection.

## Proposed Data Concepts

These are questions for current-surface design and proof, not field names or an
approved database schema:

- a scoped turn reference and ordered attempt number;
- the stable registered tool name, timing, completion state, and bounded error
  class;
- privacy-safe input and result references, only where the current audience may
  still observe them;
- the retrieval-surface and model versions needed to interpret the observation;
- response-support or user-feedback labels with their source and confidence;
  and
- enough lineage to distinguish direct tool use from prefetched, continuity,
  and background context.

## Approach

1. Inspect the then-current harness, tool catalogue, installed database
   boundary, and background-agent surface on the exact implementation revision.
2. Choose the product questions and label semantics before choosing storage.
3. Threat-model raw and derived data across personal, room, and voyage scopes.
4. Design the schema and instrumentation as one current-shaped change; do not
   extend the legacy fixed-pipeline record by default.
5. Prove authorization, redaction, retention, ordering, retries, background
   completion, logging failure, and response-latency behavior.
6. Require a separate human decision before enabling collection or exporting a
   DSPy dataset.

## Non-Goals

- Replacing or deferring current agent-selected retrieval
- Adding telemetry to K0/K1
- Registering the proof-only future graph boundary
- Calling substring overlap or a follow-up question ground truth
- Retaining unrestricted raw prompts, results, or responses

## Open Decisions

- Which product decision would the first dataset support?
- Which signals are useful enough to justify their privacy and retention cost?
- What is the minimum safe observation for multi-step and background retrieval?
- Should the legacy fixed-pipeline logger be removed when a current-shaped
  design is approved?

## Outcomes

Unbuilt. No schema, instrumentation, collection, DSPy dataset, or optimizer is
authorized by this proposal.
