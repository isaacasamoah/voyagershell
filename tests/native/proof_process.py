from pathlib import Path


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
