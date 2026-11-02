# General research progress, recorded in OmniGraph

This isolated experiment records and shares research progress. It supplies a
domain-neutral graph configuration and a reproducible trial with two examples:
an arithmetic claim and a meaning-preserving sentence rewrite. It implements
no application interface, research solver, scheduler or notification service.

`cluster.yaml` declares the graph. `progress.pg` defines its records and
`progress.gq` defines its reads plus a conditional problem-revision operation.

There are two configuration layers. `progress.pg` defines the graph structure.
`progress.gq` defines the executed rules for reading progress and revising a
problem. `usage.yaml` proposes the wider rules for an agent using that graph,
with explicit record and query bindings. Each rule identifies what the trial
exercises and what remains proposed. No runtime adapter loads that usage profile
yet. Renaming graph roles requires updating the bindings and queries; arbitrary
schemas do not work automatically.

The proposed Jev choice rule follows TypeSafe's [model](https://docs.typesafe.ai/models)
and [Choice](https://docs.typesafe.ai/primitives/choice) documentation, inspected
on 2 November 2026. It names `jev-1.14.0` and retains the options, probabilities,
model and usage. Confidence describes the distribution, not scientific truth.
No Jev request was made in this trial.

## Run the trial

Use Python 3 and the official OmniGraph **0.14.0** release. Check
`omnigraph version` for HTTP contract 0.14 and the release source revision.
No server, account, embedding provider or system installation is needed.

The writing critique is a recorded model contribution. Obtain its JSON from the
trial evidence bundle, or obtain a new critique using `writing-review-request.json`
and label its provenance accurately. Supply its path explicitly. A rerun
replays that recorded input; it does not call a model or establish agreement
with another assessor.

From this experiment directory:

```sh
python3 prove.py --binary /path/to/omnigraph --review /path/to/writing-review.json --output /tmp/new-research-trial
```

The output path must not exist. The command validates the configuration,
computes bounded arithmetic and word counts, loads progress in two stages,
executes the research and participant queries, and checks failure and restore
cases. It saves the raw artifacts, full graph export, query results, command
receipts and source hashes. It changes no existing graph or running service.

## Read or contribute

Use the same binary, query file and resulting `research.omni` directory:

```sh
omnigraph query research_brief --query progress.gq --target /tmp/new-research-trial/research.omni --params '{"problem":"writing"}' --format json
omnigraph query ready_contributions --query progress.gq --target /tmp/new-research-trial/research.omni --params '{"problem":"writing"}' --format json
omnigraph query updates_for --query progress.gq --target /tmp/new-research-trial/research.omni --params '{"participant":"newcomer","after":0}' --format json
```

Start with `research_brief`, `criteria`, `qualified_assessments` and
`ready_contributions`. Open `assessment_history`, `assessment_evidence`,
`hypothesis_evidence` and `candidates` to investigate. `next_contributions`
includes waiting invitations; `contribution_dependencies` explains why they
wait. An invitation ready for consideration is not execution permission.

Capture new contributions with fresh record identities and strict append loads.
Preserve the old attempts, their scopes and raw evidence. A protocol captures
the evaluation contract; assessments copy its method and qualification terms
and the relevant criterion fields. Changed terms or a changed problem revision
remove the old assessment from the qualified view until reassessed. The history
remains available. `revise_problem` changes a problem only at the expected
revision and requires a higher replacement revision.

Participant interest links select updates. Every update includes what changed,
why it matters, a requested contribution and traceable assessment/evidence.
The trial proves retrieval by interest, not automatic relevance judgment, push
delivery, authenticated participation or adoption of an update by its reader.

## Evidence and interpretation

The arithmetic example uses one bounded computation to stage an inconclusive
prefix and a later factor witness. They are not independent replications.
The writing example measures word counts and stores a separate agent's critique.
Author approval and reader preference remain unresolved. Shortest does not
mean best, and model judgment does not become human preference.

Graph qualification checks do not prove scientific truth. Raw evidence integrity,
assessor trust, provenance review and sufficient replication remain research
responsibilities. Direct unrestricted graph writes are not a public contribution
API. This configuration has no hosted access policy or untrusted-user service.

The [hardware-program cookbook](https://github.com/ModernRelay/omnigraph-cookbooks/blob/db957f63c65e40c3f890cd05b4f706a6a3ff607d/hardware-program/README.md)
informed definitions/runs, measurable criteria, review baselines and stale
verification. Company-brain informed provenance and contested assessments.
This experiment's source was authored independently.

`TRIAL.md` owns the bounded question and evidence limits. Runtime data, model
review evidence and reports stay outside Git. New research domains enter as
problem, criterion, candidate and evidence records; the two examples do not
establish scientific validity for every possible domain.
