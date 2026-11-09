import copy
import json
import sys
import time

from PIL import ImageChops

from proof_workspace import core_rpc, named_button
from proof_clipboard import Clipboard
from proof_process import observe_core_exit


def prove(
    *, native, capture, geometry, close, start_frame, evidence, session, env, journey
):
    assert journey in ("canvas", "canvas-input")
    pid = json.loads((evidence / "launch.json").read_text())["pid"]
    opened = True
    package = evidence / "profile/mods/header/layout-panel.js"
    original = None
    original_clipboard = None

    def document():
        return core_rpc(session, env, "doc.get", {"name": "voyager-layout-v1"})

    def terminal_screen(stage):
        state = core_rpc(session, env, "terminal.get", {"terminal": target})
        screen = core_rpc(session, env, "terminal.read", {"terminal": target})
        (evidence / f"canvas-terminal-{stage}.json").write_text(
            json.dumps({"terminal": state, "screen": screen}, indent=2)
        )
        return screen["text"]

    def wait(get, predicate, label, seconds=20):
        deadline = time.monotonic() + seconds
        while time.monotonic() < deadline:
            value = get()
            if predicate(value):
                return value
            time.sleep(0.1)
        raise AssertionError(f"Timed out waiting for {label}: {value}")

    def click(point):
        bounds = geometry()
        native(
            "move",
            int(bounds["X"]) + round(point[0] * 2),
            int(bounds["Y"]) + round(point[1] * 2),
            2,
        )
        native("button", True)
        native("button", False)

    def button(name):
        click(named_button(native, evidence, name))

    def editor():
        matches = wait(
            lambda: [
                item
                for item in native("fields", pid, None, "window")["fields"]
                if item["role"] in ("entry", "text", "editable text")
                and item["width"] > 200
                and item["height"] > 150
            ],
            lambda fields: len(fields) == 1,
            "unique native layout editor",
        )
        (evidence / "canvas-editor-fields.json").write_text(
            json.dumps(matches, indent=2)
        )
        return matches[0]

    def click_editor():
        field = editor()
        click(
            (
                (field["x"] + field["width"] / 2) / 2,
                (field["y"] + field["height"] / 2) / 2,
            )
        )
        time.sleep(0.3)
        return field

    def select_all():
        for key, down in [
            (65507, True),
            (ord("a"), True),
            (ord("a"), False),
            (65507, False),
        ]:
            native("key", key, down)

    def replace(text):
        nonlocal original_clipboard
        if original_clipboard is None:
            original_clipboard = clipboard.preserve(
                evidence / "canvas-clipboard-types.json"
            )
        clipboard.write(text.encode())
        click_editor()
        select_all()
        for key, down in (
            (65507, True),
            (ord("v"), True),
            (ord("v"), False),
            (65507, False),
        ):
            native("key", key, down)

    clipboard = Clipboard(env, wait)
    try:
        initial = wait(
            document,
            lambda doc: bool(doc["value"]["contents"][0].get("backend")),
            "initial shell",
        )
        layout = initial["value"]
        assert layout["voyages"][0]["fleets"][0]["name"] == "Fleet 1"
        target = layout["contents"][0]["backend"]
        terminal = core_rpc(session, env, "terminal.get", {"terminal": target})
        terminal_screen("early")
        capture("canvas-initial")
        if journey == "canvas-input":
            opened = False
            close()
            original = package.read_bytes()
            (evidence / "canvas-input-original.js").write_bytes(original)
            source = original.decode()
            anchor = "    this.version = version;"
            assert source.count(anchor) == 1
            probe = """
    this.error = "INPUT_PROBE ready";
    for (const event of ["focus", "blur", "change"]) {
      this.input.on(event, (_data, cx) => {
        this.error = `INPUT_PROBE ${event}: ${this.input.value().length}: ${JSON.stringify(this.input.value().slice(-40))}`;
        cx.notify();
      });
    }
"""
            package.write_text(source.replace(anchor, anchor + probe))
            (evidence / "canvas-input-probe.js").write_text(package.read_text())
            start_frame("canvas-input-probe-reopened")
            opened = True
            pid = json.loads((evidence / "launch.json").read_text())["pid"]
            button("Workspace layout")
            wait(
                lambda: native("fields", pid, ["Apply workspace layout"], "window")[
                    "fields"
                ],
                bool,
                "diagnostic editor controls",
            )
            observations = []
            for stage in (
                "opened",
                "clicked",
                "typed",
                "native-select-all",
                "native-after-select",
                "collapse-sidebar",
                "click-after-collapse",
                "type-after-collapse",
                "blur-with-apply",
                "blank-frame-click",
                "typed-after-frame",
                "glyph-click",
                "typed-after-glyph",
            ):
                if stage == "clicked":
                    click_editor()
                if stage == "typed":
                    native("key", ord("x"), True)
                    native("key", ord("x"), False)
                if stage == "native-select-all":
                    select_all()
                if stage in (
                    "native-after-select",
                    "typed-after-frame",
                    "typed-after-glyph",
                    "type-after-collapse",
                ):
                    native("key", ord("y"), True)
                    native("key", ord("y"), False)
                if stage == "blur-with-apply":
                    button("Apply workspace layout")
                if stage == "collapse-sidebar":
                    button("Collapse sidebar")
                if stage == "click-after-collapse":
                    click_editor()
                if stage == "blank-frame-click":
                    click_editor()
                if stage == "glyph-click":
                    field = editor()
                    click((field["x"] / 2 + 12, field["y"] / 2 + 12))
                time.sleep(0.3)
                capture(f"canvas-input-{stage}")
                observations.append(
                    {
                        "stage": stage,
                        "fields": native("fields", pid, None, "window")["fields"],
                        "terminal": terminal_screen(f"probe-{stage}"),
                    }
                )
            (evidence / "canvas-input-observed.json").write_text(
                json.dumps(observations, indent=2)
            )
            button("Close workspace layout")
            opened = False
            close()
            return ["native-canvas-input-observation-only"]
        button("Workspace layout")
        wait(
            lambda: native("fields", pid, ["Apply workspace layout"], "window")[
                "fields"
            ],
            bool,
            "layout controls",
        )
        capture("canvas-layout-editor")
        baseline = []

        def baseline_sample():
            text = terminal_screen(f"baseline-{len(baseline)}")
            baseline.append(text)
            return text

        terminal_text = wait(
            baseline_sample,
            lambda text: len(baseline) > 1 and text == baseline[-2],
            "settled initial terminal screen",
        )
        field = click_editor()
        rect = (
            field["x"] / 2 + 12,
            field["y"] / 2 + 12,
            (field["x"] + field["width"]) / 2 - 12,
            (field["y"] + field["height"]) / 2 - 12,
        )
        before_scroll = capture("canvas-editor-before-scroll").crop(rect)
        deltas = []
        for direction in (-480, 480):
            native("scroll", direction, 0)
            native("scroll", 0, 1)
            time.sleep(0.3)
            after_scroll = capture(f"canvas-editor-scroll-{direction}").crop(rect)
            deltas.append(ImageChops.difference(before_scroll, after_scroll).getbbox())
            before_scroll = after_scroll
        replace("{}")
        capture("canvas-invalid-draft")
        assert terminal_screen("before-invalid-apply") == terminal_text
        button("Apply workspace layout")
        time.sleep(0.3)
        assert document()["version"] == initial["version"]
        assert terminal_screen("after-invalid-apply") == terminal_text
        capture("canvas-invalid-definition-refused")
        changed = copy.deepcopy(layout["canvas"])
        assert changed["root"]["kind"] == "row"
        changed["root"]["children"].reverse()
        button("Collapse sidebar")
        outside = wait(
            document,
            lambda doc: doc["value"]["canvas"]["sidebarCollapsed"],
            "outside sidebar control",
        )
        assert outside["value"]["context"] == layout["context"]
        replace(json.dumps(changed))
        button("Apply workspace layout")
        time.sleep(0.3)
        assert document()["version"] == outside["version"]
        capture("canvas-stale-definition-refused")
        button("Reload workspace layout")
        time.sleep(0.2)
        replace(json.dumps(changed))
        button("Apply workspace layout")
        moved = wait(
            document, lambda doc: doc["value"]["canvas"] == changed, "moved sidebar"
        )
        assert moved["value"]["voyages"] == layout["voyages"]
        assert moved["value"]["contents"] == layout["contents"]
        assert moved["value"]["context"] == layout["context"]
        wait(
            lambda: named_button(native, evidence, "Workspace layout"),
            lambda point: point[0] > 1000,
            "sidebar on the right",
        )
        capture("canvas-sidebar-moved")
        button("Workspace layout")
        replace(json.dumps(layout["canvas"]))
        button("Apply workspace layout")
        restored = wait(
            document,
            lambda doc: doc["value"]["canvas"] == layout["canvas"],
            "restored canvas",
        )
        button("Collapse sidebar")
        collapsed = wait(
            document,
            lambda doc: doc["value"]["canvas"]["sidebarCollapsed"],
            "collapsed rail",
        )
        assert collapsed["value"]["context"] == restored["value"]["context"]
        capture("canvas-sidebar-collapsed")
        button("Expand sidebar")
        wait(
            document,
            lambda doc: not doc["value"]["canvas"]["sidebarCollapsed"],
            "expanded sidebar",
        )
        after = core_rpc(session, env, "terminal.get", {"terminal": target})
        assert after["pid"] == terminal["pid"]
        assert document()["value"]["contents"] == layout["contents"]
        assert terminal_screen("final") == terminal_text
        capture("canvas-restored")
        (evidence / "canvas-observed.json").write_text(
            json.dumps(
                {
                    "initial": initial,
                    "moved": moved,
                    "collapsed": collapsed,
                    "terminalBefore": terminal,
                    "terminalAfter": after,
                    "editorScrollPixelDifferences": deltas,
                },
                indent=2,
            )
        )
        assert any(delta and delta[3] - delta[1] > 30 for delta in deltas), (
            "Editor text did not scroll"
        )
        opened = False
        close()
        return [
            "native-canvas-edit-and-refusal",
            "native-canvas-move-retains-work",
            "native-sidebar-rail-preserves-context",
        ]
    finally:
        primary = sys.exc_info()[0] is not None
        errors = []
        if original_clipboard is not None and clipboard.mutated:
            try:
                clipboard.write(original_clipboard)
            except Exception as error:
                errors.append(f"clipboard restore: {error}")
        if opened:
            try:
                opened = False
                close()
            except Exception as error:
                errors.append(f"quit: {error}")
        if original is not None:
            package.write_bytes(original)
        try:
            observe_core_exit(session, env)
        except Exception as error:
            errors.append(f"Core exit: {error}")
        (evidence / "canvas-cleanup.json").write_text(
            json.dumps({"errors": errors}, indent=2)
        )
        if errors and not primary:
            raise AssertionError(errors)
