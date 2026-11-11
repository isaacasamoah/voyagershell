import json
import threading
import time
from pathlib import Path

from proof_conversation import private_turn
from proof_session_quit import pane_candidates
from proof_workspace import chord, click_control, core_rpc, stop_existing_core, wait


def prove(
    *, native, capture, geometry, close, start_frame, evidence, session, env, journey
):
    assert journey == "vessel-finding"
    owner = json.loads((evidence / "launch.json").read_text())["pid"]
    socket = Path(env["XDG_RUNTIME_DIR"]) / "herdr-core" / f"{session}.sock"
    owned = {}
    settings = env.get("VOYAGER_PROOF_AVATAR_SETTINGS")

    def save(name, value):
        (evidence / f"{name}.json").write_text(json.dumps(value, indent=2))

    def rpc(method, params):
        return core_rpc(session, env, method, params)

    def document():
        return rpc("doc.get", {"name": "voyager-layout-v1"})

    def fleet(doc):
        return next(
            fleet
            for voyage in doc["value"]["voyages"]
            for fleet in voyage["fleets"]
            if fleet["id"] == doc["value"]["selectedFleet"]
        )

    def terminals(doc):
        return [
            item for item in doc["value"]["contents"] if item["typeId"] == "terminal"
        ]

    def bound(count):
        return wait(
            document,
            lambda doc: len(terminals(doc)) == count
            and all(item.get("backend") for item in terminals(doc)),
            f"{count} bound terminals",
        )

    def fields(name, count=1):
        return wait(
            lambda: [
                item
                for item in native("fields", owner, [name], "window")["fields"]
                if name != "Terminal" or item["role"] == "terminal"
            ],
            lambda items: len(items) == count
            and all(item["width"] > 0 and item["height"] > 0 for item in items),
            f"{count} native {name} target(s)",
        )

    def panes():
        return sorted(fields("Terminal", 3), key=lambda item: (item["x"], item["y"]))

    def click(item):
        bounds = geometry()
        native(
            "move",
            int(bounds["X"]) + round(item["x"] + item["width"] / 2),
            int(bounds["Y"]) + round(item["y"] + item["height"] / 2),
            2,
        )
        native("button", True)
        native("button", False)

    def split(key, count):
        focus(fields("Terminal", count - 1)[0], count - 1)
        chord(native, key)
        choice = fields("Create Terminal Vessel")[0]
        while choice != (choice := fields("Create Terminal Vessel")[0]):
            time.sleep(0.1)
        click(choice)
        return bound(count)

    def focus(item, count):
        click(item)
        wait(
            lambda: fields("Terminal", count),
            lambda current: any(
                target["focused"]
                and all(target[key] == item[key] for key in ("x", "y"))
                for target in current
            ),
            "native terminal focus at the clicked pane",
        )

    def type_text(value):
        for character in value:
            code = 65293 if character == "\n" else ord(character)
            native("key", code, True)
            native("key", code, False)

    def vessel(doc, backend):
        content = next(
            item["id"] for item in terminals(doc) if item["backend"] == backend
        )
        return next(
            item for item in fleet(doc)["vessels"] if item["content"] == content
        )

    def shown(backends, expected):
        docks = fields("Vessel dock", 3)
        everything = [
            item
            for item in native("fields", owner, None, "window")["fields"]
            if item["width"] and item["height"]
        ]
        names = {}
        for backend, pane in zip(backends, panes()):
            dock = next(item for item in docks if pane_candidates([pane], item))
            titles = [
                item["name"]
                for item in pane_candidates(everything, dock)
                if item["role"] in ("button", "push button")
                and item["name"] in expected
            ]
            assert len(titles) == 1, (titles, expected)
            names[backend] = titles[0]
        assert sorted(names.values()) == sorted(expected), names
        return names

    def ask(prompt, name, context, right):
        before = document()
        timing = {}

        seen = {}

        def watch():
            while "answered" not in timing:
                try:
                    state = json.loads((evidence / "conversation.json").read_text())
                except (OSError, ValueError):
                    continue
                users = [m for m in state["messages"] if m["role"] == "user"]
                if users and users[-1]["text"] == prompt:
                    timing.setdefault("submitted", time.monotonic())
                    now = round(time.monotonic() - timing["submitted"], 2)
                    for m in state["messages"]:
                        if m["requestId"] == users[-1]["requestId"] and m["role"] != "user":
                            tool = m.get("tool", {})
                            step = tool.get("action", {}).get("action", {}).get("operation")
                            seen.setdefault((step or "answer", tool.get("status", "")), now)
                time.sleep(0.03)

        def accepted(_state, _user):
            timing["started"] = time.monotonic()
            wait(document, lambda doc: fleet(doc) != fleet(before), name, 90)
            timing["seconds"] = round(time.monotonic() - timing["started"], 1)

        threading.Thread(target=watch).start()
        final, user = private_turn(
            native=native,
            pid=owner,
            evidence=evidence,
            wait=wait,
            type_text=type_text,
            prompt=prompt,
            context=context,
            owned=owned,
            name=name,
            accepted=accepted,
        )
        answered = timing["answered"] = round(time.monotonic() - timing["started"], 1)
        after = document()
        capture(name)
        mine = [m for m in final["messages"] if m["requestId"] == user["requestId"]]
        save(
            name + "-result",
            {
                "prompt": prompt,
                "settings": settings,
                "acceptedToEffectSeconds": timing["seconds"],
                "acceptedToAnswerSeconds": answered,
                "submittedToStepSeconds": sorted((at, *step) for step, at in seen.items()),
                "calls": [m["tool"] for m in mine if m["role"] == "tool"],
                "answer": [m["text"] for m in mine if m["role"] == "assistant"],
                "fleet": fleet(after),
            },
        )
        assert right(before, after), fleet(after)

    try:
        wait(socket.is_socket, bool, "the dedicated Core socket")
        context = bound(1)["value"]["context"]
        split("o", 2)
        layout = split("e", 3)
        backends = []
        for index, item in enumerate(panes()):
            focus(item, 3)
            type_text(f"printf 'FIND_%s\\n' {index}\n")
            backends.append(
                wait(
                    lambda: [
                        content["backend"]
                        for content in terminals(layout)
                        if f"FIND_{index}"
                        in rpc("terminal.read", {"terminal": content["backend"]})[
                            "text"
                        ].splitlines()
                    ],
                    lambda matches: len(matches) == 1,
                    f"real output from native pane {index}",
                )[0]
            )
        assert len(set(backends)) == 3, backends
        folder = Path(terminals(layout)[0]["cwd"]).name
        plain = bool(env.get("VOYAGER_PROOF_POSITION_ONLY"))
        names = {} if plain else shown(backends, [folder, f"{folder} 2", f"{folder} 3"])
        capture("finding-numbered-names")
        corner = max(
            zip(backends, panes()),
            key=lambda pair: (pair[1]["x"] + pair[1]["width"], -pair[1]["y"]),
        )[0]
        numbered = next(
            (
                backend
                for backend, name in names.items()
                if name != folder and backend != corner
            ),
            None,
        )
        if settings:
            (evidence / "profile/conversation.json").write_text(settings)
        click_control(native, capture, geometry, evidence, owner, "Chat", [])
        if not plain:
            ask(
                f"Rename the vessel called {names[numbered]} to Port.",
                "finding-by-name",
                context,
                lambda before, after: [item["name"] for item in fleet(after)["vessels"]]
                == [
                    "Port" if item["id"] == vessel(before, numbered)["id"] else item["name"]
                    for item in fleet(before)["vessels"]
                ],
            )
            after = shown(backends, [folder, f"{folder} 2", "Port"])
            save("finding-names", {"before": names, "afterRename": after})
        ask(
            "Maximize the top right vessel.",
            "finding-by-position",
            context,
            lambda _before, after: fleet(after).get("maximizedPlacement")
            == vessel(after, corner)["id"],
        )
    except BaseException:
        try:
            save("finding-failure-document", document())
            capture("finding-failure")
        except Exception:
            pass
        raise
    finally:
        close()
        stop_existing_core(session, env)
        wait(lambda: not socket.exists(), bool, "the dedicated Core socket to go")
    return [
        "three-same-folder-terminals-show-numbered-names",
        "avatar-renamed-the-numbered-vessel-by-its-shown-name",
        "avatar-maximized-the-top-right-vessel",
        "native-quit-and-dedicated-core-stop",
    ]
