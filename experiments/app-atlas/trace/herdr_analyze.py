"""Turns a trace/herdr-drive.sh run into apps/herdr-core/runs/<id>.json.

Each pathway step whose effect crosses a process boundary (a socket frame, a
pseudo-terminal read or write, a process start, a file saved) has a probe: the
process kind, the system call and text the call must carry. The step is seen
when its probe matches inside that pathway's part of the run, searched in step
order. Steps that stay inside one process make no system call of their own and
say so.

  python3 trace/herdr_analyze.py RUN_DIR --id DATE-NAME --layer apps/herdr-core/layer --out apps/herdr-core/runs/DATE-NAME.json
"""
import argparse, json, os, re, sys

sys.path.insert(0, os.path.dirname(__file__))
from herdr_strace import parse, Processes, thread_roles  # noqa: E402

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "architecture-map"))

HOLDER_FRAME = lambda kind: ', "' + kind  # noqa: E731  a Core-Holder frame starts with its kind byte
WRITERS = {"Link-writer": "the Link's writer thread", "to-Core writer": "the Holder's writer thread", "registry-writer": "the registry-writer thread", "input writer": "the terminal's input writer thread"}

# step id: (process kinds, system calls, texts that must all appear, optional: "fail" for an error result)
# or a string: why the step cannot be seen in system calls.
INSIDE = "stays inside one process; no system call marks it"
PROBES = {
    "run-background-1": ("cli", "execve", ['"run", "--bg"']),
    "run-background-2": "fills in the request inside the hc process; its result is the request in the next steps",
    "run-background-3": ("cli", "connect", ["atlas.sock"]),
    "run-background-4": ("cli", "sendto", ['"method":"terminal.run"']),
    "run-background-5": ("core", "recvfrom", ['"method":"terminal.run"']),
    "run-background-6": "the template lookup found nothing and read no file",
    "run-background-7": "a Holder of this build was already linked, so ensure_holder returned at once",
    "run-background-8": ("core", "sendto", [HOLDER_FRAME("\\2\\"), "review.sh"]),
    "run-background-9": ("holder", "recvfrom", [HOLDER_FRAME("\\2\\")]),
    "run-background-10": ("holder", "fork", []),
    "run-background-11": ("holder", "sendto", [HOLDER_FRAME("h\\")]),
    "run-background-12": ("core", "recvfrom", [HOLDER_FRAME("h\\")]),
    "run-background-13": ("core", "rename", ["terminals.json"]),
    "run-background-14": ("cli", "recvfrom", ['"result"']),
    "first-command-starts-core-1": ("cli", "connect", ["atlas.sock"], "fail"),
    "first-command-starts-core-2": ("cli", "fork", []),
    "first-command-starts-core-3": ("cli", "connect", ["atlas.sock"]),
    "first-command-starts-core-4": ("core", "write", ["core.lock"]),
    "first-command-starts-core-5": ("core", "rename", ["core.json"]),
    "first-command-starts-core-6": ("core", "rename", ["terminals.json"]),  # the empty registry reaches disk; the read of a missing file is not traced
    "first-command-starts-core-7": "found no Holder sockets on a first start; listing a folder is not traced",
    "first-command-starts-core-8": ("core", "bind", ["atlas.sock"]),
    "first-command-starts-core-9": ("core", "recvfrom", ['"method":"terminal.run"']),
    "first-command-starts-core-10": ("core", "fork", []),
    "first-command-starts-core-11": ("holder", "bind", ["holder."]),
    "first-command-starts-core-12": ("holder", "sendto", [HOLDER_FRAME("e\\")]),
    "first-command-starts-core-13": ("core", "recvfrom", ['"instance"']),
    "first-command-starts-core-14": ("core", "sendto", [HOLDER_FRAME("\\2\\")]),
    "agent-sends-input-1": ("cli", "execve", ['"send"']),
    "agent-sends-input-2": ("cli", "sendto", ['"method":"terminal.send"']),
    "agent-sends-input-3": ("core", "recvfrom", ['"method":"terminal.send"']),
    "agent-sends-input-4": "not exercised: the sender was not an hc terminal, so no tag was added",
    "agent-sends-input-5": INSIDE,
    "agent-sends-input-6": INSIDE,
    "agent-sends-input-7": "prepares the steps in memory; the next step shows the result, an unbracketed paste because the program never turned on mode 2004",
    "agent-sends-input-8": ("core", "sendto", [HOLDER_FRAME("\\3\\"), "Focus on the error path."]),
    "agent-sends-input-9": ("holder", "recvfrom", [HOLDER_FRAME("\\3\\")]),
    "agent-sends-input-10": ("holder", "write", ["/dev/ptmx", "Focus on the error path."]),
    "agent-sends-input-11": ("program", "read", ["Focus on the error path."]),
    "agent-sends-input-12": INSIDE,
    "agent-sends-input-13": ("core", "sendto", ['"started":']),
    "agent-sends-input-14": ("cli", "recvfrom", ['"started":']),
    "agent-sends-input-b1-1": ("core", "recvfrom", ['"method":"terminal.keys"']),
    "agent-sends-input-b1-2": ("core", "sendto", [HOLDER_FRAME("\\3\\"), "\\33"]),
    "agent-sends-input-b1-3": ("cli", "recvfrom", ['"result"']),
    "output-to-screen-1": ("program", "write", ["tick"]),
    "output-to-screen-2": ("holder", "read", ["/dev/ptmx", "tick"]),
    "output-to-screen-3": ("holder", "sendto", [HOLDER_FRAME("g\\"), "tick"]),
    "output-to-screen-4": ("core", "recvfrom", [HOLDER_FRAME("g\\")]),
    "output-to-screen-5": INSIDE,
    "output-to-screen-6": INSIDE,
    "output-to-screen-7": INSIDE,
    "output-to-screen-8": INSIDE,
    "output-to-screen-9": "not exercised: this output asked the screen nothing",
    "output-to-screen-10": INSIDE,
    "output-to-screen-11": ("core", "sendto", ["atlas.sock", "tick"]),
    "output-to-screen-12": ("cli", "write", ["/dev/pts", ', "tick ']),
    "output-to-screen-b1-1": "not exercised: no Core crashed in this run (server-restart shows the planned handover instead)",
    "output-to-screen-b1-2": "not exercised: no Core crashed in this run",
    "status-and-wait-1": ("cli", "execve", ['"wait"']),
    "status-and-wait-2": ("core", "recvfrom", ['"method":"terminal.wait"']),
    "status-and-wait-3": INSIDE,
    "status-and-wait-4": ("program", "write", ["7501;state=done"]),
    "status-and-wait-5": ("core", "recvfrom", ["7501;state=done"]),
    "status-and-wait-6": ("core", "rename", ["terminals.json"]),
    "status-and-wait-7": INSIDE,
    "status-and-wait-8": INSIDE,
    "status-and-wait-9": "no event subscribers in this run",
    "status-and-wait-10": ("core", "sendto", ['"ended":true']),
    "status-and-wait-11": ("core", "rename", ["terminals.json"]),
    "status-and-wait-12": ("cli", "write", ["done, turn"]),
    "status-and-wait-b1-1": "not exercised: the parent was waiting, so the news counted as seen and no note was due",
    "status-and-wait-b1-2": "not exercised: no note was due",
    "status-and-wait-b1-3": "not exercised: no note was due",
    "status-and-wait-b1-4": "not exercised: no note was due",
    "status-and-wait-b1-5": "not exercised: no note was due",
    "attach-and-detach-1": ("cli", "execve", ['"attach"']),
    "attach-and-detach-2": ("cli", "write", ["\\33]10;?"]),
    "attach-and-detach-3": ("cli", "connect", ["atlas.sock"]),
    "attach-and-detach-4": ("core", "recvfrom", ['"method":"hello"']),
    "attach-and-detach-5": ("core", "recvfrom", ['"method":"terminal.attach"']),
    "attach-and-detach-6": ("core", "sendto", ['"channel"']),
    "attach-and-detach-7": ("cli", "sendto", ['"\\1\\0\\0\\0\\1\\4']),
    "attach-and-detach-8": ("core", "recvfrom", [HOLDER_FRAME("g\\")]),
    "attach-and-detach-9": ("cli", "sendto", ['"\\1\\0\\0\\0\\0\\1\\0\\0\\0x"']),
    "attach-and-detach-10": ("core", "sendto", [HOLDER_FRAME("\\3\\"), 'x"']),
    "attach-and-detach-11": ("core", "sendto", ['{"cols":120,"rows":40}']),
    "attach-and-detach-12": ("cli", "sendto", ['"\\1\\0\\0\\0\\2\\0\\0\\0\\0"']),
    "attach-and-detach-13": ("core", "sendto", ['{"cols":200,"rows":120}']),
    "attach-and-detach-14": ("cli", "write", ["detached from web"]),
    "attach-and-detach-b1-1": "not exercised: the program was still running at detach",
    "attach-and-detach-b1-2": "not exercised: the program was still running at detach",
    "attach-and-detach-b2-1": "not exercised: no other machine",
    "attach-and-detach-b2-2": "not exercised: no other machine",
    "attach-and-detach-b2-3": "not exercised: no other machine",
    "app-connects-1": ("app", "vfork", []),
    "app-connects-2": ("cli", "execve", ['"connect", "--session"']),
    "app-connects-3": ("cli", "connect", ["atlas.sock"]),
    "app-connects-4": ("core", "recvfrom", ['"method": "hello"']),
    "app-connects-5": ("core", "sendto", ['"result":{"core"']),
    "app-connects-6": ("core", "recvfrom", ['"method": "terminal.list"']),
    "app-connects-7": INSIDE,
    "app-connects-8": ("core", "sendto", ['"hidden_finished"']),
    "app-connects-9": ("cli", "write", ['"hidden_finished"']),
    "app-connects-10": ("core", "recvfrom", ['"method": "terminal.attach"']),
    "app-connects-11": ("core", "recvfrom", ['"\\1\\0\\0\\0\\1\\4']),
    "app-connects-12": ("core", "recvfrom", [', "", ']),
    "app-connects-b1-1": "not exercised: the app spoke generation 1",
    "app-connects-b2-1": "not exercised: the app returned credit for everything it read",
    "server-restart-1": ("cli", "execve", ['"server", "restart"']),
    "server-restart-2": ("core", "rename", ["restart-env.json"]),
    "server-restart-3": ("core", "sendto", ['"stopped":true']),
    "server-restart-4": ("core", "sendto", ['"handover"']),
    "server-restart-5": ("holder", "sendto", [HOLDER_FRAME("k\\")]),
    "server-restart-6": ("core", "rename", [".snap"]),
    "server-restart-7": ("cli", "fork", []),
    "server-restart-8": "not taken: with a private runtime folder Herdr starts the Core directly, as on a machine without a systemd user manager",
    "server-restart-9": ("core", "read", ["restart-env.json"]),
    "server-restart-10": ("core", "recvfrom", ['"instance"']),
    "server-restart-11": ("core", "read", [".snap"]),
    "server-restart-12": ("core", "bind", ["atlas.sock"]),
    "server-restart-13": ("cli", "recvfrom", ['"uptime_ms"']),
    "server-restart-b1-1": "not exercised: hc update downloads a release",
    "server-restart-b1-2": "not exercised: hc update downloads a release",
    "server-restart-b1-3": "not exercised: hc update downloads a release",
    "server-restart-b2-1": "not exercised: the Holder never went 3 s without a Core",
}
# Which part of the run each pathway's steps are searched in (the driver's marks).
WINDOW = {"output-to-screen": "attach-and-detach"}


def matches(e, probe, procs):
    kinds, calls, texts = probe[0], probe[1], probe[2]
    if procs.kind.get(procs.tgid.get(e.tid, e.tid)) not in kinds.split("|") or e.sc not in calls.split("|"):
        return False
    failed = e.ret.startswith("-1")
    if (len(probe) > 3 and probe[3] == "fail") != failed:
        return False
    text = e.args.replace('\\"', '"')
    return all(t in text for t in texts)


def describe(e, procs, roles):
    role = procs.thread_name.get(e.tid) or roles.get(e.tid)
    writer = WRITERS.get(role)
    group = procs.tgid.get(e.tid, e.tid)
    if writer and procs.kind.get(group) == "core":
        return f"{writer} (the Core queues the bytes; this thread writes them)", "core-writer"
    return procs.describe(e.tid, roles), procs.lane(e.tid)


def sanitize(text, run):
    """Keeps machine and personal identifiers out of the record."""
    import getpass, socket
    text = text.replace(run, "<run>")
    text = re.sub(r"/(?:home|Users)/[^/\"\s]+", "~", text)
    text = re.sub(r'"(machine_id|boot_id)":"[^"]*"', r'"\1":"<redacted>"', text)
    text = re.sub(r"\b[0-9a-f]{32}\b", "<id>", text)
    for private in {socket.gethostname(), socket.gethostname().split(".")[0], getpass.getuser()}:
        if private:
            text = text.replace(f'"{private}"', '"<host>"').replace(private, "<user>")
    return text


def analyze(run, layer):
    import yaml  # PyYAML, present on the machine that traced
    events, marks = parse(os.path.join(run, "trace.log"))
    procs = Processes(events)
    roles = thread_roles(events, procs)
    names = [m[0] for m in marks]
    pathways = yaml.safe_load(open(os.path.join(layer, "pathways.yaml")))["pathways"]
    steps_out, windows = {}, []
    known = {p["id"] for p in pathways}
    for i, (name, start) in enumerate(marks[:-1]):
        if name.replace("-b1", "") in known:
            windows.append({"pathway": name.replace("-b1", ""), "label": name, "ms": round((marks[i + 1][1] - start) * 1000)})
    for pathway in pathways:
        mark = WINDOW.get(pathway["id"], pathway["id"])
        if mark not in names:
            continue
        lo = marks[names.index(mark)][1]
        hi = marks[names.index(mark) + 1][1]
        groups = [(None, pathway["steps"])] + [(b["id"], b["steps"]) for b in pathway.get("branches", [])]
        out = {}
        for branch, steps in groups:
            if branch:
                bmark = mark + "-b1" if (mark + "-b1") in names and branch.endswith("-b1") else mark
                lo_b, hi_b = marks[names.index(bmark)][1], marks[names.index(bmark) + 1][1]
            else:
                lo_b, hi_b = lo, hi
            # Steps on one kind of process happen in order; different processes run side by side.
            cursors = {}
            for step in steps:
                probe = PROBES.get(step["id"])
                if probe is None or isinstance(probe, str):
                    out[step["id"]] = {"checkable": False, "reason": probe or INSIDE}
                    continue
                window = [e for e in events if lo_b <= e.t < hi_b and matches(e, probe, procs)]
                cursor = cursors.get(probe[0], lo_b)
                found = next((e for e in window if e.t >= cursor), None)
                in_order = found is not None
                found = found or (window[0] if window else None)
                if not found:
                    out[step["id"]] = {"checkable": True, "seen": False, "reason": f"no {probe[1]} by the {probe[0]} matched in this part of the run"}
                    continue
                cursors[probe[0]] = max(cursor, found.t)
                thread, lane = describe(found, procs, roles)
                expected = step.get("runs_on")
                same = lane == expected or (lane == "core-writer" and expected in ("core-loop", "core-thread"))
                entry = {
                    "checkable": True,
                    "seen": True,
                    "symbol": f"{found.sc}: " + sanitize(found.args.replace('\\"', '"'), run)[:120],
                    "hits": len(window),
                    "thread": thread,
                    "roles": [lane],
                    "matches": same,
                    "after_ms": round((found.t - lo_b) * 1000),
                    "trace_line": found.line,
                }
                if not in_order:
                    entry["order"] = "seen before the previous step on the same kind of process"
                out[step["id"]] = entry
        steps_out[pathway["id"]] = out
    return steps_out, windows, procs, roles, marks


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("run")
    ap.add_argument("--id", required=True)
    ap.add_argument("--layer", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--plain", default="")
    ap.add_argument("--finding", action="append", default=[], help="pathway=text")
    args = ap.parse_args()
    steps, windows, procs, roles, marks = analyze(args.run, args.layer)
    status = json.load(open(os.path.join(args.run, "status-end.json"))) if os.path.exists(os.path.join(args.run, "status-end.json")) else {}
    record = {
        "id": args.id,
        "date": args.id[:10],
        "plain": args.plain,
        "binary_sha256": open(os.path.join(args.run, "binary.sha256")).read().strip(),
        "binary_note": f"hc {status.get('version', '?')} release build (stripped), copied into the run folder; seen through strace, not a debugger",
        "session": "atlas (isolated: private runtime, state, config and home folders)",
        "core_stop": "stopped" if "MARK end" in open(os.path.join(args.run, "marks")).read() else "unknown",
        "leftover_processes": open(os.path.join(args.run, "leftover.txt")).read().strip(),
        "windows": windows,
        "threads": {"core_loop_identified": True, "named": sorted(set(procs.thread_name.values()))},
        "steps": steps,
        "findings": [{"pathway": f.split("=", 1)[0], "plain": f.split("=", 1)[1]} for f in args.finding],
    }
    json.dump(record, open(args.out, "w"), indent=1, sort_keys=False)
    seen = sum(1 for p in steps.values() for s in p.values() if s.get("seen"))
    checkable = sum(1 for p in steps.values() for s in p.values() if s.get("checkable"))
    off = [f"{k}: {s['thread']}" for p in steps.values() for k, s in p.items() if s.get("seen") and not s.get("matches")]
    print(f"{seen} of {checkable} checkable steps seen; {len(off)} on a different thread than the layer says")
    for line in off:
        print("  ", line)
    for p, ss in steps.items():
        for k, s in ss.items():
            if s.get("checkable") and not s.get("seen"):
                print("  not seen:", k, s["reason"])
            if s.get("order"):
                print("  out of order:", k)


if __name__ == "__main__":
    main()
