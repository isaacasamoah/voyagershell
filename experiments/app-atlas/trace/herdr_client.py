"""Drives two Herdr Core pathways for trace/herdr-drive.sh.

connect T: what an app does: start `hc connect`, say hello, switch to frames,
           list terminals, watch terminal T for two seconds, close.
attach T:  what a person does: `hc attach T` in a pseudo-terminal, read its
           output, type, resize the window, then press Ctrl+\\ to detach.
"""
import fcntl, json, os, pty, select, signal, struct, subprocess, sys, termios, time

DATA, CREDIT, CLOSE = 0, 1, 2


def frame(channel, kind, payload):
    return struct.pack("<IBI", channel, kind, len(payload)) + payload


def read_exact(stream, n):
    out = b""
    while len(out) < n:
        chunk = stream.read(n - len(out))
        if not chunk:
            raise EOFError("hc connect closed")
        out += chunk
    return out


def read_frame(stream):
    channel, kind, size = struct.unpack("<IBI", read_exact(stream, 9))
    return channel, kind, read_exact(stream, size)


def connect(terminal):
    hc = subprocess.Popen(["hc", "connect", "--session", "atlas"], stdin=subprocess.PIPE, stdout=subprocess.PIPE, bufsize=0)
    hello = {"jsonrpc": "2.0", "id": 1, "method": "hello", "params": {"generation": 1, "framed": True}}
    hc.stdin.write((json.dumps(hello) + "\n").encode())
    line = b""
    while not line.endswith(b"\n"):
        line += read_exact(hc.stdout, 1)
    print("hello:", json.loads(line)["result"].get("version"))

    def call(id_, method, params):
        hc.stdin.write(frame(0, DATA, json.dumps({"jsonrpc": "2.0", "id": id_, "method": method, "params": params}).encode()))
        while True:
            channel, kind, payload = read_frame(hc.stdout)
            if channel == 0 and kind == DATA:
                message = json.loads(payload)
                if message.get("id") == id_:
                    return message

    listed = call(2, "terminal.list", {"all": True})
    print("terminals:", [t["address"] for t in listed["result"]["terminals"]])
    attached = call(3, "terminal.attach", {"terminal": terminal, "cols": 80, "rows": 24, "observe": True})
    channel = attached["result"]["channel"]
    print("attached on channel", channel)
    end, seen = time.time() + 2, 0
    while time.time() < end:
        if not select.select([hc.stdout], [], [], 0.2)[0]:
            continue
        got, kind, payload = read_frame(hc.stdout)
        if got == channel and kind == DATA:
            seen += len(payload)
            hc.stdin.write(frame(channel, CREDIT, struct.pack("<I", len(payload))))
    print("stream bytes:", seen)
    hc.stdin.write(frame(channel, CLOSE, b""))
    hc.stdin.close()
    hc.wait(timeout=10)


def attach(terminal):
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack("HHHH", 30, 100, 0, 0))
    hc = subprocess.Popen(["hc", "attach", terminal], stdin=slave, stdout=slave, stderr=slave, start_new_session=True,
                          preexec_fn=lambda: fcntl.ioctl(0, termios.TIOCSCTTY, 0))
    os.close(slave)

    def drain(seconds):
        end, out = time.time() + seconds, b""
        while time.time() < end:
            if select.select([master], [], [], 0.1)[0]:
                try:
                    out += os.read(master, 65536)
                except OSError:
                    break
        return out

    shown = drain(3)
    print("attach output bytes:", len(shown), "ticks seen:", shown.count(b"tick"))
    os.write(master, b"x")
    drain(1)
    fcntl.ioctl(master, termios.TIOCSWINSZ, struct.pack("HHHH", 40, 120, 0, 0))
    os.kill(hc.pid, signal.SIGWINCH)
    drain(1.5)
    os.write(master, b"\x1c")
    drain(1)
    print("attach exit status:", hc.wait(timeout=10))


if __name__ == "__main__":
    {"connect": connect, "attach": attach}[sys.argv[1]](sys.argv[2])
