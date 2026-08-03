# K5A claims-scoped warm-synthetic floor arm at 1,400

Scope label: `CLAIMS-SCOPED`, `WARM-SYNTHETIC`. This receipt measures the
`retrieveKnowledgeGraphClaims` boundary only. It does **not** establish the
G6 timing arm for unit search; the search boundary and its number/unsupported
scale behavior remain pending G11.

The ruled lever keeps `RESPONSE_FLOOR_MS = 556` and moves the exact-recall
horizon to 1,400 authorized units. The source-coupled arm was rerun with the
active horizon set to 1,400 and passed.

- Source floor: 556ms (`lib/knowledge/kernel/boundary.ts`)
- Sealed boundary overhead: 3.256ms
- Database budget: 552.744ms
- Supported scale: 1,400 authorized units
- Paired p95 samples: 494.670, 475.016, 466.807, 462.617, 487.823ms
- Worst measured p95: 494.670ms
- Mean: 475.556ms; standard deviation: 10.121ms
- Largest paired delta: 21.661ms
- Verdict: `CARTOGRAPHER_K5A_FLOOR_DATABASE_GREEN`

The arm reads `RESPONSE_FLOOR_MS` from its source and derives the under-floor
budget by subtracting measured overhead; it does not copy a latency literal.
Within this claims-only measurement, the 1,400 horizon is the exact-recall
boundary. Above it, the
authorized-partition ANN gate is the ruled path; approximation is never
automatic and never permitted to leak across authorization.
