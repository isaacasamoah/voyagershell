# K4a interactive proof — memory that can be read

Status: `proved, with one named limitation`

Covers the interactive pass the K4a spec requires: memory written by K3 is read
back into a real Voyager turn, typed and attributed, without widening scope.
Not a release, deployment, or product Test Gate.

## Identity

- Branch: `feature/k4a-graph-memory-read`
- Revision proved: `362c734` (includes the merged `feature/codex-connection-trust`)
- Database: Supabase branch `voyager-dev`, ref `hpotfrfdigzmhyibihst`
- Forbidden primary ref `iesprdzzgjypnksoljym`: never contacted
- Migration `073` applied to the development branch 2026-07-28
- Bench: `next dev` on `localhost:3001` (isaacasamoah) and `127.0.0.1:3001`
  (elisheya), two real signed-in accounts, driven through `claude-has-hands`
- Model path: Isaac's reconnected Codex subscription (`openai.responses` /
  `gpt-5.5`); embeddings on `OPENAI_API_KEY` per the ruling of 2026-07-28

## Claim-by-claim

| Claim | Result | Evidence |
|---|---|---|
| **K4-C1** unit carries its own physics | **pass** | A typed room sentence produced a v2 unit with `knowledge_type=operational`, `attention_score=0.85`, and a 1536-dimension embedding. A private aside produced `knowledge_type=preference`, `0.9`. The classifications are meaningful, not nominal: a recurring appointment read as *operational*, a standing instruction as *preference*. |
| **K4-C2** reading never widens the audience | **pass — from the victim's seat** | Driven in Elisheya's own session, through her own Voyager. `graph_memory` returned exactly the 2 room-audience claims. Assertions over the full rendered page returned **false** for both of Isaac's private units ("coffee after 2pm", "two sentences"). The reply stated *"Not truncated — that's the complete reachable set"*, so the private units are absent rather than hidden behind a budget. Database-level expectation confirmed independently beforehand: Isaac 6 claims, Elisheya 4. |
| **K4-C3 / C4** bounded reach, honest degradation | **pass** | With `nodeBudget 1, frontierBudget 1` the tool returned **0 claims with `truncated: true`** and the note *"Partial graph reach: do not present this as a complete memory search."* This is the exact distinction that was broken on 2026-07-28 (see below). |
| **K4-C4** the read comes from the graph, not the projection | **pass** | The `knowledge_current` row for event `0568418e` was captured, deleted, and the unit remained reachable — through the RPC *and* through the product tool, which returned it with type and source attribution. The row was then restored and verified field-identical. |
| **K4-C4** reach is aware of working memory | **pass** | Isaac's preference unit, already present in standing context, is consistently absent from `graph_memory` results while both operational units are returned. |
| **K4-C5** preferences stand, knowledge is reached | **pass (graph door)** | The preference unit reaches turns through standing injection without a tool call; operational units arrive only via `graph_memory`. Per the corrected claim, the projection's own injections are out of scope until K5. |

## Defects this pass found (all fixed before it closed)

The interactive surface caught three things a green structural suite could not:

1. **A confident empty on a lost race.** `RPC_DEADLINE_MS` was 500 ms against a
   walk measuring 498–516 ms. The deadline race returned
   `{claims: [], truncated: false}` and Voyager told the user it had no
   memories. Budget overflow had been made honest; deadline and error had not.
   Fixed: five distinct outcome kinds, deadline now 8 s.
2. **The app rejecting its own identifiers.** `toClaim` validated UUIDs with an
   RFC version/variant regex. KnowledgeUnit ids are minted deterministically as
   `md5(format('voyager-unit:k3:…'))::uuid`, so their nibbles are arbitrary. The
   graph returned six claims and the runtime accepted one. Fixed to validate the
   canonical UUID text shape. Recorded in the project gotchas.
3. **A dead model credential reporting itself healthy.** Isaac changed ChatGPT
   accounts; the stored connection stayed `status: active` bound to the old
   account for eight days, and every model call failed while the fallback —
   which guards the lookup, not the call — never engaged. Fixed on
   `feature/codex-connection-trust` and merged here.

## Limitation

**Three K3-era units are invisible to the live read.** Units committed before
K4a carry `knowledge_type = NULL` and `attention_score = NULL`, so the runtime
validator correctly drops them. This is expected and bounded: gate decision 1
schedules exactly one backfill pass at K4b to write type, attention and
embeddings for pre-K4a units. Until then the live read surfaces v2 units only.
It cannot change the readiness decision — the claims are about whether reach
works and stays scoped, and both are answered on v2 units.

## Not proven, deliberately

K4b (topics) and K4c (relations) are unbuilt and out of scope. Database-role
denial probes were proved at K3 and were not repeated; today's evidence is the
stronger product-surface form. No production deployment, PR, or merge.

## Verification at `362c734`

| Check | Outcome |
|---|---|
| `npm run test:run` | 75 files, 401 tests passed |
| `npm run type-check` | passed |
| model-lane contract guard | generation via resolver, embeddings on the API key, per-call |
| `git diff --check` | passed |

## Data left behind

Six units, their nodes, grants, `derived_from` and `about` edges remain in the
`voyager-dev` fambam room, plus the extraction jobs and immutable attempts and
outcomes behind them. Deliberately not deleted: `knowledge_events` is
append-only and the extraction tables are immutable by trigger, so removing
them would mean defeating the guards this work exists to prove. The one
projection row deleted during the reread falsification was restored and
verified.
