import hashlib
import json
from pathlib import Path
import sys
import zlib

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "cycle"))
from markers import bounds


def evaluate(config, folder, wrong_template=False, blank_template=False):
    dispatches = json.loads((folder / "dispatch.json").read_text())
    receipt = json.loads((folder / "receipt.json").read_text())
    assert receipt == json.loads((folder / "frames.receipt.json").read_text())
    assert receipt["complete"]
    text = config["text"]
    sequence_scope = config.get("sequenceScope", "full-recording")
    assert sequence_scope in ("full-recording", "measured-key-window")
    assert "".join(row["character"] for row in dispatches) == text
    assert text in json.loads((folder / "screen-after.json").read_text())["text"]
    frames = [json.loads(line) for line in (folder / "frames.jsonl").read_text().splitlines() if json.loads(line)["type"] == "frame"]
    assert len(frames) == receipt["frames"] and len(frames) > 2
    compressed = (folder / "frames.rgb.z").read_bytes()
    patches, times, previous, gaps = [], [], None, []
    position = 0
    for index, frame in enumerate(frames):
        assert frame["index"] == index and frame["format"] == "RGB"
        assert frame["width"] == config["roi"][2] and frame["height"] == config["cellHeight"]
        assert frame["pixelOffset"] == position
        assert all(frame["source"][key] == frame["sample"][key] and frame["source"][key] is not None for key in ("ptsNs", "offset"))
        if previous:
            advance = frame["source"]["offset"] - previous["source"]["offset"]
            assert advance > 0
            if advance != 1:
                assert sequence_scope == "measured-key-window"
                gaps.append({"previousFrame": index - 1, "nextFrame": index, "missingOffsets": advance - 1})
            assert frame["source"]["ptsNs"] > previous["source"]["ptsNs"]
            assert all(frame["clock"][key] == previous["clock"][key] for key in ("identity", "type", "name", "baseTimeNs"))
        size = frame["bytes"]
        assert size == frame["stride"] * frame["height"] <= 65536
        end = position + frame["pixelLength"]
        decoder = zlib.decompressobj()
        raw = decoder.decompress(compressed[position:end], size + 1)
        assert decoder.eof and not decoder.unused_data and len(raw) == size
        assert hashlib.sha256(raw).hexdigest() == frame["pixelSha256"]
        cells = []
        for column in range(len(text)):
            start = (column * config["cellWidth"] + 2) * 3
            cells.append(b"".join(raw[y * frame["stride"] + start:y * frame["stride"] + start + (config["cellWidth"] - 4) * 3] for y in range(frame["height"])))
        patches.append(cells)
        times.append(bounds(frame))
        position, previous = end, frame
    assert position == len(compressed)
    templates = list(patches[-1])
    if wrong_template:
        templates[0] = templates[1]
    if blank_template:
        templates[0] = templates[0][:3] * (len(templates[0]) // 3)
    assert all(len(set(patch[index:index + 3] for index in range(0, len(patch), 3))) > 1 for patch in templates), "Blank glyph template"
    assert len(set(templates)) == len(templates), "Glyph templates are not distinct"
    observations = []
    for column, dispatched in enumerate(dispatches):
        matching = [index for index, cells in enumerate(patches) if cells[column] == templates[column]]
        assert matching, "Expected glyph template never appeared"
        first = matching[0]
        assert first > 0, "Glyph was already visible before the key"
        assert len(matching) == len(patches) - first, "Glyph patch changed after first appearance"
        before = round(dispatched["key"]["before"] * 1e9)
        acknowledged = round(dispatched["key"]["acknowledged"] * 1e9)
        assert before <= acknowledged and before <= times[first][1]
        low = max(0, times[first - 1][0] - acknowledged) / 1e6
        high = (times[first][1] - before) / 1e6
        observations.append({"sequence": column + 1, "character": text[column], "firstFrame": first, "delayMs": [low, high], "dispatchNs": [before, acknowledged], "precedingFrameNs": times[first - 1], "matchingFrameNs": times[first]})
    begin = min(key["dispatchNs"][0] for key in observations)
    end = max(key["matchingFrameNs"][1] for key in observations)
    for gap in gaps:
        gap["boundsNs"] = [times[gap["previousFrame"]][0], times[gap["nextFrame"]][1]]
        gap["overlapsMeasuredWindow"] = gap["boundsNs"][0] <= end and gap["boundsNs"][1] >= begin
        assert not gap["overlapsMeasuredWindow"], "Source sequence gap overlaps measured typing"
    return {"scope": "Exploratory twelve-character calibration using settled glyph templates and independently checked final Codex text. No load comparison, causal attribution or physical scanout claim. The fixed pixel crops are not validated for longer text or changed geometry.", "keys": observations, "frames": len(frames), "pixelTemplateRule": "Exact central four RGB columns per nominal eight-pixel cell. Both two-pixel edges are excluded after the calibration identified caret contamination. Require nonblank, distinct glyph templates and one lasting transition per patch.", "sampleCount": len(observations), "sourceSequence": {"scope": sequence_scope, "measurementWindowNs": [begin, end], "recordedGaps": gaps}}


if __name__ == "__main__":
    config = json.loads(Path(sys.argv[1]).read_text())
    folder = Path(sys.argv[2])
    result = evaluate(config, folder, "--wrong-template" in sys.argv[3:], "--blank-template" in sys.argv[3:])
    print(json.dumps(result, indent=2))
