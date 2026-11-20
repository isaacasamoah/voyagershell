import json, os, subprocess, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
TOOL = "mcp__voyager__voyager_workspace"
ADMINISTRATOR = (
    "You are Voyager, the human's concise private workspace administrator. Each request carries voyager.focus with the avatar's "
    "scope, readable path, folder and layout revision. A path of Overwatch means the whole workspace. Use voyager_workspace to inspect real IDs and versions before a workspace "
    "effect, then quote the returned version. Resolve names and positions from the panels list in the response when it is present. "
    "If the target does not exist, change nothing and say so. Report the actual Applied, Rejected or Uncertain outcome in one short "
    "plain sentence that can be read aloud; acceptance is not completion. Do not repeat an uncertain effect. Never ask a question "
    "when the request is clear. A request may arrive by voice and be misheard: match names loosely against the panels, and never "
    "mention spelling or wording."
)


def calls(log):
    if not os.path.exists(log):
        return []
    return [json.loads(line) for line in open(log) if line.strip()]


class Session:
    def __init__(self, model, effort):
        self.work = tempfile.mkdtemp(prefix="voyager-act-")
        self.log = os.path.join(self.work, "calls.jsonl")
        config = os.path.join(self.work, "mcp.json")
        json.dump({"mcpServers": {"voyager": {"command": sys.executable, "args": [os.path.join(HERE, "workspace_stub.py")], "env": {"VOYAGER_STUB_LOG": self.log}}}}, open(config, "w"))
        command = ["claude", "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose",
                   "--model", model, "--effort", effort, "--system-prompt", ADMINISTRATOR, "--mcp-config", config, "--strict-mcp-config",
                   "--tools", "", "--allowedTools", TOOL, "--setting-sources", "", "--disable-slash-commands", "--no-session-persistence"]
        environment = {key: value for key, value in os.environ.items() if not key.startswith(("CLAUDE", "HC_")) and key != "ANTHROPIC_API_KEY"}
        self.process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, cwd=self.work, env=environment)

    def turn(self, request, focus, timeout=240):
        seen = len(calls(self.log))
        current = open(self.log + ".version").read() if os.path.exists(self.log + ".version") else focus["revision"]
        prompt = "voyager.focus: " + json.dumps({**focus, "revision": current}) + "\n\n" + request
        open(self.log + ".reset", "w").close()
        started = time.time()
        self.process.stdin.write(json.dumps({"type": "user", "message": {"role": "user", "content": [{"type": "text", "text": prompt}]}}) + "\n")
        self.process.stdin.flush()
        answer, error, usage, extra = "", None, {}, {}
        for line in self.process.stdout:
            if time.time() - started > timeout:
                error = "timed out"
                break
            try:
                event = json.loads(line)
            except ValueError:
                continue
            if event.get("type") == "result":
                answer = event.get("result", "")
                error = answer if event.get("is_error") else None
                usage = event.get("usage") or {}
                extra = {key: event.get(key) for key in ("num_turns", "duration_ms", "duration_api_ms")}
                break
        else:
            error = error or "session ended"
        seconds = time.time() - started
        made = calls(self.log)[seen:]
        effects = [entry for entry in made if entry["action"].get("operation") != "inspect"]
        return {"request": request, "answer": answer, "calls": made, "seconds": seconds, "error": error, "usage": usage, **extra,
                "first_call_seconds": (made[0]["at"] - started) if made else None,
                "first_effect_seconds": (effects[0]["at"] - started) if effects else None}

    def close(self):
        try:
            self.process.stdin.close()
            self.process.wait(timeout=20)
        except Exception:
            self.process.kill()
