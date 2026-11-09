import argparse
import json
import os
from pathlib import Path
import select
import sys
import termios
import time

parser = argparse.ArgumentParser()
parser.add_argument('--chunk', type=int, required=True)
parser.add_argument('--hz', type=int, required=True)
parser.add_argument('--seconds', type=int, required=True)
parser.add_argument('--out', type=Path, required=True)
parser.add_argument('--barrier', type=Path)
args = parser.parse_args()
assert 64 <= args.chunk <= 16384 and 1 <= args.hz <= 64
assert 1 <= args.seconds <= 7200 and args.out.is_absolute()
fd = sys.stdin.fileno()
prior = termios.tcgetattr(fd)
mode = list(prior)
mode[3] &= ~(termios.ECHO | termios.ICANON)
mode[6] = list(prior[6])
mode[6][termios.VMIN] = 0
mode[6][termios.VTIME] = 0
termios.tcsetattr(fd, termios.TCSANOW, mode)
started = time.monotonic()
sequence = inputs = total = 0
next_write = started
pattern = 'Voyager β界 é '.encode()
try:
    with args.out.open('x') as log:
        if args.barrier:
            assert args.barrier.is_absolute() and not args.barrier.exists()
            log.write(json.dumps({'kind':'ready','timeNs':time.monotonic_ns()}) + '\n')
            log.flush()
            deadline = time.monotonic() + 30
            while not args.barrier.exists():
                if time.monotonic() >= deadline:
                    raise TimeoutError('Producer barrier did not open')
                time.sleep(0.01)
            started = next_write = time.monotonic()
        os.write(1, b'\x1b[?1049h\x1b[?25l\x1b[2J\x1b[H\x1b[48;2;255;0;0m \x1b[0m')
        while time.monotonic() - started < args.seconds:
            now = time.monotonic()
            if now >= next_write:
                cols, rows = os.get_terminal_size(1)
                prefix = f'\x1b[2;{rows}r\x1b[2;1H\x1b[36m{sequence:08d} '.encode()
                suffix = b'\x1b[0m'
                size = args.chunk - len(prefix) - len(suffix)
                body = (pattern * (size // len(pattern) + 1))[:size]
                while body and body[-1] & 0xc0 == 0x80:
                    body = body[:-1]
                body = body.decode(errors='ignore').encode()
                body += b' ' * (size - len(body))
                chunk = prefix + body + suffix
                before = time.monotonic_ns()
                offset = 0
                while offset < len(chunk):
                    offset += os.write(1, chunk[offset:])
                after = time.monotonic_ns()
                total += offset
                log.write(json.dumps({'kind':'output','sequence':sequence,'bytes':offset,'total':total,'beforeNs':before,'afterNs':after}) + '\n')
                log.flush()
                sequence += 1
                next_write += 1 / args.hz
            ready = select.select([fd], [], [], max(0, min(0.05, next_write - time.monotonic())))[0]
            if ready:
                value = os.read(fd, 1024)
                for byte in value:
                    if byte != ord('x'):
                        continue
                    inputs += 1
                    colour = '0;255;0' if inputs % 2 else '255;0;0'
                    before = time.monotonic_ns()
                    os.write(1, f'\x1b7\x1b[1;1H\x1b[48;2;{colour}m \x1b[0m\x1b8'.encode())
                    log.write(json.dumps({'kind':'input','sequence':inputs,'rgb':colour,'beforeNs':before,'afterNs':time.monotonic_ns()}) + '\n')
                    log.flush()
        log.write(json.dumps({'kind':'complete','bytes':total,'outputs':sequence,'inputs':inputs,'elapsed':time.monotonic()-started}) + '\n')
finally:
    os.write(1, b'\x1b[r\x1b[?1049l\x1b[?25h')
    termios.tcsetattr(fd, termios.TCSANOW, prior)
