# K5a C5 — corpus v2 authorship note (blind)

**Date:** 2026-08-03
**Artefact:** `recipes/experiments/k5a-c5-extraction-corpus-v2.json`
**Issue:** #95
**State:** FROZEN. Labels final before any run.

## Why this note exists

The C5 acceptance ruling (`~/obsidian/Projects/voyager/specs/ORU-319/k5-truth-machinery-rethink-2026-08-01.md`,
review amendment 2026-08-03) requires that the corpus gating
`cartographer-single-claim-v5` be authored **against the definitions, by someone
who has not seen the v4 outputs** — because a corpus written with knowledge of
what a model got wrong measures the patch rather than the capability. This note
records what was read and what was deliberately not read, so the blindness claim
is auditable rather than asserted.

## What was read

- The C5 acceptance ruling, sections **§2** (the ordered domain / operational /
  preference decision procedure and the rim tie-break), **§4** (the bars and
  their per-direction asymmetry), **§5** (the durability definition, its hard
  core, and the named rim residual), and **§6** (the corpus composition contract
  and the rule-of-three arithmetic).
- `recipes/experiments/k5a-c5-extraction-corpus.json` — **field names and enum
  values only**, obtained through `jq` key/enum inspection (`keys`,
  `[.cases[].eventType]|unique`, and so on). Its case text was never rendered.
- `recipes/experiments/k5a-c5-extraction-harness.ts` lines 1–60 — the
  `CorpusCase` interface, the admitted event-type set, and the two person
  fixtures the harness supplies as candidates (`The author`, `Mara`). Needed to
  label about-person at all, since the corpus stores UUIDs and not names.

## What was deliberately not read

- `docs/testing/receipts/memory/k5a-c5-extraction-measurement-2026-08-03.md`,
  and every other receipt naming v4 results.
- The v4 extractor prompt text in `lib/agents/cartographer/contract.ts`, every
  v4 extractor output, and every harness output file.
- **§3 of the ruling** ("Re-adjudication against the definition above") — it
  adjudicates individual v4 cases and would have identified failures.
- The case text of the v1 corpus.
- The four v1 case IDs named as failing in the authoring brief were not looked
  up, and no case here was written toward them. The v2 IDs use a distinct
  `v2-…` scheme in a separate file, so no ID collides with a v1 case.

**One unavoidable exposure, disclosed:** §1 of the ruling was read in the same
block as §2 and carries aggregate v4 scores per dimension (for example
"controls 2/4"). Those are arm-level counts. They name no case, no shape and no
failure mode, and no case here was written toward them. Recorded rather than
elided.

## How the labels were decided

Each case was labelled by applying the written rules in this order, as a
labeller applying a rule to fresh material:

1. **§5 durability first.** Durable (its truth is asserted to hold beyond the
   moment of utterance) → positive. Content asserting that something is not yet
   settled — pending, absent, ongoing, undecided, still to come — plus social
   and procedural conversational acts and statements whose entire content is a
   promise to speak later → **hard-core control**. Present-tense state that will
   change without announcing it → **rim control**.
2. **§2 type procedure**, positives only, ordered, first match wins:
   `preference` (a person's disposition — the author or a supplied candidate) →
   `operational` (an obligation or sequencing rule for action, addressed to
   whoever is in that situation) → `domain` (every other durable claim).
   The **rim tie-break** was applied literally: classify on what the claim
   asserts, never on what a reader might do with it, so descriptive surface form
   goes to `domain` regardless of operational intent.
3. **§4 bar 3 about-person**, mechanically: a person named in the claim, or the
   speaker for a first-person claim. Where the person named is not one of the
   two supplied candidates (Devi, the finance team, the platform team, a duty
   manager, an incident lead), about-person is **null** — a non-null ID there is
   a fabricated reference under bar 3′.

Every genuinely contested label carries a `labelNote` in the case recording the
decision and the reason it went that way. Those notes were written at authoring
time and are inside the hashed payload. Per §6, **no label may change after a
run** — a post-run change invalidates the run.

## Contested labels, decided and recorded

The set is deliberately hard, and these are the calls a reviewer should check
before the run rather than after:

| Case | Call | Reason |
|---|---|---|
| `v2-pos-pref-explicit-04` ("I choose Tuesday mornings…") | `preference` | "Choose" is one of rule 1's named disposition verbs and the sentence asserts the choosing |
| `v2-pos-dom-slack-02` ("I always run the linter…") | `domain` | The sentence asserts a recurring act; restating it as a preference adds information rule 1's test forbids. Rule 3 names recurring behaviour of a person. Deliberate contrast with the case above |
| `v2-pos-dom-explicit-01` ("The platform team prefers Terraform…") | `domain` | Rule 1 requires the claim's subject to be a person — author or supplied candidate. A team is neither, so it falls through to rule 3 |
| `v2-pos-op-doc-03` ("The runbook is explicit: rotate…") | `operational` | The descriptive frame is provenance; the asserted content is itself an ordered obligation |
| `v2-pos-op-explicit-02` ("If something touches production data, tell me…") | `operational` | A conditional imperative, not an assertion of what the author wants. Contrast with `v2-pos-pref-explicit-01` ("I want you to…"), which asserts the wanting |
| `v2-pos-dom-slack-03` ("production flag changes go through the incident lead") | `domain` | The sharpest tie-break case: plainly operational intent, purely descriptive surface form |
| `v2-pos-dom-jira-02` ("the vendor decision sits with the finance team…") | `domain`, durable | Asserts who *owns* a decision, which is durable — not that the decision is pending. The deliberate contrast case for the hard-core controls |
| `v2-ctl-core-explicit-02` ("Thanks, that's exactly what I needed.") | hard-core control | Brushes disposition, but evaluates one prior turn rather than asserting a standing want |

Deliberate contrast pairs run through the set — preference-with-before/after
against true sequencing rules, third-party "wants" against third-party
obligations, decision-ownership against decision-pending, and descriptive
routing facts against imperative routing rules.

## Counts against the §6 minimums

| Stratum | Built | Minimum | |
|---|---:|---:|---|
| Non-durable controls, total | **41** | ≥ 30 | ✅ |
| — hard core (gated, bar 1b) | **30** | ≥ 20 | ✅ |
| — rim (measured only, bar 1b′) | **11** | ≥ 10 | ✅ |
| Positives, `operational` or `preference` | **30** | ≥ 30 | ✅ |
| — of which `preference` | **13** | ≥ 12 | ✅ |
| — of which `operational` | 17 | — | |
| Positives, `domain` | **9** | ≥ 8 | ✅ |
| Positives with non-null about-person | **18** | ≥ 12 | ✅ |
| **Total cases** | **80** | ~68 | above |

Shape coverage, ≥ 4 of each admitted shape in **each** set:

| Shape | Controls | Positives |
|---|---:|---:|
| `document` | 10 | 10 |
| `slack_message` | 11 | 10 |
| `jira_update` | 10 | 9 |
| `explicit` | 10 | 10 |

**Why 80 and not ~68 — one deliberate departure, named rather than slipped in.**
The ruling's composition sets hard core at ≥ 20 but quotes its power figure
against "30 controls → ≤ 10%". Those are two different denominators: bar 1b
gates the **hard core alone**, and at 20 cases that arm certifies only to ≤ 15%.
Since §6 calls false-durable "the single most consequential dimension in this
measurement", the hard core was built to **30** so the gated arm actually
certifies to the ≤ 10% the ruling's own arithmetic quotes. The cost is nine
extra extraction calls on one run. Every other stratum sits at or just above its
minimum. If the ~68 shape is preferred, the trim must happen **before** the run
and the corpus must be re-frozen and re-hashed.

## Power the counts give

Rule of three — for an arm with zero observed failures, the one-sided 95% upper
bound on the true error rate is ≈ 3/n:

| Arm | n | Clean-run bound |
|---|---:|---:|
| Hard-core controls (**gated**, bar 1b) | 30 | **≤ 10.0%** |
| All controls including rim | 41 | ≤ 7.3% |
| Rim, reported separately (bar 1b′, not gated) | 11 | ≤ 27.3% |
| `operational`/`preference` positives (**gated**, bar 2b zeroing direction) | 30 | **≤ 10.0%** |
| Preference boundary (bar 2a) | 13 true-preference | ≤ 23.1% |
| About-person (bar 3) | 39 positives | ≤ 7.7% |
| `domain` (bar 2c, measured against the 0.60 collapse floor) | 9 | no power claim |

Bar 2a is scored in both directions: the 13 true-preference cases plus the 26
positives that must **not** come back `preference`.

Reaching the ≤ 5% bound §6 names for the production release gate would need
≈ 60 of each arm. That is G3's target, not a slice-3 blocker, and is not
attempted here.

## Freeze and hash

**Labels are frozen.** Any post-run label change invalidates the run (§6).

- **Canonical payload hash (recorded inside the corpus file):**
  `84369a79ed9bbecc67f1c02318c5101296db5fa10fa054021d0b03363a44eb5a`
  Verify with:
  ```
  jq -S -c '{version,cases}' recipes/experiments/k5a-c5-extraction-corpus-v2.json | shasum -a 256
  ```
  The hash covers `version` + `cases` — every id, every content string and all
  three expected labels. `meta` is excluded so the hash can be recorded inside
  the file it seals; `meta` carries no labels.
- **Plain file hash at freeze** (v1's scheme, for byte-level comparison):
  `727c4ac50f9f7d9739731319e36c8cd0c0fb271433137e048184f1efcd76560b`
  This one changes if `meta` is ever touched; the payload hash does not.
- The commit SHA carrying this file is the real seal on both.

## What this author did not do

No extractor was run. The extractor prompt, `contract.ts`, the harness, every
migration and every battery are untouched. `recipes/experiments/k5a-c5-extraction-harness.ts`
still imports the v1 corpus — pointing it at v2 is the builder's wiring step for
the v5 run. The extra per-case fields (`stratum`, `labelNote`) are ignored by the
harness's `CorpusCase` cast.

Per §5's commitment: if the completed v5 contract fails the bars against this
corpus, it returns to spec. It does not get a second revision tuned against this
same corpus.
