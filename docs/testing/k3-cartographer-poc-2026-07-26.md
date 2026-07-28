# K3 Cartographer proof-of-concept evidence

Status: `needs_attention`

This record covers the bounded Spec-phase proof of concept. It is not a
release, deployment, product Test Gate, or claim that K3 is ready to build.

## Identity

- Start revision: `ea64781d9ab8fabcc52132abecd9760bd4d3c7a2`
- Branch: `feature/k3-cartographer-poc`
- Reviewed specification digest:
  `e8252bae82b3806b992802b20c1658bd65930d6a1e8d4444b882bc7a799bdbb1`
- Authorized development project ref: `hpotfrfdigzmhyibihst`
- Forbidden primary project ref: `iesprdzzgjypnksoljym`
- Final local revision: the commit containing this evidence record; the side
  quest result records its exact hash.

The owner-only `.env.local` resolved independently to the authorized
development ref. A service-role REST preflight against that ref returned
`404 / PGRST205` for `knowledge_extractor_contracts`, proving migration 072 was
not already installed.

## Implemented proof slice

- Database-owned active extraction contract and `AFTER INSERT` human-event
  eligibility, without changing the K2 ingress signature.
- Mutable per-source jobs, immutable attempt starts, immutable terminal
  outcomes, bounded leases, audience-authorized oldest-job recovery, and exact
  source-job wakeup.
- One structured provider result with concrete model provenance, service-only
  raw output, stable `claim:0`, one derived KnowledgeUnit, `derived_from`
  evidence, and optional audience-constrained `about` Person evidence.
- Idempotent identical completion, byte-preserving claim-key conflict
  rejection, caller/raw-payload consistency checks, retry after provider
  failure, and denied non-service access.
- Clean removal of the threshold queue, source sentinel, message exclusions,
  two-stage extractor, and general graph-edge writer.

## Observed local evidence

| Check | Outcome |
|---|---|
| `recipes/cartographer-k3-local-proof.sh` | `CARTOGRAPHER_K3_LOCAL_GREEN` |
| 25 concurrent lease claims | one winner |
| expired lease recovery | one immutable `expired` outcome, then one new attempt |
| 25 identical completions | one graph fragment, all calls safely replayed |
| claim-key and caller/raw mismatch probes | rejected without unit mutation |
| outsider and authenticated-role probes | source work/evidence inaccessible; structural insert denied |
| `recipes/full-suite.sh` | `FULL_SUITE_GREEN`; 68 files, 370 tests |
| `npm run type-check` | passed |
| `npm run build` | passed with pre-existing framework/lint warnings |
| modified shell scripts under `bash -n` | passed |
| changed TypeScript and migration line cap | every file at or below 249 lines |
| `git diff --check` | passed |

The disposable database proof used the pinned local pgvector image with
`--pull=never` and `--network none`. Candidate schema and proof data stayed
inside that disposable container and were removed with it.

## Production-shaped evidence still required

The actual provider/local-application recipe did not run:

1. The documented local Supabase Management API token file was absent.
2. The documented Fedora credential fallback timed out before authentication.
3. No controllable signed-in browser was attached to this side-quest session.

The migration therefore was not applied to the development database, no PoC
room event or provider attempt was created, and there were no PoC rows to
clean up. No request targeted the primary project, and neither database
received a write.

The next bounded step is to attach a signed-in Chrome session or restore the
documented development Management API credential, reverify
`hpotfrfdigzmhyibihst`, apply only migration 072 there, and run the reviewed
two-account dev-room recipe. Until that evidence records the exact event,
audience, provider/model, tokens, unit, edges, denial probes, and cleanup
outcome, this PoC remains `needs_attention` and must not advance to post-PoC
review or the human Spec Gate.

## Non-blocking environment observations

- The installed Node runtime was v24 while `package.json` requests Node 20.
- Dependency installation reported 47 existing audit findings.
- The successful build retained existing Edge-runtime, image optimization,
  stale browser-data, and one hook-dependency warning.
- Running `tsc` concurrently with `next build` produced transient missing-file
  errors while the build rewrote `.next/types`; the documented typecheck
  result is the subsequent serial run against completed build output.
