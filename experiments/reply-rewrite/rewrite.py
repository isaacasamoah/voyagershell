import json, os, re, subprocess, sys, time, http.client
from pathlib import Path

SOURCE = Path("/var/tmp/voyager-crew/scratch/voice-spoken-r2")
SCRATCH = Path("/var/tmp/voyager-crew/scratch/reply-rewrite")
CLAUDE = "/home/isaac/.local/share/fnm/node-versions/v24.13.1/installation/lib/node_modules/@anthropic-ai/claude-code/bin/claude.exe"
PROMPT = (Path(__file__).parent / "rewrite-prompt.md").read_text()
SENTENCE_END = re.compile(r"[.!?][\"')]?(\s|$)")
CLEAN_ENV = {k: v for k, v in os.environ.items() if k not in ("ANTHROPIC_API_KEY", "HC_SOCKET", "HC_SESSION", "HC_TERMINAL_ID", "HC_SCOPE", "HC_TERMINAL_SOCKET")}


def clean(text):
    return re.sub(r"^\s*(\[vy\]|oru:)\s*", "", text or "").strip()


def turns(batch):
    folder = SOURCE / f"batch-{batch}"
    lines = [line.rstrip("\n").split("\t", 1)[1] for line in open(folder / "prompts.tsv") if line.strip()]
    for n, said in enumerate(lines, 1):
        path = folder / "out" / f"turn-{n:02d}.json"
        reply = ""
        if path.exists():
            try:
                reply = clean(json.load(open(path)).get("result"))
            except ValueError:
                pass
        yield n, said, reply


def message(said, reply):
    said = re.sub(r"^\s*\[spoken\]\s*", "", said)
    return f"The person said: {said}\n\nVoyager's reply:\n{reply}"


class Clock:
    def __init__(self):
        self.start = time.monotonic()
        self.text = ""
        self.first_text = None
        self.first_sentence = None

    def add(self, piece):
        if not piece:
            return
        now = time.monotonic() - self.start
        if self.first_text is None:
            self.first_text = now
        self.text += piece
        if self.first_sentence is None and SENTENCE_END.search(self.text):
            self.first_sentence = now

    def finish(self, text=None):
        done = time.monotonic() - self.start
        text = (text if text is not None else self.text).strip()
        return {"result": text, "timing": {"first_text_s": self.first_text, "first_sentence_s": self.first_sentence if self.first_sentence is not None else done, "done_s": done}}


def claude_args(model, extra):
    return [CLAUDE, "-p", "--model", model, "--system-prompt", PROMPT, "--tools", "", "--setting-sources", "", "--strict-mcp-config",
            "--disable-slash-commands", "--no-session-persistence", "--output-format", "stream-json", "--include-partial-messages", "--verbose", *extra]


def stream_deltas(line):
    event = json.loads(line)
    if event.get("type") == "stream_event":
        inner = event.get("event", {})
        if inner.get("type") == "content_block_delta" and inner.get("delta", {}).get("type") == "text_delta":
            return "delta", inner["delta"]["text"]
    if event.get("type") == "result":
        return "result", event.get("result") or ""
    return None, None


def claude_cold(model, text):
    clock = Clock()
    run = subprocess.Popen(claude_args(model, [text]), cwd=SCRATCH, env=CLEAN_ENV, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    final = None
    for line in run.stdout:
        kind, value = stream_deltas(line)
        if kind == "delta":
            clock.add(value)
        elif kind == "result":
            final = value
    run.wait()
    return clock.finish(final)


def llama(port, text):
    clock = Clock()
    body = json.dumps({"messages": [{"role": "system", "content": PROMPT}, {"role": "user", "content": text}], "temperature": 0, "max_tokens": 400, "stream": True})
    connection = http.client.HTTPConnection("127.0.0.1", port, timeout=120)
    connection.request("POST", "/v1/chat/completions", body, {"Content-Type": "application/json"})
    response = connection.getresponse()
    for raw in response:
        line = raw.decode().strip()
        if not line.startswith("data:") or line == "data: [DONE]":
            continue
        piece = json.loads(line[5:])["choices"][0].get("delta", {}).get("content")
        clock.add(piece)
    connection.close()
    return clock.finish()


def rewrite_all(name, sources, rewrite):
    for batch in sources:
        out = SCRATCH / f"batch-{name}-{batch}"
        (out / "out").mkdir(parents=True, exist_ok=True)
        (out / "prompts.tsv").write_bytes((SOURCE / f"batch-{batch}" / "prompts.tsv").read_bytes())
        for n, said, reply in turns(batch):
            target = out / "out" / f"turn-{n:02d}.json"
            if target.exists():
                continue
            row = rewrite(message(said, reply)) if reply else {"result": "", "timing": None}
            row["source"] = batch
            target.write_text(json.dumps(row))
            print(name, batch, n, row["timing"] and round(row["timing"]["done_s"], 2), flush=True)


def claude_warm(model, sources, out_path):
    run = subprocess.Popen(claude_args(model, ["--input-format", "stream-json"]), cwd=SCRATCH, env=CLEAN_ENV, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
    rows = []
    for batch in sources:
        for n, said, reply in turns(batch):
            if not reply:
                continue
            clock = Clock()
            run.stdin.write(json.dumps({"type": "user", "message": {"role": "user", "content": "Rewrite this one, on its own.\n\n" + message(said, reply)}}) + "\n")
            run.stdin.flush()
            for line in run.stdout:
                kind, value = stream_deltas(line)
                if kind == "delta":
                    clock.add(value)
                elif kind == "result":
                    rows.append({"source": batch, "turn": n, **clock.finish(value)["timing"]})
                    print("warm", model, batch, n, round(rows[-1]["done_s"], 2), flush=True)
                    break
    run.stdin.close()
    run.wait()
    Path(out_path).write_text(json.dumps(rows, indent=1))


if __name__ == "__main__":
    command = sys.argv[1]
    if command == "claude":
        model, name, sources = sys.argv[2], sys.argv[3], sys.argv[4].split(",")
        rewrite_all(name, sources, lambda text: claude_cold(model, text))
    elif command == "llama":
        port, name, sources = int(sys.argv[2]), sys.argv[3], sys.argv[4].split(",")
        rewrite_all(name, sources, lambda text: llama(port, text))
    elif command == "warm":
        claude_warm(sys.argv[2], sys.argv[3].split(","), sys.argv[4])
