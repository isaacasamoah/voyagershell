import json
from pathlib import Path
import select
import subprocess
import time


def stable_geometry(window, execute):
    previous = None
    unchanged = 0
    for _ in range(40):
        geometry = dict(
            line.split("=", 1)
            for line in execute("xdotool", "getwindowgeometry", "--shell", window).splitlines()
        )
        unchanged = unchanged + 1 if geometry == previous else 0
        if unchanged == 5:
            return geometry
        previous = geometry
        time.sleep(0.1)
    raise RuntimeError("Window placement did not settle before compensation")


class Native:
    def __init__(self, env, evidence):
        self.log = (Path(evidence) / 'input.log').open('x')
        self.process = subprocess.Popen(
            ['/usr/bin/python3', str(Path(__file__).with_name('proof_native_input.py')), '--pointer'],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=self.log,
            text=True,
            env=env,
        )

    def __call__(self, *args):
        self.process.stdin.write(json.dumps(args) + '\n')
        self.process.stdin.flush()
        if not select.select([self.process.stdout], [], [], 35)[0]:
            raise TimeoutError('Native input helper did not reply')
        value = json.loads(self.process.stdout.readline())
        if not value.get('ok'):
            raise RuntimeError(value)
        return value

    def close(self):
        self.process.stdin.close()
        code = self.process.wait(timeout=10)
        self.log.close()
        if code:
            raise RuntimeError(f'Native input helper exited with {code}')
