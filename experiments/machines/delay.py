import os
import subprocess
import sys
import threading
import time
import queue

delay = float(sys.argv[1]) / 1000.0
child = subprocess.Popen(sys.argv[2:], stdin=subprocess.PIPE, stdout=subprocess.PIPE, bufsize=0)


def carry(source, sink):
    pending = queue.Queue()

    def release():
        while True:
            due, chunk = pending.get()
            if chunk is None:
                sink.flush()
                return
            wait = due - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            sink.write(chunk)
            sink.flush()

    threading.Thread(target=release, daemon=True).start()
    while True:
        chunk = os.read(source.fileno(), 65536)
        pending.put((time.monotonic() + delay, chunk or None))
        if not chunk:
            return


up = threading.Thread(target=carry, args=(sys.stdin.buffer, child.stdin))
down = threading.Thread(target=carry, args=(child.stdout, sys.stdout.buffer))
up.start()
down.start()
code = child.wait()
down.join()
time.sleep(delay + 0.05)
os._exit(code)
