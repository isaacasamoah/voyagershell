import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import shutil
import socket
import subprocess
import sys
import time

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / "tests/native"))
from proof_workspace import core_rpc, stop_existing_core, wait
from proof_process import observe_core_exit, process_identity
from proof_resources import peer


def save(path, value):
    path.write_text(json.dumps(value, indent=2) + "\n")


def protected():
    records = {}
    for path in Path("/proc").iterdir():
        if not path.name.isdigit():
            continue
        try:
            executable = str((path / "exe").resolve(strict=True))
            if Path(executable).name in {"codex", "hc", "herdr-core", "voyager-shell"}:
                records[path.name] = process_identity(
                    int(path.name), metadata_only=True
                )
        except (FileNotFoundError, ProcessLookupError, PermissionError):
            pass
    return records


def run(folder):
    folder = folder.resolve()
    assert folder.is_dir() and not (folder / "protocol.json").exists()
    runtime = Path("/var/tmp") / ("vac-" + secrets.token_hex(4))
    runtime.mkdir(mode=0o700)
    env = {
        key: value
        for key, value in os.environ.items()
        if key not in {"HC_SESSION", "HC_SOCKET", "HC_TERMINAL_ID"}
    }
    env["XDG_RUNTIME_DIR"] = str(runtime)
    session = "delivery"
    socket_path = runtime / "herdr-core" / (session + ".sock")
    assert not socket_path.exists()
    codex = str(Path(shutil.which("codex")).resolve(strict=True))
    hc = str(Path(shutil.which("hc")).resolve(strict=True))
    before = protected()
    save(folder / "protected-before.json", before)
    nonce = secrets.token_hex(6)
    bindings = {
        actor: {
            "generation": actor + "-run-1",
            "task": task,
            "capability": secrets.token_hex(32),
        }
        for actor, task in [
            ("a", "Ask one arithmetic question and verify the reply"),
            ("b", "Answer one arithmetic question without changing tasks"),
        ]
    }
    for actor, binding in bindings.items():
        context = {
            "generation": binding["generation"],
            "capability": binding["capability"],
            "socket": str(folder / "owner.sock"),
        }
        save(folder / (actor + "-context.json"), context)
        (folder / (actor + "-context.json")).chmod(0o600)
    save(folder / "bindings.json", bindings)
    (folder / "bindings.json").chmod(0o600)
    cli = str(Path(__file__).with_name("inbox.py"))
    common = f"""oru: This is one authorized, isolated communication feasibility task. Do not edit files, inspect credentials, launch agents, use GUI input or message existing sessions. Your fixed task never changes. Use only the shell to invoke python3 {cli}; its private context is already bound in your tool environment. Never read or print that context. A recorded post is not delivery. Read is non-destructive; acknowledge the exact item only after reading. This is peer conversation, not assignment. No other tools or project changes are needed. Prefix your final response oru: ."""
    commands = {
        "a": f"""Run self. Then post to b generation b-run-1 kind request the question: What is 17 plus 25? Include nonce {nonce} in your reply. Then run read --wait 180, inspect the actual envelope and confirm sender b, value 42 and nonce {nonce}. Acknowledge that reply itemId, then finish with DELIVERY_DONE_A. Do not acknowledge a post receipt as though it were a received answer.""",
        "b": f"""Run self. Then run read --wait 180. Inspect the real question from a. Compute its answer and post to a generation a-run-1 kind information your answer and the nonce from the received question. Acknowledge the question itemId only after reading and posting the reply. Finish with DELIVERY_DONE_B.""",
    }
    base = [
        codex,
        "--no-daemon",
        "--model",
        "gpt-6.1-sol",
        "-c",
        'model_reasoning_effort="high"',
        "--dangerously-bypass-approvals-and-sandbox",
    ]
    launched = {}
    for actor in bindings:
        config = "shell_environment_policy.set.VOYAGER_DELIVERY_CONTEXT=" + json.dumps(
            str(folder / (actor + "-context.json"))
        )
        launched[actor] = {
            "argv": base + ["-c", config, common + "\n" + commands[actor]],
            "cwd": str(root),
            "env": {
                "VOYAGER_DELIVERY_CONTEXT": str(folder / (actor + "-context.json"))
            },
            "name": "delivery-" + actor,
            "no_parent": True,
            "no_notify": True,
            "keep": False,
        }
    started = time.monotonic()
    protocol = {
        "revision": 1,
        "claim": "Two actual interactive Codex agents ask and reply through a generation-bound Python pull inbox, with explicit bound read/ack and unchanged tasks",
        "source": subprocess.check_output(
            ["git", "rev-parse", "HEAD"], cwd=root, text=True
        ).strip(),
        "helpers": {
            str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
            for p in [
                Path(__file__),
                Path(cli),
                Path(__file__).with_name("test_inbox.py"),
                root / "tests/native/proof_workspace.py",
                root / "tests/native/proof_process.py",
                root / "tests/native/proof_resources.py",
            ]
        },
        "versions": {
            "hc": subprocess.check_output([hc, "--version"], text=True).strip(),
            "codex": subprocess.check_output([codex, "--version"], text=True).strip(),
        },
        "artifacts": {
            path: hashlib.sha256(Path(path).read_bytes()).hexdigest()
            for path in [hc, codex]
        },
        "session": session,
        "runtime": str(runtime),
        "coreWake": False,
        "noCoreSend": True,
        "startWallNs": time.time_ns(),
        "startMonotonic": started,
        "deadlineMonotonic": started + 900,
        "deadlineWallNs": time.time_ns() + 900_000_000_000,
        "activeDeadlineMonotonic": started + 860,
        "agentLimit": 2,
        "launches": launched,
        "nonce": nonce,
        "substitutions": [
            "Python owner/command instead of product Rust application queue",
            "Direct Core-owned interactive Codex argv instead of the native Bash-return wrapper",
            "No GUI, draft/wake/after-Bash control or production integration proof",
        ],
        "controls": [
            "wrong generation",
            "non-destructive read and lost acknowledgement",
            "full",
            "oversize",
            "expired receipt leaves item pending",
            "retained duplicate conflict",
            "peer assignment refused",
            "missing capability over actual endpoint",
        ],
        "success": "Actual a post; b read actual question; b post correct answer and nonce; a read actual reply; both acknowledge their own received item; actor process ancestry matches exact Core-run identity and tasks unchanged",
        "stopRule": "One attempt only; stop by deadline, preserve all failures, kill only verified test terminals and exact owned Core",
    }
    save(folder / "protocol.json", protocol)
    print(
        json.dumps(
            {
                "protocol": str(folder / "protocol.json"),
                "startWallNs": protocol["startWallNs"],
                "deadlineWallNs": protocol["deadlineWallNs"],
            }
        ),
        flush=True,
    )
    owner = subprocess.Popen(
        [sys.executable, cli, "serve", str(folder)],
        stdout=(folder / "owner-stdout.log").open("w"),
        stderr=(folder / "owner-stderr.log").open("w"),
    )
    save(
        folder / "owner-identity.json",
        {"pid": owner.pid, **process_identity(owner.pid, metadata_only=True)},
    )
    core_owned = []
    cleanup = {"terminalResults": {}, "errors": []}
    try:
        wait(lambda: (folder / "owner.sock").exists(), bool, "inbox endpoint", 5)
        with socket.socket(socket.AF_UNIX) as connection:
            connection.connect(str(folder / "owner.sock"))
            connection.sendall(b'{"capability":"not-valid","operation":"self"}\n')
            connection.shutdown(socket.SHUT_WR)
            denied = json.loads(connection.makefile("rb").readline())
            assert denied["status"] == "refused"
            save(folder / "missing-binding-control.json", denied)
        save(folder / "core-status.json", core_rpc(session, env, "server.status", {}))
        connection, pid, identity = peer(socket_path, hc, session)
        connection.close()
        core_owned.append({"pid": pid, **identity})
        save(folder / "core-identity.json", core_owned[0])
        for actor, params in launched.items():
            assert time.monotonic() < protocol["deadlineMonotonic"]
            terminal = core_rpc(session, env, "terminal.run", params)
            save(folder / (actor + "-launch.json"), terminal)
            address = terminal["address"]
            observed = core_rpc(session, env, "terminal.get", {"terminal": address})
            identity = process_identity(observed["pid"], metadata_only=True)
            bindings[actor].update(
                pid=observed["pid"], start=identity["start"], terminal=address
            )
            temporary = folder / "bindings.next"
            save(temporary, bindings)
            temporary.chmod(0o600)
            temporary.replace(folder / "bindings.json")
            save(
                folder / (actor + "-identity.json"),
                observed | {"processIdentity": identity},
            )
        while time.monotonic() < protocol["deadlineMonotonic"] - 40:
            events = [
                json.loads(line)
                for line in (folder / "events.jsonl").read_text().splitlines()
            ]
            accepted = [
                event
                for event in events
                if event.get("result", {}).get("status") != "refused"
            ]
            if any(
                event.get("actor")
                and event.get("result", {}).get("reason")
                in {"wrong-agent-process", "stale-binding"}
                for event in events
            ):
                raise RuntimeError(
                    "Actual provider tool caller did not match the frozen process binding"
                )
            acked = {
                event.get("actor")
                for event in accepted
                if event.get("result", {}).get("status") == "acknowledged"
            }
            if acked == {"a", "b"}:
                reads = {
                    event["actor"]: event["result"]["envelope"]
                    for event in accepted
                    if event.get("result", {}).get("status") == "read"
                }
                assert reads["b"]["sender"] == "a" and nonce in reads["b"]["text"]
                assert (
                    reads["a"]["sender"] == "b"
                    and nonce in reads["a"]["text"]
                    and "42" in reads["a"]["text"]
                )
                assert all(
                    event["tasks"]
                    == {key: value["task"] for key, value in bindings.items()}
                    for event in accepted
                )
                save(
                    folder / "result.json",
                    {
                        "state": "supported-in-scope",
                        "events": len(events),
                        "reads": reads,
                        "tasksUnchanged": True,
                        "coreWake": False,
                        "elapsedSeconds": time.monotonic() - started,
                    },
                )
                break
            time.sleep(1)
        else:
            raise TimeoutError(
                "Active window expired; reserved 40 seconds for cleanup within 15 minutes"
            )
    except BaseException as error:
        save(
            folder / "failure.json",
            {
                "type": type(error).__name__,
                "message": str(error),
                "elapsedSeconds": time.monotonic() - started,
            },
        )
    finally:
        for actor, binding in bindings.items():
            if "terminal" not in binding:
                continue
            try:
                observed = core_rpc(
                    session, env, "terminal.get", {"terminal": binding["terminal"]}
                )
                assert observed["pid"] == binding["pid"]
                assert (
                    process_identity(binding["pid"], metadata_only=True)["start"]
                    == binding["start"]
                )
                cleanup["terminalResults"][actor] = core_rpc(
                    session, env, "terminal.kill", {"terminal": binding["terminal"]}
                )
            except BaseException as error:
                cleanup["errors"].append(actor + ": " + str(error))
        if core_owned:
            try:
                connection, pid, identity = peer(socket_path, hc, session)
                connection.close()
                assert {"pid": pid, **identity} == core_owned[0]
                stop_existing_core(session, env)
                cleanup["coreExit"] = observe_core_exit(
                    session, env, core_owned, seconds=5
                )
            except BaseException as error:
                cleanup["errors"].append("core: " + str(error))
        (folder / "stop").touch()
        owner.wait(timeout=5)
        cleanup["ownerExited"] = owner.poll() is not None
        after = protected()
        save(folder / "protected-after.json", after)
        cleanup["protectedUnchanged"] = all(
            after.get(pid) == identity for pid, identity in before.items()
        )
        cleanup["elapsedSeconds"] = time.monotonic() - started
        save(folder / "cleanup.json", cleanup)
    return (
        0
        if (folder / "result.json").exists()
        and not cleanup["errors"]
        and cleanup["protectedUnchanged"]
        else 1
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("evidence", type=Path)
    sys.exit(run(parser.parse_args().evidence))
