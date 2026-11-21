import argparse, base64, json, os, re, statistics, sys, time, urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from record_requests import DEFAULT_DIR, refuse_unsafe

URL = "http://127.0.0.1:8112/v1/chat/completions"
BASE = "Perform ASR in English."
HINT = BASE + " Words you may hear: dock, Fleet, Vessel, Voyage, Voyager, voyagershell, rename, maximize, Portal, Core."

PRODUCT = {
    "dock": r"dock(s|ed|ing)?",
    "fleet": r"fleets?",
    "vessel": r"vessels?",
    "voyage": r"voyages?",
    "voyagershell": r"voyagershell",
    "rename": r"renam(e|es|ed|ing)",
    "maximize": r"maximi[sz](e|es|ed|ing)",
}
PRODUCT_RE = {k: re.compile("^" + v + "$") for k, v in PRODUCT.items()}
NUM = {"0": "zero", "1": "one", "2": "two", "3": "three", "4": "four", "5": "five", "6": "six", "7": "seven", "8": "eight", "9": "nine", "10": "ten"}


def words(text):
    t = text.lower().replace("voyager shell", "voyagershell").replace("voyager-shell", "voyagershell")
    t = re.sub(r"[^a-z0-9' ]", " ", t.replace("-", " "))
    return [NUM.get(w, w) for w in t.split()]


def product_key(w):
    for k, r in PRODUCT_RE.items():
        if r.match(w):
            return k
    return None


def align(ref, hyp):
    n, m = len(ref), len(hyp)
    d = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n + 1):
        d[i][0] = i
    for j in range(m + 1):
        d[0][j] = j
    for i in range(1, n + 1):
        for j in range(1, m + 1):
            d[i][j] = min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (ref[i - 1] != hyp[j - 1]))
    pairs, i, j = [], n, m
    while i > 0 or j > 0:
        if i > 0 and j > 0 and d[i][j] == d[i - 1][j - 1] + (ref[i - 1] != hyp[j - 1]):
            pairs.append((ref[i - 1], hyp[j - 1])); i -= 1; j -= 1
        elif i > 0 and d[i][j] == d[i - 1][j] + 1:
            pairs.append((ref[i - 1], None)); i -= 1
        else:
            pairs.append((None, hyp[j - 1])); j -= 1
    return d[n][m], pairs[::-1]


def hear(wav_path, system):
    with open(wav_path, "rb") as f:
        b = base64.b64encode(f.read()).decode()
    body = {"model": "omni", "temperature": 0, "max_tokens": 120, "messages": [
        {"role": "system", "content": system},
        {"role": "user", "content": [{"type": "input_audio", "input_audio": {"data": b, "format": "wav"}}]}]}
    req = urllib.request.Request(URL, json.dumps(body).encode(), {"Content-Type": "application/json"})
    t0 = time.time()
    with urllib.request.urlopen(req, timeout=120) as r:
        out = json.load(r)
    return out["choices"][0]["message"]["content"].strip(), time.time() - t0


def score(rows):
    errs = sum(r["errors"] for r in rows)
    refn = sum(r["ref_words"] for r in rows)
    prod = {k: {"heard": 0, "total": 0, "as": {}} for k in PRODUCT}
    for r in rows:
        for ref_w, hyp_w in r["pairs"]:
            k = product_key(ref_w) if ref_w else None
            if k is None:
                continue
            prod[k]["total"] += 1
            if hyp_w is not None and product_key(hyp_w) == k:
                prod[k]["heard"] += 1
            else:
                key = hyp_w or "(dropped)"
                prod[k]["as"][key] = prod[k]["as"].get(key, 0) + 1
    tot = sum(v["total"] for v in prod.values())
    ok = sum(v["heard"] for v in prod.values())
    return {
        "requests": len(rows),
        "word_error_rate": round(errs / refn, 4) if refn else None,
        "median_request_wer": round(statistics.median(r["wer"] for r in rows), 4) if rows else None,
        "exact_requests": sum(r["errors"] == 0 for r in rows),
        "product_words_heard": ok, "product_words_total": tot,
        "product_word_error_rate": round(1 - ok / tot, 4) if tot else None,
        "per_product_word": prod,
        "median_seconds": round(statistics.median(r["seconds"] for r in rows), 2) if rows else None,
    }


def run_mode(items, folder, system):
    rows = []
    for key, e in items:
        heard, secs = hear(os.path.join(folder, e["file"]), system)
        ref, hyp = words(e["text"]), words(heard)
        errs, pairs = align(ref, hyp)
        rows.append({"key": key, "category": e["category"], "split": e["split"], "text": e["text"], "heard": heard,
                     "ref_words": len(ref), "errors": errs, "wer": round(errs / len(ref), 4) if ref else 0.0,
                     "pairs": pairs, "seconds": round(secs, 3)})
    return rows


def show(name, rows):
    s = score(rows)
    print(f"\n== {name} ==")
    print(f"requests {s['requests']}, exact {s['exact_requests']}, word error {s['word_error_rate']:.1%} (median per request {s['median_request_wer']:.1%}), median {s['median_seconds']} s each")
    for split in ("tune", "held_out"):
        sub = [r for r in rows if r["split"] == split]
        if sub:
            print(f"  {split}: word error {score(sub)['word_error_rate']:.1%} over {len(sub)}")
    print(f"product words heard right: {s['product_words_heard']}/{s['product_words_total']} (error {s['product_word_error_rate']:.1%})")
    for k, v in s["per_product_word"].items():
        if v["total"]:
            miss = ", ".join(f"{a} x{n}" for a, n in sorted(v["as"].items(), key=lambda x: -x[1]))
            print(f"  {k:13s} {v['heard']}/{v['total']}" + (f"   came out as: {miss}" if miss else ""))
    return s


def main():
    ap = argparse.ArgumentParser(description="Run Omni's hearing (llama-server on port 8112) over the recorded requests: word error per request and product-word errors.")
    ap.add_argument("recordings_dir", nargs="?", default=DEFAULT_DIR, help=f"folder made by record_requests.py (default {DEFAULT_DIR})")
    ap.add_argument("--plain-only", action="store_true", help="skip the run that lists the product words in the prompt")
    a = ap.parse_args()
    refuse_unsafe(a.recordings_dir)
    mpath = os.path.join(a.recordings_dir, "manifest.json")
    if not os.path.exists(mpath):
        sys.exit(f"no manifest at {mpath}; record the requests first with round4/record_requests.py")
    with open(mpath) as f:
        m = json.load(f)
    items = sorted(m["requests"].items())
    if not items:
        sys.exit("manifest has no recordings")
    modes = [("plain prompt (no hint)", BASE, "plain")] + ([] if a.plain_only else [("prompt lists the product words", HINT, "hinted")])
    result = {"recordings_dir": a.recordings_dir, "ran_at": time.strftime("%Y-%m-%dT%H:%M:%S%z"), "modes": {}}
    for title, system, tag in modes:
        rows = run_mode(items, a.recordings_dir, system)
        result["modes"][tag] = {"summary": show(title, rows), "rows": rows}
    out = os.path.join(a.recordings_dir, "hearing-results.json")
    fd = os.open(out, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(result, f, indent=1)
    print(f"\nfull results, with the heard text for each request, are in {out} (not in git)")


if __name__ == "__main__":
    main()
