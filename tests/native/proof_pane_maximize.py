import copy
from secrets import token_hex

from proof_process import process_identity
from proof_session_quit import pane_candidates
from proof_workspace import chord


def pane_extent(panes):
    assert panes
    x = min(item["x"] for item in panes)
    y = min(item["y"] for item in panes)
    right = max(item["x"] + item["width"] for item in panes)
    bottom = max(item["y"] + item["height"] for item in panes)
    return [x, y, right - x, bottom - y]


def maximize(
    *,
    native,
    owner,
    capture,
    wait,
    document,
    fleet,
    panes,
    settled,
    fields,
    move,
    click,
    focus,
    press,
    type_text,
    rpc,
    save,
    nested,
    terminals,
    pane_backends,
    owned,
    core,
):
    root = fleet(nested)["root"]
    press("Fleet layouts")
    press("Save Fleet layout")
    wait(lambda: fields("Name"), lambda items: items[0]["focused"], "layout-name focus")
    type_text("Maximize proof\n")
    baseline = wait(
        document,
        lambda doc: any(
            item["name"] == "Maximize proof" and item["root"] == root
            for item in doc["value"]["savedLayouts"]
        ),
        "the saved original three-pane arrangement",
    )
    press("Fleet layouts")
    rectangles = settled()
    original_panes = panes()
    full_extent = pane_extent(original_panes)
    selected_content = next(
        item
        for item in baseline["value"]["contents"]
        if item.get("backend") == pane_backends[1]
    )
    selected = next(
        item["id"]
        for item in fleet(baseline)["vessels"]
        if item["content"] == selected_content["id"]
    )

    def verify(maximized):
        expected = copy.deepcopy(baseline)
        if maximized:
            fleet(expected)["maximizedPlacement"] = selected
        else:
            fleet(expected).pop("maximizedPlacement", None)
        actual = document()
        assert actual["value"] == expected["value"], actual
        status = rpc("server.status", {})
        assert (status["pid"], status["core"]["id"]) == (
            core["pid"],
            core["core"]["id"],
        )
        current = {
            item["address"]: item
            for item in rpc("terminal.list", {"all": True})["terminals"]
        }
        assert set(current) == set(terminals)
        for address, original in terminals.items():
            assert (
                current[address]["pid"] == original["pid"]
                and current[address]["state"] == "live"
            )
            assert (
                process_identity(current[address]["pid"], metadata_only=True)
                == owned[str(original["pid"])]
            )
        return actual

    def ordinary_input(index, name, maximized=False, explicit_refocus=False):
        count = 1 if maximized else 3
        expected_rect = full_extent if maximized else rectangles[index]
        focused = wait(
            lambda: [item for item in fields("Terminal", count) if item["focused"]],
            lambda items: (
                len(items) == 1
                and [items[0][key] for key in ("x", "y", "width", "height")]
                == expected_rect
            ),
            "the intended terminal focus without repair",
        )
        save(
            name + "-focus",
            {
                "fields": focused,
                "explicitRefocus": explicit_refocus,
                "backend": pane_backends[index],
            },
        )
        token = token_hex(6)
        marker = "MAX_" + token
        type_text(f"printf 'MAX_%s\\n' {token}\n")
        screens = wait(
            lambda: {
                address: rpc("terminal.read", {"terminal": address})["text"]
                for address in terminals
            },
            lambda values: marker in values[pane_backends[index]].splitlines(),
            "native input producing a distinct line on the intended backend",
        )
        assert all(
            marker not in text.splitlines()
            for address, text in screens.items()
            if address != pane_backends[index]
        )
        save(
            name,
            {
                "document": verify(maximized),
                "focus": focused,
                "marker": marker,
                "screens": screens,
            },
        )
        capture(name)

    def corner(maximized, name):
        count = 1 if maximized else 3
        target = fields("Terminal", 1)[0] if maximized else panes()[1]
        frames = [
            frame
            for frame in fields("Vessel dock", count)
            if pane_candidates([target], frame)
        ]
        assert len(frames) == 1, frames
        frame = frames[0]
        point = [frame["x"] + frame["width"] - 32, (frame["y"] + target["y"]) / 2]
        move(*point)
        label = "Restore Vessel" if maximized else "Maximize Vessel"
        controls = wait(
            lambda: pane_candidates(
                native("fields", owner, [label], "window")["fields"], frame
            ),
            lambda items: len(items) == 1,
            "the intended pane's actual hover button",
        )
        assert controls[0]["role"] in ("button", "push button")
        save(
            name + "-hover",
            {"frame": frame, "point": point, "label": label, "control": controls[0]},
        )
        capture(name + "-hover")
        click(controls[0])

    focus(panes()[0], 3)
    ordinary_input(0, "maximize-before", explicit_refocus=True)
    for number, (method, maximized) in enumerate(
        (
            ("corner", True),
            ("keyboard", False),
            ("keyboard", True),
            ("corner", False),
        )
    ):
        before = document()
        name = "maximize-" + str(number) + "-" + method
        if method == "corner":
            corner(not maximized, name)
        else:
            chord(native, "z")
        changed = wait(
            document,
            lambda doc: (
                fleet(doc).get("maximizedPlacement")
                == (selected if maximized else None)
            ),
            "the accepted maximize or restore effect",
        )
        assert changed["version"] > before["version"]
        expected_rectangles = [full_extent] if maximized else rectangles
        wait(
            lambda: [
                [item[key] for key in ("x", "y", "width", "height")]
                for item in (fields("Terminal", 1) if maximized else panes())
            ],
            lambda values: values == expected_rectangles,
            "the intended maximized or restored native geometry",
        )
        actual_panes = fields("Terminal", 1) if maximized else panes()
        save(
            name + "-effect",
            {
                "before": before,
                "after": verify(maximized),
                "fieldsBeforeOrdinaryInput": actual_panes,
            },
        )
        ordinary_input(1, name, maximized)
    for index, pane in enumerate(panes()):
        focus(pane, 3)
        ordinary_input(
            index, "maximize-final-mapping-" + str(index), explicit_refocus=True
        )
    target = panes()[1]
    frames = fields("Vessel dock", 3)
    candidates = [frame for frame in frames if pane_candidates([target], frame)]
    assert len(candidates) == 1, candidates
    frame = candidates[0]
    away = panes()[0]
    move(away["x"] + away["width"] / 2, away["y"] + away["height"] / 2)
    native("focus", owner, "Vessel dock", frames.index(frame))
    wait(
        lambda: fields("Vessel dock", 3),
        lambda items: items[frames.index(frame)]["focused"],
        "the intended Vessel dock focused without activation",
    )
    trace = []
    for step in range(9):
        snapshot = native("fields", owner, None, "window")["fields"]
        trace.append(snapshot)
        save("maximize-tab-navigation", {"steps": trace, "frame": frame})
        buttons = pane_candidates(
            [
                item
                for item in snapshot
                if item["name"] == "Maximize Vessel" and item["focused"]
            ],
            frame,
        )
        if len(buttons) == 1:
            assert buttons[0]["role"] in ("button", "push button")
            break
        assert not any(
            item["role"] == "terminal" and item["focused"] for item in snapshot
        ), "Tab reached a terminal before the maximize button"
        assert step < 8, "Maximize button was not reached within eight Tabs"
        native("key", 65289, True)
        native("key", 65289, False)
    assert document()["value"] == baseline["value"]
    capture("maximize-tab-focused-arrow")
    native("key", 65293, True)
    native("key", 65293, False)
    wait(
        document,
        lambda doc: fleet(doc).get("maximizedPlacement") == selected,
        "Enter maximized the selected Vessel",
    )
    maximized_frame = fields("Vessel dock", 1)[0]
    focused_restore = wait(
        lambda: pane_candidates(
            native("fields", owner, ["Restore Vessel"], "window")["fields"],
            maximized_frame,
        ),
        lambda items: len(items) == 1 and items[0]["focused"],
        "the same keyboard button now focused as Restore",
    )
    save(
        "maximize-enter-focused-restore",
        {"document": verify(True), "fields": focused_restore},
    )
    capture("maximize-enter-focused-restore")
    native("key", 65293, True)
    native("key", 65293, False)
    wait(
        document,
        lambda doc: not fleet(doc).get("maximizedPlacement"),
        "Enter restored the selected Vessel",
    )
    assert settled() == rectangles
    save(
        "maximize-enter-restored",
        {"document": verify(False), "fields": fields("Vessel dock", 3)},
    )
    capture("maximize-enter-restored")
    save(
        "maximize-preserved",
        {
            "initial": baseline,
            "final": verify(False),
            "rectangles": settled(),
            "paneBackends": pane_backends,
            "terminals": terminals,
            "owned": owned,
        },
    )
    return [
        "three-real-pane-input-output-mapping-and-saved-layout",
        "corner-maximize-different-pane-without-focus-repair",
        "keyboard-restore-and-maximize-without-focus-repair",
        "corner-restore-retains-the-accepted-three-leaf-tree",
        "tab-visible-button-and-enter-maximize-restore-with-pointer-away",
        "original-processes-context-layouts-and-pane-mapping-retained",
        "native-quit-and-recorded-owned-exits",
    ]
