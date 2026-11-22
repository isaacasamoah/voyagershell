import io, json, os, sys
import numpy as np, soundfile as sf, pyarrow.parquet as pq
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from scipy.signal import resample_poly
from eot_eval import SmartTurn

SHARD = "/var/tmp/voyager-crew/scratch/voice-interrupt/data-dl/smart-turn-v3.2-test/train-00000-of-00010.parquet"
LIMIT = int(sys.argv[2]) if len(sys.argv) > 2 else 600

t = pq.read_table(SHARD, columns=["audio", "language", "endpoint_bool", "midfiller", "endfiller", "synthetic", "dataset"])
rows = [r for r in t.to_pylist() if r["language"] in ("eng", "en", "english")]
print("english rows", len(rows), "of", t.num_rows, {k: sum(1 for r in rows if r["synthetic"] == k) for k in (True, False)})
human = [r for r in rows if not r["synthetic"]][:LIMIT]
st = SmartTurn(); out = []
for r in human:
    a, sr = sf.read(io.BytesIO(r["audio"]["bytes"]), dtype="float32", always_2d=True); a = a.mean(1)
    if sr != 16000:
        g = np.gcd(sr, 16000); a = resample_poly(a, 16000 // g, sr // g).astype(np.float32)
    out.append({"complete": r["endpoint_bool"], "midfiller": r["midfiller"], "endfiller": r["endfiller"], "dataset": r["dataset"], "p": st(a)})
res = {}
for thr in (0.5, 0.7, 0.9):
    inc = [o for o in out if not o["complete"]]; com = [o for o in out if o["complete"]]
    res[thr] = {"incomplete_called_complete": f"{sum(o['p'] >= thr for o in inc)}/{len(inc)}",
                "complete_called_complete": f"{sum(o['p'] >= thr for o in com)}/{len(com)}",
                "midfiller_incomplete_called_complete": f"{sum(o['p'] >= thr for o in inc if o['midfiller'])}/{sum(1 for o in inc if o['midfiller'])}"}
print(json.dumps(res, indent=1))
json.dump({"summary": res, "rows": out}, open(sys.argv[1], "w"))
