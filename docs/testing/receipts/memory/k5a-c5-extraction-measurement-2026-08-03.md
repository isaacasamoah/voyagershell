# K5a C5 extraction coverage measurement — 2026-08-03

Status: `K5A-C5-BLOCKED-PENDING-SPEC`

## Decision

Migration `080` has not been authored. The approved C5 contract says that a
labelled sample of at least 20 utterances must be measured for claim
correctness, type correctness, and audience inheritance before the enqueue
predicate widens, and that a below-bar result returns to Spec. The contract
does not define the numeric bar or a decision rule for the domain/operational
boundary, so this run cannot honestly be called either passing or below-bar.

The fixed synthetic corpus contains 24 cases, six for each newly eligible
projection shape: `document`, `slack_message`, `jira_update`, and `explicit`.
Twenty cases contain one labelled durable claim and four are labelled
no-claim controls. Private and room source audiences alternate across the
sample. No live database was read or written.

The scored corpus SHA-256 is
`4c7b0c9b27da1b6a9c5fc50f9cd45a341e37d66a14ecdcb66d058045d2a90870`.

## Method

Command:

```bash
./node_modules/.bin/vite-node recipes/experiments/k5a-c5-extraction-harness.ts
```

The harness called the production `extractKnowledge` function, its unchanged
`cartographer-single-claim-v4` prompt and schema, and the repository's connected
classification model (`openai/gpt-5.5`) once per case. It supplied only the
source event, the actor plus one allowed Person candidate, and the source
audience carried by the extraction attempt. There was no few-shot material,
database fixture, prompt tuning, or corrective run.

Before scoring, four preference labels that explicitly said “I prefer” were
corrected from `aboutPersonId = null` to the author Person ID. That fixes a
ground-truth error against the existing prompt's explicit-about rule; the case
text, model input, and observed output did not change.

## Observed result

| Measure | Result | Observation |
|---|---:|---|
| Claim correctness | 22 / 24 (0.917) | Every positive claim preserved its labelled meaning. Two no-claim controls became durable status claims. |
| Type correctness | 16 / 20 (0.800) | Four positive cases labelled `domain` were returned as `operational`. |
| About-person correctness | 24 / 24 (1.000) | The author and named Mara were selected only when explicitly named by the claim. |
| Audience inheritance | not credited | The original harness compared a value with itself. The C5 structural falsifier now owns this privacy bar. |
| Provider/schema outcomes | 24 / 24 structured | No provider or schema failure occurred. |

The two claim disagreements were:

- `document-no-claim-06`: “still collecting examples; nothing has been decided
  yet” became “Examples were still being collected and no decisions had been
  made at the time of the draft notes.”
- `jira-no-claim-06`: “investigation continues and there is no conclusion yet”
  became “Investigation is ongoing and has not reached a conclusion yet.”

The four type disagreements were `document-domain-person-04`,
`slack-domain-01`, `slack-domain-person-04`, and
`jira-domain-person-04`. The model classified an ownership/contact fact or a
recurring archival behavior as operational where the corpus labels them as
domain. The checked-in extraction prompt names the three type values but does
not define their boundary, so changing either the prompt or the labels after
seeing this run would tune the mechanism past the gate rather than measure it.

All other positive claims were semantically equivalent restatements of their
labels. The four source shapes each completed six structured judgments. The
model never invented a Person ID and the explicit “remember this” cases scored
5 / 6 for claim correctness, 5 / 5 for type correctness, and 6 / 6 for
about-person. The original audience score was later ruled tautological and is
not evidence.

## Blocker

Spec must rule the acceptance threshold and the type-label boundary against
these fixed results. Until then:

- the current enqueue predicate remains unchanged;
- no `080` file was authored;
- no backfill was constructed or run; and
- `081` remains untouched because its SQL precondition depends on `080`'s
  proved drain marker.

This is the first and only provider measurement for this corpus. The harness
and labels are durable so a ruling can evaluate the observed result without a
correction loop.
