import glob, json, os, statistics, sys

R = "/var/tmp/voyager-crew/scratch/voice-spoken-r2"
S = "/var/tmp/voyager-crew/scratch/model-tiers/exp0"


def folder(batch):
    mine = f"{S}/batch-{batch}"
    return mine if os.path.isdir(mine) else f"{R}/batch-{batch}"


def first_text(stream):
    rows = [json.loads(l) for l in open(stream)]
    events = [(r["t"], json.loads(r["line"])) for r in rows if r["line"].startswith("{")]
    starts = [i for i, (_, m) in enumerate(events) if m.get("type") == "stream_event" and m["event"]["type"] == "message_start"]
    any_text = next((t for t, m in events if m.get("type") == "stream_event" and m["event"].get("delta", {}).get("type") == "text_delta"), None)
    last = starts[-1] if starts else 0
    final_text = next((t for t, m in events[last:] if m.get("type") == "stream_event" and m["event"].get("delta", {}).get("type") == "text_delta"), None)
    end = next((t for t, m in events if m.get("type") == "result"), None)
    return any_text, final_text, end


def pct(xs, p):
    xs = sorted(xs)
    if not xs:
        return None
    k = (len(xs) - 1) * p
    lo, hi = int(k), min(int(k) + 1, len(xs) - 1)
    return round(xs[lo] + (xs[hi] - xs[lo]) * (k - lo), 2)


def batch_stats(batch):
    d = folder(batch)
    durations, costs, any_t, final_t, ends, tokens_out = [], [], [], [], [], []
    for f in sorted(glob.glob(f"{d}/out/turn-*.json")):
        if f.endswith(".err"):
            continue
        try:
            j = json.load(open(f))
        except Exception:
            continue
        durations.append(j.get("duration_ms", 0) / 1000)
        costs.append(j.get("total_cost_usd", 0))
        tokens_out.append((j.get("usage") or {}).get("output_tokens", 0))
        stream = f[:-5] + ".stream.jsonl"
        if os.path.exists(stream):
            a, b, e = first_text(stream)
            if a is not None:
                any_t.append(a)
            if b is not None:
                final_t.append(b)
            if e is not None:
                ends.append(e)
    return {
        "batch": batch, "variant": open(f"{d}/variant").read().strip(), "turns": len(durations),
        "cost_usd": round(sum(costs), 2), "output_tokens": sum(tokens_out),
        "duration_p50": pct(durations, .5), "duration_p90": pct(durations, .9),
        "first_text_p50": pct(any_t, .5), "first_text_p90": pct(any_t, .9),
        "reply_text_p50": pct(final_t, .5), "reply_text_p90": pct(final_t, .9),
        "wall_end_p50": pct(ends, .5), "wall_end_p90": pct(ends, .9),
    }


for b in sys.argv[1:]:
    print(json.dumps(batch_stats(b)))
