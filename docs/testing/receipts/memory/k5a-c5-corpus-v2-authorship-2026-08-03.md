# K5a C5 — corpus v2 authorship note (blind)

**Date:** 2026-08-03
**Artefact:** `recipes/experiments/k5a-c5-extraction-corpus-v2.json`
**Issue:** #95
**State:** RE-FROZEN 2026-08-03 after Spec-seat adjudication. 81 cases. Labels
final before any run.

## Adjudication outcome (2026-08-03, pre-run)

The eight contested labels went to the **K5 Spec seat** — the definitional
authority that wrote the §2 type procedure and the §5 durability definition.
Neither this author nor the builder adjudicates them.

**Result: 7 confirmed, 1 definition-gap, ZERO label changes.** The uncontested
set was spot-checked for systemic error and none was found.

Two of the contested calls were named as the highest-value cases in the set,
both because they catch the *over-corrections* a durability fix naturally
produces and nothing else in the corpus would detect:

- `v2-pos-dom-jira-02` ("the vendor decision sits with the finance team") — the
  only case that catches a prompt pushed toward nulling unsettledness starting
  to null anything that *mentions* a decision.
- `v2-ctl-core-explicit-02` ("Thanks, that's exactly what I needed.") — the
  mirror over-correction: a prompt mining a preference out of a pleasantry.

**Clarification D — the one definition-gap.** Rule 1's no-added-information
test needs an **attribution signal** in order to run at all. A bare imperative
carries none, so on such a sentence the preference/operational boundary is
*undecided* rather than decided. Undecided cases are **scored and reported, never
gated**. `v2-pos-op-explicit-02` is the one case in the corpus of that shape; its
**label did not change** (type `operational`, about-person the author) — only its
scoring stratum did, to the new `positive-type-rim`. Clarification D reaches the
type axis only; the case's about-person stays inside bar 3's gated denominator.

**§6 arithmetic correction accepted.** This author's finding — that the ruling
gated bar 1b on the hard core alone while quoting its ≤ 10% bound against the
30-case control *set*, two different denominators — was accepted and the ruling
corrected. The hard core minimum is now **≥ 30** and the ≤ 10% bound attaches to
the hard core specifically. The departure recorded below was approved
retrospectively as the correct call.

**The re-freeze changed zero labels.** It moved one case's scoring stratum and
added one new case (`v2-pos-op-jira-05`), authored blind under the same
discipline, so the gated `operational`/`preference` denominator returns to 30 and
bar 2b keeps its ≤ 10% bound. It is pre-run, so §6's freeze rule is intact. The
superseded payload hash `84369a79…` (80 cases) is **void**.

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
| `v2-pos-op-explicit-02` ("If something touches production data, tell me…") | `operational`, **reported not gated** | **The definition-gap.** Label confirmed unchanged, but a bare conditional imperative carries no attribution signal, so rule 1's test cannot run and the boundary is undecided — clarification D. Moved to stratum `positive-type-rim`. Contrast with `v2-pos-pref-explicit-01` ("I want you to…"), which asserts the wanting and *is* decidable |
| `v2-pos-dom-slack-03` ("production flag changes go through the incident lead") | `domain` | The sharpest tie-break case: plainly operational intent, purely descriptive surface form |
| `v2-pos-dom-jira-02` ("the vendor decision sits with the finance team…") | `domain`, durable | Asserts who *owns* a decision, which is durable — not that the decision is pending. The deliberate contrast case for the hard-core controls |
| `v2-ctl-core-explicit-02` ("Thanks, that's exactly what I needed.") | hard-core control | Brushes disposition, but evaluates one prior turn rather than asserting a standing want |

All eight were adjudicated by the Spec seat on 2026-08-03: seven confirmed as
written, the eighth (`v2-pos-op-explicit-02`) confirmed as written but ruled
undecidable-and-therefore-ungated under clarification D. No label changed.

Deliberate contrast pairs run through the set — preference-with-before/after
against true sequencing rules, third-party "wants" against third-party
obligations, decision-ownership against decision-pending, and descriptive
routing facts against imperative routing rules.

**The one case authored after adjudication.** `v2-pos-op-jira-05` ("I'm making
this the rule for the epic going forward: no schema migration merges without a
rollback script in the same PR") was written blind under the same discipline, to
restore the gated denominator to 30. It is decidable under clarification D
because it carries an explicit attribution signal — first-person authoring of a
rule — which lets rule 1's no-added-information test actually run. The test
fails: restating it as "the author prefers…" drops the institution of a rule and
converts an obligation into a stance, which is information added. So rule 1 does
not fire and rule 2 does. About-person is null, because the claim's subject is
schema migrations and the first person sits only in the instituting frame — the
same provenance-not-content treatment the runbook frame gets in
`v2-pos-op-doc-03`.

## Counts against the §6 minimums

| Stratum | Built | Minimum | |
|---|---:|---:|---|
| Non-durable controls, total | **41** | ≥ 30 | ✅ |
| — hard core (gated, bar 1b) | **30** | ≥ 30 (as corrected) | ✅ |
| — rim (measured only, bar 1b′) | **11** | ≥ 10 | ✅ |
| Positives, **gated** `operational` or `preference` | **30** | ≥ 30 | ✅ |
| — of which `preference` | **13** | ≥ 12 | ✅ |
| — of which `operational` | 17 | — | |
| Positives, `positive-type-rim` (typed `operational`, reported not gated) | 1 | — | |
| Positives, `domain` | **9** | ≥ 8 | ✅ |
| Positives with non-null about-person | **18** | ≥ 12 | ✅ |
| **Total cases** | **81** | ~68 | above, accepted |

Shape coverage, ≥ 4 of each admitted shape in **each** set:

| Shape | Controls | Positives |
|---|---:|---:|
| `document` | 10 | 10 |
| `slack_message` | 11 | 10 |
| `jira_update` | 10 | 10 |
| `explicit` | 10 | 10 |

**Why 81 and not ~68 — one deliberate departure, named rather than slipped in,
and since accepted.** The ruling's composition originally set hard core at ≥ 20
but quoted its power figure against "30 controls → ≤ 10%". Those are two
different denominators: bar 1b gates the **hard core alone**, and at 20 cases
that arm certifies only to ≤ 15%. Since §6 calls false-durable "the single most
consequential dimension in this measurement", the hard core was built to **30**
so the gated arm actually certifies to the ≤ 10% the ruling's own arithmetic
quotes. **That finding was accepted on 2026-08-03 and §6 corrected — hard core
is now ≥ 30 and the ≤ 10% bound attaches to the hard core specifically.** The
extra calls are accepted and no trim is to be made. Every other stratum sits at
or just above its minimum.

## Power the counts give

Rule of three — for an arm with zero observed failures, the one-sided 95% upper
bound on the true error rate is ≈ 3/n:

| Arm | n | Clean-run bound |
|---|---:|---:|
| Hard-core controls (**gated**, bar 1b) | 30 | **≤ 10.0%** |
| All controls including rim | 41 | ≤ 7.3% |
| Rim, reported separately (bar 1b′, not gated) | 11 | ≤ 27.3% |
| `operational`/`preference` positives (**gated**, bar 2b zeroing direction) | 30 | **≤ 10.0%** |
| Type-rim, reported separately (clarification D, not gated) | 1 | none computable |
| Preference boundary (bar 2a) | 13 true-preference | ≤ 23.1% |
| About-person (bar 3) | 40 positives | ≤ 7.5% |
| `domain` (bar 2c, measured against the 0.60 collapse floor) | 9 | no power claim |

Bar 2a is scored in both directions: the 13 true-preference cases plus the 27
positives that must **not** come back `preference`.

Reaching the ≤ 5% bound §6 names for the production release gate would need
≈ 60 of each arm. That is G3's target, not a slice-3 blocker, and is not
attempted here.

## Freeze and hash

**Labels are frozen.** Any post-run label change invalidates the run (§6). The
2026-08-03 re-freeze is **pre-run** and changed zero labels — it moved one case's
scoring stratum and added one case — so the freeze rule is intact.

- **Canonical payload hash (recorded inside the corpus file):**
  `47f188f48fde5ad93df3e7a8bcd5de03108fc074f17d05b981e4edd8a665345a`
  Verify with:
  ```
  jq -S -c '{version,cases}' recipes/experiments/k5a-c5-extraction-corpus-v2.json | shasum -a 256
  ```
  The hash covers `version` + `cases` — every id, every content string and all
  three expected labels. `meta` is excluded so the hash can be recorded inside
  the file it seals; `meta` carries no labels.
- **Plain file hash at re-freeze** (v1's scheme, for byte-level comparison):
  `0acf018f06808635ad728f309e12ab971d2c86c89f7590b6fdc33cc254abb61a`
  This one changes if `meta` is ever touched; the payload hash does not.
- **Superseded and void:** payload `84369a79ed9bbecc67f1c02318c5101296db5fa10fa054021d0b03363a44eb5a`
  and file `727c4ac50f9f7d9739731319e36c8cd0c0fb271433137e048184f1efcd76560b`,
  the 80-case freeze of commit `0d62e53`. Any run measured against those hashes
  would be measuring a corpus that no longer exists.
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
