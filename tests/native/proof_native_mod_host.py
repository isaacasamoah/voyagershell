import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import time
from pathlib import Path

from PIL import Image, ImageChops

from proof_process import process_identity


def candidate_directory(foundation):
    repository = Path(__file__).resolve().parents[2]
    return repository if foundation else repository / "experiments/native-content"


def reap_launched_candidate(process, pid):
    if process is not None and process.pid == pid:
        process.wait(timeout=5)


def run():
    parser = argparse.ArgumentParser()
    parser.add_argument("--native-mod-host", action="store_true")
    parser.add_argument("--foundation", action="store_true")
    parser.add_argument("--journey", choices=["feedback-ux", "rename-typing", "canvas", "canvas-input", "workspace", "workspace-ux", "workspace-unavailable", "placement", "terminal", "portal-terminal", "terminal-grid", "terminal-reported-status", "arrangement", "layouts", "split-resize", "pane-maximize", "notes", "notes-lifetime", "notes-configuration", "conversation", "conversation-interrupt", "conversation-administrator", "conversation-workspace-refresh", "conversation-process", "conversation-ux", "terminal-agent", "terminal-agent-create", "session-quit", "conversation-scroll", "conversation-stop", "conversation-voice", "conversation-content", "avatar", "portal-avatar"])
    parser.add_argument("--launch", action="store_true")
    parser.add_argument("--quit", action="store_true")
    parser.add_argument("--review", action="store_true")
    parser.add_argument("--notes", action="store_true")
    parser.add_argument("--notes-case", choices=["standard", "delayed", "uncertain", "resilience", "refusal"], default="standard")
    parser.add_argument("--pointer-only", action="store_true")
    parser.add_argument("--compositor", action="store_true")
    parser.add_argument("--binary", type=Path, default=Path("target/release/voyager-shell"))
    parser.add_argument("--session", required=True)
    parser.add_argument("--evidence", type=Path, required=True)
    parser.add_argument("--desktop-env", type=Path)
    parser.add_argument("--window-origin", nargs=2, type=int)
    parser.add_argument("--public-snapshot", type=Path)
    args = parser.parse_args()
    if args.review and (
        not args.foundation
        or not args.compositor
        or args.quit
        or args.notes
        or args.journey
    ):
        parser.error(
            "--review requires --foundation --compositor without --journey, --notes or --quit"
        )
    if args.journey in ("feedback-ux", "rename-typing") and not args.foundation:
        parser.error("Feedback journeys require the foundation route")
    if args.journey in ("avatar", "portal-avatar") and not args.compositor:
        parser.error("Avatar journeys require compositor capture")
    if args.journey in ("notes", "notes-lifetime", "notes-configuration") and not args.compositor:
        parser.error("Notes journey requires compositor capture")
    if args.journey == "session-quit" and not args.compositor:
        parser.error("Session Quit requires compositor capture")
    if args.journey == "terminal-reported-status" and not args.compositor:
        parser.error("Reported status requires compositor capture")
    if args.journey in ("split-resize", "pane-maximize") and not args.compositor:
        parser.error("Split resize requires compositor capture")
    if args.journey in ("canvas", "canvas-input", "workspace-ux", "feedback-ux", "rename-typing") and not args.compositor:
        parser.error("Canvas requires compositor capture")
    if args.journey == "conversation-scroll":
        if args.public_snapshot is None or not args.public_snapshot.is_absolute() or not args.public_snapshot.is_file():
            parser.error("conversation-scroll requires an absolute public Snapshot file")
    elif args.public_snapshot is not None:
        parser.error("--public-snapshot is only for conversation-scroll")
    if not re.fullmatch(r"voyager-[a-z0-9-]+", args.session):
        parser.error("Use a dedicated voyager- session")
    root = Path(__file__).resolve().parent
    candidate_root = candidate_directory(args.foundation)
    if not args.foundation:
        sys.path.append(str(candidate_root))
    binary = args.binary.resolve()
    if args.launch and not binary.is_file():
        raise RuntimeError("Native header capability has not been built")
    evidence = args.evidence.resolve()
    if args.launch:
        evidence.mkdir(parents=True, exist_ok=False)
    elif not evidence.is_dir():
        raise RuntimeError("Existing candidate evidence is required")
    env = dict(os.environ)
    if args.desktop_env:
        env.update(json.loads(args.desktop_env.read_text())[1]["env"])
    elif not args.launch:
        env.update(json.loads((evidence / "launch.json").read_text())["desktopEnvironment"])
    wayland_display = env.pop("WAYLAND_DISPLAY", None)
    env.pop("VOYAGER_PROOF_WAYLAND_DISPLAY", None)
    if args.journey in ("conversation-ux", "canvas", "notes-lifetime", "notes-configuration", "feedback-ux") and wayland_display:
        env["VOYAGER_PROOF_WAYLAND_DISPLAY"] = wayland_display
    if args.journey in ("conversation-stop", "conversation-ux"):
        if env.get("HC_SOCKET"):
            raise RuntimeError("Selected Stop requires an unset HC_SOCKET before launch")
        env.pop("HC_SESSION", None)
        env.pop("HC_TERMINAL_ID", None)
        if args.launch:
            for selected in ((args.session, args.session + "-other") if args.journey == "conversation-stop" else (args.session,)):
                socket = Path(env["XDG_RUNTIME_DIR"]) / "herdr-core" / (selected + ".sock")
                if socket.exists():
                    raise RuntimeError("Selected Stop requires two fresh dedicated Core sessions")
    if args.review or args.journey in ("avatar", "portal-avatar", "notes", "notes-lifetime", "notes-configuration", "split-resize", "pane-maximize", "canvas", "canvas-input", "workspace-ux", "feedback-ux", "rename-typing", "conversation-voice", "conversation-content", "terminal-agent-create", "arrangement", "session-quit", "terminal-reported-status"):
        if env.get("HC_SOCKET"):
            raise RuntimeError("This journey requires an unset HC_SOCKET before launch")
        env.pop("HC_SESSION", None)
        env.pop("HC_TERMINAL_ID", None)
        if args.launch:
            socket = Path(env["XDG_RUNTIME_DIR"]) / "herdr-core" / (args.session + ".sock")
            if socket.exists():
                raise RuntimeError("This journey requires a fresh dedicated Core session")
    env.pop("VOYAGER_PROOF_PUBLIC_SNAPSHOT", None)
    if args.journey == "conversation-scroll":
        env["VOYAGER_PROOF_PUBLIC_SNAPSHOT"] = str(args.public_snapshot)
    env["VOYAGER_WORKSPACE_SESSION"] = args.session
    if args.journey in ("notes-lifetime", "notes-configuration", "session-quit") or args.journey and args.journey.startswith("conversation"):
        env["VOYAGER_CONVERSATION_EVIDENCE"] = str(evidence / "conversation.json")
    if args.journey == "conversation-voice":
        env["VOYAGER_VOICE_EVIDENCE"] = str(evidence / "voice.json")
    if args.journey == "workspace-unavailable":
        env["VOYAGER_HC"] = "/bin/false"
    profile = evidence / "profile"
    launch_file = evidence / "launch.json"
    command = [str(binary), "--profile", str(profile), "--session", args.session]

    def execute(*parts):
        return subprocess.check_output(
            parts, env=env, text=True, stderr=subprocess.DEVNULL
        ).strip()

    def identify(pid):
        identity = process_identity(pid)
        identity["executable"] = str(Path(f"/proc/{pid}/exe").resolve())
        info = Path(f"/proc/{pid}/exe").stat()
        identity["artifact"] = [info.st_dev, info.st_ino, info.st_size, info.st_mtime_ns]
        return identity

    pending_process = None
    pending_identity = None

    def launch_candidate():
        nonlocal pending_process, pending_identity
        with (evidence / "native.log").open("a") as log:
            process = subprocess.Popen(
                command, cwd=candidate_root, env=env, stdout=log, stderr=log, start_new_session=True
            )
        pending_process = process
        pending_identity = None
        pending = {"pid": process.pid, "command": command, "session": args.session}
        pending_path = evidence / "launch-pending.json"
        pending_path.write_text(json.dumps(pending, indent=2))
        try:
            pending["identity"] = identify(process.pid)
            pending_identity = pending["identity"]
        except (OSError, ValueError, KeyError, StopIteration) as error:
            pending["identityError"] = str(error)
        pending_path.write_text(json.dumps(pending, indent=2))
        windows = []
        for _ in range(100):
            if process.poll() is not None:
                raise RuntimeError("Native candidate exited before its window")
            try:
                visible = execute(
                    "xdotool", "search", "--onlyvisible", "--pid", str(process.pid)
                ).splitlines()
                candidates = [
                    {"window": item, "title": execute("xdotool", "getwindowname", item)}
                    for item in visible
                ]
                (evidence / "launch-window-candidates.json").write_text(
                    json.dumps({"pid": process.pid, "candidates": candidates}, indent=2)
                )
                windows = (
                    [
                        item["window"]
                        for item in candidates
                        if item["title"] == f"Voyager — {args.session}"
                    ]
                    if args.foundation
                    else visible
                )
                if len(windows) == 1:
                    break
            except subprocess.CalledProcessError:
                pass
            time.sleep(0.1)
        else:
            raise RuntimeError("No unambiguous native window")
        record = {
            "pid": process.pid,
            "session": args.session,
            "command": command,
            "identity": identify(process.pid),
            "window": windows[0],
            "binarySha256": hashlib.sha256(binary.read_bytes()).hexdigest(),
            "desktopEnvironment": {
                key: env[key]
                for key in ["DISPLAY", "XAUTHORITY", "XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS"]
                if key in env
            },
        }
        launch_file.write_text(json.dumps(record, indent=2))
        return record

    def cleanup_launch_failure():
        errors = []
        process = pending_process
        if process is not None and process.poll() is None:
            try:
                actual = identify(process.pid)
                assert pending_identity is not None and actual == pending_identity
                assert actual["uid"] == os.getuid() and actual["cwd"] == str(candidate_root)
                assert actual["session"] == args.session and actual["command"] == command
                assert actual["executable"] == str(binary)
                process.terminate()
                process.wait(timeout=5)
            except Exception as error:
                errors.append(f"unverified or surviving candidate {process.pid}: {error}")
        try:
            (evidence / "launch-failure-cleanup.json").write_text(json.dumps({"errors": errors}, indent=2))
        except OSError as error:
            errors.append(f"cleanup receipt: {error}")
        if errors:
            print(f"Launch cleanup errors: {errors}", file=sys.stderr)

    def cleanup_initial_core():
        if args.journey in ("notes", "notes-lifetime", "notes-configuration") and pending_process is not None and pending_process.poll() is not None:
            try:
                from proof_workspace import stop_existing_core

                socket = Path(env["XDG_RUNTIME_DIR"]) / "herdr-core" / (args.session + ".sock")
                if socket.is_socket():
                    stop_existing_core(args.session, env)
                    for _ in range(50):
                        if not socket.exists():
                            break
                        time.sleep(0.1)
                    assert not socket.exists(), "Dedicated Core socket survived cleanup"
            except Exception as error:
                print(f"Initial Notes Core cleanup failed: {error}", file=sys.stderr)

    def launch():
        try:
            return launch_candidate()
        except BaseException:
            cleanup_launch_failure()
            raise

    try:
        record = launch() if args.launch else json.loads(launch_file.read_text())
    except BaseException:
        cleanup_initial_core()
        raise

    def verify():
        actual = identify(record["pid"])
        assert actual == record["identity"], "Process identity changed"
        assert actual["uid"] == os.getuid() and actual["cwd"] == str(candidate_root)
        assert actual["session"] == args.session and actual["command"] == record["command"]
        assert int(execute("xdotool", "getwindowpid", record["window"])) == record["pid"]
        assert args.session in execute("xdotool", "getwindowname", record["window"])

    origin_sequence = 0

    def apply_window_origin():
        nonlocal origin_sequence
        if args.window_origin is None:
            return
        verify()
        before = execute("xdotool", "getwindowgeometry", "--shell", record["window"])
        execute("xdotool", "windowmove", "--sync", record["window"], *map(str, args.window_origin))
        after = execute("xdotool", "getwindowgeometry", "--shell", record["window"])
        origin_sequence += 1
        suffix = "" if origin_sequence == 1 else f"-{origin_sequence}"
        (evidence / f"window-origin{suffix}.json").write_text(json.dumps({"requested": args.window_origin, "before": before, "after": after}, indent=2))

    try:
        verify()
        apply_window_origin()
        execute("xdotool", "windowactivate", "--sync", record["window"])
        pointer = subprocess.Popen(
            ["/usr/bin/python3", str(root / "proof_native_input.py")]
            + (["--pointer"] if args.notes or args.foundation else []), env=env, text=True,
            stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=(evidence / "pointer.log").open("a"),
        )
    except BaseException:
        if args.launch:
            cleanup_launch_failure()
            cleanup_initial_core()
        raise

    input_targets = []

    def native(*action):
        if args.foundation and (
            action[0] == "scroll"
            or action[0] == "key" and action[-1] is True
            or action[0] == "button" and action[1] is True
        ):
            verify()
            if action[0] == "key":
                target = execute("xdotool", "getwindowfocus")
            else:
                location = dict(line.split("=", 1) for line in execute("xdotool", "getmouselocation", "--shell").splitlines())
                target = location["WINDOW"]
            owner = int(execute("xdotool", "getwindowpid", target))
            input_targets.append({"action": action, "window": target, "pid": owner, **({"pointerPosition": location} if action[0] != "key" else {})})
            input_file = "input-targets-quit.json" if args.quit else "input-targets.json"
            (evidence / input_file).write_text(json.dumps(input_targets, indent=2))
            assert owner == record["pid"], "Native input target is not the owned candidate"
        pointer.stdin.write(json.dumps(action) + "\n")
        pointer.stdin.flush()
        result = json.loads(pointer.stdout.readline())
        assert result.get("ok"), f"Native input refused: {result}"
        if action[0] == "move":
            result["pointerPosition"] = dict(line.split("=", 1) for line in execute("xdotool", "getmouselocation", "--shell").splitlines())
        return result

    def close():
        verify()
        execute("xdotool", "windowactivate", "--sync", record["window"])
        capture("before-close")
        for key, down in [(65507, True), (ord("q"), True), (ord("q"), False), (65507, False)]:
            native("key", key, down)
        for _ in range(60):
            process = Path(f"/proc/{record['pid']}")
            try:
                state = process.joinpath("stat").read_text().rsplit(") ", 1)[1].split()[0]
            except FileNotFoundError:
                state = None
            if state in (None, "Z"):
                reap_launched_candidate(pending_process, record["pid"])
                return
            time.sleep(0.1)
        raise AssertionError("Native Quit did not close the owned candidate")

    capture_sequence = 0

    def capture(name, window=None):
        nonlocal capture_sequence
        capture_sequence += 1
        verify()
        path = evidence / f"{name}.png"
        window = record["window"] if window is None else window
        assert int(execute("xdotool", "getwindowpid", window)) == record["pid"]
        if not args.compositor or args.journey not in ("avatar", "portal-avatar", "notes", "notes-lifetime", "notes-configuration"):
            execute("import", "-window", window, str(path))
        if args.compositor:
            bounds = geometry(window)
            crop = [int(bounds[key]) for key in ("X", "Y", "WIDTH", "HEIGHT")]
            canonical = evidence / f"{name}-compositor.png"
            path = evidence / f"{name}-compositor-{capture_sequence}.png"
            receipt = native("capture", str(path), crop, 2)["capture"]
            canonical.write_bytes(path.read_bytes())
            (evidence / f"{name}-compositor.json").write_text(json.dumps(receipt, indent=2))
        return Image.open(path).convert("RGB")

    def start_frame(name):
        nonlocal record
        record = launch()
        try:
            apply_window_origin()
            execute("xdotool", "windowactivate", "--sync", record["window"])
            time.sleep(0.5)
            return capture(name)
        except BaseException:
            cleanup_launch_failure()
            raise

    def save(path, value):
        temporary = path.with_name(path.name + ".tmp")
        temporary.write_text(value)
        os.replace(temporary, path)

    def geometry(window=None):
        verify()
        window = record["window"] if window is None else window
        assert int(execute("xdotool", "getwindowpid", window)) == record["pid"]
        return dict(line.split("=") for line in execute(
            "xdotool", "getwindowgeometry", "--shell", window
        ).splitlines())

    def resize_window():
        bounds = geometry()
        execute("xdotool", "windowsize", record["window"],
                str(int(bounds["WIDTH"]) + 20), bounds["HEIGHT"])
        time.sleep(0.3)

    passed = []
    timings = {}
    completed = False

    def edit(path, value, name, previous):
        start = time.monotonic()
        save(path, value)
        while time.monotonic() - start < 0.75:
            image = capture(name)
            if ImageChops.difference(previous, image).getbbox():
                elapsed = time.monotonic() - start
                assert elapsed <= 0.75, f"{name} exceeded the frozen reload limit"
                timings[name] = round(elapsed * 1000, 2)
                return image
            time.sleep(0.04)
        raise AssertionError(f"{name} did not visibly change within 750 ms")

    try:
        if args.review:
            capture("review-initial")
        elif args.quit:
            close()
            passed.append("native-quit")
        elif args.foundation:
            import importlib
            module = "proof_feedback_ux" if args.journey in ("feedback-ux", "rename-typing") else "proof_workspace_ux" if args.journey == "workspace-ux" else "proof_session_quit" if args.journey == "session-quit" else "proof_voice" if args.journey == "conversation-voice" else "proof_canvas" if args.journey in ("canvas", "canvas-input") else "proof_split_resize" if args.journey in ("split-resize", "pane-maximize") else "proof_notes_lifetime" if args.journey in ("notes-lifetime", "notes-configuration") else "proof_foundation_notes" if args.journey == "notes" else "proof_avatar" if args.journey in ("avatar", "portal-avatar") else "proof_selected_stop" if args.journey == "conversation-stop" else "proof_conversation_scroll" if args.journey == "conversation-scroll" else "proof_terminal_agent" if args.journey in ("terminal-agent", "terminal-agent-create") else "proof_conversation" if args.journey and args.journey.startswith("conversation") else "proof_workspace"
            proof_workspace = importlib.import_module(module)

            options = dict(native=native, capture=capture, geometry=geometry, close=close, start_frame=start_frame, evidence=evidence, session=args.session, env=env, journey=args.journey)
            if args.journey in ("notes", "notes-lifetime", "notes-configuration"):
                options.update(profile=profile, pid=lambda: record["pid"], resize_window=resize_window)
            passed.extend(proof_workspace.prove(**options))
        elif args.notes:
            import proof_native_notes

            journey = {
                "standard": proof_native_notes.prove,
                "delayed": proof_native_notes.delayed_initial_read,
                "uncertain": proof_native_notes.uncertain_confirmation,
                "resilience": proof_native_notes.resize_and_refresh,
                "refusal": proof_native_notes.known_refusal_clears,
            }[args.notes_case]
            passed.extend(journey(
                profile=profile, evidence=evidence, native=native,
                pid=lambda: record["pid"], capture=capture,
                close=close, start_frame=start_frame, resize_window=resize_window,
                geometry=geometry, pointer_only=args.pointer_only,
            ))
        else:
            time.sleep(0.5)
            initial = capture("header-initial")
            package = profile / "mods/header/main.js"
            source = package.read_text()
            changed = source.replace('.child("Voyager")', '.child("Voyager Live")')
            assert changed != source, "Expected shipped native header source"
            valid = edit(package, changed, "header-live", initial)
            passed.append("live-header-pixels")
            invalid = edit(package, "export default class {\n", "header-invalid", valid)
            passed.append("broken-source-visible-result")
            corrected = edit(package, changed, "header-corrected", invalid)
            theme_path = profile / "themes/voyager.json"
            theme = json.loads(theme_path.read_text())
            theme["background"] = "#14202b"
            themed = edit(theme_path, json.dumps(theme), "header-theme", corrected)
            bad_theme = edit(theme_path, "{", "header-theme-invalid", themed)
            edit(theme_path, json.dumps(theme), "header-theme-corrected", bad_theme)
            close()
            start_frame("header-reopened")
            assert package.read_text() == changed and json.loads(theme_path.read_text()) == theme
            close()
            save(package, "export default class {\n")
            first_error = start_frame("header-first-load-invalid")
            edit(package, changed, "header-first-load-corrected", first_error)
            close()
            save(theme_path, "{")
            first_theme_error = start_frame("header-first-theme-invalid")
            edit(theme_path, json.dumps(theme), "header-first-theme-corrected", first_theme_error)
            close()
            hoisted = changed.replace(
                "export default", "const chrome = projection();\n\nexport default"
            ).replace("    const chrome = projection();\n", "")
            save(package, hoisted)
            save(theme_path, "{")
            module_error = start_frame("header-module-theme-invalid")
            edit(theme_path, json.dumps(theme), "header-module-theme-corrected", module_error)
            close()
            imported = "import { heading } from './heading.js';\n" + changed.replace(
                '.child("Voyager Live")', '.child(heading)'
            )
            save(package, imported)
            helper = package.with_name("heading.js")
            save(helper, "export const heading = ;\n")
            import_error = start_frame("header-import-invalid")
            edit(helper, "export const heading = 'Voyager Live';\n", "header-import-corrected", import_error)
            passed.extend([
                "theme-and-error-captures", "native-quit",
                "personal-source-preserved-on-reopen", "first-load-error-and-recovery",
                "first-theme-error-and-recovery",
                "module-theme-error-and-recovery",
                "import-error-and-recovery",
            ])
        completed = not args.review
        print(json.dumps({
            "passed": passed,
            "visualReviewRequired": True,
            "reviewOpened": args.review,
        }))
    finally:
        primary = sys.exc_info()[0] is not None
        primary_error = str(sys.exc_info()[1])
        cleanup_errors = []
        try:
            pointer.stdin.close()
            input_status = pointer.wait(timeout=20)
            if input_status:
                cleanup_errors.append(f"Native input exited {input_status}; see pointer.log")
        except Exception as error:
            cleanup_errors.append(f"Native input cleanup: {error}")
            if pointer.poll() is None:
                try:
                    pointer.kill()
                    pointer.wait(timeout=5)
                except Exception as stop_error:
                    cleanup_errors.append(f"Native input reap: {stop_error}")
        try:
            cleanup = "native-input-quit-cleanup.json" if args.quit else "native-input-cleanup.json"
            if pointer.poll() is not None:
                (evidence / cleanup).write_text(pointer.stdout.read())
            else:
                cleanup_errors.append("Native input still running; receipt unavailable")
        except Exception as error:
            cleanup_errors.append(f"Native input receipt: {error}")
        check_file = "quit-checks.json" if args.quit else "checks.json"
        (evidence / check_file).write_text(json.dumps({
            "passed": passed, "reloadObservedUpperBoundMs": timings,
            "completed": completed and not cleanup_errors, "error": primary_error,
            "reviewOnly": args.review,
            "cleanupErrors": cleanup_errors,
            "visualReviewRequired": True,
        }, indent=2))
        if cleanup_errors:
            message = f"Native input cleanup failed: {cleanup_errors}"
            if primary:
                print(message, file=sys.stderr)
            else:
                raise RuntimeError(message)


if __name__ == "__main__":
    run()
