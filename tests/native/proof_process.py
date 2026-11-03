from pathlib import Path
import time


def exit_observation(owned, socket, root=Path("/proc")):
    processes = []
    for item in owned:
        try:
            stat = (
                (root / str(item["pid"]) / "stat")
                .read_text()
                .rsplit(") ", 1)[1]
                .split()
            )
            state = "pid-reused" if stat[19] != item["start"] else stat[0]
        except FileNotFoundError:
            state = "absent"
        processes.append({**item, "observedState": state})
    return {
        "processes": processes,
        "socketAbsent": not socket.exists(),
        "complete": not socket.exists()
        and all(
            item["observedState"] in ("absent", "pid-reused") for item in processes
        ),
    }


def observe_core_exit(session, env, owned=(), seconds=5):
    runtime = env.get("XDG_RUNTIME_DIR")
    assert runtime and Path(runtime).is_absolute(), (
        "Core proof needs its actual runtime directory"
    )
    socket = Path(runtime) / "herdr-core" / (session + ".sock")
    deadline = time.monotonic() + seconds
    while True:
        result = exit_observation(owned, socket)
        if result["complete"]:
            return result
        assert time.monotonic() < deadline, f"Owned Core exit is unconfirmed: {result}"
        time.sleep(0.1)


def process_identity(pid, *, metadata_only=False):
    process = Path(f"/proc/{pid}")
    if metadata_only:
        return {
            "uid": process.stat().st_uid,
            "start": process.joinpath("stat")
            .read_text()
            .rsplit(") ", 1)[1]
            .split()[19],
            "executable": str(process.joinpath("exe").resolve(strict=True)),
        }
    key = b"VOYAGER_WORKSPACE_SESSION="
    session = next(
        value[len(key) :].decode()
        for value in (process / "environ").read_bytes().split(b"\0")
        if value.startswith(key)
    )
    return {
        "uid": process.stat().st_uid,
        "cwd": str((process / "cwd").resolve()),
        "start": (process / "stat").read_text().rsplit(") ", 1)[1].split()[19],
        "command": (process / "cmdline").read_bytes().decode().split("\0")[:-1],
        "session": session,
    }
