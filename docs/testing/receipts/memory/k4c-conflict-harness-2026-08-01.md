# K4c conflict harness — local result (2026-08-01)

Status: `superseded`

Sanitization: corpus subject matter was redacted. Corpus size, payload shape,
measurements, verdicts, and the stop decision are retained.

## Decision

The `relation-conflict-v1` judgment did not meet the K4c-R1 build gate. The
build stopped before migration 077, relation tables, runtime code, or database
proof work was authored.

No live database was read or written. OpenAI's public API supplied the
1536-dimensional `text-embedding-3-small` vectors. Judgment used the
repository's connected Codex classification lane (`openai/gpt-5.5`). The
repository-default Anthropic fallback was unavailable because that account had
insufficient API credit; this happened before any case was judged and is not
included in the measured result.

## Corpus and contract

- 48 labelled claim pairs across 12 subjects.
- All five required shapes are labelled: restatement that is not conflict,
  temporal supersession, cross-topic conflict, negation, and adjacent but
  compatible claims.
- The exact production payload shape was judged: one focus KnowledgeUnit plus
  an ordered list of candidate KnowledgeUnits containing unit id, claim,
  topic labels, and claim-vector similarity.
- Blocking was topic-sibling union claim-vector top-k, floor `0.200`, window
  `16`.
- The contract instruction contains no few-shot examples. The corpus labels
  were not included in the instruction or model payload.
- The authored corpus and instruction were not tuned after measurement.

## Observed result

Command:

```bash
set -a
source .env.local
set +a
./node_modules/.bin/vite-node recipes/experiments/relation-conflict-harness.ts
```

| Measure | Precision | Recall | TP | FP | FN |
|---|---:|---:|---:|---:|---:|
| `contradicts` | 1.000 | 0.500 | 5 | 0 | 5 |
| `supersedes` | 0.706 | 0.923 | 12 | 5 | 1 |

Additional observations:

- Blocking positive recall: `1.000`.
- Judged pairs: `48`.
- Combined verdict recall: `0.739`.
- Five expected contradictions were classified as `supersedes` across three
  redacted subject domains.
- One expected supersession was missed.

K4c-R1 requires precision `1.000` on both verdicts and recall at least `0.75`.
The supersession precision failure is decisive, so the claim returns to Spec.

`K4C-HARNESS-BELOW-BAR`
