# K4c conflict ledger — local structural proof (2026-08-01)

## Result

`recipes/cartographer-k4c-local-proof.sh` completed successfully against the
pinned pgvector PostgreSQL image in a disposable container with networking
disabled. It emitted:

```text
CARTOGRAPHER_K4C_LOCAL_GREEN
```

No live Supabase project or other live database was read or written. The
migration and its bounded eligibility backfill were exercised only inside the
disposable database.

## Observed battery

| Boundary               | Observed result                                                                                                                                                                                                                                                                                          |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Contract and enqueue   | `relation-conflict-v2` was active, its two verdicts and two-call identity were pinned, every pre-077 eligible unit/person pair received one job, and new room units fanned out to one job per person.                                                                                                    |
| Claim race             | Twenty-five concurrent `begin_relation_attempt` callers targeted one unit; exactly one immutable attempt won the lease.                                                                                                                                                                                  |
| Expiry and retry cap   | An expired lease recorded `expired`, a second provider failure returned the job to pending, and the third outcome exhausted the contract cap with the job `completed` and all lease columns null.                                                                                                        |
| Replay and convergence | Identical completion replayed from one stored outcome; a changed usage payload was rejected. Two people writing the same contradiction produced one canonical `graph_edges` row and two assertion rows.                                                                                       |
| Narrow writer          | A non-empty grant request and every forbidden edge kind (`authored_by`, `posted_in`, `reply_to`, `in_voyage`, `member_of`, `companion_of`, `derived_from`, `generated_by`, `about`, `supports`, `elaborates`, `relates_to`, `decided_by`, `raised_by`) completed as `commit_rejected`; none was written. |
| Assertion privacy      | The owner assertion included a private third input. The owner could traverse the room-to-room contradiction; the other room member could not until her independent assertion, whose inputs she could all read, converged on the same edge.                                                               |
| Evidence               | The accepted contradiction carried both endpoint source events in `graph_edge_evidence`.                                                                                                                                                                                                                 |
| Zero overlap           | Two compatible units co-filed under one topic were candidates, completed successfully with an empty verdict list, and produced no contradiction or supersession edge.                                                                                                                                    |
| Database authority     | Authenticated callers could not inspect relation attempts/outcomes or invoke the service-only begin writer.                                                                                                                                                                                              |

## Command

```bash
./recipes/cartographer-k4c-local-proof.sh
```

This proves the local migration, race, writer, traversal, and zero-edge
contracts. It does not prove the live `voyager-dev` migration, live provider
behavior, browser experience, or production behavior; those remain outside
this build and with the bridge.
