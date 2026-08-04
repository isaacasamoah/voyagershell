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

Corpus `cubesat-session-v1`, payload SHA `0e49b2efc5747bb16110ed53a5f6bcaaa6e0bdeec142966c6e7202832bf6c0c7`. Four arms in one process, one
variable at a time.

**The committed fixture is REDUCED FOR PRIVACY to the five ruled cases.** That is
not a claim that five cases is the better instrument — it is not, and the noise
described below is a direct consequence. The full session ran 28 turns / 13 user
messages; each retained case carries the preceding turn truncated to the 1200
characters the runtime actually sends. Restoring the other eight messages is a
small edit and changes nothing about what is asserted here.

Five ruled cases:

| Case | Message | Expectation |
|---|---|---|
| `cubesat-06` | "lets mostly look out at space" | must **not** be `preference` |
| `cubesat-07` | "space craft survivability" | claim must name the subject |
| `cubesat-08` | "ok, lets esign it, what components do we need?" | claim must name the subject |
| `cubesat-09` | "nice, ok lets layout the costs" | claim must name the subject |
| `cubesat-12` | "…your answers are way too long, lets do more concise answers from now on" | **must remain** `preference` |

`cubesat-12` is the regression guard. The v4 extraction of it was correct
behaviour and tuning it away would be a real loss, not a fix.

`cubesat-07`, `08` and `09` are scored on the word "cubesat" only. An earlier
version of this instrument also accepted "survivability" for `cubesat-07` — but
that message *contains* the word, so the baseline would have passed without ever
recovering the missing subject. The instrument was tightened and re-sealed
before either reported run.

### Result — the fix is partial, and the two context shapes are indistinguishable

The four-arm instrument was run twice: once against the full 13-user-message
session, and once against the privacy-reduced 5-case fixture that ships. **The
two runs disagree about which context shape wins.**

| Arm | Run 1 (13 cases) | Run 2 (5 ruled cases, shipped fixture) |
|---|---|---|
| `v5-none` (baseline) | 1/5 | 1/5 |
| `v6-none` | 1/5 | 1/5 |
| `v6-subject` | 2/5 | **3/5** |
| `v6-preceding` (shipped) | **2/5** | 1/5 |

Per ruled case, run 2:

| Case | `v5-none` | `v6-none` | `v6-subject` | `v6-preceding` |
|---|---|---|---|---|
| `cubesat-06` not preference | FAIL | FAIL | FAIL | FAIL |
| `cubesat-07` subject | FAIL (null) | FAIL (null) | FAIL (null) | FAIL (null) |
| `cubesat-08` subject | FAIL (null) | FAIL (null) | **PASS** | FAIL (null) |
| `cubesat-09` subject | FAIL (null) | FAIL | **PASS** | FAIL |
| `cubesat-12` **regression guard** | PASS | PASS | PASS | PASS |

**Five ruled cases cannot separate the two context shapes.** `cubesat-08` and
`cubesat-09` flip between arms across runs. Any statement that one shape beats
the other on this evidence would be reading noise. Taken together the subject
line is ahead (5/10 versus 3/10 across both runs), which is suggestive and not
conclusive.

Token cost, counted on the exact strings the runtime sends (5-case fixture):

| Arm | Mean input tokens | vs baseline |
|---|---|---|
| `v5-none` | 691 | 1.00× |
| `v6-none` | 791 | 1.14× |
| `v6-subject` | 805 | 1.16× |
| `v6-preceding` | 1,058 | 1.53× |

Measured against the full 13-message session before privacy reduction, the same
arms cost 697 / 797 / 811 / 988, and an **uncapped** preceding turn cost 1,628 —
**2.34×**. That figure is recorded here rather than emitted by the token script,
because the shipped fixture stores only the capped slice and could not reproduce
it. It is the evidence that the 1200-character cap is load-bearing.

### What is stable across both runs

**The regression guard holds in all eight arm-runs.** "your answers are way too
long, lets do more concise answers from now on" classifies as `preference` every
time, including with a CubeSat subject line stamped on that compound message.
That was the thing most at risk and it never broke.

**Context resolves reference. It does not fix classification.** `cubesat-06`
recovers the subject in every context arm in both runs —

- without context: *"Isaac wants to mostly look out at space."*
- with context: *"Isaac wants the CubeSat mission to mostly look out at space."*

— and is **still** typed `preference` every time. It is an answer to Voyager's
question, not a disposition. The v6 sentence written to catch exactly this
(*"A source event that merely answers a question posed in the context states the
answer, not a preference for it"*) did not move it once. That is a
classification defect and it belongs to the next contract.

**`cubesat-07` returns a null claim in all arms, both runs.** Not a
subject-recovery failure — the extractor declines to find any durable claim in
"space craft survivability".

### Why `v6-preceding` ships, on architecture rather than score

The score does not support the choice, and this receipt does not pretend it
does. The deciding fact is that **the subject line has no source.**
`sessions.title` exists but its writer, `set_session_title()`, was dropped in
`059_session_authority_cleanup.sql`. Nothing writes it. Shipping the subject-line
arm means first building a titler and paying a summary call per session — real
work, outside this wave, to buy a difference this instrument cannot measure.

The preceding turn needs no machinery that does not already exist, tracks the
topic drift this session demonstrates, and costs 1.53× with a cap that provably
matters.

**If the subject line is revisited, this is the open question to settle first,
with a larger instrument.** Five cases was enough to protect the regression
guard and to show that reference resolution works; it is not enough to choose
between two ways of supplying context.

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
