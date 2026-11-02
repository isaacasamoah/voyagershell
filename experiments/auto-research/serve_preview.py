import argparse
from functools import partial
import hashlib
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import shutil
import tempfile


parser = argparse.ArgumentParser()
parser.add_argument("--record", required=True, type=Path)
parser.add_argument("--d3", required=True, type=Path)
parser.add_argument("--port", type=int, default=18747)
args = parser.parse_args()
source = Path(__file__).resolve().parent
with tempfile.TemporaryDirectory(prefix="research-voyage-preview-") as directory:
    root = Path(directory)
    for name in ["index.html", "preview.css", "preview.js", "graph.js", "progress.pg", "progress.gq", "usage.yaml", "cluster.yaml"]:
        shutil.copyfile(source / name, root / name)
    shutil.copyfile(args.record / "export.jsonl", root / "export.jsonl")
    shutil.copyfile(args.d3, root / "d3.min.js")
    metadata = {"record": args.record.name,
                "export_sha256": hashlib.sha256((root / "export.jsonl").read_bytes()).hexdigest(),
                "mode": "read-only snapshot; configuration export is a draft"}
    (root / "snapshot.json").write_text(json.dumps(metadata))
    handler = partial(SimpleHTTPRequestHandler, directory=directory)
    with ThreadingHTTPServer(("127.0.0.1", args.port), handler) as server:
        print(f"Research Voyage preview: http://127.0.0.1:{server.server_port}/", flush=True)
        server.serve_forever()
