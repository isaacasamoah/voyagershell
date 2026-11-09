# Generation-bound agent inbox experiment

This archived feasibility experiment observed two real interactive Codex agents
ask and answer through a small Python inbox and command. It establishes that
bounded exchange under the recorded Linux conditions. It does not implement
Voyager's Rust communication owner or establish the complete authority model.

The runner is archival. It inherited the default Core state home during the
recorded run. Do not rerun it until state storage/session isolation is corrected
and reviewed. The original state directory is retained untouched.

## Observed result

The agents used the installed Codex CLI 0.167.0 with `--no-daemon`,
`gpt-6.1-sol`, high effort and YOLO, launched as two new programs through
Herdr Core 0.1.19. There was no GUI input and no message to an existing agent.

The owner observed eight authenticated command calls: two identity inspections,
a question post, the other agent's read, its reply post, the first agent's read,
and two explicit acknowledgements. The reply answered the arithmetic question
with 42 and included the nonce from the actual question envelope. Task labels
stayed unchanged. The witness completed in 26.41 seconds. A post receipt alone
was not counted as delivery.

The socket obtained each command's Linux `SO_PEERCRED` identity. For this
`--no-daemon` run, every authenticated command process was a descendant of its
own Core-launched Codex PID with the recorded start time. The per-run context
also reached the provider's tool environment. This does not establish that a
shared provider daemon, another provider or a different launch mode has the
same process ancestry.

Cleanup completed after 27.25 seconds. Core returned both test terminals as
finished; the dedicated Core, owner and eight identified command processes
were observed absent, and the test sockets disappeared. Pre-existing selected
Core, Codex and Voyager process identities were unchanged. This is process
identity evidence, not a new GUI or full resource-lifetime proof. The cohort
filter skipped an original Core with a deleted executable link. A separate
comparison with an earlier retained receipt confirmed that Core's PID/start
and executable inode, both original Codex clients and two original shells.
The agents' final turn completion was not required or claimed; cleanup followed
the observed read/reply/acknowledgement chain.

## Source and controls

`inbox.py` supplies the substituted Python owner and thin command. Core owns
both real agent processes. `run.py` imports the maintained native Core,
process-identity and socket-peer helpers. It does not copy a native runner or
start a second program supervisor. `test_inbox.py` contains five pure owner
controls.

| Observation | Evidence category |
| --- | --- |
| Two agents post, read, reply and acknowledge with unchanged task labels | Actual Core programs, command processes and Unix socket events |
| Missing capability refuses | Actual Unix socket control |
| Wrong generation, retained duplicate conflict and peer assignment refuse | Pure Inbox tests |
| Repeated read retains the pending body until explicit acknowledgement | Pure Inbox test simulating a lost acknowledgement |
| Full 32-item inbox and oversized 8 KiB envelope refuse before admission | Pure Inbox test |
| Receipt eviction leaves its pending item readable | Pure Inbox test |

The prototype has one shared ring of 32 completed mutation receipts, keyed by
actor and request ID. It does not have 32 receipts per caller. A read does not
remove an item. An acknowledgement removes it. Evicted receipts report
unavailable and do not prove delivery or authorize automatic resubmission.

Source formatting, Python compilation and five tests pass. The recorded red
failed because the Inbox implementation did not yet exist. A post-run
`ruff check --select F` reports one redundant f-string prefix in the second
fixed prompt. Executed source is retained unchanged, including that finding.
No Rust or Node application checks ran because no product code changed.
Independent review is pending.

## Limits and retained deviation

The Python owner substitutes for product Rust types, caller binding and queue
integration. It has no production role registry, assignment engine, application
restart epoch, persistence or proved surviving-agent rebinding. The server uses
threads, not the product's eight-call queue. It has not been load-tested.

Direct Core body delivery was not selected or exercised. Core wakes were
explicitly disabled. Human drafts, busy-agent wake behavior, delayed wake after
exit to Bash and real exited-target admission were not tested. The socket
handler checks a target root PID/start before posting, but that source check
is not an observed exited-target refusal. A wrong-generation unit case does
not prove the exit case. Direct Core Codex launch also differs from Voyager's
Bash-return wrapper.

The Core endpoint used a private random runtime directory. The recorded
runner nevertheless inherited `XDG_STATE_HOME` and used a fixed Core session
name. Core created new state under its default state home. The directory birth
time matched this attempt, and startup reported zero live/finished terminals.
No existing process identity changed. This is an isolation deviation: do not
rerun this archived producer until state storage and the session name are
isolated and independently reviewed. No corrective model run was performed.

The result supports trying the pull-inbox boundary in the application owner.
It does not select optional wakes, assert language-model obedience, enforce
permissions against hostile same-user programs, or establish UX, latency,
physical presentation, Herdr parity or completed foundation acceptance.

## Accounting and reproduction

Normally formatted authored source is 272 lines of owner/command, 339 lines of
runner and 127 lines of tests. The run reuses 146 physical lines across the
named maintained helper functions. The private support ledger adds 284 conservative lines for inspection and
accounting oneoffs. The proving/support total is 896 lines, including reused
helpers, against the 272-line prototype owner. It exceeds the prototype
owner's size before those oneoffs, so no proof-size acceptance is claimed.
Count this experiment when combining later acceptance evidence; do not omit it
because it is exploratory.

The frozen private protocol records source hashes, exact launch argv, model
settings, artifact hashes, start/deadline, controls and substitutions. Raw
synthetic messages, process identities, capability files and receipts remain
outside Git. Public source contains no credentials or transcripts.

Non-model checks from this checkout are:

```sh
python3 -m unittest discover -s experiments/agent-communication-delivery -p test_inbox.py
python3 -m py_compile experiments/agent-communication-delivery/*.py
ruff format --check experiments/agent-communication-delivery
ruff check --select F experiments/agent-communication-delivery
```

The last command retains the one lint finding described above. These commands
cannot reproduce the real model exchange. A future real attempt needs a newly
reviewed private protocol, corrected isolation, current launch/runtime checks,
at most two fresh agents, a 15-minute cap and exact owned cleanup. No automatic
retry, merge, installation or live-viewer replacement follows from this record.

The source study used Voyager's `app/src/launch.rs`, `contract/src/launch.rs`,
`tests/native/proof_workspace.py`, `proof_process.py` and `proof_resources.py`.
The inspected Core [agent guide](https://github.com/herdrdev/herdr-core/blob/3ba03e6fc59fb974a4e2627586646f87ebbaf2ee/crates/herdr-core/src/SKILL.md),
[send API](https://github.com/herdrdev/herdr-core/blob/3ba03e6fc59fb974a4e2627586646f87ebbaf2ee/crates/herdr-core/src/api.rs#L448-L490),
[tagging](https://github.com/herdrdev/herdr-core/blob/3ba03e6fc59fb974a4e2627586646f87ebbaf2ee/crates/herdr-core/src/notes.rs#L140-L162)
and [state paths](https://github.com/herdrdev/herdr-core/blob/3ba03e6fc59fb974a4e2627586646f87ebbaf2ee/crates/herdr-core/src/paths.rs#L17-L24)
explain why a Core wake is separate from body retrieval and why runtime socket
isolation alone does not isolate saved state. These pinned source observations
are separate from the installed-runtime witness.
