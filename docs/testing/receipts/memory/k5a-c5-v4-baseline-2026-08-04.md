# K5a C5 v4 baseline against v5 — 2026-08-04

Status: `AB-DONE`

## Rule declaration — read this before any number below

`recipes/README.md:28` and `docs/testing/receipts/memory/k5a-c5-v5-one-shot-result-2026-08-03.md`
both state: do not rerun or tune v5 against this corpus. That rule exists to prevent
acceptance-shopping — running until a candidate passes.

This run measured v5 against that corpus a second time. Isaac authorised that narrow
exception, and its terms are these:

- **v5's acceptance verdict is FIXED at FAIL and CANNOT change as a result of this run.**
  Whatever v5 scores here, it remains rejected. This run cannot promote v5 by itself.
- The v5 arm exists ONLY as a same-process control for model drift. Comparing a fresh v4 run
  against a run recorded on 2026-08-03 does not control for the provider changing underneath
  the measurement; without a same-process v5 arm, any v4 number is confounded with drift.
- No prompt, corpus file, expected value, label, bar, or scoring stratum was changed. The
  active contract was not changed. v5 was not registered in `knowledge_extractor_contracts`.
  Nothing was activated and nothing was promoted.
- No tuning of any kind occurred between the two arms. Both arms ran in one uninterrupted
  process against one sealed corpus.

The exception is safe against the risk the rule guards because there is no acceptance to shop
for: v5's verdict was fixed at FAIL as a precondition of running, not as a finding afterwards.

## Verdict in one paragraph

**v4 is decisively worse than v5.** The headline: v4's hard-core false-durable count is
**25/30** against v5's **4/30** fresh and **5/30** recorded, on a bar of zero. Both contracts
fail that arm; v4 fails it about five times more severely, and the ~21-case gap is roughly
twenty times the measured noise floor. v4 also fails the preference boundary that v5 passes
(24/26 against 26/26) — the arm Isaac's live defect sits on — and collapses correct-domain
typing to 1/9 = 0.111 against v5's 8/9 = 0.889. v4's only nominal advantage is about-person
attribution at 40/40 against v5's 39/40, but the drift control shows that arm is noise-dominated
and the advantage is **not established**. Recommendation: promote v5 as the best available
contract while explicitly recording that it remains below bar, and author v6 against the four
named residual failure cases. Full reasoning under "Plain-language verdict".

## Sealed instrument

- Corpus: `k5a-c5-labelled-v2`, 81 cases, unchanged
- Canonical `{version,cases}` payload SHA-256:
  `47f188f48fde5ad93df3e7a8bcd5de03108fc074f17d05b981e4edd8a665345a` — **recomputed and matched
  by the harness before model acquisition**, as on 2026-08-03
- Plain corpus file SHA-256:
  `0acf018f06808635ad728f309e12ab971d2c86c89f7590b6fdc33cc254abb61a` — matches the recorded
  receipt exactly
- Measurement pairs: `cartographer-single-claim-v4 × openai/gpt-5.5` and
  `cartographer-single-claim-v5 × openai/gpt-5.5`
- Provider executions: exactly one uninterrupted harness process, both arms, v4 first
- Base: `origin/dev` at `f026a63`, branch `chore/c5-v4-baseline`, worktree
  `/Users/isaac/the-workshop/voyagershell-ab`
- No database of any kind was touched. No migration was authored or applied. The harness
  imports no DB module.

The seal was verified before any quota was spent: the harness was invoked with a deliberately
invalid contract name, `assertCorpus()` passed, and the run terminated at the contract gate
with `k5a_c5_contract_not_measurable`. The corpus had not drifted.

## Single-variable claim — why these arms are comparable

v4 and v5 differ **only in the system-prompt string**. Everything else reaching or leaving the
model is identical, verified by inspection rather than assumed:

- Both routes funnel into the same `runExtraction` function; `lib/agents/cartographer/extractor.ts:94`
  and `:112` are its only two call sites.
- Same user prompt. Both build it with `promptForAttempt(attempt, [], false)`, and
  `extractorVersion` is **not** serialised into that prompt — the source JSON carries only
  `eventId`, `eventType`, `actorPersonId` and `content` (`extractor.ts:29-41`).
- Same schema, by object identity, not merely by equivalence: `contract.ts:69` defines
  `extractionSchema` **as** `historicalExtractionSchema`, which is the schema the v5 route
  passes.
- Same `maxOutputTokens: 1024`, stripped identically for both arms by the Codex compatibility
  middleware (`lib/models/codex.ts:60-71`).

The three v4/v5 divergences that exist elsewhere in the codebase were checked and all lie
**outside the harness's import set**, which is only `contract`, `extractor`, `types`, the
corpus JSON and the model factory:

- `complete_v4_knowledge_extraction_attempt` vs `complete_knowledge_extraction_attempt` —
  `lib/agents/cartographer/jobs.ts:104-108`, a post-model DB completion RPC never invoked here.
- `isClaimBlockedTopicContract` branching — `lib/agents/cartographer.ts:174,195,207,209` and
  `jobs.ts:8`, all in the orchestrator, not in `extractor.ts`.
- Retry wrapping — `topic-pipeline.ts`, `backfill.ts`, `relation-pipeline.ts`; none is in this
  extraction path.

**One asymmetry, named rather than papered over:** v4 reaches `runExtraction` through a
conditional (`isCurrentContract`), v5 through a version guard and a direct call. That is a
difference in how identical arguments are *selected*, not a difference in the arguments. The
values arriving at `generateObject` are the same on both arms.

## Scorer calibration — why these numbers are trustworthy

The scorer (`recipes/experiments/k5a-c5-arm-scorer.ts`) was calibrated against the known-good
published result before being trusted on v4. `recipes/experiments/k5a-c5-recorded-v5-calibration.ts`
rebuilds the 2026-08-03 recorded per-case outputs from that receipt's full table into the
harness output shape; feeding it to the scorer reproduced **every published number exactly**:

| Arm | Published 2026-08-03 | Scorer reproduction |
|---|---|---|
| 1a meaning fidelity (claim emitted) | 40/40 | 40/40 |
| 1b hard-core false durability | 5/30 | 5/30, same five case ids |
| 2a true preferences | 13/13 | 13/13 |
| 2a gated non-preferences | 26/26 | 26/26 |
| 2b zeroing-direction | 0/30 errors | 0/30 errors |
| 3 about-person | 39/40, miss `v2-pos-op-jira-03` | 39/40, same miss |
| 3′ fabricated Person ID | 0/40 | 0/40 |
| 1b′ durability rim | 8 durable, 3 null | 8 durable, 3 null |
| 2c correct-domain rate | 8/9 = 0.889 | 8/9 = 0.889, same error case |
| Type rim | `operational` | `operational` |

Ten arms, ten exact reproductions, including per-case identities rather than counts alone. Two
properties make this a real calibration rather than a circular one: only *actuals* were
transcribed, with expected values read live from the sealed corpus, so the fixture cannot
encode the answer; and the scorer tests claim **nullity**, never claim text, so a sentinel was
used instead of retyped prose and no transcription artifact can pass as a match.

Every bar in the scorer is a constant transcribed from the 2026-08-03 receipt. The scorer
computes; it never decides a bar.

## Arm-by-arm comparison

| Arm | Bar | v4 | v5 (this run, control) | v5 (recorded 2026-08-03) | Which is better |
|---|---|---|---|---|---|
| 1a Meaning fidelity | 100%, n=40 | **40/40 PASS** | 40/40 PASS | 40/40 PASS | tie |
| 1b Hard-core false durability | zero, n=30 | **25/30 FAIL** | 4/30 FAIL | 5/30 FAIL | **v5, by ~21 cases** |
| 2a Preference — true preferences | 100%, n=13 | **13/13 PASS** | 13/13 PASS | 13/13 PASS | tie |
| 2a Preference — gated non-preferences | 100%, n=26 | **24/26 FAIL** | 26/26 PASS | 26/26 PASS | **v5** |
| 2b Zeroing-direction type error | zero, n=30 | **0/30 PASS** | 0/30 PASS | 0/30 PASS | tie |
| 3 About-person exact attribution | 100%, n=40 | **40/40 PASS** | 39/40 FAIL | 39/40 FAIL | v4 nominally — **inside noise, not established** |
| 3′ Fabricated Person ID | zero, n=40 | **0/40 PASS** | 0/40 PASS | 0/40 PASS | tie |
| 1b′ Durability rim | reported, n=11 | **11 durable, 0 null** | 7 durable, 4 null | 8 durable, 3 null | v5 — v4 never returns null |
| 2c Correct-domain rate | floor 0.60, n=9 | **1/9 = 0.111, BELOW FLOOR** | 8/9 = 0.889 | 8/9 = 0.889 | **v5, by 8×** |
| Type rim | reported, n=1 | **`preference`** | `operational` | `operational` | v5 — label is `operational` |
| 4 Audience inheritance | 100%, structural | contract-invariant | contract-invariant | 3/3 PASS | n/a — see below |
| C3 Recoverable type dynamics | structural | contract-invariant | contract-invariant | PASS | n/a — see below |

Arm 1a was reviewed by hand, claim by claim, against the frozen source for **both** arms. All 40
v4 positives and all 40 v5 positives are entailed by their source; narrower or broader wording
introduced no false attribution in either arm.

## The noise floor — what the drift control bought

The v5 control arm is the reason the numbers above can be read at all. Comparing v5-fresh
against v5-recorded measures how much this instrument moves when **nothing changes**:

| Arm | v5 recorded | v5 fresh | Movement |
|---|---|---|---|
| 1b hard-core false durability | 5/30 | 4/30 | −1 case; fresh is a **strict subset** of recorded |
| 1b′ durability rim | 8 durable | 7 durable | −1 case |
| 2a preference boundary | 13/13, 26/26 | 13/13, 26/26 | none |
| 2b zeroing-direction | 0/30 | 0/30 | none |
| 2c correct-domain rate | 8/9, error `v2-pos-dom-slack-03` | 8/9, same error case | none |
| 3 about-person | 39/40 | 39/40 | same count, **different case** |
| 3′ fabricated Person ID | 0/40 | 0/40 | none |
| Type rim | `operational` | `operational` | none |

**Provider drift between 2026-08-03 and 2026-08-04 is negligible.** The instrument is stable to
about ±1 case out of 30 on the durability arms and exactly stable on the type and preference
arms. Two consequences:

1. **The v4 result is trustworthy.** The v4-versus-v5 hard-core gap is 25 against 4 — roughly
   21 cases, about twenty times the observed noise. No plausible drift explains it.
2. **The recorded 2026-08-03 numbers are still a valid comparator.** Anyone reading this can
   compare v4 against the recorded receipt directly; the control simply removes the need to
   assume that.

## Per-case failure sets and their relationships

### 1b Hard-core false durability

- **v4 fails 25/30.** `doc-01` `doc-02` `doc-03` `doc-04` `doc-05` `doc-06` `doc-07`
  `slack-02` `slack-03` `slack-04` `slack-05` `slack-06` `slack-07` `slack-08` `jira-01`
  `jira-03` `jira-04` `jira-05` `jira-06` `jira-07` `explicit-01` `explicit-03` `explicit-05`
  `explicit-06` `explicit-08` (all prefixed `v2-ctl-core-`).
- **v5 fresh fails 4/30.** `slack-02` `slack-03` `jira-04` `explicit-07`.
- **v5 recorded failed 5/30.** `doc-03` `slack-02` `slack-03` `jira-04` `explicit-07`.

**Set relationship: OVERLAPPING — near-superset with one escape.** Not a clean superset, and
not disjoint.

- Shared by both fresh arms (3): `v2-ctl-core-slack-02`, `v2-ctl-core-slack-03`,
  `v2-ctl-core-jira-04`
- v4 only (22): the remaining 22 listed above
- **v5 only (1): `v2-ctl-core-explicit-07`**

So of Bridge Prime's three possibilities this is closest to (c) — v4 worse in count and
containing almost all of v5's failures — but it is **not** a strict superset. One case escapes,
and it is informative rather than incidental:

`v2-ctl-core-explicit-07`, source *"Ignore my last message, wrong thread."*
- v4 returns `null` — correct.
- v5 returns *"The author's last message was in the wrong thread."* — a false durable.
- v5 failed this case in **both** runs (2/2); v4 passed it (1/1).

That two-of-two repetition puts it outside the ±1 noise band and makes it a genuine
v5-specific residual failure mode: **meta-conversational self-correction**. v5's prompt nulls
unsettled decisions and social acts, but a correction about a previous message is neither, so
it falls through. This is a concrete v6 input derived from evidence, not guesswork.

The three failures **both** contracts share are the harder v6 problem, because no existing
contract handles them:

| Case | Source | Failure class |
|---|---|---|
| `v2-ctl-core-slack-02` | "thanks Mara, that saved me an hour" | social acknowledgement carrying incidental content |
| `v2-ctl-core-slack-03` | "adding Mara here so she has the context 👆" | meta-conversational participant addition |
| `v2-ctl-core-jira-04` | "root cause is still unknown; the trace doesn't show where the retry loop starts" | negative finding restated as durable fact |

### 3 About-person exact attribution — the arm that turns out to be noise

- **v4 fresh: 40/40. No misses.**
- **v5 fresh: 39/40**, miss = `v2-pos-op-explicit-02` (expected the author, returned `null`).
- **v5 recorded: 39/40**, miss = `v2-pos-op-jira-03` (expected Mara, returned `null`).

**Set relationship: DISJOINT, in both directions.** v4-fresh versus v5-fresh is disjoint
because v4 has no failures at all. Critically, **v5-fresh versus v5-recorded is also disjoint** —
v5 lost exactly one attribution in each run, but never the same one.

Two conclusions follow, and they matter more than the counts:

1. **v5's gated arm-3 FAIL is not reproducible on a specific case.** The 2026-08-03 receipt
   named `v2-pos-op-jira-03` as the miss; v5 got that case **right** today and dropped a
   different one instead. Authoring a v6 that targets `v2-pos-op-jira-03` would be chasing a
   phantom — precisely the risk that motivated calibrating the scorer.
2. **v4's 40/40 does not establish that v4 is better on this arm.** Two v5 runs are consistent
   with an independent per-case attribution-loss probability around 2.5%; under that model a
   clean 40/40 occurs roughly a third of the time by chance. A single v4 run cannot separate
   "v4 is better" from "v4 got lucky". **This arm cannot be called from this run.**

Direct answer to the question asked: **v4 does not miss `v2-pos-op-jira-03`** — it attributes
it correctly to Mara. Nor does it miss any other case.

A bar-design observation for Spec, not a v6 prompt problem: a 100% bar on n=40 against roughly
2.5% stochastic attribution loss is a bar this instrument may be unable to meet reliably,
whatever the prompt says.

## Token usage — not measurable, and that is itself the finding

**The Codex backend reported no usage at all.** Every per-case `usage` object came back empty
across all 162 calls, so `usageTotals` is `0` with `reportedCases: 0` on both arms — the honest
encoding of *not known*, as distinct from *zero*. The middleware reads usage from the stream's
`finish` part (`lib/models/codex.ts:97-100`); the backend does not populate it.

This means **Codex-subscription spend is currently invisible through this path**. Given that
the connection is now shared for testing, that gap is worth closing independently of this run.

Best available proxy, from character counts, excluding reasoning tokens:

| Arm | System prompt | Input (approx.) | Visible output (approx.) |
|---|---|---|---|
| v4 | 685 chars | ~93,600 chars ≈ 23,400 tok | ~12,100 chars ≈ 3,000 tok |
| v5 | 2,666 chars | ~254,100 chars ≈ 63,500 tok | ~12,700 chars ≈ 3,200 tok |

v5's input cost is roughly 2.7× v4's because its system prompt is about four times longer.
`gpt-5.5` is a reasoning model, so true output tokens are materially higher than the visible
proxy. 162 provider calls total.

## Arms that cannot be compared, and why

**Arm 4 (audience inheritance) and C3 (recoverable type dynamics) are contract-invariant and
were not re-measured.** They are structural PostgreSQL proofs run by
`recipes/cartographer-k5a-c3-local-proof.sh`, which invokes no model and contains no reference
to any extractor version; neither `recipes/sql/cartographer-k5a-c3-v5-dynamics.sql` nor
`recipes/sql/cartographer-k5a-c5-structural-falsifier.sql` pins an extractor version either.
These arms exercise the ingress-to-unit pipeline over fixture rows, not the extractor prompt.
A v4 number for them would be identical to v5's by construction, so none is fabricated here.

**Arm 1a is only partly mechanical.** Entailment is a human judgement. The scorer reports the
mechanical floor — whether a labelled positive produced a claim at all — and the entailment
review is recorded separately below.

## Plain-language verdict

**v4 is worse. Decisively, not marginally, and not mixed in any way that survives the noise
floor.**

On the arm that matters most — hard-core false durability, bar zero — v4 emits 25 false durable
claims from 30 cases where the correct answer is silence. v5 emits 4. v4 does not merely fail
the bar; it fails it at a rate that means **roughly five in six unsettled statements become
permanent knowledge units**. The rim arm makes the mechanism plain: v4 returned a claim for
11 of 11 rim controls and 40 of 40 positives. Across the whole 81-case corpus v4 returned
`null` only 5 times. **v4 does not really have a durability judgement at all** — it extracts
something from almost everything, which is exactly what its one-line classification instruction
would predict, and exactly the junk-durable behaviour visible live on voyager-dev.

The failure mode is not subtle. Source *"Owner of the reconciliation runbook: TBD"* becomes the
durable claim *"The owner of the reconciliation runbook is TBD."* Source *"we have not chosen
between the single-queue and the sharded-queue design"* becomes a durable claim asserting the
non-choice. v4 is manufacturing permanent facts out of explicit statements that no fact exists
yet.

**v4 also fails the arm Isaac's live defect sits on.** Preference boundary: v4 scores 24/26 on
the gated non-preference direction, leaking `preference` on `v2-pos-dom-slack-02` ("I always run
the linter before I push") and `v2-pos-dom-explicit-01` ("The platform team prefers Terraform to
Pulumi"). v5 scores 26/26, and did so in both runs. That is a clean, stable, reproducible signal
that v5 fixes something v4 breaks.

**And v4's type discipline collapses.** Correct-domain retention is 1/9 = 0.111 against a
reported floor of 0.60; v5 holds 8/9 = 0.889. v4 relabels almost every domain fact as
operational — it turns *"Devi owns the CI runners"* into an obligation.

v4's only nominal win is about-person attribution, 40/40 against v5's 39/40. **That win is not
established.** v5 dropped a different single case in each of two runs, so the arm is
noise-dominated, and one clean v4 run is what you would expect about a third of the time from a
contract with the same ~2.5% loss rate.

### Does the evidence support promoting v5, or authoring v6?

**Both — and they are not alternatives. Promote v5 now; author v6 from this evidence.**

The case for promoting v5 is that leaving v4 active is not a neutral holding position. Every
day v4 runs, it writes junk-durable units at roughly a 5-in-6 hard-core rate and mistypes domain
facts as operational at 8-in-9. v5 is better on every arm where the difference exceeds the noise
floor, and never meaningfully worse. Waiting for v6 means choosing the worse contract for the
duration.

Three qualifications must travel with that recommendation, or it is dishonest:

1. **v5 is still below bar and its acceptance verdict remains FAIL.** Promoting it would be
   recording "best available, measured, still below bar" — not acceptance. This run cannot and
   does not promote it.
2. **v5 carries one genuine regression against v4**, `v2-ctl-core-explicit-07`
   (meta-conversational self-correction), failed 2/2 by v5 and passed by v4. It is one case
   against v4's twenty-two, but it is real and should be fixed in v6 rather than discovered
   later.
3. **The about-person arm cannot be called from this run** and should not be used as an argument
   either way.

v6's work list falls straight out of the per-case evidence, with no guesswork required:

- The three failures **both** contracts share: social acknowledgement carrying incidental
  content (`slack-02`), meta-conversational participant addition (`slack-03`), and negative
  findings restated as durable fact (`jira-04`).
- The one failure **v5 alone** has: meta-conversational self-correction (`explicit-07`).
- Not a prompt problem: arm 3's 100% bar on n=40 against ~2.5% stochastic attribution loss is a
  bar-design question for Spec.

The premise in the original framing — that the project rejected a measured contract in favour of
an unmeasured one — is now confirmed with numbers. v4 was never measured, and it is far worse
than the candidate it displaced.

## Stop boundary

This run measured. It changed no active contract, registered no contract, wrote to no database,
authored no migration, and promoted nothing. v5's acceptance verdict remains FAIL.
