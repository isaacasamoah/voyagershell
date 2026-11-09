import hashlib
import json
import math
from pathlib import Path
import shlex
import statistics
import sys
import traceback


def read(path):
    return json.loads(path.read_text())


def json_lines(path):
    return [json.loads(line) for line in path.read_text().splitlines()]


def interval(values):
    assert len(values) == 3 and all(value > 0 for value in values)
    logs = [math.log(value) for value in values]
    mean = statistics.mean(logs)
    margin = 4.3026527299 * statistics.stdev(logs) / math.sqrt(3)
    return {
        "geometricMeanRatio": math.exp(mean),
        "ratio95PercentInterval": [math.exp(mean - margin), math.exp(mean + margin)],
    }


def resource_summary(rows, manifest):
    header, *samples, finished = rows
    assert header["type"] == "run" and header["clock"] == "monotonic_ns"
    for key in ("protocol", "run", "variant", "session", "binarySha256"):
        assert header[key] == manifest[key], key
    assert header["requestedSamples"] == len(samples) == finished["samples"] == 61
    assert header["intervalSeconds"] == 1 and header["ticksPerSecond"] > 0
    assert (
        finished["type"] == "completed"
        and finished["complete"]
        and finished["errors"] == 0
    )
    prior = None
    inventory = None
    measurements = []
    for sample in samples:
        assert (
            sample["type"] == "sample"
            and sample["error"] is None
            and not sample["exits"]
        )
        assert sample["startedNs"] < sample["endedNs"]
        current = {row["pid"]: row for row in sample["processes"]}
        assert len(current) == len(sample["processes"])
        identities = {
            pid: (row["uid"], row["start"], row["executable"], tuple(row["roles"]))
            for pid, row in current.items()
        }
        if inventory is None:
            inventory = identities
            app = manifest["app"]
            assert current[app["pid"]]["roles"] == ["app"]
            for key in ("uid", "start", "executable"):
                assert current[app["pid"]][key] == app["identity"][key]
            cores = [row for row in current.values() if "core" in row["roles"]]
            assert (
                len(cores) == 1
                and cores[0]["executable"] == manifest["core"]["executable"]
            )
            assert any("holder" in row["roles"] for row in current.values())
            assert sum("backend" in row["roles"] for row in current.values()) == len(
                manifest["terminals"]
            )
        assert identities == inventory, "Process roster or identity changed"
        for pid, row in current.items():
            assert set(row["roles"]) <= {
                "app",
                "app-helper",
                "core",
                "core-helper",
                "holder",
                "backend",
            }
            assert row["roles"] and all(
                row[key] >= 0
                for key in ("cpuTicks", "pssBytes", "rssBytes", "swapPssBytes")
            )
            expected = (
                None if prior is None else row["cpuTicks"] - prior[pid]["cpuTicks"]
            )
            assert expected is None or expected >= 0
            assert row["cpuDeltaTicks"] == expected
        for key in ("pssBytes", "rssBytes"):
            assert sample["totals"][key] == sum(row[key] for row in current.values())
        delta = (
            None
            if prior is None
            else sum(row["cpuDeltaTicks"] for row in current.values())
        )
        assert sample["totals"]["cpuDeltaTicks"] == delta
        if measurements:
            assert sample["startedNs"] > measurements[-1]["endedNs"]
        measurements.append(sample)
        prior = current
    first, last = samples[0], samples[-1]
    start = (first["startedNs"] + first["endedNs"]) / 2
    end = (last["startedNs"] + last["endedNs"]) / 2
    elapsed = (end - start) / 1e9
    assert last["startedNs"] - first["startedNs"] >= 60e9
    groups = {}
    app_pids = {pid for pid, row in prior.items() if "app" in row["roles"]}
    app_tree = {
        pid for pid, row in prior.items() if set(row["roles"]) & {"app", "app-helper"}
    }
    selections = {
        "app": app_pids,
        "appAndHelpers": app_tree,
        "common": prior.keys() - app_tree,
        "whole": set(prior),
    }
    initial = {row["pid"]: row["cpuTicks"] for row in first["processes"]}
    for name, pids in selections.items():
        ticks = sum(prior[pid]["cpuTicks"] - initial[pid] for pid in pids)
        groups[name] = {
            "cpuPercentOneCore": ticks / header["ticksPerSecond"] / elapsed * 100
        }
        for key in ("pssBytes", "rssBytes", "swapPssBytes"):
            groups[name]["median" + key[0].upper() + key[1:]] = statistics.median(
                sum(row[key] for row in sample["processes"] if row["pid"] in pids)
                for sample in samples
            )
    return {
        "samples": len(samples),
        "elapsedSeconds": elapsed,
        "windowNs": [start, end],
        "endpointSpanMs": [
            (sample["endedNs"] - sample["startedNs"]) / 1e6 for sample in (first, last)
        ],
        "ticksPerSecond": header["ticksPerSecond"],
        "processes": first["processes"],
        "groups": groups,
    }


def producer_summary(path, window, chunk, hz):
    rows = json_lines(path)
    output = [row for row in rows if row["kind"] == "output"]
    finished = rows[-1]
    assert finished["kind"] == "complete" and finished["outputs"] == len(output)
    assert len([row for row in rows if row["kind"] == "ready"]) == 1
    assert finished["inputs"] == sum(row["kind"] == "input" for row in rows)
    assert finished["bytes"] == len(output) * chunk and finished["elapsed"] > 0
    for index, row in enumerate(output):
        assert (
            row["sequence"] == index
            and row["bytes"] == chunk
            and row["total"] == (index + 1) * chunk
        )
        assert row["beforeNs"] <= row["afterNs"]
        if index:
            assert row["beforeNs"] >= output[index - 1]["afterNs"]
    start, end = window
    assert output[0]["beforeNs"] <= start < end <= output[-1]["afterNs"]
    included = [row for row in output if start <= row["afterNs"] <= end]
    writes = [(row["afterNs"] - row["beforeNs"]) / 1e6 for row in included]
    return {
        "requestedBytesPerSecond": chunk * hz,
        "windowBytes": sum(row["bytes"] for row in included),
        "windowBytesPerSecond": sum(row["bytes"] for row in included)
        / ((end - start) / 1e9),
        "writeCallWallMs": sum(writes),
        "maxWriteCallWallMs": max(writes, default=0),
        "lifetimeBytesPerSecond": finished["bytes"] / finished["elapsed"],
        "inputs": finished["inputs"],
    }


def analyze_run(folder, protocol, count, condition, repeat, variant):
    result = read(folder / "result.json")
    assert (
        result["complete"]
        and result["countWorkload"] == count
        and result["countActual"] == count + 1
    )
    manifest = read(folder / "resources-manifest.json")
    assert manifest["run"] == folder.name and manifest["variant"] == variant
    assert manifest["binarySha256"] == protocol["binarySha256"]
    if protocol.get("comparisonScope") == "row-paint-confirmation":
        assert manifest["app"]["environmentOverrides"] == protocol["variants"][str(variant)]
    geometry = manifest["app"]["geometry"]
    assert all(
        geometry[key] == value
        for key, value in protocol["geometry"].items()
        if key != "WINDOW"
    )
    before = {
        row["address"]: row["pid"]
        for row in read(folder / "terminals-before.json")["terminals"]
        if row["state"] == "live"
    }
    after = {
        row["address"]: row["pid"]
        for row in read(folder / "terminals-after.json")["terminals"]
        if row["state"] == "live"
    }
    assert before == after and set(before) == set(manifest["terminals"])
    assert len(before) == (1 if count == 1 else count - 2)
    resources = resource_summary(json_lines(folder / "resources.jsonl"), manifest)
    assert {
        row["pid"] for row in resources["processes"] if "backend" in row["roles"]
    } == set(before.values())
    layout = read(folder.parent / "layout.json")
    voyage = layout["voyages"][0]
    contents = {row["id"]: row for row in layout["contents"]}
    main = {
        contents[row["content"]]["backend"]
        for row in voyage["fleets"][0]["vessels"]
        if contents[row["content"]]["typeId"] == "terminal"
    }
    hidden = [
        contents[row["content"]]["backend"]
        for fleet in voyage["fleets"][1:]
        for row in fleet["vessels"]
    ]
    flood = hidden[-1] if hidden else next(iter(main))
    producers = {}
    for address in manifest["terminals"]:
        chunk, hz = protocol["conditions"][
            condition if condition != "flood" or address == flood else "ordinary"
        ]
        command = shlex.split(read(folder / (address + "-dispatch.json"))["command"])
        assert command[command.index("--chunk") + 1] == str(chunk)
        assert command[command.index("--hz") + 1] == str(hz)
        producers[address] = producer_summary(
            folder / (address + ".jsonl"), resources["windowNs"], chunk, hz
        )
    return {
        "path": str(folder),
        "repeat": repeat,
        "variant": variant,
        "resources": resources,
        "producers": producers,
    }


def check_order(runs):
    observed = [
        (run["repeat"], run["variant"])
        for run in sorted(runs, key=lambda run: run["resources"]["windowNs"][0])
    ]
    expected = [(1, 0), (1, 1), (2, 1), (2, 0), (3, 0), (3, 1)]
    assert observed == expected[: len(observed)], (
        "Measured run order differs from AB BA AB"
    )


def matrix(folder):
    manifests = sorted(folder.glob("count-*/*/resources-manifest.json"))
    paths = {read(path)["protocol"] for path in manifests}
    assert len(paths) == 1, "One frozen protocol is required"
    protocol_path = Path(paths.pop())
    protocol = read(protocol_path)
    assert Path(protocol["output"]).resolve() == folder.resolve()
    row_confirmation = protocol.get("comparisonScope") == "row-paint-confirmation"
    expected_counts = [1, 16] if row_confirmation else [1, 4, 8, 16]
    assert protocol["counts"] == expected_counts and protocol["repeats"] == 3
    if row_confirmation:
        assert not protocol.get("carriedCells")
        assert protocol["conditions"] == {"busy": [4096, 16]}
        assert protocol["variants"] == {
            "0": {"VOYAGER_EXPERIMENT_COMPACT_BACKGROUNDS": "1", "VOYAGER_EXPERIMENT_ROW_PAINT": "0"},
            "1": {"VOYAGER_EXPERIMENT_COMPACT_BACKGROUNDS": "1", "VOYAGER_EXPERIMENT_ROW_PAINT": "1"},
        }
    assert protocol["warmSeconds"] == protocol["sampleSeconds"] == 60
    expected = {
        folder / f"count-{count}" / f"{condition}-{repeat}-{variant}"
        for count in protocol["counts"]
        for condition in protocol["conditions"]
        for repeat in range(1, 4)
        for variant in (0, 1)
    }
    assert all(path.parent in expected for path in manifests), (
        "Unexpected resource run; no retry exclusion"
    )
    cells, invalid = [], []
    for count in protocol["counts"]:
        for condition in protocol["conditions"]:
            runs, pending = {}, []
            invalid_before = len(invalid)
            for repeat in range(1, 4):
                for variant in (0, 1):
                    path = folder / f"count-{count}" / f"{condition}-{repeat}-{variant}"
                    if not (path / "result.json").exists():
                        pending.append(str(path))
                        continue
                    try:
                        runs[repeat, variant] = analyze_run(
                            path, protocol, count, condition, repeat, variant
                        )
                    except (
                        AssertionError,
                        KeyError,
                        ValueError,
                        TypeError,
                        OSError,
                    ) as error:
                        invalid.append(
                            {
                                "path": str(path),
                                "error": repr(error),
                                "analysisLine": traceback.extract_tb(
                                    error.__traceback__
                                )[-1].lineno,
                            }
                        )
            if len(invalid) == invalid_before:
                check_order(list(runs.values()))
            pairs = []
            for repeat in range(1, 4):
                if (repeat, 0) in runs and (repeat, 1) in runs:
                    ratios = {}
                    for group in ("app", "appAndHelpers", "common", "whole"):
                        for metric in ("cpuPercentOneCore", "medianPssBytes"):
                            a, b = [
                                runs[repeat, variant]["resources"]["groups"][group][
                                    metric
                                ]
                                for variant in (0, 1)
                            ]
                            ratios[group + "." + metric] = (
                                b / a if a > 0 and b > 0 else None
                            )
                    pairs.append({"repeat": repeat, "candidateOverBaseline": ratios})
            confidence = {}
            if len(pairs) == 3:
                for metric in pairs[0]["candidateOverBaseline"]:
                    values = [pair["candidateOverBaseline"][metric] for pair in pairs]
                    confidence[metric] = (
                        interval(values)
                        if all(value is not None for value in values)
                        else {
                            "unavailable": "Zero CPU at counter resolution; no logarithmic ratio"
                        }
                    )
            cells.append(
                {
                    "countWorkload": count,
                    "countActual": count + 1,
                    "condition": condition,
                    "complete": len(pairs) == 3,
                    "runs": list(runs.values()),
                    "pairs": pairs,
                    "threePairConfidence": confidence,
                    "pending": pending,
                }
            )
    return {
        "protocol": str(protocol_path),
        "protocolSha256": hashlib.sha256(protocol_path.read_bytes()).hexdigest(),
        "scope": ("Native same-binary compact1 row-paint0/1 busy resource comparison." if row_confirmation else "Native same-binary compact0/1 resource comparison.") + " Electron Home/font/geometry differ; no formal Electron-relative memory gain, latency/frame or foundation acceptance.",
        "assumptions": [
            "Three paired log effects are independent and approximately normal; df2 Student-t95%. Shared Core/profile within each count can correlate pairs.",
            "One run median PSS is one observation; per-second samples are not independent trials.",
            "CPU uses endpoint counters and sample-midpoint elapsed time; endpoint spans and tick resolution remain measurement limits.",
            "Producer throughput counts workload chunks completed inside the resource window. Write-call wall time bounds blocking but does not isolate scheduler/CPU time.",
            "Master numerical limits, lifecycle/startup/soak and the proving-size gate remain unchanged.",
        ],
        "cells": cells,
        "invalidRuns": invalid,
        "wholeFoundationAcceptance": False,
    }


def legacy(folder):
    records = read(folder / "runs.json")
    assert [row["variant"] for row in records] == [
        "baseline",
        "candidate",
        "candidate",
        "baseline",
        "baseline",
        "candidate",
    ]
    pairs = []
    for index in range(0, 6, 2):
        pair = {row["variant"]: row for row in records[index : index + 2]}
        a, b = [
            pair[key]["measurement"]["app"]["cpuPercentOneCore"]
            for key in ("baseline", "candidate")
        ]
        pairs.append(
            {"baselineCpuPercent": a, "candidateCpuPercent": b, "ratio": b / a}
        )
    result = interval([pair["ratio"] for pair in pairs])
    return {
        "pairs": pairs,
        "geometricMeanCpuRatio": result["geometricMeanRatio"],
        "cpuRatio95PercentInterval": result["ratio95PercentInterval"],
        "pairedLogNormalityAssumed": True,
        "scope": "Retained quiet app-CPU comparison only; no whole-foundation acceptance",
    }


if __name__ == "__main__":
    folder = Path(sys.argv[1])
    result = legacy(folder) if (folder / "runs.json").exists() else matrix(folder)
    print(json.dumps(result, indent=2))
    sys.exit(bool(result.get("invalidRuns")))
