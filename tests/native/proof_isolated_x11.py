import ctypes
import os
import subprocess
from pathlib import Path

from proof_process import process_identity


class Native:
    def __init__(self, env, pid):
        self.env = env
        self.pid = pid
        self.identity = process_identity(pid, metadata_only=True)
        self.display = env["DISPLAY"]
        command = Path(f"/proc/{pid}/cmdline").read_bytes().split(b"\0")
        assert self.identity["executable"] == "/usr/bin/Xvfb"
        assert self.identity["uid"] == os.getuid()
        assert self.display.encode() in command and self.display != ":0"
        self.x11 = ctypes.CDLL("libX11.so.6")
        self.x11.XKeysymToString.argtypes = [ctypes.c_ulong]
        self.x11.XKeysymToString.restype = ctypes.c_char_p

    def __call__(self, *args):
        assert process_identity(self.pid, metadata_only=True) == self.identity
        action = args[0]
        result = {"ok": True}
        command = None
        if action == "move":
            command = ["mousemove", str(round(args[1])), str(round(args[2]))]
        elif action == "button":
            command = [
                "mousedown" if args[1] else "mouseup",
                str({272: 1, 273: 3, 274: 2}[args[2] if len(args) > 2 else 272]),
            ]
        elif action == "key":
            name = self.x11.XKeysymToString(args[1])
            assert name, f"No X11 keysym name for {args[1]}"
            command = ["keydown" if args[2] else "keyup", name.decode()]
        elif action == "scroll":
            if args[1]:
                command = ["click", "4" if args[1] < 0 else "5"]
        else:
            raise ValueError(f"Unsupported isolated X11 action: {action}")
        if command:
            subprocess.run(["xdotool", *command], env=self.env, check=True)
        return result
