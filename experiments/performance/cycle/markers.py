import argparse
from collections import defaultdict
import hashlib
import json
import math
from pathlib import Path
import zlib


def require(condition, reason):
    if not condition:
        raise ValueError(reason)


def read(path):
    return json.loads(path.read_text())


def bounds(frame):
    clock = frame["clock"]
    before, after = clock["hostBeforeNs"], clock["hostAfterNs"]
    require(before <= after, "Reversed clock bracket")
    point = clock["baseTimeNs"] + frame["runningTimeNs"] - clock["timeNs"]
    return point + before, point + after


def summarize(intervals):
    require(bool(intervals), "No matched intervals")
    p95 = math.ceil(len(intervals) * 0.95) - 1
    lower, upper = [sorted(item[side] for item in intervals) for side in (0, 1)]
    result = {
        "samples": len(intervals),
        "p95Ms": [lower[p95], upper[p95]],
        "maximumMs": [lower[-1], upper[-1]],
    }
    for key, limit in (("p95Ms", 100), ("maximumMs", 250)):
        low, high = result[key]
        result[key + "Status"] = (
            "pass"
            if high <= limit
            else "definite-fail"
            if low > limit
            else "unresolved"
        )
    return result


def evaluate(run):
    result = read(run / "result.json")
    require(result.get("complete") is True, "Run is incomplete")
    condition, repeat, variant = run.name.rsplit("-", 2)
    manifest = read(run / "resources-manifest.json")
    require(
        manifest["run"] == run.name and manifest["variant"] == int(variant),
        "Run identity mismatch",
    )
    launch = read(run / "input-launch.json")
    require(
        launch["pid"] == manifest["app"]["pid"]
        and launch["identity"] == manifest["app"]["identity"]
        and launch["session"] == manifest["session"],
        "Input and resource app/session identities differ",
    )
    address = launch.get("inputTerminal", "t1")
    require(Path(address).name == address, "Invalid producer address")
    source = run / (address + ".jsonl")
    producer = [json.loads(line) for line in source.read_text().splitlines()]
    require(
        producer[-1]["kind"] == "complete" and producer[-1]["inputs"] == 18,
        "Producer did not complete with 18 inputs",
    )
    inputs = [row for row in producer if row["kind"] == "input"]
    dispatches = read(run / "input/dispatch.json")
    expected = list(range(1, 19))
    require(
        [row["sequence"] for row in inputs] == expected,
        "Expected exactly 18 ordered producer inputs",
    )
    require(
        [row["sequence"] for row in dispatches] == expected,
        "Expected exactly 18 ordered native dispatches",
    )
    receipt = read(run / "input/receipt.json")
    require(
        receipt == read(run / "input/frames.receipt.json") and receipt["complete"],
        "Frame collection is incomplete",
    )
    metadata = run / "input/frames.jsonl"
    pixel_path = run / "input/frames.rgb.z"
    rows = [json.loads(line) for line in metadata.read_text().splitlines()]
    frames = [row for row in rows if row["type"] == "frame"]
    require(
        len(frames) == receipt["frames"] and len(frames) > 1, "Frame count mismatch"
    )
    pixels = pixel_path.read_bytes()
    colours, position, clock_key, previous = [], 0, None, None
    for index, frame in enumerate(frames):
        require(frame["index"] == index, "Frame index gap")
        require(
            all(
                frame["source"][key] is not None
                and frame["source"][key] == frame["sample"][key]
                for key in ("ptsNs", "offset")
            ),
            "Source/sample PTS or sequence mismatch",
        )
        clock = frame["clock"]
        current = [clock[key] for key in ("identity", "type", "name", "baseTimeNs")]
        require(clock_key is None or current == clock_key, "Frame clock changed")
        clock_key = current
        low, high = bounds(frame)
        if previous is not None:
            require(
                frame["source"]["offset"] == previous["source"]["offset"] + 1
                and frame["source"]["ptsNs"] > previous["source"]["ptsNs"],
                "Source sequence gap or reversed PTS",
            )
            require(low > bounds(previous)[1], "Mapped frame times overlap or reverse")
        previous = frame
        size = frame["bytes"]
        require(
            frame["format"] == "RGB"
            and frame["width"] == frame["height"] == 8
            and size == frame["stride"] * 8 <= 65536,
            "Unexpected marker crop or byte bound",
        )
        start, length = frame["pixelOffset"], frame["pixelLength"]
        require(
            start == position and 0 < length <= len(pixels) - start,
            "Pixel range mismatch",
        )
        compressed = zlib.decompressobj()
        raw = compressed.decompress(pixels[start : start + length], size + 1)
        require(
            compressed.eof and not compressed.unused_data and len(raw) == size,
            "Invalid compressed pixel extent",
        )
        require(
            hashlib.sha256(raw).hexdigest() == frame["pixelSha256"],
            "Pixel hash mismatch",
        )
        visible = b"".join(
            raw[y * frame["stride"] : y * frame["stride"] + 24] for y in range(8)
        )
        colour = visible[:3]
        require(
            colour in (b"\xff\0\0", b"\0\xff\0") and visible == colour * 64,
            "Ambiguous marker pixels",
        )
        colours.append(int(colour == b"\0\xff\0"))
        position += length
    require(
        position == len(pixels) and colours[0] == 0,
        "Unmatched pixel data or missing initial red marker",
    )
    changes = [
        index
        for index in range(1, len(colours))
        if colours[index] != colours[index - 1]
    ]
    require(
        len(changes) == 18 and [colours[index] for index in changes] == [1, 0] * 9,
        "Expected exactly 18 matching red/green transitions; markers may be missing or coalesced",
    )
    native_intervals, output_intervals = [], []
    for index in range(18):
        native, written = dispatches[index]["key"], inputs[index]
        require(
            native["keysym"] == 120 and native["down"] is True,
            "Expected an actual native x key-down",
        )
        before, after = [round(native[key] * 1e9) for key in ("before", "acknowledged")]
        require(
            before <= after
            and written["beforeNs"] <= written["afterNs"]
            and before <= written["beforeNs"],
            "Dispatch/producer clock order is invalid",
        )
        require(
            written["rgb"] == ("0;255;0" if index % 2 == 0 else "255;0;0"),
            "Producer colour sequence changed",
        )
        changed = changes[index]
        low, high = bounds(frames[changed - 1])[0], bounds(frames[changed])[1]
        require(
            high >= written["beforeNs"] and high >= after,
            "Matching pixels precede their input",
        )
        if index:
            require(
                dispatches[index - 1]["key"]["acknowledged"] <= native["before"]
                and inputs[index - 1]["afterNs"] <= written["beforeNs"],
                "Inputs overlap or reverse",
            )
        native_intervals.append([max(0, low - after) / 1e6, (high - before) / 1e6])
        output_intervals.append(
            [max(0, low - written["afterNs"]) / 1e6, (high - written["beforeNs"]) / 1e6]
        )
    return {
        "run": str(run),
        "status": "available",
        "batch": str(run.parent.parent),
        "count": result["countWorkload"],
        "actualCount": result["countActual"],
        "condition": condition,
        "repeat": int(repeat),
        "variant": int(variant),
        "coreId": manifest["core"]["id"],
        "session": manifest["session"],
        "inputIntervalsMs": native_intervals,
        "markerOutputIntervalsMs": output_intervals,
        "input": summarize(native_intervals),
        "markerOutput": summarize(output_intervals),
        "sourceSha256": {
            str(path): hashlib.sha256(path.read_bytes()).hexdigest()
            for path in (metadata, pixel_path, source, run / "input/dispatch.json")
        },
    }


def analyze_run(run):
    try:
        return evaluate(Path(run))
    except (OSError, ValueError, KeyError, TypeError, IndexError, zlib.error) as error:
        return {"run": str(run), "status": "unavailable", "reason": str(error)}


def aggregate(runs):
    groups = defaultdict(list)
    for run in runs:
        if run["status"] == "available":
            groups[
                tuple(
                    run[key]
                    for key in ("batch", "coreId", "count", "condition", "variant")
                )
            ].append(run)
    summaries = []
    for key, group in sorted(groups.items()):
        row = dict(zip(("batch", "coreId", "count", "condition", "variant"), key))
        row["runs"] = [item["run"] for item in group]
        row["status"] = (
            "available"
            if sorted(item["repeat"] for item in group) == [1, 2, 3]
            else "unavailable"
        )
        if row["status"] == "available":
            for output, intervals in (
                ("input", "inputIntervalsMs"),
                ("markerOutput", "markerOutputIntervalsMs"),
            ):
                row[output] = summarize(
                    [sample for item in group for sample in item[intervals]]
                )
                row[output]["perRun"] = [
                    item[output]
                    for item in sorted(group, key=lambda item: item["repeat"])
                ]
        else:
            row["reason"] = (
                "Requires exactly three complete repeats in the same batch and Core block"
            )
        summaries.append(row)
    return summaries


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("batches", nargs="+", type=Path)
    args = parser.parse_args()
    runs = [
        analyze_run(path.parent)
        for batch in args.batches
        for path in sorted(batch.glob("count-*/*/input"))
    ]
    print(
        json.dumps(
            {
                "scope": "Native marker input and input-triggered marker-output timing only; formal 5% reference comparison, physical presentation, animation cadence and all-periodic-output timing remain unproved",
                "runs": runs,
                "cells": aggregate(runs),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
