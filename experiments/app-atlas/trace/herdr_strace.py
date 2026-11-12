"""Reads an strace -f -tt -yy log from trace/herdr-drive.sh into events, each
labelled with the process and thread it ran on (hc command, Core async loop,
a named Core thread, Holder, program, app)."""
import re

LINE = re.compile(r"^(\d+) (\d\d):(\d\d):(\d\d\.\d+) (.*)$")
CALL = re.compile(r"^(\w+)\((.*)\)\s+= (.*)$", re.S)
UNFINISHED = re.compile(r"^(\w+)\((.*) <unfinished \.\.\.>$", re.S)
RESUMED = re.compile(r"^<\.\.\. (\w+) resumed>(.*)\)\s+= (.*)$", re.S)


class Event:
    __slots__ = ("t", "tid", "sc", "args", "ret", "line")

    def __init__(self, t, tid, sc, args, ret, line):
        self.t, self.tid, self.sc, self.args, self.ret, self.line = t, tid, sc, args, ret, line


def parse(path):
    events, pending, marks = [], {}, []
    for n, raw in enumerate(open(path, encoding="utf-8", errors="replace")):
        m = LINE.match(raw.rstrip("\n"))
        if not m:
            continue
        tid, rest = int(m[1]), m[5]
        t = int(m[2]) * 3600 + int(m[3]) * 60 + float(m[4])
        if rest.startswith("+++") or rest.startswith("---"):
            continue
        u = UNFINISHED.match(rest)
        if u:
            pending[tid] = (u[1], u[2], t)
            continue
        r = RESUMED.match(rest)
        if r:
            sc, args, _ = pending.pop(tid, (r[1], "", t))
            # A call that blocked counts from when it returned: that is when its data arrived.
            events.append(Event(t, tid, sc, args + r[2], r[3], n + 1))
            continue
        c = CALL.match(rest)
        if c:
            events.append(Event(t, tid, c[1], c[2], c[3], n + 1))
        elif rest.startswith("exit_group("):
            events.append(Event(t, tid, "exit_group", rest[11:].split(")")[0], "?", n + 1))
    events.sort(key=lambda e: (e.t, e.line))
    for e in events:
        if e.sc == "write" and "/marks>" in e.args:
            marks.append((re.search(r'"MARK ([\w-]+)', e.args)[1], e.t))
    return events, marks


class Processes:
    """Who each thread id belongs to, and what that process and thread are."""

    def __init__(self, events):
        self.tgid, self.parent, self.kind, self.name, self.thread_name = {}, {}, {}, {}, {}
        for e in events:
            group = self.tgid.setdefault(e.tid, e.tid)
            if e.sc in ("clone", "clone3", "fork", "vfork") and e.ret.split()[0].isdigit():
                child = int(e.ret.split()[0])
                if "CLONE_THREAD" in e.args:
                    self.tgid[child] = group
                else:
                    self.tgid[child] = child
                    self.parent[child] = group
            elif e.sc == "execve" and e.ret.startswith("0"):
                argv = re.findall(r'"((?:[^"\\]|\\.)*)"', e.args.split("], ")[0])[1:]
                self.kind[group], self.name[group] = self.classify(group, argv)
            elif e.sc == "prctl" and "PR_SET_NAME" in e.args:
                self.thread_name[e.tid] = re.search(r'PR_SET_NAME, "([^"]*)"', e.args)[1]

    def classify(self, pid, argv):
        exe = argv[0] if argv else ""
        if exe.endswith("herdr-core") and argv[1:2] == ["serve"]:
            return "core", "Core"
        if exe.endswith("herdr-core") and argv[1:2] == ["hold"]:
            return "holder", "Holder"
        if exe == "hc" or exe.endswith("/hc"):
            return "cli", "hc " + " ".join(a for a in argv[1:3])
        if exe.startswith("python3"):
            return "app", "client: " + argv[-2]
        if exe in ("sh", "/usr/bin/sh") and argv[1:] and argv[1].endswith(".sh"):
            ancestor = self.parent.get(pid)
            if ancestor and self.kind.get(ancestor) == "holder":
                return "program", argv[1].rsplit("/", 1)[-1][:-3]
        return "other", exe

    def lane(self, tid):
        group = self.tgid.get(tid, tid)
        kind = self.kind.get(group, "other")
        if kind == "core":
            return "core-loop" if tid == group else "core-thread"
        return {"cli": "cli", "holder": "holder", "program": "program", "app": "you"}.get(kind, "other")

    def describe(self, tid, roles):
        group = self.tgid.get(tid, tid)
        kind, name = self.kind.get(group, "other"), self.name.get(group, "?")
        if kind == "core":
            if tid == group:
                return "the Core's async loop (main thread)"
            label = self.thread_name.get(tid)
            if label == "registry-writer":
                return "the Core's registry-writer thread"
            if label == "tokio-rt-worker":
                return "a Core blocking-pool thread"
            return f"a Core {roles.get(tid, 'helper')} thread"
        if kind == "holder":
            return "the Holder's main thread" if tid == group else f"a Holder {roles.get(tid, 'helper')} thread"
        if kind == "cli":
            return f"the `{name}` process"
        if kind == "program":
            return f"the program ({name}.sh)"
        if kind == "app":
            return "the app (test client)"
        return name


def thread_roles(events, procs):
    """Names unnamed Core and Holder threads by what they do on the wire: a
    thread that only writes to the Holder socket is the Link's writer, one that
    reads it is the Holder reader, and so on. Named threads keep their name."""
    seen = {}
    for e in events:
        group = procs.tgid.get(e.tid, e.tid)
        kind = procs.kind.get(group)
        if e.tid == group or kind not in ("core", "holder") or e.tid in procs.thread_name:
            continue
        holder_socket = "holder." in e.args or ("UNIX-STREAM:[" in e.args and "atlas.sock" not in e.args)
        pty = "/dev/ptmx" in e.args
        acts = seen.setdefault(e.tid, set())
        if e.sc in ("recvfrom", "read") and holder_socket:
            acts.add("reads-link")
        elif e.sc in ("sendto", "write") and holder_socket:
            acts.add("writes-link")
        elif e.sc == "read" and pty:
            acts.add("reads-pty")
        elif e.sc == "write" and pty:
            acts.add("writes-pty")
    roles = {}
    for tid, acts in seen.items():
        kind = procs.kind.get(procs.tgid.get(tid, tid))
        if kind == "core":
            roles[tid] = {frozenset({"writes-link"}): "Link-writer", frozenset({"reads-link"}): "Holder-reader"}.get(frozenset(acts), "helper")
        else:
            roles[tid] = ("commands" if "reads-link" in acts else "to-Core writer" if acts == {"writes-link"} else
                          "output pump" if acts == {"reads-pty"} else "input writer" if acts == {"writes-pty"} else "helper")
    return roles
