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
DEFAULT = {
    "HC_SESSION": "default",
    "HC_SOCKET": "/run/user/1000/herdr-core/default.sock",
    "HC_TERMINAL_ID": "t9",
}
CROSSED = {**LIVE, "HC_SOCKET": "/run/user/1000/herdr-core/default.sock"}
TRIAL = {
    "HC_SESSION": "voyager-trial",
    "HC_SOCKET": "/run/user/1000/herdr-core/voyager-trial.sock",
    "HC_TERMINAL_ID": "t6v",
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
        self.refused("hc ls", DEFAULT)
        self.refused("hc ls", CROSSED)
        self.refused("HC_SESSION=voyager-other hc ls")
        self.refused("hc ls && cargo test")
        self.refused("cargo test --workspace --locked")
        self.refused("npm test")
        self.refused("ZIG=/z bash -c 'cargo test -p voyager-app'")
        self.refused("./target/release/voyager-shell --profile /p --session voyager-x")

    def test_fixture_session_named_inline(self):
        self.refused("HC_SESSION=voyager-live-conversation-20261108 hc ls", TRIAL)
        self.refused("HC_SESSION=voyager-live-conversation-20261108 hc ls", LIVE)

    def test_resolves_to_default_session(self):
        self.refused("env -u HC_SESSION -u HC_SOCKET hc ls", TRIAL)
        self.refused("unset HC_SESSION HC_SOCKET; hc ls", TRIAL)
        self.refused("env -u HC_SOCKET hc ls", {"HC_SESSION": "default"})
        self.refused(f"{CLEAN} hc ls", TRIAL)
        self.refused("env -i hc ls", TRIAL)
        self.refused("hc ls", {})
        self.refused("hc ls", {"HC_TERMINAL_ID": "t9"})
        self.refused("for t in t1 t2; do env -u HC_SESSION -u HC_SOCKET hc get $t; done", TRIAL)

    def test_each_chained_call_resolves_on_its_own(self):
        self.refused("env -u HC_SESSION -u HC_SOCKET hc ls; HC_SESSION=voyager-trial hc ls", TRIAL)
        self.refused("env -u HC_SOCKET HC_SESSION=default hc ls; env -u HC_SOCKET HC_SESSION=voyager-trial hc ls", TRIAL)
        self.refused(f"{CLEAN} hc ls && env -u HC_SOCKET -u HC_TERMINAL_ID HC_SESSION=voyager-trial hc ls", TRIAL)
        self.refused("hc ls | cat; env -u HC_SESSION -u HC_SOCKET hc ls", TRIAL)
        self.refused("export HC_SESSION=default; hc ls", TRIAL)
        self.refused("HC_SOCKET=/run/user/1000/herdr-core/default.sock\nhc ls", TRIAL)
        self.refused(f"{CLEAN} gh pr view 1; env -u HC_SESSION -u HC_SOCKET hc ls", TRIAL)

    def test_shell_c_strings_still_scanned(self):
        self.refused("bash -c 'unset HC_SESSION HC_SOCKET; hc ls'", TRIAL)
        self.refused(f"{CLEAN} sh -c 'hc ls'", TRIAL)

    def test_prefixed_gh_git_substitution_still_scanned(self):
        inner = "env -u HC_SESSION -u HC_SOCKET hc ls"
        self.refused(f"{CLEAN} gh pr view 1 $({inner})", TRIAL)
        self.refused(f"{CLEAN} gh pr view 1 `{inner}`", TRIAL)
        self.refused(f"{CLEAN} gh pr comment 1 --body \"$({inner})\"", TRIAL)
        self.refused(f"{CLEAN} gh pr comment 1 --body-file <({inner})", TRIAL)
        self.refused(f"{CLEAN} git log >({inner})", TRIAL)
        self.refused(f"{CLEAN} gh pr view 1 $(hc ls)", {})
        self.refused(f"unset HC_SESSION HC_SOCKET; {CLEAN} gh pr view 1 $(hc ls)", TRIAL)

    def test_comment_apostrophe_does_not_hide_next_line(self):
        self.refused(f"{CLEAN} git status # it's\nenv -u HC_SESSION -u HC_SOCKET hc ls", TRIAL)
        self.refused(f"{CLEAN} gh pr view 1 # don't\nhc ls", {})

    def test_ansi_c_quote_with_escaped_quote_does_not_hide_next_call(self):
        body = "gh pr comment 1 --body $'it\\'s'"
        self.refused(f"{CLEAN} {body}; hc ls", {})
        self.refused(f"{CLEAN} {body}\nhc ls", {})
        self.refused(f"{CLEAN} {body} $(hc ls)", TRIAL)

    def test_escaped_or_doubled_dollar_before_quote_does_not_hide_next_call(self):
        self.refused(f"{CLEAN} gh pr comment 1 --body \\$'a\\' ; hc ls", {})
        self.refused(f"{CLEAN} gh pr comment 1 --body $$'a\\' ; hc ls", {})
        self.refused(f"{CLEAN} gh pr comment 1 --body \\$'a\\'\nhc ls", {})

    def test_prefixed_gh_git_text_is_refused_and_the_message_names_body_file(self):
        for command in (
            f"{CLEAN} gh pr comment 1 --body 'run `hc ls` first'",
            f"{CLEAN} git commit -m 'refuse `hc ls` in default'",
        ):
            reason = guard.check(command, TRIAL)
            self.assertIsNotNone(reason, command)
            self.assertIn("--body-file", reason)
        self.assertIn("--body-file", guard.check("hc ls", DEFAULT))

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

    def test_hc_inside_own_voyager_session(self):
        self.allowed("hc ls")
        self.allowed("hc send t5v 'co1 code-ready workshop#27@fc0468a reports/co1.md'")
        self.allowed("hc get --json t64", {"HC_SESSION": "voyager-trial", "HC_TERMINAL_ID": "t64"})

    def test_naming_a_session_that_is_not_default(self):
        self.allowed("env -u HC_SOCKET -u HC_TERMINAL_ID HC_SESSION=voyager-trial hc ls", TRIAL)
        self.allowed("env -u HC_SOCKET -u HC_TERMINAL_ID HC_SESSION=voyager-trial hc ls", {})

    def test_chained_calls_that_each_name_a_session(self):
        named = "env -u HC_SOCKET -u HC_TERMINAL_ID HC_SESSION=voyager-trial hc"
        self.allowed(f"{named} ls; {named} get t1", TRIAL)
        self.allowed(f"{named} ls && {named} get t1 | head", TRIAL)
        self.allowed("hc ls 2>&1 | head; hc get t1 &>/dev/null", TRIAL)
        self.allowed("unset HC_SOCKET; export HC_SESSION=voyager-trial; hc ls", TRIAL)

    def test_crew_prefix_before_grep(self):
        self.allowed(f"{CLEAN} grep -n 'cargo test' file", LIVE)

    def test_own_session(self):
        self.allowed("env -u HC_SOCKET -u HC_TERMINAL_ID HC_SESSION=voyager-demo hc server stop")
        self.allowed("env -u HC_SOCKET -u HC_TERMINAL_ID HC_SESSION=voyager-try hc send t1 'echo hi'")

    def test_unrelated_and_quoted(self):
        self.allowed("git status")
        self.allowed("gh pr create --body 'run cargo test and hc ls'")
        self.allowed("ls ~/.local/bin/hc")
        self.allowed("grep -rn cargo app/src")
        self.allowed("cargo build --release --locked")
        self.allowed("echo hc ls", {})
        self.allowed(
            "grep -o '[^\" ]*/voyager-shell --profile [^ ]* --session voyager-live' transcript.jsonl | sort"
        )
        self.allowed("ls -la /var/tmp/build/voyager-shell /var/tmp/hc")
        self.allowed("echo 'run cargo test then hc ls'")
        self.allowed("pgrep -af 'voyager-shell --profile'")

    def test_launch_forms_still_refused(self):
        self.assertIsNotNone(guard.check('cd /p && "$VOYAGER_REPO/target/release/voyager-shell" --profile /x', LIVE))
        self.assertIsNotNone(guard.check("timeout 30 ~/.local/bin/hc server stop", {}))
        self.assertIsNotNone(guard.check("for t in t1 t2; do hc get $t; done", DEFAULT))
        self.assertIsNotNone(guard.check("x=$(hc ls)", DEFAULT))
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
