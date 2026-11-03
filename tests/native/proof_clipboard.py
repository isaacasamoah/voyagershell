import json
import subprocess


class Clipboard:
    def __init__(self, env, wait):
        self.env = env
        self.wait = wait
        self.written = set()
        self.mutated = False

    def read(self):
        return subprocess.run(
            ["xsel", "--clipboard", "--output", "--selectionTimeout", "2000"],
            env=self.env,
            capture_output=True,
            check=True,
            timeout=4,
        ).stdout

    def write(self, value):
        assert self.read() in self.written, "Clipboard changed externally"
        self.mutated = True
        self.written.add(value)
        subprocess.run(
            ["xsel", "--clipboard", "--input"],
            input=value,
            env=self.env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.PIPE,
            check=True,
            timeout=4,
        )
        self.wait(self.read, lambda current: current == value, "clipboard write", 5)

    def preserve(self, evidence):
        wayland_env = dict(
            self.env, WAYLAND_DISPLAY=self.env["VOYAGER_PROOF_WAYLAND_DISPLAY"]
        )
        types = (
            subprocess.run(
                ["wl-paste", "--list-types"],
                env=wayland_env,
                capture_output=True,
                check=True,
                timeout=4,
            )
            .stdout.decode()
            .splitlines()
        )
        advertised = types
        transfer_targets = {
            "SAVE_TARGETS",
            "TARGETS",
            "INCR",
            "DELETE",
            "MULTIPLE",
            "TIMESTAMP",
        }
        types = [kind for kind in types if kind not in transfer_targets]
        assert types and all(
            kind in {"UTF8_STRING", "TEXT", "STRING"}
            or kind.lower() in {"text/plain", "text/plain;charset=utf-8"}
            for kind in types
        ), f"Clipboard is not known plain text: {types}"
        original_clipboard = self.read()
        original_clipboard.decode("utf-8")
        representations = []
        for kind in types:
            try:
                result = subprocess.run(
                    ["wl-paste", "--no-newline", "--type", kind],
                    env=wayland_env,
                    capture_output=True,
                    check=False,
                    timeout=4,
                )
                representations.append(
                    {
                        "type": kind,
                        "length": len(result.stdout),
                        "match": result.returncode == 0
                        and result.stdout == original_clipboard,
                    }
                )
            except subprocess.TimeoutExpired:
                representations.append({"type": kind, "length": None, "match": False})
        evidence.write_text(
            json.dumps(
                {
                    "advertisedTypes": advertised,
                    "xselLength": len(original_clipboard),
                    "representations": representations,
                    "restores": "text bytes only; MIME aliases and owner are not preserved",
                },
                indent=2,
            )
        )
        assert any(
            item["match"]
            and item["type"].lower() in {"text/plain", "text/plain;charset=utf-8"}
            for item in representations
        ), "No canonical Wayland plain-text representation matched X11"
        self.written.add(original_clipboard)
        return original_clipboard
