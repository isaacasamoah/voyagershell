import hashlib
import json
import math
from pathlib import Path


def prepare(source, output, review_path):
    rows = [json.loads(line) for line in (source / "examples.jsonl").read_text().splitlines()]

    def node(type_name, key, **data):
        rows.append({"type": type_name, "data": {"key": key, **data}})

    def edge(type_name, left, right):
        rows.append({"edge": type_name, "id": f"{type_name}:{left}:{right}", "from": left, "to": right})

    def artifact(name, data):
        path = output / name
        path.write_text(json.dumps(data, indent=2) + "\n")
        return name, hashlib.sha256(path.read_bytes()).hexdigest()

    def attempt(key, problem, method, scope, actor):
        node("Attempt", key, method=method, status="completed", scope=scope, actor=actor)
        edge("AttemptFor", key, problem)
        edge("UsedProtocol", key, f"{problem}-v1")

    def assessment(key, problem, criterion, evidence, result, statement, reason, review, target):
        protocol = next(row["data"] for row in rows if row.get("type") == "Protocol" and row["data"]["key"] == f"{problem}-v1")
        definition = next(row["data"] for row in rows if row.get("type") == "Criterion" and row["data"]["key"] == criterion)
        node("Assessment", key, result=result, statement=statement, rationale=reason,
             problem_revision=1, protocol=f"{problem}-v1", review=review,
             assessor="arithmetic-checker" if problem == "math" else "peer-reviewer",
             protocol_method=protocol["method"], protocol_qualification=protocol["qualification"],
             criterion_kind=definition["kind"], criterion_role=definition["role"],
             criterion_definition=definition["definition"], criterion_evaluator=definition["evaluator"],
             criterion_unit=definition["unit"])
        for relation, other in [("Assesses", problem), ("Addresses", criterion), ("Cites", evidence)]:
            edge(relation, key, other)
        edge("AboutClaim" if problem == "math" else "AboutCandidate", key, target)

    def progress(key, problem, criterion, assessment_key, sequence, summary, why, request):
        node("Progress", key, summary=summary, why_it_matters=why,
             contribution_requested=request, sequence=sequence,
             problem_revision=1, protocol=f"{problem}-v1")
        for relation, other in [("Updates", problem), ("Changed", criterion),
                                ("ExplainedBy", assessment_key), ("ContributedBy", "record-author")]:
            edge(relation, key, other)

    values = []
    for n in range(101):
        value = n * n + n + 41
        factor = next((d for d in range(2, math.isqrt(value) + 1) if value % d == 0), None)
        values.append({"n": n, "value": value, "factor": factor})
    math_artifact, math_hash = artifact("arithmetic.json", values)
    first_witness = next(row for row in values if row["factor"] is not None)
    for key, bound, result, statement, reason in [
        ("prefix", 39, "inconclusive", "The first 40 terms have no counterexample.",
         "A finite prefix cannot establish the universal claim."),
        ("expanded", 100, "refutes", "The universal claim is false: n=40 gives 1681=41*41.",
         "A proper factorization at one permitted input refutes the universal quantifier.")
    ]:
        attempt(key, "math", "exact trial division", f"Integers 0 through {bound} inclusive", "arithmetic-checker")
        edge("Tested", key, "polynomial")
        node("Evidence", f"e-{key}", kind="observation" if key == "prefix" else "counterexample",
             summary=statement, numeric_value=None, unit=None, value_text=reason,
             artifact=math_artifact, sha256=math_hash, origin="computed", assessor="arithmetic-checker")
        edge("ProducedBy", f"e-{key}", key)
        assessment(f"a-{key}", "math", "prime-everywhere", f"e-{key}", result,
                   statement, reason, "reviewed", "prime-claim")
    edge("Supersedes", "a-expanded", "a-prefix")
    edge("MotivatedBy", "math-next", "a-expanded")
    progress("math-prefix", "math", "prime-everywhere", "a-prefix", 1,
             "No counterexample in the first 40 terms.", "The universal claim is still unresolved.",
             "Extend the search or seek a general argument; do not call the prefix a proof.")
    progress("math-counterexample", "math", "prime-everywhere", "a-expanded", 2,
             "A factor witness refutes the original claim.", "Do not repeat work trying to prove this exact universal claim.",
             "Check the witness, then propose a useful restricted or revised question.")
    candidates = [row["data"] for row in rows if row.get("type") == "Candidate" and row["data"]["key"] != "polynomial"]
    counts = {c["key"]: len(c["content"].split()) for c in candidates}
    count_artifact, count_hash = artifact("word-counts.json", counts)
    review = json.loads(Path(review_path).read_text())
    review_artifact, review_hash = artifact("writing-review.json", review)
    attempt("writing-count", "writing", "whitespace word count", "Four exact candidate strings", "split-words-v1")
    attempt("writing-review", "writing", "independent model critique", "Four semantic obligations; no human preference", "peer-reviewer")
    for key, count in counts.items():
        node("Evidence", f"words-{key}", kind="measurement", summary=f"{key} contains {count} words.",
             numeric_value=float(count), unit="words", value_text=None, artifact=count_artifact,
             sha256=count_hash, origin="computed", assessor="split-words-v1")
        edge("ProducedBy", f"words-{key}", "writing-count")
        edge("Tested", "writing-count", key)
        if key == "original":
            continue
        result = review[key]
        node("Evidence", f"meaning-{key}", kind="judgment", summary=json.dumps(result),
             numeric_value=None, unit=None, value_text=json.dumps(result), artifact=review_artifact,
             sha256=review_hash, origin="model", assessor=review["assessor"])
        edge("ProducedBy", f"meaning-{key}", "writing-review")
        edge("Tested", "writing-review", key)
        assessment(f"a-{key}", "writing", "fidelity", f"meaning-{key}",
                   "meets" if result["eligible"] else "violates", f"Model judgment of rewrite {key}.",
                   "A is conditionally eligible with an evidence-visibility caveat; B and C lose or reverse meaning.",
                   "proposed", key)
    edge("MotivatedBy", "fidelity-review", "a-A")
    progress("writing-progress", "writing", "fidelity", "a-A", 3,
             "A has 17 words versus 26; its model review retains an evidence-visibility caveat.",
             "The shortest rewrite loses meaning; model review does not establish reader preference.",
             "Review the caveat, then compare eligible rewrites with actual readers.")
    seed = output / "records.jsonl"
    seed.write_text("".join(json.dumps(row, ensure_ascii=False) + "\n" for row in rows))
    return seed, first_witness, counts
