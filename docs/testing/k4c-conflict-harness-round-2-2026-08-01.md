# K4c conflict harness — round 2 local result (2026-08-01)

## Decision

The amended `relation-conflict-v2` two-stage judgment remains below the K4c-R1
build gate. The final measured two-call form produced `contradicts` precision
`0.909`, so the build stopped before migration 077, relation tables, runtime
pipeline code, or database proof work was authored.

No live database was read or written. OpenAI's public API supplied the
1536-dimensional `text-embedding-3-small` vectors. Both judgment stages used
the repository's connected Codex classification lane (`openai/gpt-5.5`).

## Corpus integrity and contract

- The same 48 labelled pairs across the same 12 subjects were used without
  editing. The corpus remains Git blob `2a66d8e42764ba11852d90389d1ade06ddc28503`
  and SHA-256
  `1951a311680f6d640bf83b3cd7f4459712aaf51f799b108f01a8f9d40df6f6b9`.
- Blocking remained topic-sibling union claim-vector top-k, floor `0.200`,
  window `16`; its positive recall remained `1.000`.
- The contract contains zero few-shot examples.
- Stage 1 asks the existing user-consequence question and emits
  `conflict | none`. Stage 2 sees only stage-1 conflicts, requires explicit
  replacement evidence for `supersedes`, and defaults to `contradicts`.

## Observed result

Command:

```bash
set -a
source .env.local
set +a
./node_modules/.bin/vite-node recipes/experiments/relation-conflict-harness.ts
```

The amendment permitted one provider call for both stages only if measurement
held. That form did not hold, so the definitive v2 measurement used two calls
per focus case.

| Two-call measure   | Precision | Recall |  TP |  FP |  FN |
| ------------------ | --------: | -----: | --: | --: | --: |
| Stage 1 `conflict` |     1.000 |  0.957 |  22 |   0 |   1 |
| `contradicts`      |     0.909 |  1.000 |  10 |   1 |   0 |
| `supersedes`       |     1.000 |  0.846 |  11 |   0 |   2 |

Additional observations:

- Blocking positive recall: `1.000`.
- Judged pairs: `48`.
- Combined verdict recall: `0.913`.
- Stage 1 missed one afternoon-caffeine supersession.
- Stage 2 classified one car-loan supersession as `contradicts`.
- The rejected one-call form measured stage-1 conflict `P 1.000 / R 0.957`,
  `contradicts P 0.833 / R 1.000`, `supersedes P 1.000 / R 0.769`, and
  combined verdict recall `0.870`.

K4c-R1 requires precision `1.000` on both final verdicts and recall at least
`0.75`. The `contradicts` precision failure is decisive.

## Diagnosis

The amendment fixed the dangerous round-1 direction: neither measured v2 form
emitted a false supersession, and the two-call boundary recovered one of the
one-call supersession misses. It still cannot draw the accepted boundary at
perfect precision: the car-loan focus explicitly ends the loan repayments,
but the older claim phrases that obligation as a monthly budget item, so the
judge treats it as a conflicting downstream fact rather than the same replaced
commitment. Stage 1 separately treats the narrower earlier espresso rule as
potentially compatible with the newer general afternoon-coffee habit. Further
prompt adjustment would tune the mechanism after its gate measurement; the
remaining issue instead needs a spec decision about whether these differently
phrased operative consequences are truly supersession ground truth.

`K4C-HARNESS-BELOW-BAR`

## Gate addendum — Amendment 2

Isaac amended K4c-R1's acceptance bar at the gate after the round-2
measurement: `supersedes` precision must equal `1.000`, `contradicts`
precision must be at least `0.90`, and recall must be at least `0.75` for both
verdicts. Under that amended bar, the untuned-corpus `relation-conflict-v2`
two-call measurements pass: `supersedes` P/R `1.000/0.846` and `contradicts`
P/R `0.909/1.000`.

This amendment was ruled after measurement, with the provenance and reasoning
recorded in Amendment 2 of the approved spec. It resolves the tension between
the safe default-to-`contradicts` rule and a perfect-precision requirement for
that recoverable verdict. The K4c-R1 harness gate is therefore satisfied.

`K4C-HARNESS-PASS-AMENDED-BAR`
