import json
import os
import re
import sys

LIVE = ("HC_SESSION", "HC_SOCKET", "HC_TERMINAL_ID")
PREFIX = "env -u HC_SOCKET -u HC_SESSION -u HC_TERMINAL_ID -u HC_SCOPE -u HC_TERMINAL_SOCKET -u WAYLAND_DISPLAY -u DISPLAY"
SESSION_FORM = "env -u HC_SOCKET -u HC_TERMINAL_ID HC_SESSION=voyager-trial hc ..."
LEAD =r"(?:^|[;&|(`\n]|\$\(|-c\s+['\"])\s*"
WRAP = r"(?:(?:then|do|else|env|exec|nohup|nice|time|timeout\s+\S+|-u\s+\S+|-i|--unset[=\s]\S+|[A-Za-z_][A-Za-z0-9_]*=\S*)\s+)*"
HC = r"(?:[^\s;&|'\"]*/)?hc"
APP = r"[^\s;&|'\"]*voyager-shell"


def word(command, pattern):
    return re.search(r"(^|[\s;&|(`'\"])" + pattern + r"(?=$|[\s;&|)`'\"])", command)


def run(command, pattern):
    return re.search(LEAD + WRAP + r"['\"]?" + pattern + r"(?=['\"]?(?:$|[\s;&|)`]))", command)


def cleared(command, name):
    if re.search(r"\benv\s+(-\S+\s+)*-i\b", command):
        return True
    if re.search(r"(-u|--unset)[\s=]" + name + r"\b", command):
        return True
    return bool(re.search(r"\bunset\b[^;&|\n]*\b" + name + r"\b", command))


def targets_own_session(command):
    return bool(re.search(r"\bHC_SESSION=['\"]?voyager-[a-z0-9-]+", command))


def inside_own_session(environment):
    session = environment.get("HC_SESSION", "")
    socket = environment.get("HC_SOCKET", "")
    return bool(re.fullmatch(r"voyager-[a-z0-9-]+", session)) and (
        not socket or socket.endswith(f"/{session}.sock")
    )


def assigned(command, name):
    found = re.findall(r"(?:^|[\s;&|(`'\"])" + name + r"=['\"]?([^\s;&|'\")]+)", command)
    return found[-1] if found else ""


def resolved_session(command, environment):
    socket = assigned(command, "HC_SOCKET") or (
        "" if cleared(command, "HC_SOCKET") else environment.get("HC_SOCKET", "")
    )
    if socket:
        return os.path.basename(socket).removesuffix(".sock")
    session = assigned(command, "HC_SESSION") or (
        "" if cleared(command, "HC_SESSION") else environment.get("HC_SESSION", "")
    )
    return session or "default"


def deny(reason):
    json.dump(
        {
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": reason,
            }
        },
        sys.stdout,
    )
    sys.exit(0)


def check(command, environment):
    first = command.lstrip().split(maxsplit=1)[0] if command.strip() else ""
    if first in ("git", "gh"):
        return None
    hc = run(command, HC)
    if run(command, HC + r"\s+update"):
        return "Agents never run `hc update`. It upgrades Core and restarts the live session. Ask Isaac."
    if run(command, HC + r"\s+server\s+(?:stop|restart)") and not (
        targets_own_session(command) and cleared(command, "HC_SOCKET")
    ):
        return (
            "`hc server stop|restart` needs an explicit session you created: "
            "`env -u HC_SOCKET -u HC_TERMINAL_ID HC_SESSION=voyager-<yours> hc server stop`."
        )
    if hc and resolved_session(command, environment) == "default":
        return (
            "This `hc` call resolves to Isaac's `default` Core session, because HC_SESSION and HC_SOCKET "
            "are cleared or unset. Name your own session: "
            "`env -u HC_SOCKET -u HC_TERMINAL_ID HC_SESSION=voyager-<yours> hc ...`."
        )
    live = [name for name in LIVE if environment.get(name)]
    if hc and inside_own_session(environment) and not re.search(r"\bHC_(?:SESSION|SOCKET)=", command):
        hc = None
    runs_core = (
        hc
        or run(command, r"cargo\s+test")
        or run(command, r"npm\s+(?:run\s+)?test")
        or run(command, APP)
    )
    if live and runs_core and not word(command, r"\S*voyager-verification\s+run"):
        own = targets_own_session(command) and cleared(command, "HC_SOCKET")
        safe = own or all(cleared(command, name) for name in live)
        if not safe:
            if hc:
                return (
                    f"This shell carries {', '.join(live)} for Isaac's live Core session. "
                    f"Name your own session: `{SESSION_FORM}`."
                )
            return (
                f"This shell carries {', '.join(live)} for Isaac's live Core session. "
                f"Clear them inline: `{PREFIX} <command>`, or name your own session with "
                "`env -u HC_SOCKET -u HC_TERMINAL_ID HC_SESSION=voyager-<yours> ...`."
            )
    if (
        run(command, APP)
        and re.search(r"\bDISPLAY=:", command)
        and not cleared(command, "WAYLAND_DISPLAY")
    ):
        return (
            "This launch sets DISPLAY but keeps WAYLAND_DISPLAY, so the app opens on Isaac's "
            "real desktop. Add `-u WAYLAND_DISPLAY` or use `env -i`."
        )
    return None


def main():
    payload = json.load(sys.stdin)
    if payload.get("tool_name") != "Bash":
        return
    reason = check(payload.get("tool_input", {}).get("command", ""), os.environ)
    if reason:
        deny(reason)


if __name__ == "__main__":
    main()
