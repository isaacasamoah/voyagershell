import copy, json, os, statistics, sys

TARGETS = ["fleet", "split", "notes", "avatar"]


def summarize(runs):
    rows = []
    for name, run in runs:
        r, i, checks = run["result"], run["input"], run["checks"]
        a, b, a2 = r.get("layoutA", {}), r.get("layoutB", {}), r.get("layoutA2", {})
        rows.append({
            "run": name,
            "verdict": checks.get("runtimeResult"),
            "scriptErrors": len(r.get("errors", [])),
            "endpointFoundA": a.get("endpointTiming", {}).get("allFoundEveryTime"),
            "endpointFoundB": b.get("endpointTiming", {}).get("allFoundEveryTime"),
            "endpointSplitEffectB": b.get("endpointSplitEffect"),
            "atspiFoundB": b.get("atspiTiming", {}).get("allFoundEveryTime"),
            "atspiFoundA2": a2.get("atspiTiming", {}).get("allFoundEveryTime"),
            "agreeB": all(b.get("agree", {}).get(t) for t in TARGETS) if b.get("agree") else False,
            "agreeA2": all(a2.get("agree", {}).get(t) for t in TARGETS) if a2.get("agree") else False,
            "fixedOffsetHitsAfterChange": sum(bool(v) for v in b.get("fixedOffsetFromAStillHits", {}).values()),
            "endpointMs": [a.get("endpointTiming", {}).get("medianMs"), b.get("endpointTiming", {}).get("medianMs")],
            "atspiMs": [b.get("atspiTiming", {}).get("medianMs"), a2.get("atspiTiming", {}).get("medianMs")],
            "atspiActivationS": r.get("atspiActivationSeconds"),
            "settleA2": a2.get("settleSeconds"),
            "settleBEndpoint": b.get("endpointSettleSeconds"),
            "cpuOff": r.get("a11yOff"),
            "cpuOn": r.get("a11yOn"),
            "input": i,
            "probe": run.get("probe"),
        })
    return rows


def med(values):
    values = [v for v in values if v is not None]
    return (round(statistics.median(values), 3), round(min(values), 3), round(max(values), 3)) if values else None


def report(rows):
    n = len(rows)
    count = lambda key: sum(1 for r in rows if r[key] is True)
    print(f"runs: {n}; verifier verdict passed: {sum(r['verdict'] == 'passed' for r in rows)}; script errors: {sum(r['scriptErrors'] for r in rows)}")
    for key in ["endpointFoundA", "endpointFoundB", "endpointSplitEffectB", "atspiFoundB", "atspiFoundA2", "agreeB", "agreeA2"]:
        print(f"{key}: {count(key)}/{n}")
    print("fixed offsets from layout A that still hit after change (of 4):", [r["fixedOffsetHitsAfterChange"] for r in rows])
    print("endpoint lookup ms median (min,max over runs):", med([m for r in rows for m in r["endpointMs"]]))
    print("atspi lookup ms median:", med([m for r in rows for m in r["atspiMs"]]))
    print("atspi activation s:", med([r["atspiActivationS"] for r in rows]))
    print("settle after change, endpoint (A->B):", med([r["settleBEndpoint"] for r in rows]))
    print("settle after change, both polled (B->A2) atspi / endpoint:", med([(r["settleA2"] or {}).get("atspi") for r in rows]), med([(r["settleA2"] or {}).get("endpoint") for r in rows]))
    print("burst CPU s/4s a11y off / on:", med([(r["cpuOff"] or {}).get("burstCpuSecondsPer4s") for r in rows]), med([(r["cpuOn"] or {}).get("burstCpuSecondsPer4s") for r in rows]))
    print("idle CPU s/2s a11y off / on:", med([(r["cpuOff"] or {}).get("idleCpuSecondsPer2s") for r in rows]), med([(r["cpuOn"] or {}).get("idleCpuSecondsPer2s") for r in rows]))
    for side in ["off", "on"]:
        rows_ = [(r["probe"] or {}).get(side, {}) for r in rows]
        print(f"redraw probe a11y {side}: runs with terminal_canvas_rows>0: {sum(1 for p in rows_ if p.get('terminal_canvas_rows', 0) > 0)}/{n}; terminal_renders total: {sum(p.get('terminal_renders', 0) for p in rows_)}; terminal_canvas_rows total: {sum(p.get('terminal_canvas_rows', 0) for p in rows_)}")
    for key in ["processClickMs", "processMoveMs", "processVerifiedKeyMs", "processCaptureMs", "x11rbClickMs", "x11rbCaptureMs"]:
        print(f"{key} (median of per-run medians, min, max):", med([(r["input"] or {}).get(key, {}).get("median") for r in rows]))


def probe(path):
    totals = {False: {}, True: {}}
    try:
        lines = open(os.path.join(path, "native.log")).read().splitlines()
    except OSError:
        return None
    for line in lines:
        if '"voyager_redraw_probe"' not in line:
            continue
        event = json.loads(line)
        side = totals[event["a11y_active_at_poll"]]
        for key, value in event["counts"].items():
            side[key] = side.get(key, 0) + value
    return {"off": totals[False], "on": totals[True]}


def load(paths):
    runs = []
    for path in paths:
        try:
            runs.append((os.path.basename(path), {
                "result": json.load(open(os.path.join(path, "observation-result.json"))),
                "input": json.load(open(os.path.join(path, "input.json"))) if os.path.exists(os.path.join(path, "input.json")) else None,
                "checks": json.load(open(os.path.join(path, "checks.json"))),
                "probe": probe(path),
            }))
        except (OSError, ValueError) as error:
            runs.append((os.path.basename(path), {"result": {"errors": [str(error)]}, "input": None, "checks": {}}))
    return runs


def control(runs):
    good = [run for run in runs if run[1]["result"].get("layoutB", {}).get("agree")]
    assert good, "control needs one complete run"
    name, run = good[0]
    bad = copy.deepcopy(run)
    b = bad["result"]["layoutB"]
    b["atspi"]["split"] = [b["atspi"]["split"][0] + 5] + b["atspi"]["split"][1:]
    b["agree"] = {t: b["atspi"].get(t) == b["endpointAfterA11y"].get(t) for t in TARGETS}
    del bad["result"]["layoutB"]["endpointTiming"]
    row = summarize([(name + "-control", bad)])[0]
    assert row["agreeB"] is False, "control: shifted box must disagree"
    assert not row["endpointFoundB"], "control: missing lookup must not count as found"
    print("negative controls: shifted AT-SPI box reported as disagreement; missing endpoint lookup not counted as found")


if __name__ == "__main__":
    runs = load(sys.argv[1:])
    control(runs)
    report(summarize(runs))
