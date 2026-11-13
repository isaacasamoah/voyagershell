import importlib.util
import json
import subprocess
import sys
import unittest
from pathlib import Path

HOOK = Path(__file__).with_name("guard-live-session.py")
spec = importlib.util.spec_from_file_location("guard", HOOK)
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)

LIVE = {
    "HC_SESSION": "voyager-live-conversation-20261108",
    "HC_SOCKET": "/run/user/1000/herdr-core/voyager-live-conversation-20261108.sock",
    "HC_TERMINAL_ID": "t9",
}
CLEAN = "env -u HC_SOCKET -u HC_SESSION -u HC_TERMINAL_ID -u HC_SCOPE -u HC_TERMINAL_SOCKET -u WAYLAND_DISPLAY -u DISPLAY"


class Refused(unittest.TestCase):
    def refused(self, command, environment=LIVE):
        self.assertIsNotNone(guard.check(command, environment), command)

    def test_the_13_november_upgrade(self):
        self.refused("hc update --json")
        self.refused("hc update --help", {})

    def test_the_13_november_desktop_launch(self):
        self.refused(
            "cd /var/tmp/voyager-try/project && DISPLAY=:87 /x/target/release/voyager-shell --profile /p --session voyager-try",
            {},
        )

    def test_inherited_session_reaches_core(self):
        self.refused("hc ls")
        self.refused("HC_SESSION=voyager-live-conversation-20261108 hc ls")
        self.refused("cargo test --workspace --locked")
        self.refused("npm test")
        self.refused("ZIG=/z bash -c 'cargo test -p voyager-app'")
        self.refused("./target/release/voyager-shell --profile /p --session voyager-x")

    def test_server_stop_without_own_session(self):
        self.refused("hc server stop")
        self.refused("HC_SESSION=voyager-demo hc server stop")


class Allowed(unittest.TestCase):
    def allowed(self, command, environment=LIVE):
        self.assertIsNone(guard.check(command, environment), command)

    def test_cleared_commands(self):
        self.allowed(f"{CLEAN} cargo test --workspace --locked")
        self.allowed(f"{CLEAN} npm test")
        self.allowed("unset HC_SOCKET HC_SESSION HC_TERMINAL_ID; cargo test")
        self.allowed(
            "env -i HOME=$HOME PATH=$PATH DISPLAY=:88 XDG_RUNTIME_DIR=/run/user/1000 /x/voyager-shell --profile /p --session voyager-demo"
        )
        self.allowed(f"{CLEAN} DISPLAY=:87 /x/voyager-shell --profile /p --session voyager-x")

    def test_own_session(self):
        self.allowed("env -u HC_SOCKET -u HC_TERMINAL_ID HC_SESSION=voyager-demo hc server stop")
        self.allowed("env -u HC_SOCKET -u HC_TERMINAL_ID HC_SESSION=voyager-try hc send t1 'echo hi'")

    def test_unrelated_and_quoted(self):
        self.allowed("git status")
        self.allowed("gh pr create --body 'run cargo test and hc ls'")
        self.allowed("ls ~/.local/bin/hc")
        self.allowed("grep -rn cargo app/src")
        self.allowed("cargo build --release --locked")
        self.allowed("hc ls", {})
        self.allowed("tests/native/target/debug/voyager-verification run --journey terminal-scrolling")


class Hook(unittest.TestCase):
    def run_hook(self, command):
        result = subprocess.run(
            [sys.executable, str(HOOK)],
            input=json.dumps({"tool_name": "Bash", "tool_input": {"command": command}}),
            capture_output=True,
            text=True,
            env={**LIVE, "PATH": "/usr/bin:/bin"},
        )
        self.assertEqual(result.returncode, 0, result.stderr)
        return result.stdout

    def test_denies_through_stdin(self):
        output = json.loads(self.run_hook("hc update --json"))
        self.assertEqual(output["hookSpecificOutput"]["permissionDecision"], "deny")

    def test_silent_when_allowed(self):
        self.assertEqual(self.run_hook("git status"), "")


if __name__ == "__main__":
    unittest.main()
