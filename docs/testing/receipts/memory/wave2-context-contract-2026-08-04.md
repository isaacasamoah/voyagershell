# Wave 2 — extractor context, v4 → v5 → v6 — 2026-08-04

Status: `WAVE2-CONTEXT-SHIPPED-UNMEASURED-AGAINST-C5`

Two contract promotions in one release. **Neither is a passed gate.** Read this
section before the numbers.

- **v5** ships as harm reduction. Its C5 one-shot verdict remains
  `K5A-V5-RESULT-FAIL`: the hard-core false-durability bar is zero and v5 does
  not reach it. It is promoted only because v4 is measurably worse on every arm
  that decides whether memory can be trusted.
- **v6 has never been run against the C5 corpus.** It inherits v5's
  classification text but none of v5's measurement. What backs v6 is a sealed
  replay of ruled cases from one real session, and nothing else. Do not read v6
  as measured because v5 was. That inheritance-by-association is the same
  mistake that left v4 in production for five days.

## Why the decision was made anyway

The A/B measured v4 and v5 on the sealed 81-case corpus, same model, one
process:

| Arm | Bar | v4 (was active) | v5 |
|---|---|---|---|
| Hard-core false durability | zero, n=30 | 25/30 | 4–5/30 |
| Preference boundary | 100%, n=26 | 24/26 FAIL | 26/26 PASS |
| Correct-domain rate | ≥0.60 | 0.111 | 0.889 |
| About-person | 100%, n=40 | 40/40 | 39/40 |

v4 mints permanent, never-decaying preference units at a 5-in-6 rate.
Preferences never decay — `lib/knowledge/lifecycle/effective-attention.ts:48`
guards the whole decay block on `knowledgeType !== 'preference'` — and
preferences at attention ≥0.5 preload into every turn. A v4 false preference is therefore forever. That asymmetry, not
v5's quality, is what justifies the promotion.

## Fresh C5 run after the v5 activation (commit 1)

Re-run live on `gpt-5.5` against the same sealed corpus, payload SHA
`47f188f4…5345a`:

| Arm | Bar | Recorded v5 | This run |
|---|---|---|---|
| Hard-core false durability | zero, n=30 | 4–5/30 | **2/30** |
| Correct-domain rate | ≥0.60 | 0.889 | **0.889 (8/9)** |
| About-person | 100%, n=40 | 39/40 | **40/40** |
| Preference recall | — | — | **13/13** |
| Preference false positives | — | — | **0/27** |

**v5 still fails.** The bar is zero and this run sits at 2. The FAIL verdict is
now confirmed live rather than inherited.

The two surviving false-durables are `v2-ctl-core-jira-04` and
`v2-ctl-core-explicit-07`. The second is the known v5-specific regression
("Ignore my last message, wrong thread") that v4 correctly nulls. It is not
addressed here; it belongs to the next contract.

This run came in better than the recorded v5 on two arms. That is a larger move
than the one-case noise floor observed between v5-fresh and v5-recorded, so it
is reported as a fresh sample rather than as a correction to the recorded run.

## What v6 changes

Two edits that only work together:

1. **Deleted** `Do not infer a claim from prior knowledge` from the contract.
2. **Added** a `## Session context` section to the extraction input, carrying a
   bounded slice of the immediately preceding turn.

Shipping (2) without (1) pays for tokens the model is explicitly instructed to
ignore — a silent no-op that looks like a fix. They are in one commit for that
reason.

v6 also adds one line aimed squarely at the false-preference failure: *"A source
event that merely answers a question posed in the context states the answer, not
a preference for it."*

**Context is bounded and O(1) per extraction.** `SESSION_CONTEXT_CHARS = 1200`,
one preceding turn, never the whole history. Feeding whole history would make
total session cost O(N²) in session length — it degrades exactly as sessions
become valuable.

**Context respects the audience boundary.** Only the actor's own turns and
Voyager's replies are carried. A room session holds other people's messages, and
resolving one person's claim against another person's words would cross the
audience boundary. The loader declines rather than truncating or redacting.

## The session is not about one thing

Isaac's real session runs memory-repair chatter → CubeSat mission planning →
*"ok, lets change tack"* → an unrelated app idea → retrieval testing. Thirteen
user messages, at least three subjects.

This matters because the cheap option — one subject line for the whole session —
is wrong for a session that changes subject, and it aims directly at the
regression guard. Isaac's preference message is compound: *"ok, lets test deep
retreival, summarise our chat on cubesats, and by the way your answers are way
too long, lets do more concise answers from now on."* One message carrying both a
CubeSat reference and the preference. A "this session is about CubeSats" line is
exactly the pressure that could pull the extraction onto the CubeSat clause and
drop the preference.

So the two context shapes were measured head to head rather than assumed.

## Sealed session measurement

Corpus `cubesat-session-v2`, payload SHA `6ab60c2dabfd4fbc94ce685fe89a12f314fde1e62fc3be3aa23b45a9a8c59ca3`. Four arms in one process, one
variable at a time.

**The committed fixture carries the full session.** All 28 turns / 13 user
messages, each case carrying the assistant turn that preceded it, truncated to
the 1200 characters the runtime sends.

An earlier revision of this fixture was reduced to the five ruled cases pending
Isaac's ruling on committing his own session. He approved the full session on
**2026-08-04** and it was restored the same day, re-sealed under a new corpus
version and payload SHA. **The reduced run is not withdrawn** — it is reported
below as history, because its run-to-run instability is the reason this
restoration exists.

Six of the thirteen are ruled:

| Case | Message | Expectation |
|---|---|---|
| `cubesat-06` | "lets mostly look out at space" | must **not** be `preference` |
| `cubesat-07` | "space craft survivability" | claim must name the subject |
| `cubesat-08` | "ok, lets esign it, what components do we need?" | claim must name the subject |
| `cubesat-09` | "nice, ok lets layout the costs" | claim must name the subject |
| `cubesat-11` | "how do you distinguish if from chat gpt…" | claim must name the subject |
| `cubesat-12` | "…your answers are way too long, lets do more concise answers from now on" | **must remain** `preference` |

`cubesat-12` is the regression guard. The v4 extraction of it was correct
behaviour and tuning it away would be a real loss, not a fix.

`cubesat-07`, `08` and `09` are scored on the word "cubesat" only. An earlier
version of this instrument also accepted "survivability" for `cubesat-07` — but
that message *contains* the word, so the baseline would have passed without ever
recovering the missing subject. The instrument was tightened and re-sealed
before either reported run.

**`cubesat-11` is the case the reduced fixture could not contain, and the only
ruled case that separates the two context shapes on structure rather than on
score.** "how do you distinguish if from chat gpt" — "if" is a typo for "it",
meaning the app Voyager had just proposed. It is scored on "papershield", which
appears in the preceding turn and nowhere in the message. Crucially it sits
*after* the tack change, so the whole-session subject line ("This session is
about planning a CubeSat mission") cannot supply the referent while the
preceding turn can. It was ruled from the transcript before any arm was run.

### The seven unruled turns, and why

The other seven restored turns are carried unruled. This is a limit of the
instrument, not an oversight: the judge treats a null claim as a failure of
every ruled expectation, so it **cannot express "a null claim is the correct
answer here"** — which is exactly what the contract prescribes for bare
questions (`cubesat-01`, `cubesat-03`) and for unsettled outcomes
(`cubesat-04`). Ruling those turns would manufacture false failures.

`cubesat-05` states its own subject, so scoring it on "cubesat" would let every
arm pass without recovering anything. `cubesat-02` and `cubesat-13` are
genuinely ambiguous under the contract.

`cubesat-10` — *"ok, lets change tack"* — is the most costly of these to leave
unruled. It is the point where a whole-session CubeSat subject line becomes
actively wrong, and the strongest available evidence against the `v6-subject`
shape. But "the claim must **not** name CubeSat" is not expressible in this
assertion vocabulary. **Two instrument gaps for the next contract: a
`claim_absent` assertion and a negative subject assertion.** Both are recorded
here rather than acted on.

All thirteen turns are extracted in every arm regardless, so the token figures
below are measured over the real session rather than over five selected turns.

**One known fidelity gap, carried deliberately.** The fixture stores each
preceding turn with whitespace collapsed before the 1200-character cut, while
the runtime (`loadSessionContext`) trims and cuts the raw text with its newlines
intact. The fixture therefore carries slightly more words per 1200 characters
than production does. It was left as-is so the five original cases stay
byte-frozen and run 3 remains comparable to runs 1 and 2; changing it would
re-base the measurement in the same edit that enlarged it. It is a small
overstatement of how much context production actually sees, and it belongs on
the v7 instrument list.

### Result — run 3, against the restored full session

Run 3 is the first run against the restored `cubesat-session-v2` fixture: 13
user turns, 6 ruled, 52 live extractions in one process on `gpt-5.5`.

| Arm | Run 1 (13 turns, 5 ruled) | Run 2 (5 turns, 5 ruled) | **Run 3 (13 turns, 6 ruled)** |
|---|---|---|---|
| `v5-none` (baseline) | 1/5 | 1/5 | **1/6** |
| `v6-none` | 1/5 | 1/5 | **1/6** |
| `v6-subject` | 2/5 | **3/5** | **3/6** |
| `v6-preceding` (shipped) | **2/5** | 1/5 | **2/6** |

Per ruled case, run 3:

| Case | `v5-none` | `v6-none` | `v6-subject` | `v6-preceding` |
|---|---|---|---|---|
| `cubesat-06` not preference | FAIL | FAIL | FAIL | FAIL |
| `cubesat-07` subject | FAIL (null) | FAIL (null) | FAIL (null) | FAIL (null) |
| `cubesat-08` subject | FAIL | FAIL (null) | **PASS** | **PASS** |
| `cubesat-09` subject | FAIL (null) | FAIL (null) | **PASS** | FAIL (null) |
| `cubesat-11` subject | FAIL | FAIL | FAIL | FAIL |
| `cubesat-12` **regression guard** | PASS | PASS | PASS | PASS |

**The subject line is now ahead in all three runs** — 2, 3, 3 against the
preceding turn's 2, 1, 2. The earlier reading that the two shapes were
indistinguishable was based on two runs of five cases; a third run on a larger
instrument no longer supports it. **On score alone, `v6-subject` is the better
context shape.**

**On score alone. The claims say something the score cannot.** `cubesat-11` is
where the restored session earns its keep. The message — *"how do you
distinguish if from chat gpt"* — comes **after** the tack change, and it is
about the PaperShield app, not CubeSats. Every arm failed to name PaperShield.
But look at what `v6-subject` produced:

| Arm | Claim on `cubesat-11` |
|---|---|
| `v5-none` | "ChatGPT could probably do this right out of the box." |
| `v6-none` | "ChatGPT could probably do this right out of the box." |
| `v6-subject` | "ChatGPT could probably handle **the discussed CubeSat mission-planning task** out of the box." |
| `v6-preceding` | "ChatGPT could probably do this right out of the box." |

The subject line did not merely fail to help — **it manufactured a false
claim**, importing a subject the session had already left behind. That is the
contamination the whole-session shape was always theorised to cause, and it is
now observed rather than argued. `v6-preceding` stayed neutral.

So the two shapes trade differently than the score suggests: the subject line
buys points on turns whose subject it happens to match, and pays for them by
fabricating on turns it does not. A score of 3/6 versus 2/6 does not price that
in, because the fixture has no assertion that can fail a claim for being wrong.

**`cubesat-08` is the one case both context arms now pass**, and the preceding
turn produces the better claim of the two: *"Isaac wants to design the FamBam
CubeSat Survivability Mission"* against the subject line's *"Isaac wants the
group to design the CubeSat."*

**A new false preference, visible only because the session was restored.** On
the unruled `cubesat-02` — *"lets switch to the fambam voyager"*, a momentary
navigation instruction — `v6-none` and `v6-preceding` both mint
`preference: "Isaac wants to switch to the fambam voyager."` while `v5-none`
and `v6-subject` correctly return null. Preferences never decay
(`lib/knowledge/lifecycle/effective-attention.ts:48`), so that is a permanent
unit built from a passing remark. It is the same false-preference class as
`cubesat-06`, it is a **v6 regression against v5**, and the five-case fixture
could not see it. It goes to the next contract with `cubesat-06`.

Claim yield across the whole session was otherwise near-identical — 6/13 for
both no-context arms, 7/13 for both context arms — and context did **not**
manufacture claims out of the bare questions (`cubesat-01`, `cubesat-03`) or
the tack-change turn (`cubesat-10`), which every arm correctly nulled.

Token cost, counted on the exact strings the runtime sends, over all 13 turns.
The connected provider reports no usage, so these come from the deterministic
tiktoken script rather than from the live run:

| Arm | Mean input tokens | vs baseline |
|---|---|---|
| `v5-none` | 697 | 1.00× |
| `v6-none` | 797 | 1.14× |
| `v6-subject` | 811 | 1.16× |
| `v6-preceding` | 988 | **1.42×** |

These are the same per-arm figures the pre-reduction run recorded, which is an
independent check that the restored fixture reproduces the original instrument.
The 1.53× previously reported was the five-case fixture; **1.42× is the
full-session figure.** An **uncapped** preceding turn cost 1,628 — **2.34×** —
recorded here rather than emitted by the token script, because the fixture
stores only the capped slice. It is the evidence that the 1200-character cap is
load-bearing.

### What is stable across all three runs

**The regression guard holds in all twelve arm-runs.** "your answers are way too
long, lets do more concise answers from now on" classifies as `preference` every
time, including with a CubeSat subject line stamped on that compound message.
That was the thing most at risk and it never broke.

**Context resolves reference. It does not fix classification.** `cubesat-06`
recovers the subject in every context arm in all three runs —

- without context: *"Isaac wants to mostly look out at space."*
- with context: *"Isaac wants the CubeSat mission to mostly look out at space."*

— and is **still** typed `preference` every time. It is an answer to Voyager's
question, not a disposition. The v6 sentence written to catch exactly this
(*"A source event that merely answers a question posed in the context states the
answer, not a preference for it"*) did not move it once. That is a
classification defect and it belongs to the next contract.

**`cubesat-07` returns a null claim in all arms, all three runs.** Not a
subject-recovery failure — the extractor declines to find any durable claim in
"space craft survivability".

### Why `v6-preceding` ships, on architecture rather than score

**Run 3 changes the score story and does not change the shipping decision.** The
subject line is now ahead in all three runs rather than tied, so this receipt no
longer claims the two shapes are indistinguishable on points. It is still not
what ships, for two reasons that the score does not price.

First, **the subject line has no source.** `sessions.title` exists but its
writer, `set_session_title()`, was dropped in
`059_session_authority_cleanup.sql`. Nothing writes it. Shipping the
subject-line arm means first building a titler and paying a summary call per
session — real work, outside this wave.

Second, and new in run 3, **the subject line fabricates.** On `cubesat-11` it
imported "CubeSat mission-planning" into a turn about an entirely different
subject. A stale session subject is not a neutral hint; it is a false premise
the extractor will honour. Its 3/6 is partly bought with the same mechanism that
produced that fabrication, and the fixture has no assertion that can fail a
claim for being wrong.

The preceding turn needs no machinery that does not already exist, tracks the
topic drift this session demonstrates, produces the better claim on the one case
both arms pass, and costs 1.42× with a cap that provably matters.

**This is v7's question, not this PR's.** `v6-preceding` is live on
`voyager-dev` as migration 084 and the shipped contract is not changed here. The
open item for v7 is whether a subject line that is *fresh* — recomputed at the
tack change rather than fixed for the session — beats the preceding turn without
the fabrication. Answering it needs the two assertions this instrument lacks: a
`claim_absent` assertion, and a negative subject assertion that can fail a claim
for naming something the turn is not about. **Both would have scored `cubesat-11`
against `v6-subject` instead of scoring it against nobody.**

## Proof

- `recipes/cartographer-k5a-c3-local-proof.sh` — disposable Postgres, exit 0,
  markers `CARTOGRAPHER_K5A_083_IDEMPOTENT_GREEN`,
  `CARTOGRAPHER_V5_ACTIVATION_GREEN`,
  `CARTOGRAPHER_K5A_084_IDEMPOTENT_GREEN`,
  `CARTOGRAPHER_V6_ACTIVATION_GREEN`. Both migrations apply twice cleanly.
- Offline suite green, typecheck clean, no new lint warnings.
- Migrations 083 and 084 are **not applied to `voyager-dev`** in this branch.

## Not in this wave

Dedup / content-derived `claim_key` / reinforcement / retraction · persisting
`contextSnippet` · the temporal filter · the `remember_knowledge` double-write ·
widening the enqueue predicate to the six event shapes (the v5 readiness receipt
asks for it, but it changes which events get extracted at all and is nowhere in
this brief).

Deferred to the next contract: social-ack-with-content, meta-conversational
addition, negative-finding-as-fact, and `v2-ctl-core-explicit-07`.
