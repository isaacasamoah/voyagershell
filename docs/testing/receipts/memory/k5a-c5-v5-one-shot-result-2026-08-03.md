# K5a C5 v5 one-shot result — 2026-08-03

Status: `K5A-V5-RESULT-FAIL`

## Verdict

**C5 fails and returns to Spec.** The completed v5 contract missed two gated bars: it emitted five durable claims from the 30-case hard core, where the bar permits zero, and it matched about-person on 39 of 40 positives, where the bar requires 100%. No prompt, corpus label, scoring stratum, or expected value changed after the run. There will be no second v5 revision or provider run against this corpus.

The same run passed meaning fidelity, the preference boundary, and the zeroing-direction type bar. Those passes do not override either gated failure.

## Sealed instrument

- Corpus commit: `da232cb`
- Harness execution commit: `18bd4a7dc88656ad4bbe604449af32e8d5e3d439`
- Corpus: `k5a-c5-labelled-v2`, 81 cases
- Canonical `{version,cases}` payload SHA-256: `47f188f48fde5ad93df3e7a8bcd5de03108fc074f17d05b981e4edd8a665345a`
- Plain corpus file SHA-256: `0acf018f06808635ad728f309e12ab971d2c86c89f7590b6fdc33cc254abb61a`
- Frozen v5 system-prompt SHA-256: `3ae9be74c09f0284034a5baddee82672a672e6006baa796c879f9baa425b4ce2`
- Measurement pair: `cartographer-single-claim-v5 × openai/gpt-5.5` (`model_provider = openai`, `model_id = gpt-5.5`)
- Provider executions: exactly one uninterrupted harness process; 81/81 structured results

The v5 prompt was frozen before corpus v2 existed. The harness recomputed and matched the canonical payload hash before model acquisition. The superseded 80-case hashes were not accepted by the harness and were not measured.

## Arm-by-arm result

| Arm | Bar | Result | Verdict |
|---|---:|---:|---|
| 1a Meaning fidelity | 100% | 40/40 faithful positive claims | **PASS** |
| 1b Hard-core false durability | zero false durable, n=30 | 5/30 false durable; 25/30 null | **FAIL** |
| 2a Preference boundary, both gated directions | 100% | 13/13 true preferences; 26/26 gated non-preferences did not return preference | **PASS** |
| 2b Zeroing-direction type error | zero `operational`/`preference` → `domain`, n=30 | 0/30 errors | **PASS** |
| 3 About-person exact attribution | 100%, n=40 | 39/40; `v2-pos-op-jira-03` omitted Mara | **FAIL** |
| 3′ Fabricated Person ID | zero | 0/40 | **PASS** |
| 4 Audience inheritance | 100%, structural | 3/3 human sources preserved source audience through job, attempt, outcome, unit, and grant; Voyager response did not enqueue | **PASS** |
| 1b′ Durability rim | reported, not gated, n=11 | 8 durable outputs; 3 null | reported |
| 2c `domain` → `operational` | reported; correct-domain rate collapse floor 0.60, n=9 | 1/9 error; 8/9 = 0.889 remained domain | above floor |
| Type rim | reported, not gated, n=1 | `v2-pos-op-explicit-02` returned `operational` | reported |
| C3 recoverable type dynamics | reached and below fresher higher-birth claim | mistyped operational claim returned at 0.18 behind fresh 0.90 claim | **PASS** |

Meaning fidelity was reviewed claim-by-claim against the frozen source and expected claim after the run. All 40 positive outputs are entailed by their source; narrower wording did not introduce a false attribution. The complete rows below make that judgment inspectable.

### Gated failures

Hard-core false-durable outputs:

- `v2-ctl-core-doc-03`: “Section 4 is a placeholder.”
- `v2-ctl-core-slack-02`: “Mara saved the author an hour.”
- `v2-ctl-core-slack-03`: “Mara is being added here so she has the context.”
- `v2-ctl-core-jira-04`: “The trace does not show where the retry loop starts.”
- `v2-ctl-core-explicit-07`: “The author's previous message was in the wrong thread.”

- About-person: `v2-pos-op-jira-03` expected Mara but returned `null`. The claim text and operational type were otherwise faithful. No output contained a Person ID outside the two supplied candidates.

## Structural falsifiers

Command: `./recipes/cartographer-k5a-c3-local-proof.sh` in a disposable, network-isolated pinned pgvector container. No hosted database was touched.

The first execution exposed a proof-fixture defect before the C3 assertion: both ingress events inherited PostgreSQL transaction time, so an in-transaction sleep could not order them. The fixture now assigns an explicit chronology while the source-immutability trigger is disabled only for those two disposable rows, restores the trigger before invoking product functions, and rolls back the transaction. No product function or acceptance bar changed. The first corrective execution returned `CARTOGRAPHER_K5A_C3_LOCAL_GREEN`, which includes exact checks for `CARTOGRAPHER_K5A_C3_V5_DYNAMICS_GREEN` and `CARTOGRAPHER_K5A_C5_STRUCTURAL_GREEN`.

## Full per-case table

| ID | Stratum / event | Source | Expected claim | Actual claim | Type expected → actual | About expected → actual | Arm result |
|---|---|---|---|---|---|---|---|
| `v2-ctl-core-doc-01` | control-hard-core<br>document | “Open question for the design review: we have not chosen between the single-queue and the sharded-queue design. Both remain on the table until the load test comes back.” | `null` | `null` | `null → domain` | `null` → `null` | 1b PASS — null |
| `v2-ctl-core-doc-02` | control-hard-core<br>document | “Legal will come back with a position on settlement-log retention after their review, and the policy follows from that.” | `null` | `null` | `null → domain` | `null` → `null` | 1b PASS — null |
| `v2-ctl-core-doc-03` | control-hard-core<br>document | “Section 4 is a placeholder. Nobody has written the failure-handling section yet.” | `null` | “Section 4 is a placeholder.” | `null → domain` | `null` → `null` | 1b **FAIL** — false durable |
| `v2-ctl-core-doc-04` | control-hard-core<br>document | “Decision log, entry 12: no decision. The group could not agree on whether refunds stay reversible past thirty days, and will revisit.” | `null` | `null` | `null → domain` | `null` → `null` | 1b PASS — null |
| `v2-ctl-core-doc-05` | control-hard-core<br>document | “Owner of the reconciliation runbook: TBD.” | `null` | `null` | `null → domain` | `null` → `null` | 1b PASS — null |
| `v2-ctl-core-doc-06` | control-hard-core<br>document | “Risks: it is not yet clear whether the sharded design meets the p99 target. The load test will tell us.” | `null` | `null` | `null → domain` | `null` → `null` | 1b PASS — null |
| `v2-ctl-core-doc-07` | control-hard-core<br>document | “Naming for the new service is up in the air. Three candidates are listed below and none has been picked.” | `null` | `null` | `null → domain` | `null` → `null` | 1b PASS — null |
| `v2-ctl-core-slack-01` | control-hard-core<br>slack_message | “morning all 👋” | `null` | `null` | `null → domain` | `null` → `null` | 1b PASS — null |
| `v2-ctl-core-slack-02` | control-hard-core<br>slack_message | “thanks Mara, that saved me an hour” | `null` | “Mara saved the author an hour.” | `null → domain` | `null` → Mara | 1b **FAIL** — false durable |
| `v2-ctl-core-slack-03` | control-hard-core<br>slack_message | “adding Mara here so she has the context 👆” | `null` | “Mara is being added here so she has the context.” | `null → domain` | `null` → Mara | 1b **FAIL** — false durable |
| `v2-ctl-core-slack-04` | control-hard-core<br>slack_message | “we still haven't landed on whether the legacy webhook stays. leaving it open until the vendor call” | `null` | `null` | `null → domain` | `null` → `null` | 1b PASS — null |
| `v2-ctl-core-slack-05` | control-hard-core<br>slack_message | “I'll write up my thinking on the pricing tiers and post it in here later today” | `null` | `null` | `null → domain` | `null` → `null` | 1b PASS — null |
| `v2-ctl-core-slack-06` | control-hard-core<br>slack_message | “no idea yet what's causing the duplicate settlements — still digging” | `null` | `null` | `null → domain` | `null` → `null` | 1b PASS — null |
| `v2-ctl-core-slack-07` | control-hard-core<br>slack_message | “still waiting on the vendor to tell us whether they support partial refunds” | `null` | `null` | `null → domain` | `null` → `null` | 1b PASS — null |
| `v2-ctl-core-slack-08` | control-hard-core<br>slack_message | “I'll come back to you on the pricing question — need to look at the numbers first” | `null` | `null` | `null → operational` | `null` → `null` | 1b PASS — null |
| `v2-ctl-core-jira-01` | control-hard-core<br>jira_update | “ORU-412 — comment: blocked pending finance's decision on whether we refund the fees. Nothing to action until they answer.” | `null` | `null` | `null → domain` | `null` → `null` | 1b PASS — null |
| `v2-ctl-core-jira-02` | control-hard-core<br>jira_update | “ORU-388 — comment: acknowledged, thanks for the write-up.” | `null` | `null` | `null → domain` | `null` → `null` | 1b PASS — null |
| `v2-ctl-core-jira-03` | control-hard-core<br>jira_update | “ORU-401 — comment: I'll drop the query plan in this ticket once I've run it against the bigger dataset.” | `null` | `null` | `null → domain` | `null` → `null` | 1b PASS — null |
| `v2-ctl-core-jira-04` | control-hard-core<br>jira_update | “ORU-455 — comment: root cause is still unknown; the trace doesn't show where the retry loop starts.” | `null` | “The trace does not show where the retry loop starts.” | `null → domain` | `null` → `null` | 1b **FAIL** — false durable |
| `v2-ctl-core-jira-05` | control-hard-core<br>jira_update | “ORU-470 — comment: the cutover date is still to be picked.” | `null` | `null` | `null → domain` | `null` → `null` | 1b PASS — null |
| `v2-ctl-core-jira-06` | control-hard-core<br>jira_update | “ORU-478 — comment: parking this until we know what the compliance answer is.” | `null` | `null` | `null → domain` | `null` → `null` | 1b PASS — null |
| `v2-ctl-core-jira-07` | control-hard-core<br>jira_update | “ORU-482 — comment: 👍” | `null` | `null` | `null → domain` | `null` → `null` | 1b PASS — null |
| `v2-ctl-core-explicit-01` | control-hard-core<br>explicit | “I don't know yet whether we keep the second region. Ask me again after the cost review.” | `null` | `null` | `null → operational` | `null` → `null` | 1b PASS — null |
| `v2-ctl-core-explicit-02` | control-hard-core<br>explicit | “Thanks, that's exactly what I needed.” | `null` | `null` | `null → domain` | `null` → `null` | 1b PASS — null |
| `v2-ctl-core-explicit-03` | control-hard-core<br>explicit | “I'll tell you what I decide about the onboarding flow once I've slept on it.” | `null` | `null` | `null → domain` | `null` → `null` | 1b PASS — null |
| `v2-ctl-core-explicit-04` | control-hard-core<br>explicit | “Hey — just checking in.” | `null` | `null` | `null → domain` | `null` → `null` | 1b PASS — null |
| `v2-ctl-core-explicit-05` | control-hard-core<br>explicit | “Whether Mara takes over the settlement work is still open between her and Devi.” | `null` | `null` | `null → domain` | `null` → `null` | 1b PASS — null |
| `v2-ctl-core-explicit-06` | control-hard-core<br>explicit | “The retention window is a call I still have to make; the legal note lands first.” | `null` | `null` | `null → domain` | `null` → `null` | 1b PASS — null |
| `v2-ctl-core-explicit-07` | control-hard-core<br>explicit | “Ignore my last message, wrong thread.” | `null` | “The author's previous message was in the wrong thread.” | `null → domain` | `null` → `null` | 1b **FAIL** — false durable |
| `v2-ctl-core-explicit-08` | control-hard-core<br>explicit | “I'll let you know once we've agreed on the escalation thresholds.” | `null` | `null` | `null → domain` | `null` → `null` | 1b PASS — null |
| `v2-ctl-rim-doc-01` | control-rim<br>document | “The settlement service runs on the shared worker pool.” | `null` | “The settlement service runs on the shared worker pool.” | `null → domain` | `null` → `null` | 1b′ reported — durable |
| `v2-ctl-rim-doc-02` | control-rim<br>document | “There are forty-two open tickets in the reconciliation epic.” | `null` | “The reconciliation epic has forty-two open tickets.” | `null → domain` | `null` → `null` | 1b′ reported — durable |
| `v2-ctl-rim-doc-03` | control-rim<br>document | “The staging environment points at the dev database.” | `null` | “The staging environment points at the dev database.” | `null → domain` | `null` → `null` | 1b′ reported — durable |
| `v2-ctl-rim-slack-01` | control-rim<br>slack_message | “the backfill is running against the 2024 batches” | `null` | `null` | `null → domain` | `null` → `null` | 1b′ reported — null |
| `v2-ctl-rim-slack-02` | control-rim<br>slack_message | “we're on Postgres 15 now” | `null` | “The team is using Postgres 15.” | `null → domain` | `null` → `null` | 1b′ reported — durable |
| `v2-ctl-rim-slack-03` | control-rim<br>slack_message | “Devi is covering on-call this rotation” | `null` | “Devi is covering on-call this rotation.” | `null → domain` | `null` → `null` | 1b′ reported — durable |
| `v2-ctl-rim-jira-01` | control-rim<br>jira_update | “ORU-433 — comment: the flag is enabled for ten percent of traffic.” | `null` | “The flag is enabled for ten percent of traffic.” | `null → domain` | `null` → `null` | 1b′ reported — durable |
| `v2-ctl-rim-jira-02` | control-rim<br>jira_update | “ORU-419 — comment: this one is mine at the moment.” | `null` | `null` | `null → domain` | `null` → `null` | 1b′ reported — null |
| `v2-ctl-rim-jira-03` | control-rim<br>jira_update | “ORU-462 — comment: p95 on the settlement endpoint is sitting around 340ms.” | `null` | “The settlement endpoint's p95 latency is around 340 ms.” | `null → domain` | `null` → `null` | 1b′ reported — durable |
| `v2-ctl-rim-explicit-01` | control-rim<br>explicit | “I'm working out of the Melbourne office at the moment.” | `null` | `null` | `null → domain` | `null` → `null` | 1b′ reported — null |
| `v2-ctl-rim-explicit-02` | control-rim<br>explicit | “My calendar is pretty clear this week.” | `null` | “The author's calendar is pretty clear this week.” | `null → domain` | `null` → author | 1b′ reported — durable |
| `v2-pos-pref-doc-01` | positive-preference<br>document | “Author's note on process: I prefer design reviews to happen before implementation starts, not after there is code to defend.” | “The author prefers design reviews to happen before implementation starts.” | “The author prefers design reviews to happen before implementation starts, rather than after there is code to defend.” | `preference → preference` | author → author | 1a PASS; 2a PASS; 2b PASS; 3 PASS |
| `v2-pos-pref-doc-02` | positive-preference<br>document | “Mara would rather we ship narrow slices than batch a quarter of work into one release.” | “Mara would rather ship narrow slices than batch a quarter of work into a single release.” | “Mara prefers shipping narrow slices rather than batching a quarter of work into one release.” | `preference → preference` | Mara → Mara | 1a PASS; 2a PASS; 2b PASS; 3 PASS |
| `v2-pos-pref-doc-03` | positive-preference<br>document | “I don't like long-lived feature branches; I'd rather merge early behind a flag.” | “The author dislikes long-lived feature branches and prefers merging early behind a flag.” | “The author does not like long-lived feature branches and prefers merging early behind a flag.” | `preference → preference` | author → author | 1a PASS; 2a PASS; 2b PASS; 3 PASS |
| `v2-pos-pref-slack-01` | positive-preference<br>slack_message | “honestly I'd rather we didn't add another queue — I like keeping the moving parts countable” | “The author prefers not to add another queue and likes keeping the number of moving parts small.” | “The author prefers not to add another queue and likes keeping the number of moving parts countable.” | `preference → preference` | author → author | 1a PASS; 2a PASS; 2b PASS; 3 PASS |
| `v2-pos-pref-slack-02` | positive-preference<br>slack_message | “Mara wants the incident write-up done within a day of the incident, every time” | “Mara wants incident write-ups completed within a day of the incident.” | “Mara wants the incident write-up done within a day of the incident every time.” | `preference → preference` | Mara → Mara | 1a PASS; 2a PASS; 2b PASS; 3 PASS |
| `v2-pos-pref-slack-03` | positive-preference<br>slack_message | “I hate being pinged in DMs for anything that isn't paging-level urgent” | “The author dislikes being pinged in DMs for anything that is not paging-level urgent.” | “The author hates being pinged in DMs for anything that is not paging-level urgent.” | `preference → preference` | author → author | 1a PASS; 2a PASS; 2b PASS; 3 PASS |
| `v2-pos-pref-jira-01` | positive-preference<br>jira_update | “ORU-390 — comment: as a standing preference on this codebase I'd rather fix a root cause than add another retry.” | “The author prefers fixing root causes over adding retries in this codebase.” | “The author prefers fixing root causes over adding another retry on this codebase.” | `preference → preference` | author → author | 1a PASS; 2a PASS; 2b PASS; 3 PASS |
| `v2-pos-pref-jira-02` | positive-preference<br>jira_update | “ORU-404 — comment: Mara prefers tickets to carry a reproduction before they get triaged.” | “Mara prefers tickets to carry a reproduction before they are triaged.” | “Mara prefers tickets to include a reproduction before they are triaged.” | `preference → preference` | Mara → Mara | 1a PASS; 2a PASS; 2b PASS; 3 PASS |
| `v2-pos-pref-jira-03` | positive-preference<br>jira_update | “ORU-421 — comment: I like acceptance criteria kept in the ticket rather than in a linked doc.” | “The author likes acceptance criteria kept in the ticket rather than in a linked document.” | “The author prefers acceptance criteria to be kept in the ticket rather than in a linked document.” | `preference → preference` | author → author | 1a PASS; 2a PASS; 2b PASS; 3 PASS |
| `v2-pos-pref-explicit-01` | positive-preference<br>explicit | “I want you to give me the short answer first and the reasoning after.” | “The author wants the short answer first and the reasoning after.” | “The author wants the short answer first and the reasoning after.” | `preference → preference` | author → author | 1a PASS; 2a PASS; 2b PASS; 3 PASS |
| `v2-pos-pref-explicit-02` | positive-preference<br>explicit | “I'd rather read a table than a paragraph when there are more than three options.” | “The author prefers a table to a paragraph when there are more than three options.” | “The author prefers reading a table rather than a paragraph when there are more than three options.” | `preference → preference` | author → author | 1a PASS; 2a PASS; 2b PASS; 3 PASS |
| `v2-pos-pref-explicit-03` | positive-preference<br>explicit | “Mara likes her code reviews blunt — she finds hedging harder to act on.” | “Mara likes her code reviews blunt.” | “Mara likes blunt code reviews because she finds hedging harder to act on.” | `preference → preference` | Mara → Mara | 1a PASS; 2a PASS; 2b PASS; 3 PASS |
| `v2-pos-pref-explicit-04` | positive-preference<br>explicit | “I choose Tuesday mornings for deep work and I protect that block.” | “The author chooses Tuesday mornings for deep work and protects that block.” | “The author chooses Tuesday mornings for deep work.” | `preference → preference` | author → author | 1a PASS; 2a PASS; 2b PASS; 3 PASS |
| `v2-pos-op-doc-01` | positive-operational<br>document | “Any change touching the payments schema needs a second reviewer before it merges.” | “A change touching the payments schema requires a second reviewer before merge.” | “Any change touching the payments schema needs a second reviewer before it merges.” | `operational → operational` | `null` → `null` | 1a PASS; 2a PASS; 2b PASS; 3 PASS |
| `v2-pos-op-doc-02` | positive-operational<br>document | “Drain the settlement queue before restarting a worker.” | “Drain the settlement queue before restarting a worker.” | “Drain the settlement queue before restarting a worker.” | `operational → operational` | `null` → `null` | 1a PASS; 2a PASS; 2b PASS; 3 PASS |
| `v2-pos-op-doc-03` | positive-operational<br>document | “The runbook is explicit: rotate the signing key before revoking the old one, never the other way round.” | “Rotate the signing key before revoking the old one, never the reverse.” | “Rotate the signing key before revoking the old signing key, never the other way around.” | `operational → operational` | `null` → `null` | 1a PASS; 2a PASS; 2b PASS; 3 PASS |
| `v2-pos-op-doc-04` | positive-operational<br>document | “When a customer reports a duplicate charge, open a P2 before replying to them.” | “When a customer reports a duplicate charge, open a P2 before replying.” | “When a customer reports a duplicate charge, a P2 must be opened before replying to them.” | `operational → operational` | `null` → `null` | 1a PASS; 2a PASS; 2b PASS; 3 PASS |
| `v2-pos-op-doc-05` | positive-operational<br>document | “Ask Mara before changing anything in the settlement schema.” | “Ask Mara before changing anything in the settlement schema.” | “Mara must be asked before anything is changed in the settlement schema.” | `operational → operational` | Mara → Mara | 1a PASS; 2a PASS; 2b PASS; 3 PASS |
| `v2-pos-op-slack-01` | positive-operational<br>slack_message | “rule going forward: no merges to main on Fridays” | “Do not merge to main on Fridays.” | “No merges to main on Fridays.” | `operational → operational` | `null` → `null` | 1a PASS; 2a PASS; 2b PASS; 3 PASS |
| `v2-pos-op-slack-02` | positive-operational<br>slack_message | “if the reconciliation job fails twice in a row, page the on-call instead of retrying it by hand” | “If the reconciliation job fails twice in a row, page the on-call rather than retrying by hand.” | “If the reconciliation job fails twice in a row, page the on-call instead of retrying it by hand.” | `operational → operational` | `null` → `null` | 1a PASS; 2a PASS; 2b PASS; 3 PASS |
| `v2-pos-op-slack-03` | positive-operational<br>slack_message | “always attach the trace ID when you escalate a settlement bug” | “Always attach the trace ID when escalating a settlement bug.” | “Attach the trace ID whenever escalating a settlement bug.” | `operational → operational` | `null` → `null` | 1a PASS; 2a PASS; 2b PASS; 3 PASS |
| `v2-pos-op-slack-04` | positive-operational<br>slack_message | “run the migration on the replica first, then the primary — that ordering matters” | “Run the migration on the replica before the primary.” | “Run the migration on the replica before running it on the primary; that ordering matters.” | `operational → operational` | `null` → `null` | 1a PASS; 2a PASS; 2b PASS; 3 PASS |
| `v2-pos-op-jira-01` | positive-operational<br>jira_update | “ORU-410 — comment: tickets in this epic should carry the affected merchant ID before they move to In Progress.” | “Tickets in this epic should carry the affected merchant ID before moving to In Progress.” | “Tickets in the ORU-410 epic should carry the affected merchant ID before they move to In Progress.” | `operational → operational` | `null` → `null` | 1a PASS; 2a PASS; 2b PASS; 3 PASS |
| `v2-pos-op-jira-02` | positive-operational<br>jira_update | “ORU-425 — comment: close the parent only after every child is closed.” | “Close a parent ticket only after every child ticket is closed.” | “Close the parent only after every child is closed.” | `operational → operational` | `null` → `null` | 1a PASS; 2a PASS; 2b PASS; 3 PASS |
| `v2-pos-op-jira-03` | positive-operational<br>jira_update | “ORU-438 — comment: anything with customer money in it has to go through Mara before it ships.” | “Anything involving customer money must go through Mara before it ships.” | “Anything with customer money in it must go through Mara before it ships.” | `operational → operational` | Mara → `null` | 1a PASS; 2a PASS; 2b PASS; 3 FAIL |
| `v2-pos-op-jira-04` | positive-operational<br>jira_update | “ORU-449 — comment: don't reuse settlement batch IDs — mint a new one per run.” | “Do not reuse settlement batch IDs; mint a new one per run.” | “Settlement batch IDs must not be reused; a new settlement batch ID must be minted for each run.” | `operational → operational` | `null` → `null` | 1a PASS; 2a PASS; 2b PASS; 3 PASS |
| `v2-pos-op-jira-05` | positive-operational<br>jira_update | “ORU-486 — comment: I'm making this the rule for the epic going forward: no schema migration merges without a rollback script in the same PR.” | “No schema migration merges without a rollback script in the same PR.” | “For the ORU-486 epic, schema migration merges must include a rollback script in the same PR.” | `operational → operational` | `null` → `null` | 1a PASS; 2a PASS; 2b PASS; 3 PASS |
| `v2-pos-op-explicit-01` | positive-operational<br>explicit | “Check the ORU ticket before reporting the state of a piece of work.” | “Check the ORU ticket before reporting the state of a piece of work.” | “Check the ORU ticket before reporting the state of a piece of work.” | `operational → operational` | `null` → `null` | 1a PASS; 2a PASS; 2b PASS; 3 PASS |
| `v2-pos-op-explicit-02` | positive-type-rim<br>explicit | “If something touches production data, tell me before you do it, not after.” | “Tell the author before touching production data, not after.” | “Tell the author before doing anything that touches production data, not after.” | `operational → operational` | author → author | 1a PASS; type-rim reported — operational; 3 PASS |
| `v2-pos-op-explicit-03` | positive-operational<br>explicit | “Escalate to the duty manager first; never page an engineer directly.” | “Escalate to the duty manager first and never page an engineer directly.” | “Escalations must go to the duty manager first, and engineers must not be paged directly.” | `operational → operational` | `null` → `null` | 1a PASS; 2a PASS; 2b PASS; 3 PASS |
| `v2-pos-op-explicit-04` | positive-operational<br>explicit | “Before archiving a Voyage, export its knowledge units — once it's archived you can't.” | “Export a Voyage's knowledge units before archiving it.” | “Export a Voyage's knowledge units before archiving the Voyage, because knowledge units cannot be exported once the Voyage is archived.” | `operational → operational` | `null` → `null` | 1a PASS; 2a PASS; 2b PASS; 3 PASS |
| `v2-pos-dom-doc-01` | positive-domain<br>document | “The owner of record for the settlement pipeline is Mara.” | “Mara is the owner of record for the settlement pipeline.” | “Mara is the owner of record for the settlement pipeline.” | `domain → domain` | Mara → Mara | 1a PASS; 2a PASS; 2c reported — domain; 3 PASS |
| `v2-pos-dom-doc-02` | positive-domain<br>document | “The reconciliation job is idempotent: rerunning it on the same batch produces no extra ledger entries.” | “The reconciliation job is idempotent; rerunning it on the same batch produces no extra ledger entries.” | “The reconciliation job is idempotent: rerunning it on the same batch produces no extra ledger entries.” | `domain → domain` | `null` → `null` | 1a PASS; 2a PASS; 2c reported — domain; 3 PASS |
| `v2-pos-dom-slack-01` | positive-domain<br>slack_message | “the on-call rota lives in the #ops-rota channel topic, not in the wiki” | “The on-call rota lives in the #ops-rota channel topic rather than the wiki.” | “The on-call rota is in the #ops-rota channel topic, not in the wiki.” | `domain → domain` | `null` → `null` | 1a PASS; 2a PASS; 2c reported — domain; 3 PASS |
| `v2-pos-dom-slack-02` | positive-domain<br>slack_message | “I always run the linter before I push — been my habit for years” | “The author always runs the linter before pushing.” | “The author habitually runs the linter before pushing code.” | `domain → domain` | author → author | 1a PASS; 2a PASS; 2c reported — domain; 3 PASS |
| `v2-pos-dom-slack-03` | positive-domain<br>slack_message | “production flag changes go through the incident lead” | “Production flag changes go through the incident lead.” | “Production flag changes go through the incident lead.” | `domain → operational` | `null` → `null` | 1a PASS; 2a PASS; 2c reported — operational; 3 PASS |
| `v2-pos-dom-jira-01` | positive-domain<br>jira_update | “ORU-441 — comment: Devi owns the CI runners.” | “Devi owns the CI runners.” | “Devi owns the CI runners.” | `domain → domain` | `null` → `null` | 1a PASS; 2a PASS; 2c reported — domain; 3 PASS |
| `v2-pos-dom-jira-02` | positive-domain<br>jira_update | “ORU-457 — comment: the vendor decision sits with the finance team, whoever ends up making the call.” | “The vendor decision sits with the finance team.” | “The vendor decision sits with the finance team.” | `domain → domain` | `null` → `null` | 1a PASS; 2a PASS; 2c reported — domain; 3 PASS |
| `v2-pos-dom-explicit-01` | positive-domain<br>explicit | “The platform team prefers Terraform to Pulumi.” | “The platform team prefers Terraform to Pulumi.” | “The platform team prefers Terraform to Pulumi.” | `domain → domain` | `null` → `null` | 1a PASS; 2a PASS; 2c reported — domain; 3 PASS |
| `v2-pos-dom-explicit-02` | positive-domain<br>explicit | “Voyager's knowledge units are immutable once written.” | “Voyager's knowledge units are immutable once written.” | “Voyager's knowledge units are immutable once written.” | `domain → domain` | `null` → `null` | 1a PASS; 2a PASS; 2c reported — domain; 3 PASS |

## Stop boundary

C5 is below bar and returns to Spec. Migration 080 remains un-authored, migration 081 remains untouched, no hosted database was changed, and this corpus will not be used for a tuned second v5 revision.
