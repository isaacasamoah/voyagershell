import json
import os
import time
from pathlib import Path

from proof_foundation_notes import notes
from proof_process import process_identity, observe_core_exit
from proof_workspace import chord, core_rpc


def splitter_point(selected, separators):
    assert selected["width"] != selected["height"], selected
    vertical = selected["height"] > selected["width"]
    coordinate, extent = ("y", "height") if vertical else ("x", "width")
    low, high = selected[coordinate], selected[coordinate] + selected[extent]
    crossings = []
    for other in separators:
        assert other["width"] != other["height"], other
        if (other["height"] > other["width"]) != vertical:
            first = max(low, other[coordinate])
            last = min(high, other[coordinate] + other[extent])
            if first < last:
                crossings.append((first, last))
    free = []
    cursor = low
    for first, last in sorted(crossings) + [(high, high)]:
        if cursor < first:
            free.append((cursor, first))
        cursor = max(cursor, last)
    assert free, "No measured splitter span remains clear of other separators"
    span = max(free, key=lambda pair: pair[1] - pair[0])
    point = [
        selected["x"] + selected["width"] / 2,
        selected["y"] + selected["height"] / 2,
    ]
    point[1 if vertical else 0] = sum(span) / 2
    return point, span


def preview_changed(before, after, horizontal):
    if horizontal:
        return after[2][0] != before[2][0] and all(
            after[index][2] != before[index][2] for index in (0, 1)
        )
    return after[2] == before[2] and all(
        after[index][3] != before[index][3] for index in (0, 1)
    )


def observer_source(source):
    source = notes.once(
        source,
        "result = await invoke(action, expectedVersion);",
        """result = await invoke(action, expectedVersion);
        if (action.operation === "resize-split") {
          const observation = {
            action,
            expectedVersion,
            requestId: result.requestId,
            status: result.status,
            version: result.version,
            message: result.message,
          };
          this.resizeProof = (this.resizeProof || []).concat(observation).slice(-8);
        }""",
    )
    return notes.once(
        source,
        '  layer(shell, layout) {\n    return Layer.new("avatar-layer", {',
        """  layer(shell, layout) {
    shell.child(
      Button.new("resize-proof")
        .absolute()
        .bottom(0)
        .right(0)
        .accessibility_label("Resize proof " + JSON.stringify({
          version: this.version,
          busy: this.busy,
          status: this.status,
          outcomes: this.resizeProof || [],
        }))
        .child("Resize proof")
    );
    return Layer.new("avatar-layer", {""",
    )


def prove(
    *, native, capture, geometry, close, start_frame, evidence, session, env, journey
):
    socket = Path(env["XDG_RUNTIME_DIR"]) / "herdr-core" / f"{session}.sock"
    owned = {}
    observed = {}
    errors = []
    failure = None
    core = None
    package = evidence / "profile/mods/header/main.js"
    original_source = None

    def save(name, value):
        (evidence / f"{name}.json").write_text(json.dumps(value, indent=2))

    def wait(get, predicate, label):
        deadline = time.monotonic() + 15
        value = None
        while time.monotonic() < deadline:
            value = get()
            if predicate(value):
                return value
            time.sleep(0.1)
        raise AssertionError(f"Timed out waiting for {label}: {value}")

    def rpc(method, params):
        assert socket.is_socket(), "The dedicated Core socket is absent"
        return core_rpc(session, env, method, params)

    def document():
        return rpc("doc.get", {"name": "voyager-layout-v1"})

    def fleet(item):
        return next(
            fleet
            for voyage in item["value"]["voyages"]
            for fleet in voyage["fleets"]
            if fleet["id"] == item["value"]["selectedFleet"]
        )

    def fields(name, count=1):
        return wait(
            lambda: [
                item
                for item in native("fields", owner, [name], "window")["fields"]
                if name != "Terminal" or item["role"] == "terminal"
            ],
            lambda items: (
                len(items) == count
                and all(item["width"] > 0 and item["height"] > 0 for item in items)
            ),
            f"{count} native {name} target(s)",
        )

    def panes():
        items = fields("Terminal", 3)
        assert all(item["role"] == "terminal" for item in items), items
        return sorted(items, key=lambda item: (item["x"], item["y"]))

    def rectangles():
        return [
            [item[key] for key in ("x", "y", "width", "height")] for item in panes()
        ]

    def restored(expected):
        return wait(
            rectangles,
            lambda current: current == expected,
            "the committed native pane geometry",
        )

    def settled():
        previous = None
        count = 0

        def stable(current):
            nonlocal previous, count
            count = count + 1 if current == previous else 0
            previous = current
            return count == 2

        return wait(rectangles, stable, "stable native pane rectangles")

    def move(x, y):
        bounds = geometry()
        native("move", int(bounds["X"]) + round(x), int(bounds["Y"]) + round(y), 2)

    def click(item):
        move(item["x"] + item["width"] / 2, item["y"] + item["height"] / 2)
        native("button", True)
        native("button", False)

    def focus(item, count):
        click(item)
        wait(
            lambda: fields("Terminal", count),
            lambda current: any(
                target["focused"]
                and all(
                    target[key] == item[key] for key in ("x", "y", "width", "height")
                )
                for target in current
            ),
            "native terminal focus at the clicked pane",
        )

    def press(name):
        item = fields(name)[0]
        assert item["role"] in ("button", "push button"), item
        click(item)

    def key(value):
        native("key", value, True)
        native("key", value, False)

    def type_text(value):
        for character in value:
            key(65293 if character == "\n" else ord(character))

    def witness():
        matches = [
            item
            for item in native("fields", owner, None, "window")["fields"]
            if (item["name"] or "").startswith("Resize proof ")
        ]
        assert len(matches) <= 1, matches
        if matches:
            assert matches[0]["role"] in ("button", "push button"), matches
            assert (matches[0]["width"] or 0) > 0 and (matches[0]["height"] or 0) > 0, (
                matches
            )
            return json.loads(matches[0]["name"].removeprefix("Resize proof "))
        return None

    def drag(name, amount, stale=False):
        before = document()
        bounds = settled()
        idle = wait(
            witness,
            lambda value: value is not None and not value["busy"],
            "an idle Header before the gesture",
        )
        outcomes = idle["outcomes"]
        assert len(outcomes) < 8 and idle["version"] == str(before["version"])
        separators = [
            item
            for item in native("fields", owner, None, "window")["fields"]
            if item["role"] == "separator"
            and (item["width"] or 0) > 0
            and (item["height"] or 0) > 0
        ]
        selected = [item for item in separators if item["name"] == name]
        assert len(selected) == 1, selected
        item = selected[0]
        save("resize-handle-last", item)
        horizontal = name == "Resize side by side panes"
        assert (item["height"] > item["width"]) == horizontal
        start, free_span = splitter_point(item, separators)
        finish = start.copy()
        axis = 0 if horizontal else 1
        finish[axis] += int(geometry()["WIDTH" if horizontal else "HEIGHT"]) * amount
        entry = {
            "selected": item,
            "separators": separators,
            "freeSpan": free_span,
            "start": start,
            "end": finish,
            "before": bounds,
            "steps": [],
        }
        observed.setdefault("drags", []).append(entry)
        path = f"resize-drag-{len(outcomes) + 1}"
        save(path, entry)

        def preview_rectangles():
            current = rectangles()
            entry["heldPreview"] = current
            save(path, entry)
            return current

        move(*start)
        native("button", True)
        try:
            for step in range(1, 7):
                point = [
                    left + (right - left) * step / 6
                    for left, right in zip(start, finish)
                ]
                move(*point)
                entry["steps"].append(
                    {
                        "point": point,
                        "fields": native("fields", owner, ["Terminal"], "window")[
                            "fields"
                        ],
                    }
                )
                save(path, entry)
            preview = wait(
                preview_rectangles,
                lambda current: preview_changed(bounds, current, horizontal),
                "the intended native split preview",
            )
            if stale:
                changed = rpc(
                    "doc.set",
                    {
                        "name": "voyager-layout-v1",
                        "version": before["version"],
                        "value": before["value"],
                    },
                )
                assert changed["version"] > before["version"], changed
                save(
                    "resize-stale-during-gesture",
                    {"before": before, "external": changed, "preview": preview},
                )
        finally:
            native("button", False)
        completed = wait(
            witness,
            lambda current: (
                current is not None
                and not current["busy"]
                and len(current["outcomes"]) == len(outcomes) + 1
            ),
            "one actual resize callback result",
        )
        outcomes_after = completed["outcomes"]
        result = outcomes_after[-1]
        expected_path = [] if horizontal else ["first"]
        assert result["action"]["operation"] == "resize-split"
        assert result["action"]["fleet"] == fleet(before)["id"]
        assert result["action"]["path"] == expected_path
        assert result["expectedVersion"] == str(before["version"])
        assert result["requestId"] and all(
            result["requestId"] != prior["requestId"] for prior in outcomes
        )
        save("resize-results", outcomes_after)
        if stale:
            assert result["status"] == "rejected" and result["message"], result
            assert completed["version"] == str(changed["version"]), completed
            capture("resize-stale-rejected")
            press("Refresh")
            refreshed = wait(
                witness,
                lambda current: (
                    current is not None
                    and not current["busy"]
                    and not current["status"]
                ),
                "the explicit Refresh completing and clearing the error row",
            )
            assert refreshed["outcomes"] == outcomes_after
            after_bounds = restored(bounds)
            after = document()
            assert (
                after["version"] == changed["version"]
                and after["value"] == before["value"]
            ), after
            save(
                "resize-stale-restored", {"document": after, "rectangles": after_bounds}
            )
            capture("resize-stale-restored")
        else:
            assert result["status"] == "applied", result
            after = wait(
                document,
                lambda current: fleet(current)["root"] != fleet(before)["root"],
                "the committed split proportion",
            )
            assert after["version"] == int(result["version"]) > before["version"]
            branch = fleet(after)["root"]
            for child in expected_path:
                branch = branch[child]
            assert branch["share"] == result["action"]["share"]
            settled()
        return after

    def bind(pid):
        identity = process_identity(pid, metadata_only=True)
        assert identity["uid"] == os.getuid()
        owned[str(pid)] = identity

    try:
        assert journey == "split-resize"
        assert not env.get("HC_SOCKET"), "Launch without a fixed Core socket"
        env = {
            key: value
            for key, value in env.items()
            if key not in {"HC_SESSION", "HC_TERMINAL_ID"}
        }
        owner = json.loads((evidence / "launch.json").read_text())["pid"]
        bind(owner)
        wait(socket.is_socket, bool, "the dedicated Core socket")
        core = rpc("server.status", {})
        bind(core["pid"])
        initial = wait(
            document,
            lambda item: (
                len((item.get("value") or {}).get("contents", [])) == 1
                and bool(item["value"]["contents"][0].get("backend"))
            ),
            "the original bound terminal",
        )
        context = initial["value"]["context"]
        original_source = package.read_bytes()
        notes.atomic(package, observer_source(original_source.decode()))
        wait(
            witness,
            lambda value: (
                value is not None and value["outcomes"] == [] and not value["busy"]
            ),
            "the loaded profile-local observer",
        )
        assert document() == initial, "The observer changed the domain layout"
        focus(fields("Terminal")[0], 1)
        chord(native, "o")
        wait(
            document,
            lambda item: len(item["value"]["contents"]) == 2,
            "the horizontal split",
        )
        focus(fields("Terminal", 2)[0], 2)
        chord(native, "e")
        nested = wait(
            document,
            lambda item: (
                len(item["value"]["contents"]) == 3
                and all(content.get("backend") for content in item["value"]["contents"])
            ),
            "three real nested terminals",
        )
        tree = fleet(nested)["root"]
        assert tree["axis"] == "horizontal" and tree["first"]["axis"] == "vertical", (
            tree
        )
        contents = nested["value"]["contents"]
        original_content = initial["value"]["contents"][0]
        assert original_content in contents and nested["value"]["context"] == context
        terminals = {
            content["backend"]: rpc("terminal.get", {"terminal": content["backend"]})
            for content in contents
        }
        for terminal in terminals.values():
            assert terminal.get("pid")
            bind(terminal["pid"])
        addresses = sorted(
            item["address"] for item in rpc("terminal.list", {"all": True})["terminals"]
        )
        assert addresses == sorted(terminals), addresses
        save("resize-owned-processes", owned)
        pane_backends = []
        for index, item in enumerate(panes()):
            focus(item, 3)
            type_text(f"printf 'RESIZE_%s\\n' {index}\n")
            matched = wait(
                lambda: [
                    address
                    for address in terminals
                    if f"RESIZE_{index}"
                    in rpc("terminal.read", {"terminal": address})["text"].splitlines()
                ],
                lambda matches: len(matches) == 1,
                f"real output from native pane {index}",
            )
            pane_backends.append(matched[0])
        assert len(set(pane_backends)) == 3, pane_backends
        observed["initial"] = {
            "document": nested,
            "terminals": terminals,
            "rectangles": rectangles(),
            "paneBackends": pane_backends,
        }
        capture("resize-nested-before")
        drag("Resize side by side panes", 0.08)
        resized = drag("Resize stacked panes", 0.08)
        saved_root = fleet(resized)["root"]
        assert saved_root["share"] != 5000 and saved_root["first"]["share"] != 5000
        saved_bounds = settled()
        capture("resize-both-axes")
        press("Fleet layouts")
        press("Save Fleet layout")
        wait(
            lambda: fields("Name"),
            lambda items: items[0]["focused"],
            "the focused native layout name editor",
        )
        type_text("Resize proof\n")
        wait(
            document,
            lambda item: any(
                saved["name"] == "Resize proof" and saved["root"] == saved_root
                for saved in item["value"]["savedLayouts"]
            ),
            "the saved weighted arrangement",
        )
        press("Fleet layouts")
        drag("Resize side by side panes", -0.06)
        drag("Resize stacked panes", -0.06)
        press("Fleet layouts")
        press("Load Resize proof")
        loaded = wait(
            document,
            lambda item: fleet(item)["root"] == saved_root,
            "same-window saved arrangement load",
        )
        press("Fleet layouts")
        restored(saved_bounds)
        capture("resize-saved-layout-restored")
        stale = drag("Resize side by side panes", -0.08, stale=True)
        assert stale["value"]["contents"] == contents
        assert stale["value"]["context"] == context
        assert stale["value"]["selectedFleet"] == nested["value"]["selectedFleet"]
        assert stale["value"]["selectedVoyage"] == nested["value"]["selectedVoyage"]
        assert (
            sorted(
                item["address"]
                for item in rpc("terminal.list", {"all": True})["terminals"]
            )
            == addresses
        )
        for address, original in terminals.items():
            actual = rpc("terminal.get", {"terminal": address})
            assert actual["pid"] == original["pid"] and actual["state"] == "live", (
                actual
            )
            assert (
                process_identity(actual["pid"], metadata_only=True)
                == owned[str(actual["pid"])]
            )
        current_core = rpc("server.status", {})
        assert (current_core["pid"], current_core["core"]["id"]) == (
            core["pid"],
            core["core"]["id"],
        )
        focus(panes()[0], 3)
        type_text("printf 'AFTER_RESIZE_%s\\n' OK\n")
        final_screens = wait(
            lambda: {
                address: rpc("terminal.read", {"terminal": address})["text"]
                for address in terminals
            },
            lambda screens: "AFTER_RESIZE_OK" in screens[pane_backends[0]].splitlines(),
            "real input after stale restoration",
        )
        assert all(
            "AFTER_RESIZE_OK" not in screen.splitlines()
            for address, screen in final_screens.items()
            if address != pane_backends[0]
        )
        final = document()
        assert final == stale, "A later workspace write followed the refused gesture"
        outcomes = witness()
        assert len(outcomes["outcomes"]) == 5, outcomes
        observed.update(
            {
                "loaded": loaded,
                "final": final,
                "rectangles": rectangles(),
                "finalScreens": final_screens,
                "outcomes": outcomes,
            }
        )
        capture("resize-original-processes-retained")
    except BaseException as error:
        failure = error
        try:
            save("resize-failure-document", document())
            capture("resize-before-close")
        except Exception as diagnostic:
            errors.append({"diagnostic": repr(diagnostic)})
    finally:
        try:
            close()
        except Exception as error:
            errors.append({"quit": repr(error)})
        if original_source is not None:
            try:
                notes.atomic(package, original_source)
                assert package.read_bytes() == original_source
            except Exception as error:
                errors.append({"sourceRestore": repr(error)})
        if core is not None:
            try:
                observe_core_exit(session, env)
            except Exception as error:
                errors.append({"coreExit": repr(error)})
        deadline = time.monotonic() + 10
        while True:
            survivors = []
            for pid, identity in owned.items():
                try:
                    stat = (
                        Path(f"/proc/{pid}/stat").read_text().rsplit(") ", 1)[1].split()
                    )
                    if stat[19] == identity["start"]:
                        survivors.append(
                            {"pid": pid, "state": stat[0], "start": stat[19]}
                        )
                except FileNotFoundError:
                    pass
            if not survivors or time.monotonic() >= deadline:
                break
            time.sleep(0.1)
        observed.update(
            {
                "owned": owned,
                "survivors": survivors,
                "socketAbsent": not socket.exists(),
                "errors": errors,
                "failure": repr(failure) if failure else None,
            }
        )
        save("resize-observed", observed)
    if failure:
        raise failure
    assert not errors and not survivors and not socket.exists(), observed
    return [
        "nested-native-splits",
        "both-divider-axes-persisted",
        "same-window-saved-proportions",
        "stale-gesture-restores-native-geometry",
        "original-processes-context-and-input-retained",
        "native-quit-and-recorded-owned-exits",
    ]
