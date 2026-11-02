import hashlib
import json
import os
import shutil
import shlex
import time
from pathlib import Path
from secrets import randbelow, token_hex

from proof_process import process_identity
from proof_workspace import core_rpc


def has_answer(text, expected):
    return any(line.strip().lstrip("• ") == expected for line in text.splitlines())


def process_record(pid):
    identity = process_identity(pid, metadata_only=True)
    path = Path("/proc") / str(pid)
    fields = path.joinpath("stat").read_text().rsplit(") ", 1)[1].split()
    return {
        **identity,
        "parent": int(fields[1]),
        "cwd": str(path.joinpath("cwd").resolve(strict=True)),
        "argv": [
            os.fsdecode(value)
            for value in path.joinpath("cmdline").read_bytes().split(b"\0")[:-1]
        ],
    }


def prove(
    *, native, capture, geometry, close, start_frame, evidence, session, env, journey
):
    assert journey == "terminal-agent"
    observed = {}
    socket = None

    def rpc(method, params):
        assert socket is not None and socket.is_socket(), (
            "The dedicated Core socket is absent"
        )
        assert env.get("HC_SESSION", session) == session
        assert env.get("HC_SOCKET", str(socket)) == str(socket)
        return core_rpc(session, env, method, params)

    def wait(get, predicate, label, seconds=20):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            value = get()
            if predicate(value):
                return value
            time.sleep(0.1)
        raise AssertionError(f"Timed out waiting for {label}")

    def type_text(text):
        for character in text:
            key = 65293 if character == "\n" else ord(character)
            native("key", key, True)
            native("key", key, False)

    try:
        socket = Path(env["XDG_RUNTIME_DIR"]) / "herdr-core" / (session + ".sock")
        command = shutil.which("codex", path=env["PATH"])
        assert command, "Installed Codex is unavailable"
        executable = Path(command).resolve(strict=True)
        package = json.loads(
            (executable.parent.parent / "codex-package.json").read_text()
        )
        assert package["version"] == "0.166.0" and package["entrypoint"] == "bin/codex"
        argv = [
            str(executable),
            "--no-daemon",
            "--model",
            "gpt-6.1-sol",
            "-c",
            'model_reasoning_effort="high"',
            "--dangerously-bypass-approvals-and-sandbox",
        ]
        left, right, extra = randbelow(70) + 20, randbelow(70) + 20, randbelow(70) + 11
        label = "native_result_" + token_hex(4)
        expected = f"oru: {label}: {left * right + extra}"
        prompt = (
            f"Use no tools or subagents. Calculate ({left} * {right}) + {extra}. "
            f"Reply in one plain line: oru: {label}: followed by your decimal result. "
            "Do not change files."
        )
        assert not has_answer(prompt, expected)
        observed = {
            "argv": argv,
            "version": package["version"],
            "prompt": prompt,
            "expected": expected,
        }
        observed["binarySha256"] = hashlib.sha256(executable.read_bytes()).hexdigest()
        wait(lambda: socket.is_socket(), bool, "the dedicated Core socket")
        core = rpc("server.status", {})
        assert type(core["pid"]) is int and core["pid"] > 1
        core_identity = process_identity(core["pid"], metadata_only=True)
        assert core_identity["uid"] == os.getuid()
        observed.update(
            {
                "corePid": core["pid"],
                "coreIdentity": core_identity,
                "coreId": core["core"]["id"],
            }
        )
        document = wait(
            lambda: rpc("doc.get", {"name": "voyager-layout-v1"}),
            lambda record: (
                bool((record.get("value") or {}).get("contents"))
                and bool(record["value"]["contents"][0].get("backend"))
            ),
            "the initial bound terminal",
        )
        layout = document["value"]
        assert layout["view"] == "fleet" and len(layout["contents"]) == 1
        content = layout["contents"][0]
        address = content["backend"]
        original = rpc("terminal.get", {"terminal": address})
        assert original["state"] == "live" and original["pid"]
        shell = process_record(original["pid"])
        observed.update({"initial": document, "original": original, "shell": shell})
        frame = capture("terminal-agent-initial")
        assert frame.size == (1450, 940), "Use the measured native viewport"
        bounds = geometry()
        native("move", int(bounds["X"]) + 700, int(bounds["Y"]) + 380, 2)
        native("button", True)
        native("button", False)
        type_text(shlex.join(argv) + "\n")

        def terminal():
            value = rpc("terminal.get", {"terminal": address})
            assert value["pid"] == original["pid"], "The Core shell changed"
            return value

        worker = wait(
            terminal,
            lambda value: (value.get("foreground") or {}).get("name") == "codex",
            "a foreground interactive Codex process",
            45,
        )
        pid = worker["foreground"]["pid"]
        identity = process_record(pid)
        assert identity["uid"] == os.getuid() and identity["executable"] == str(
            executable
        )
        assert identity["parent"] == original["pid"], (
            "The agent is not the shell's child"
        )
        assert identity["argv"] == argv
        assert identity["cwd"] == str(Path(original["cwd"]).resolve(strict=True))
        observed.update({"agentPid": pid, "agentIdentity": identity, "worker": worker})

        def screen():
            return rpc("terminal.read", {"terminal": address})

        ready = wait(
            screen,
            lambda value: (
                "Codex" in value["text"]
                and "gpt-6.1-sol" in value["text"].lower()
                and "›" in value["text"]
            ),
            "the actual interactive composer",
            45,
        )
        observed["ready"] = ready
        capture("terminal-agent-ready")
        type_text(prompt + "\n")
        response = wait(
            screen,
            lambda value: has_answer(value["text"], expected),
            "the separate calculated answer",
            120,
        )
        observed["response"] = response
        observed["after"] = terminal()
        assert observed["after"]["foreground"]["pid"] == pid
        assert process_record(pid) == identity
        assert process_record(original["pid"]) == shell
        final = rpc("doc.get", {"name": "voyager-layout-v1"})
        assert final["value"] == layout, (
            "The agent interaction changed workspace identity"
        )
        time.sleep(0.25)
        capture("terminal-agent-calculated-answer")
    except BaseException as error:
        observed["primaryFailure"] = f"{type(error).__name__}: {error}"
        try:
            capture("terminal-agent-failure")
            if "address" in locals() and socket.is_socket():
                observed["failureScreen"] = rpc("terminal.read", {"terminal": address})
        except Exception as observation_error:
            observed["observationFailure"] = str(observation_error)
        raise
    finally:
        (evidence / "terminal-agent-observed.json").write_text(
            json.dumps(observed, indent=2)
        )
        errors = []
        try:
            close()
        except Exception as cleanup_error:
            errors.append({"operation": "quit", "error": str(cleanup_error)})
        try:
            if socket is not None and socket.is_socket():
                rpc("server.stop", {})
        except Exception as cleanup_error:
            errors.append({"operation": "core-stop", "error": str(cleanup_error)})
        exits = []
        recorded = []
        if "original" in observed:
            recorded.append((observed["original"]["pid"], observed["shell"], "shell"))
        if "agentPid" in observed:
            recorded.append((observed["agentPid"], observed["agentIdentity"], "agent"))
        if "corePid" in observed:
            recorded.append((observed["corePid"], observed["coreIdentity"], "core"))
        for pid, identity, role in recorded:
            deadline = time.monotonic() + 5
            while True:
                try:
                    fields = (
                        (Path("/proc") / str(pid) / "stat")
                        .read_text()
                        .rsplit(") ", 1)[1]
                        .split()
                    )
                except FileNotFoundError:
                    state = "absent"
                    break
                if fields[19] != identity["start"]:
                    state = "original-exited-pid-reused"
                    break
                if fields[0] == "Z":
                    state = "zombie-not-reaped"
                    break
                if time.monotonic() >= deadline:
                    state = "survived"
                    errors.append({"operation": "exit", "pid": pid, "role": role})
                    break
                time.sleep(0.05)
            exits.append(
                {"pid": pid, "start": identity["start"], "role": role, "state": state}
            )
        socket_absent = socket is not None and not socket.exists()
        if not socket_absent:
            errors.append(
                {
                    "operation": "socket",
                    "error": "Dedicated socket absence is unconfirmed",
                }
            )
        (evidence / "terminal-agent-cleanup.json").write_text(
            json.dumps(
                {
                    "errors": errors,
                    "processes": exits,
                    "socketAbsent": socket_absent,
                    "limit": "Recorded identities only; zombies are reported, not claimed absent. Not full product Quit.",
                },
                indent=2,
            )
        )
        if errors and "primaryFailure" not in observed:
            raise AssertionError(f"Owned cleanup failed: {errors}")
    return [
        "native-interactive-codex-composer",
        "separate-computed-answer-captured-for-review",
        "retained-shell-backend-and-agent-identity",
        "native-quit-and-dedicated-core-stop-receipt",
    ]
