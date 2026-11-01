import json
import os
from pathlib import Path

from playwright.sync_api import expect


def process_identity(pid):
    process = Path(f"/proc/{pid}")
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


def verify_candidate(browser, evidence, session, root):
    launch = json.loads((evidence / "launch.json").read_text())
    connection = browser.new_browser_cdp_session()
    info = connection.send("SystemInfo.getProcessInfo")["processInfo"]
    pid = next(item["id"] for item in info if item["type"] == "browser")
    if pid != launch["pid"] or launch["session"] != session:
        raise RuntimeError("CDP connection does not belong to the recorded candidate")
    actual = process_identity(pid)
    if (
        actual != launch.get("identity")
        or actual["uid"] != os.getuid()
        or actual["command"] != launch["command"]
        or actual["session"] != session
        or Path(actual["command"][1]).resolve() != root.resolve()
    ):
        raise RuntimeError("Candidate process identity changed; no interaction allowed")
    (evidence / "verified-candidate.json").write_text(
        json.dumps({"pid": pid, "identity": actual}, indent=2)
    )


def processes(page):
    return {
        item["address"]: item["pid"]
        for item in page.evaluate("api.call('processes')")["terminals"]
    }


def recorder(evidence, name):
    passed = []

    def record(step):
        passed.append(step)
        (evidence / (name + ".json")).write_text(
            json.dumps({"passed": passed, "modelRequests": 0}, indent=2)
        )
        print(step, flush=True)

    return record


def settled(page):
    page.wait_for_function("""() => {
      const ids = [...document.querySelectorAll('.portal')].map(n => n.dataset.portal);
      return document.querySelector('.dimension.active')?.dataset.dimension === active().dimension.id
        && allLeaves(active().dimension.root).every(p => ids.includes(p.id));
    }""")


def open_picker(page, opener):
    opener.focus()
    opener.click()
    expect(page.locator("#content-picker")).to_be_visible()
    expect(page.locator("#dialog")).to_be_hidden()


def content_directory(evidence):
    session = json.loads((evidence / "launch.json").read_text())["session"]
    return Path.home() / ".config" / session / "portals"
