import json
import shlex
import shutil
import time
from pathlib import Path

from PIL import ImageChops

from proof_process import process_identity, observe_core_exit
from proof_workspace import core_rpc, stop_existing_core, wait


PROBE = '''import json, os, re, sys, termios, tty
from pathlib import Path
state = Path(sys.argv[1])
tracking = sys.argv[2] == "mouse"
old = termios.tcgetattr(0)
position = 100
pending = b""
def draw():
    state.write_text(json.dumps({"position": position, "tracking": tracking, "pid": os.getpid()}))
    sys.stdout.write("\\x1b[H\\x1b[2J" + "\\r\\n".join(f"SCROLL {position + row:03d}" for row in range(30)))
    sys.stdout.flush()
try:
    tty.setraw(0)
    sys.stdout.write("\\x1b[?1049h" + ("\\x1b[?1000h\\x1b[?1006h" if tracking else ""))
    draw()
    while True:
        pending += os.read(0, 128)
        if b"q" in pending:
            break
        matches = list(re.finditer(rb"\\x1b(?:\\[<(?P<button>64|65);[0-9]+;[0-9]+M|[\\[O](?P<key>A|B))", pending))
        for match in matches:
            up = match.group("button") == b"64" or match.group("key") == b"A"
            position = max(0, min(200, position + (-1 if up else 1)))
        if matches:
            pending = pending[matches[-1].end():]
            draw()
finally:
    sys.stdout.write("\\x1b[?1000l\\x1b[?1006l\\x1b[?1049l")
    sys.stdout.flush()
    termios.tcsetattr(0, termios.TCSADRAIN, old)
    state.write_text(json.dumps({"ended": True, "position": position}))
'''


def prove(*, native, capture, geometry, close, start_frame, evidence, session, env, journey):
    assert journey == "terminal-scrolling"
    socket = Path(env["XDG_RUNTIME_DIR"]) / "herdr-core" / (session + ".sock")
    observed = {"cases": [], "limits": "Probe cases are deterministic; actual Codex is separately named when enabled. Physical touchpad and IME are not established."}
    probe = evidence / "scroll-probe.py"
    probe.write_text(PROBE)
    core = None
    running = None

    def rpc(method, params):
        assert socket.is_socket(), "Dedicated Core socket is absent"
        return core_rpc(session, env, method, params)

    def key(code):
        native("key", code, True)
        native("key", code, False)

    def type_text(text):
        for character in text:
            key(65293 if character == "\n" else ord(character))

    def focus():
        if env.get("VOYAGER_SCROLL_ISOLATED_X11") == "1":
            bounds = geometry()
            image = capture("isolated-terminal-rectangle")
            assert image.size == (1450, 940), "Measured isolated terminal requires the checked viewport"
            item = {"x": 233, "y": 79, "width": 1208, "height": 822, "source": "native-repro-04/terminal-fields.json and before-close-compositor.png"}
            (evidence / "terminal-rectangle.json").write_text(json.dumps(item, indent=2))
            native("move", int(bounds["X"]) + item["x"] + item["width"] / 2, int(bounds["Y"]) + item["y"] + item["height"] / 3, 2)
            native("button", True)
            native("button", False)
            return item["x"], item["y"], item["width"], item["height"]

        def terminals():
            fields = native("fields", json.loads((evidence / "launch.json").read_text())["pid"], ["Terminal"], "window")["fields"]
            (evidence / "terminal-fields.json").write_text(json.dumps(fields, indent=2))
            return [item for item in fields if item["role"] == "terminal" and item["width"] > 0]

        terminals = wait(terminals, lambda items: len(items) == 1, "one visible native fixture terminal")
        item = terminals[0]
        bounds = geometry()
        native("move", int(bounds["X"]) + item["x"] + item["width"] / 2, int(bounds["Y"]) + item["y"] + item["height"] / 3, 2)
        native("button", True)
        native("button", False)
        return tuple(round(item[name] / 2) for name in ("x", "y", "width", "height"))

    def frame(name, box):
        image = capture(name)
        x, y, width, height = box
        return image.crop((x + 10, y + 10, x + width - 10, y + min(height // 3, 150)))

    def wheel(amount):
        for _ in range(6):
            native("scroll", amount / 6, 0)
            time.sleep(0.04)
        native("scroll", 0, 1)

    def same_program():
        assert rpc("terminal.get", {"terminal": address})["pid"] == shell["pid"]
        assert process_identity(shell["pid"], metadata_only=True) == shell_identity
        assert rpc("server.status", {})["core"]["id"] == core["core"]["id"]

    try:
        wait(socket.is_socket, bool, "dedicated Core")
        core = rpc("server.status", {})
        core_identity = process_identity(core["pid"], metadata_only=True)
        document = wait(lambda: rpc("doc.get", {"name": "voyager-layout-v1"}), lambda item: bool(item.get("value", {}).get("contents")) and bool(item["value"]["contents"][0].get("backend")), "bound terminal")
        address = document["value"]["contents"][0]["backend"]
        shell = rpc("terminal.get", {"terminal": address})
        shell_identity = process_identity(shell["pid"], metadata_only=True)
        box = focus()
        type_text("printf 'HISTORY-%03d\\n' {1..120}\n")
        time.sleep(0.5)
        live = frame("scroll-normal-live", box)
        wheel(-240)
        time.sleep(0.3)
        history = frame("scroll-normal-up", box)
        assert ImageChops.difference(live, history).getbbox(), "Normal-screen history did not visibly move up"
        wheel(240)
        time.sleep(0.3)
        restored = frame("scroll-normal-down", box)
        assert not ImageChops.difference(live, restored).getbbox(), "Normal-screen down did not restore the same visible history"
        observed["cases"].append({"mode": "normal-history", "passed": True})
        for mode in ("arrows", "mouse"):
            state = evidence / (mode + "-state.json")
            type_text("python3 " + shlex.quote(str(probe)) + " " + shlex.quote(str(state)) + " " + mode + "\n")
            wait(state.exists, bool, mode + " probe")
            running = state
            time.sleep(0.3)
            before = frame("scroll-" + mode + "-before", box)
            wheel(-120)
            time.sleep(0.3)
            up = json.loads(state.read_text())
            upper = frame("scroll-" + mode + "-up", box)
            wheel(120)
            time.sleep(0.3)
            down = json.loads(state.read_text())
            frame("scroll-" + mode + "-down", box)
            passed = up["position"] < 100 and down["position"] > up["position"] and bool(ImageChops.difference(before, upper).getbbox())
            observed["cases"].append({"mode": mode, "up": up, "down": down, "passed": passed})
            key(ord("q"))
            wait(lambda: json.loads(state.read_text()), lambda item: item.get("ended"), "probe exit")
            running = None
            same_program()
        wheel(-120)
        time.sleep(0.3)
        frame("scroll-before-reattach-history", box)
        wheel(120)
        close()
        start_frame("scroll-reattached")
        box = focus()
        time.sleep(0.3)
        reattached_live = frame("scroll-reattached-live", box)
        wheel(-120)
        time.sleep(0.3)
        reattached_history = frame("scroll-reattached-up", box)
        observed["cases"].append({"mode": "reattached-history", "passed": bool(ImageChops.difference(reattached_live, reattached_history).getbbox())})
        same_program()
        assert all(item["passed"] for item in observed["cases"]), observed["cases"]
        if env.get("VOYAGER_SCROLL_AGENT") == "1":
            executable = shutil.which("codex", path=env["PATH"])
            assert executable, "Installed Codex is unavailable"
            prompt = "Use no tools or subagents. Begin with the line oru: scroll-test. Then write 100 separate plain lines numbered SCROLL-001 through SCROLL-100. No other text. Do not change files."
            argv = [executable, "--no-daemon", "--model", "gpt-6.1-sol", "-c", 'model_reasoning_effort="high"', "-c", "check_for_update_on_startup=false", "--dangerously-bypass-approvals-and-sandbox", prompt]
            (evidence / "agent-intent.json").write_text(json.dumps({"argv": argv, "terminal": address, "shell": shell_identity}, indent=2))
            type_text(shlex.join(argv) + "\n")
            wait(lambda: rpc("terminal.read", {"terminal": address})["text"], lambda text: any(line.strip().lstrip("• ") == "SCROLL-100" for line in text.splitlines()), "one actual Codex response", 120)
            time.sleep(1)
            agent = rpc("terminal.get", {"terminal": address})["foreground"]
            agent_identity = process_identity(agent["pid"], metadata_only=True)
            before = frame("scroll-agent-before", box)
            wheel(-240)
            time.sleep(0.5)
            upper = frame("scroll-agent-up", box)
            wheel(240)
            time.sleep(0.5)
            lower = frame("scroll-agent-down", box)
            assert ImageChops.difference(before, upper).getbbox(), "Actual Codex content did not visibly scroll up"
            assert ImageChops.difference(upper, lower).getbbox(), "Actual Codex content did not visibly scroll down"
            assert process_identity(agent["pid"], metadata_only=True) == agent_identity
            key(65307)
            type_text("scroll-typing-marker")
            wait(lambda: rpc("terminal.read", {"terminal": address})["text"], lambda text: "scroll-typing-marker" in text, "visible Codex input text")
            time.sleep(0.3)
            capture("scroll-agent-typing")
            observed["cases"].append({"mode": "actual-Codex", "program": agent, "identity": agent_identity, "passed": True})
        else:
            type_text("echo SCROLL-LIVE-OUTPUT\n")
            capture("scroll-final-live-output")
        same_program()
        return ["normal-history-wheel-up-down", "alternate-arrow-wheel-up-down", "mouse-report-wheel-up-down", "same-Core-and-program"] + (["actual-Codex-wheel-and-typing"] if env.get("VOYAGER_SCROLL_AGENT") == "1" else [])
    finally:
        (evidence / "scroll-observed.json").write_text(json.dumps(observed, indent=2))
        if running is not None:
            key(ord("q"))
            wait(lambda: json.loads(running.read_text()), lambda item: item.get("ended"), "probe exit")
        if core is not None:
            assert process_identity(core["pid"], metadata_only=True) == core_identity
            close()
            assert rpc("server.status", {})["core"]["id"] == core["core"]["id"]
            stop_existing_core(session, env)
            owned = [{"pid": shell["pid"], **shell_identity}, {"pid": core["pid"], **core_identity}]
            if "agent_identity" in locals():
                owned.append({"pid": agent["pid"], **agent_identity})
            exits = observe_core_exit(session, env, owned)
            (evidence / "scroll-cleanup.json").write_text(json.dumps(exits, indent=2))
