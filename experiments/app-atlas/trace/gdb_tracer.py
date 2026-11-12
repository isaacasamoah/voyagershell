# Loaded by `gdb -x`. Sets breakpoints that never stop the app; each hit is logged with its thread.
# Each new mark (one user action, written by run.py) starts a fresh window: the first LIMIT hits of
# every breakpoint in a window are logged, later hits are only counted, so hot paint code stays cheap.
import gdb
import json
import os
import time

OUT = os.environ["ATLAS_TRACE_OUT"]
TARGETS = json.load(open(os.environ["ATLAS_TRACE_TARGETS"]))
MARKS = os.environ.get("ATLAS_TRACE_MARKS", "")
LIMIT = int(os.environ.get("ATLAS_TRACE_LIMIT", "30"))
log = open(OUT, "a", buffering=1)
state = {"window": None, "checked": 0.0}
hits = []


def window():
    now = time.monotonic()
    if MARKS and now - state["checked"] > 0.05:
        state["checked"] = now
        try:
            stamp = os.stat(MARKS).st_mtime_ns
        except OSError:
            stamp = None
        if stamp != state["window"]:
            state["window"] = stamp
            for bp in hits:
                if bp.extra:
                    log.write(json.dumps({"wall": time.time(), "key": bp.key, "name": bp.name, "more": bp.extra}) + "\n")
                bp.count = 0
                bp.extra = 0


class Hit(gdb.Breakpoint):
    def __init__(self, spec, key, name):
        super().__init__(spec, gdb.BP_BREAKPOINT, internal=True)
        self.key = key
        self.name = name
        self.count = 0
        self.extra = 0

    def stop(self):
        window()
        self.count += 1
        if self.count > LIMIT:
            self.extra += 1
            return False
        thread = gdb.selected_thread()
        log.write(json.dumps({"wall": time.time(), "key": self.key, "name": self.name, "thread": thread.name, "tid": thread.ptid[1], "pid": thread.ptid[0]}) + "\n")
        return False


for command in ("set pagination off", "set confirm off", "set print thread-events off", "set print inferior-events off",
                "handle SIGPIPE nostop noprint pass", "handle SIG32 nostop noprint pass", "handle SIG33 nostop noprint pass", "handle SIG34 nostop noprint pass"):
    gdb.execute(command)
made = 0
for item in TARGETS:
    for linkage, name in zip(item["linkage"], item["names"]):
        try:
            hits.append(Hit(linkage, item["key"], name))
            made += 1
        except gdb.error as error:
            log.write(json.dumps({"key": item["key"], "error": str(error)}) + "\n")
log.write(json.dumps({"wall": time.time(), "breakpoints": made, "targets": len(TARGETS)}) + "\n")
gdb.execute("run")
