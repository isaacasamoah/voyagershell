"""Can Claude Code take Voyager's tool over the pipe the host already holds, with no separate server process?

usage: inband_test.py [request ...]

Claude Code is started with an MCP server of type "sdk". It then writes each tool message to its own standard output
and reads the reply from its standard input, which this process already holds. Anthropic's Agent SDK uses this channel
for in-process tools. Anthropic does not document it for other programs, so a Claude Code update may change it.
"""
import json, os, subprocess, sys, threading, time

import agents, world, workspace_stub

made = []
workspace_stub.record = lambda entry: made.append({"at": time.time(), **entry})
command = ["claude", "-p", "--input-format", "stream-json", "--output-format", "stream-json", "--verbose", "--model", "claude-haiku-5-5",
           "--system-prompt", agents.ADMINISTRATOR, "--mcp-config", json.dumps({"mcpServers": {"voyager": {"type": "sdk", "name": "voyager"}}}),
           "--strict-mcp-config", "--tools", "", "--allowedTools", agents.TOOL, "--setting-sources", "", "--disable-slash-commands",
           "--no-session-persistence"]
environment = {key: value for key, value in os.environ.items() if not key.startswith("CLAUDE")}
process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True,
                           cwd=os.path.dirname(os.path.abspath(__file__)), env=environment)
threading.Timer(180, process.kill).start()


def send(value):
    process.stdin.write(json.dumps(value) + "\n")
    process.stdin.flush()


def ask(request):
    focus = dict(world.FOCUS, revision=str(workspace_stub.state["version"]))
    made.clear()
    send({"type": "user", "message": {"role": "user", "content": [{"type": "text", "text": "voyager.focus: " + json.dumps(focus) + "\n\n" + request}]}})
    return time.time()


pending = sys.argv[1:] or ["Rename the top right vessel to Starboard.", "Hide the bottom right vessel."]
started = asked = time.time()
send({"type": "control_request", "request_id": "initialize", "request": {"subtype": "initialize", "hooks": None, "sdkMcpServers": ["voyager"]}})
for line in process.stdout:
    try:
        event = json.loads(line)
    except ValueError:
        continue
    kind = event.get("type")
    if kind == "control_request" and event["request"].get("subtype") == "mcp_message":
        message = event["request"]["message"]
        answer = workspace_stub.reply(message) or {"jsonrpc": "2.0", "result": {}}
        send({"type": "control_response", "response": {"subtype": "success", "request_id": event["request_id"], "response": {"mcp_response": answer}}})
    elif kind == "control_request":
        send({"type": "control_response", "response": {"subtype": "error", "request_id": event["request_id"], "error": "unsupported"}})
    elif kind == "control_response":
        print(f"session ready after {time.time() - started:.1f} s with no server process")
        asked = ask(pending.pop(0))
    elif kind == "result":
        effects = [entry for entry in made if entry["action"].get("operation") != "inspect"]
        print(f"   {len(made)} tool call(s) over the pipe | effect after {(effects[0]['at'] - asked) if effects else float('nan'):.1f} s: "
              f"{effects[0]['action'] if effects else 'none'}\n   answer after {time.time() - asked:.1f} s: {event.get('result')!r}")
        if not pending:
            break
        asked = ask(pending.pop(0))
process.stdin.close()
try:
    process.wait(timeout=20)
except Exception:
    process.kill()
