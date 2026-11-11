"""Acting agents for the voice prototype, and the rule that picks one.

The voice front hands a typed request to an acting agent. The agent holds Voyager's tools, performs the request and
returns a short answer for the voice to read aloud. Here the tools come from workspace_stub.py over MCP.
"""
import json, os, shutil, subprocess, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
TOOL = "mcp__voyager__voyager_workspace"
ADMINISTRATOR = (
    "You are Voyager, the human's concise private workspace administrator. Each request carries voyager.focus with the avatar's "
    "scope, readable path, folder and layout revision. A path of Overwatch means the whole workspace. Use voyager_workspace to inspect real IDs and versions before a workspace "
    "effect, then quote the returned version. Resolve names and positions from the panels list in the response when it is present. "
    "If the target does not exist, change nothing and say so. Report the actual Applied, Rejected or Uncertain outcome in one short "
    "plain sentence that can be read aloud; acceptance is not completion. Do not repeat an uncertain effect. Never ask a question "
    "when the request is clear."
)


def installed(name):
    return shutil.which(name) is not None


def choose(settings, have=installed):
    """Pick the acting agent and the voice. Claude is preferred when installed; Codex keeps its own voice by default."""
    agent = settings.get("agent") or next((name for name in ("claude", "codex") if have(name)), None)
    if agent not in ("claude", "codex"):
        raise ValueError("No acting agent is available; install Claude Code or Codex")
    if not have(agent):
        raise ValueError(f"The selected acting agent, {agent}, is not installed")
    voice = settings.get("voice") or ("local" if agent == "claude" else "native")
    if voice not in ("local", "native") or (voice == "native" and agent != "codex"):
        raise ValueError("Voice must be local, or native with Codex")
    return agent, voice


def stub_config(log, panels):
    return {"command": sys.executable, "args": [os.path.join(HERE, "workspace_stub.py")],
            "env": {"VOYAGER_STUB_LOG": log, "VOYAGER_STUB_PANELS": "1" if panels else "0",
                    "VOYAGER_WORLD": os.environ.get("VOYAGER_WORLD", "")}}


def calls(log):
    if not os.path.exists(log):
        return []
    return [json.loads(line) for line in open(log) if line.strip()]


def claude_turn(request, focus, model="claude-haiku-5-5", panels=True, timeout=240):
    """One cold headless Claude Code turn. -> dict(answer, calls, seconds, first_effect_seconds, error)"""
    work = tempfile.mkdtemp(prefix="voyager-act-")
    log = os.path.join(work, "calls.jsonl")
    config = os.path.join(work, "mcp.json")
    json.dump({"mcpServers": {"voyager": stub_config(log, panels)}}, open(config, "w"))
    prompt = "voyager.focus: " + json.dumps(focus) + "\n\n" + request
    command = ["claude", "-p", prompt, "--output-format", "json", "--model", model, "--system-prompt", ADMINISTRATOR,
               "--mcp-config", config, "--strict-mcp-config", "--tools", "", "--allowedTools", TOOL,
               "--setting-sources", "", "--disable-slash-commands", "--no-session-persistence"]
    environment = {key: value for key, value in os.environ.items() if not key.startswith("CLAUDE")}
    started = time.time()
    try:
        done = subprocess.run(command, capture_output=True, text=True, timeout=timeout, cwd=work, env=environment)
    except subprocess.TimeoutExpired:
        return {"answer": "", "calls": calls(log), "seconds": timeout, "first_effect_seconds": None, "error": "timed out"}
    seconds = time.time() - started
    made = calls(log)
    effects = [entry for entry in made if entry["action"].get("operation") != "inspect"]
    try:
        body = json.loads(done.stdout)
        answer, error = body.get("result", ""), (None if not body.get("is_error") else body.get("result"))
        cost = body.get("total_cost_usd")
    except Exception:
        answer, error, cost = "", (done.stderr or done.stdout)[-400:], None
    return {"answer": answer, "calls": made, "seconds": seconds, "error": error, "cost": cost,
            "first_effect_seconds": (effects[0]["at"] - started) if effects else None}


def codex_turn(request, focus, model=None, panels=True, timeout=300):
    """One cold headless Codex turn with the same stand-in tools. -> same shape as claude_turn."""
    work = tempfile.mkdtemp(prefix="voyager-act-")
    log = os.path.join(work, "calls.jsonl")
    last = os.path.join(work, "last.txt")
    stub = stub_config(log, panels)
    prompt = ADMINISTRATOR + "\n\nvoyager.focus: " + json.dumps(focus) + "\n\n" + request
    command = ["codex", "exec", "--skip-git-repo-check", "--ephemeral", "--sandbox", "read-only", "-o", last,
               "-c", "mcp_servers.voyager.command=" + json.dumps(stub["command"]),
               "-c", "mcp_servers.voyager.args=" + json.dumps(stub["args"]),
               "-c", "mcp_servers.voyager.env=" + "{" + ", ".join(f"{key} = {json.dumps(value)}" for key, value in stub["env"].items()) + "}"]
    if model:
        command += ["-m", model]
    environment = {key: value for key, value in os.environ.items() if not key.startswith(("CLAUDE", "HC_"))}
    started = time.time()
    try:
        done = subprocess.run(command + [prompt], capture_output=True, text=True, timeout=timeout, cwd=work, env=environment)
    except subprocess.TimeoutExpired:
        return {"answer": "", "calls": calls(log), "seconds": timeout, "first_effect_seconds": None, "error": "timed out"}
    seconds = time.time() - started
    made = calls(log)
    effects = [entry for entry in made if entry["action"].get("operation") != "inspect"]
    answer = open(last).read().strip() if os.path.exists(last) else ""
    return {"answer": answer, "calls": made, "seconds": seconds, "cost": None,
            "error": None if done.returncode == 0 else (done.stderr or done.stdout)[-400:],
            "first_effect_seconds": (effects[0]["at"] - started) if effects else None}


class ClaudeSession:
    """One Claude Code process kept alive across requests, so a request does not pay the start-up cost."""

    def __init__(self, model="claude-haiku-5-5", panels=True):
        self.work = tempfile.mkdtemp(prefix="voyager-act-")
        self.log = os.path.join(self.work, "calls.jsonl")
        config = os.path.join(self.work, "mcp.json")
        json.dump({"mcpServers": {"voyager": stub_config(self.log, panels)}}, open(config, "w"))
        command = ["claude", "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose",
                   "--model", model, "--system-prompt", ADMINISTRATOR, "--mcp-config", config, "--strict-mcp-config",
                   "--tools", "", "--allowedTools", TOOL, "--setting-sources", "", "--disable-slash-commands",
                   "--no-session-persistence"]
        environment = {key: value for key, value in os.environ.items() if not key.startswith("CLAUDE")}
        self.process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                        text=True, cwd=self.work, env=environment)

    def turn(self, request, focus):
        seen = len(calls(self.log))
        prompt = "voyager.focus: " + json.dumps(focus) + "\n\n" + request
        started = time.time()
        self.process.stdin.write(json.dumps({"type": "user", "message": {"role": "user", "content": [{"type": "text", "text": prompt}]}}) + "\n")
        self.process.stdin.flush()
        answer, error = "", None
        for line in self.process.stdout:
            try:
                event = json.loads(line)
            except ValueError:
                continue
            if event.get("type") == "result":
                answer, error = event.get("result", ""), (event.get("result") if event.get("is_error") else None)
                break
        seconds = time.time() - started
        made = calls(self.log)[seen:]
        effects = [entry for entry in made if entry["action"].get("operation") != "inspect"]
        return {"answer": answer, "calls": made, "seconds": seconds, "error": error, "cost": None,
                "first_call_seconds": (made[0]["at"] - started) if made else None,
                "first_effect_seconds": (effects[0]["at"] - started) if effects else None}

    def close(self):
        try:
            self.process.stdin.close()
            self.process.wait(timeout=20)
        except Exception:
            self.process.kill()


TURNS = {"claude": claude_turn, "codex": codex_turn}
