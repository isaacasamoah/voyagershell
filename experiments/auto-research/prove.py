import argparse
import hashlib
import json
from pathlib import Path
import subprocess

from trial_data import prepare


parser = argparse.ArgumentParser()
parser.add_argument("--binary", required=True, type=Path)
parser.add_argument("--output", required=True, type=Path)
parser.add_argument("--review", required=True, type=Path)
args = parser.parse_args()
source = Path(__file__).resolve().parent
output = args.output.resolve()
output.mkdir(parents=True, exist_ok=False)
receipts = []


def run(*arguments, expected=0):
    result = subprocess.run([str(args.binary.resolve()), *map(str, arguments)],
                            text=True, capture_output=True, timeout=30)
    receipts.append({"arguments": list(map(str, arguments)), "exit": result.returncode,
                     "stdout": result.stdout, "stderr": result.stderr})
    (output / "receipts.json").write_text(json.dumps(receipts, indent=2))
    assert result.returncode == expected, result.stdout + result.stderr
    return result.stdout


def query(name, parameters, graph):
    raw = run("query", name, "--query", source / "progress.gq", "--target", graph,
              "--params", json.dumps(parameters), "--format", "json")
    return json.loads(raw)["rows"]


seed, witness, counts = prepare(source, output, args.review)
assert witness == {"n": 40, "value": 1681, "factor": 41}
assert counts == {"original": 26, "A": 17, "B": 6, "C": 11}
version = run("version")
assert "0.14.0" in version and "60bfd19db780fdff3a5178f959c1204143420114" in version
run("cluster", "validate", "--config", source)
graph = output / "research.omni"
run("init", "--schema", source / "progress.pg", graph)
records = [json.loads(line) for line in seed.read_text().splitlines()]
base = [json.loads(line) for line in (source / "examples.jsonl").read_text().splitlines()]
initial_keys = {r["data"]["key"] for r in base if "type" in r} | {"prefix", "e-prefix", "a-prefix", "math-prefix"}
initial, later = [], []
for record in records:
    early = record["data"]["key"] in initial_keys if "type" in record else record["from"] in initial_keys and record["to"] in initial_keys
    (initial if early else later).append(record)
for name, rows in [("initial", initial), ("later", later)]:
    path = output / f"{name}.jsonl"
    path.write_text("".join(json.dumps(row) + "\n" for row in rows))
    run("load", "--data", path, "--mode", "append", "--target", graph)
    if name == "initial":
        first = query("qualified_assessments", {"problem": "math"}, graph)
        assert len(first) == 1 and first[0]["result"] == "inconclusive"

observed = {}
for problem in ["math", "writing"]:
    observed[problem] = {name: query(name, {"problem": problem}, graph) for name in [
        "research_brief", "criteria", "candidates", "claims", "attempts", "evidence",
        "assessment_history", "qualified_assessments", "next_contributions", "ready_contributions"]}
assert observed["math"]["qualified_assessments"][0]["result"] == "refutes"
assert len(observed["math"]["assessment_history"]) == 2
assert observed["writing"]["claims"] == []
assert observed["writing"]["qualified_assessments"] == []
assert all(row["review"] == "proposed" for row in observed["writing"]["assessment_history"])
assert [row["key"] for row in observed["writing"]["ready_contributions"]] == ["fidelity-review"]
observed["sharing"] = {who: query("updates_for", {"participant": who, "after": 0}, graph)
                       for who in ["math-reader", "writing-reader", "unrelated-reader", "newcomer"]}
assert [len(observed["sharing"][who]) for who in observed["sharing"]] == [2, 1, 0, 3]
assert len(query("updates_for", {"participant": "newcomer", "after": 2}, graph)) == 1
for name, parameters in [("update_evidence", {"update": "math-counterexample"}),
                         ("assessment_evidence", {"assessment": "a-A"}),
                         ("assessed_candidates", {"assessment": "a-A"}),
                         ("hypothesis_evidence", {"claim": "prime-claim"}),
                         ("contribution_dependencies", {"step": "reader-review"}),
                         ("ungrounded_assessments", {})]:
    observed[name] = query(name, parameters, graph)
assert observed["ungrounded_assessments"] == []
assert observed["contribution_dependencies"][0]["state"] == "open"
export = run("export", "--target", graph)
(output / "export.jsonl").write_text(export)
run("load", "--data", seed, "--mode", "append", "--target", graph, expected=1)
assert run("export", "--target", graph) == export
invalid = output / "invalid.jsonl"
invalid.write_text(json.dumps({"type": "Attempt", "data": {"key": "invalid", "method": "none",
                   "status": "proven", "scope": "negative control", "actor": "trial"}}) + "\n")
run("load", "--data", invalid, "--mode", "append", "--target", graph, expected=1)
assert run("export", "--target", graph) == export
restored = output / "restored.omni"
run("init", "--schema", source / "progress.pg", restored)
run("load", "--data", output / "export.jsonl", "--mode", "append", "--target", restored)
assert query("assessment_history", {"problem": "math"}, restored) == observed["math"]["assessment_history"]
assert query("updates_for", {"participant": "newcomer", "after": 0}, restored) == observed["sharing"]["newcomer"]
brief = observed["math"]["research_brief"][0]
run("mutate", "revise_problem", "--query", source / "progress.gq", "--target", restored,
    "--params", json.dumps({"problem": "math", "expected": 1, "revision": 2, "protocol": brief["protocol"],
                            "question": brief["question"], "objective": brief["objective"],
                            "context": brief["context"], "limits": brief["limits"]}))
assert query("qualified_assessments", {"problem": "math"}, restored) == []
assert len(query("assessment_history", {"problem": "math"}, restored)) == 2
observed["stale_control"] = query("assessment_history", {"problem": "math"}, restored)
assert all(not row["context_current"] for row in observed["stale_control"])
run("mutate", "--target", restored, "-e", 'query setup() { update Assessment set { review: "reviewed" } where key = "a-A" }')
writing_before = query("qualified_assessments", {"problem": "writing"}, restored)
assert len(writing_before) == 1 and writing_before[0]["key"] == "a-A"
run("mutate", "--target", restored, "-e", 'query change() { update Protocol set { qualification: "Control: require explicit evidence access wording." } where key = "writing-v1" }')
assert query("qualified_assessments", {"problem": "writing"}, restored) == []
observed["writing_contract_control"] = query("assessment_history", {"problem": "writing"}, restored)
assert all(not row["protocol_content_current"] for row in observed["writing_contract_control"])
original_qualification = next(row["data"]["qualification"] for row in base if row.get("type") == "Protocol" and row["data"]["key"] == "writing-v1")
run("mutate", "--target", restored, "-e", 'query reset($text: String) { update Protocol set { qualification: $text } where key = "writing-v1" }', "--params", json.dumps({"text": original_qualification}))
assert len(query("qualified_assessments", {"problem": "writing"}, restored)) == 1
run("mutate", "--target", restored, "-e", 'query evaluator() { update Criterion set { evaluator: "Control: changed evaluator" } where key = "fidelity" }')
assert query("qualified_assessments", {"problem": "writing"}, restored) == []
observed["writing_evaluator_control"] = query("assessment_history", {"problem": "writing"}, restored)
assert all(not row["criterion_content_current"] for row in observed["writing_evaluator_control"])
(output / "results.json").write_text(json.dumps(observed, indent=2))
summary = {"status": "supported in the bounded local trial", "examples": 2,
           "nodes": sum("type" in row for row in records), "edges": sum("edge" in row for row in records),
           "witness": witness, "word_counts": counts, "human_preference": "unreviewed",
           "duplicate_and_malformed_refused": True, "export_restore": True,
           "changed_context_invalidates_qualification": True,
           "writing_contract_and_evaluator_invalidation": True,
           "source_hashes": {name: hashlib.sha256((source / name).read_bytes()).hexdigest()
                             for name in ["cluster.yaml", "progress.pg", "progress.gq", "examples.jsonl", "trial_data.py", "prove.py"]}}
(output / "summary.json").write_text(json.dumps(summary, indent=2))
print(json.dumps({"output": str(output), **summary}))
