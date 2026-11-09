import argparse
import fcntl
import json
import os
from pathlib import Path
import select
import sys
import termios
import time
import tty

parser = argparse.ArgumentParser()
parser.add_argument("--marker", type=Path, required=True)
parser.add_argument("--receipt", type=Path, required=True)
parser.add_argument("--mode", choices=("quiet", "burst"), required=True)
parser.add_argument("--seconds", type=float, default=6)
args = parser.parse_args()
assert args.seconds == 6 and not args.marker.exists()
assert os.get_terminal_size(1) == (145, 39)
assert args.marker.is_absolute() and args.receipt.is_absolute()
expected = b"xvqzjkmnprst"
patterns = [
    ("ABCDEFGHIJKLMNOPQRSTUVWXYZ"[i:] + "ABCDEFGHIJKLMNOPQRSTUVWXYZ"[:i]) * 6
    for i in range(26)
]
saved_tty = termios.tcgetattr(0)
saved_flags = fcntl.fcntl(1, fcntl.F_GETFL)
received, echoed = b"", 0
pending = (
    "\x1b[0m\x1b[2J\x1b[H"
    + "\r\n".join(patterns[row % 26][:144] for row in range(34))
    + "\x1b[36;1H› "
).encode()
kind, pending_count = "initial", 0
armed, write_began, complete = None, None, False
blocks, background_bytes = 0, 0

with args.receipt.open("x") as log:

    def record(event, **fields):
        log.write(
            json.dumps({"event": event, "atNs": time.monotonic_ns(), **fields}) + "\n"
        )
        log.flush()

    tty.setraw(0)
    os.set_blocking(1, False)
    try:
        while True:
            now = time.monotonic_ns()
            if armed is None and args.marker.exists():
                armed = now
                record("armed", mode=args.mode, seconds=args.seconds)
            active = (
                args.mode == "burst"
                and armed is not None
                and now - armed < args.seconds * 1e9
            )
            if (
                armed is not None
                and now - armed >= args.seconds * 1e9
                and not complete
                and not (pending and kind == "background")
            ):
                complete = True
                record(
                    "burst_complete",
                    blocks=blocks,
                    backgroundBytes=background_bytes,
                    received=len(received),
                    echoed=echoed,
                )
            reads, writes, _ = select.select(
                [0],
                [1] if pending or len(received) > echoed or active else [],
                [],
                0.01,
            )
            if reads:
                before = time.monotonic_ns()
                data = os.read(0, 1024)
                after = time.monotonic_ns()
                if not data:
                    break
                received += data
                record(
                    "input_read", beforeNs=before, afterNs=after, count=len(received)
                )
                if not expected.startswith(received):
                    record("invalid_input", count=len(received))
                    raise SystemExit("Unexpected measurement input")
            if not writes:
                continue
            if not pending:
                if len(received) > echoed:
                    pending = "\x1b[36;1H› ".encode() + received
                    kind, pending_count = "echo", len(received)
                elif active:
                    pending = (
                        "\x1b[H"
                        + "\r\n".join(
                            patterns[(blocks + row) % 26][:144] for row in range(34)
                        )
                        + f"\x1b[36;{3 + len(received)}H"
                    ).encode()
                    kind = "background"
                else:
                    continue
            before = time.monotonic_ns()
            try:
                written = os.write(1, pending)
            except BlockingIOError:
                continue
            after = time.monotonic_ns()
            assert written > 0
            write_began = before if write_began is None else write_began
            pending = pending[written:]
            if kind == "background":
                background_bytes += written
            if not pending:
                if kind == "echo":
                    echoed = pending_count
                    record(
                        "echo_written",
                        beforeNs=write_began,
                        afterNs=after,
                        count=echoed,
                    )
                elif kind == "background":
                    blocks += 1
                else:
                    record(
                        "ready",
                        pid=os.getpid(),
                        mode=args.mode,
                        argv=sys.argv,
                        clock=time.get_clock_info("monotonic").implementation,
                        timeNamespace=os.readlink("/proc/self/ns/time"),
                    )
                write_began = None
    finally:
        fcntl.fcntl(1, fcntl.F_SETFL, saved_flags)
        termios.tcsetattr(0, termios.TCSANOW, saved_tty)
