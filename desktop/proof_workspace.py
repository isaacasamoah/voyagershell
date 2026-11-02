import json
import subprocess
import time


def core_rpc(session, env, method, params):
    request = json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
    result = subprocess.run(
        ["hc", "connect", "--session", session],
        input=request + "\n", text=True, capture_output=True, env=env, check=True,
        timeout=5,
    )
    reply = json.loads(result.stdout.splitlines()[-1])
    assert "result" in reply, reply
    return reply["result"]


def prove(*, native, capture, geometry, close, start_frame, evidence, session, env, journey):
    if journey == "workspace-unavailable":
        for _ in range(30):
            frame = capture("workspace-core-unavailable")
            if frame.getcolors(16) is None:
                break
            time.sleep(0.1)
        assert frame.getcolors(16) is None, "Unavailable view never painted its error"
        close()
        return ["core-unavailable-captured-for-visual-review", "native-quit"]

    def rpc(method, params):
        return core_rpc(session, env, method, params)

    def state():
        return rpc("doc.get", {"name": "voyager-layout-v1"})

    def wait(predicate):
        for _ in range(50):
            result = state()
            if predicate(result["value"]):
                return result
            time.sleep(0.1)
        raise AssertionError("Native action did not reach the workspace owner")

    bounds = geometry()
    width, height = int(bounds["WIDTH"]) / 2, int(bounds["HEIGHT"]) / 2

    def click(x, y):
        bounds = geometry()
        native("move", int(bounds["X"]) + round(x * 2), int(bounds["Y"]) + round(y * 2), 2)
        native("button", True)
        native("button", False)
        time.sleep(0.2)

    initial = wait(lambda layout: layout is not None)
    assert len(initial["value"]["voyages"]) == 1, "Use a new isolated workspace"
    original = initial["value"]["voyages"][0]
    if journey == "placement":
        return placement(native, capture, click, wait, state, rpc, close, start_frame, original, width, height, evidence)
    capture("workspace-initial")
    (evidence / "workspace-initial.json").write_text(json.dumps(initial, indent=2))
    click(367, 30)
    created = wait(lambda layout: len(layout["voyages"][0]["fleets"]) == 2)
    second = created["value"]["voyages"][0]["fleets"][1]
    click(width - 40, height - 37)
    split = wait(lambda layout: len(layout["voyages"][0]["fleets"][1]["vessels"]) == 2)
    assert split["value"]["voyages"][0]["fleets"][1]["vessels"][0] == second["vessels"][0]
    capture("workspace-split")
    click(width - 40, 80)
    docked = wait(lambda layout: layout["context"]["kind"] == "vessel")
    context = docked["value"]["context"]
    click(275, 30)
    selected = wait(lambda layout: layout["selectedFleet"] == original["fleets"][0]["id"])
    assert selected["value"]["context"] == context, "Navigation changed explicit context"
    click(65, 233)
    added = wait(lambda layout: len(layout["voyages"]) == 2)
    capture("workspace-new-voyage")
    assert added["value"]["context"] == context
    click(80, 186)
    selected = wait(lambda layout: layout["selectedVoyage"] == original["id"])
    bumped = rpc("doc.set", {
        "name": "voyager-layout-v1", "version": selected["version"], "value": selected["value"],
    })
    click(465, 30)
    time.sleep(0.3)
    refused = state()
    assert refused["value"] == selected["value"] and refused["version"] == bumped["version"]
    capture("workspace-stale-refused")
    (evidence / "workspace-stale.json").write_text(json.dumps(refused, indent=2))
    click(270, height - 30)
    click(width - 40, height - 37)
    repaired = wait(lambda layout: len(layout["voyages"][0]["fleets"][0]["vessels"]) == 2)
    capture("workspace-refreshed")
    close()
    start_frame("workspace-reopened")
    assert state() == repaired, "Reopening changed the saved workspace"
    close()
    rpc("server.stop", {})
    return ["native-create-select-split-dock", "context-independent-of-navigation", "stale-layout-refused-and-refreshed", "saved-workspace-reopened", "native-quit"]


def placement(native, capture, click, wait, state, rpc, close, start_frame, original, width, height, evidence):
    def key(value):
        native("key", value, True)
        native("key", value, False)

    def replace(value):
        native("key", 65507, True)
        key(ord("a"))
        native("key", 65507, False)
        key(65288)
        for character in value:
            key(ord(character))

    def rename(x, y, value, finish="enter"):
        click(x, y)
        click(x, y)
        time.sleep(0.15)
        replace(value)
        if finish == "blur":
            click(500, height - 120)
        else:
            key(65307 if finish == "escape" else 65293)

    capture("placement-initial")
    click(70, height - 30)
    created = wait(lambda layout: len(layout["voyages"][0]["portals"]) == 1)
    portal = created["value"]["voyages"][0]["portals"][0]
    capture("placement-portal-created")
    click(width - 40, 80)
    wait(lambda layout: layout["context"] == {"kind": "portal", "id": portal["id"]})
    rename(275, 30, "Native Fleet")
    wait(lambda layout: layout["voyages"][0]["fleets"][0]["name"] == "Native Fleet")
    rename(70, 186, "Native Voyage")
    wait(lambda layout: layout["voyages"][0]["name"] == "Native Voyage")
    rename(275, 30, "Blur Fleet", "blur")
    wait(lambda layout: layout["voyages"][0]["fleets"][0]["name"] == "Blur Fleet")
    capture("placement-blur-saved")
    click(500, height - 120)
    key(65289)
    key(65471)
    capture("placement-keyboard-editor")
    replace("Keyboard Voyage")
    key(65293)
    wait(lambda layout: layout["voyages"][0]["name"] == "Keyboard Voyage")
    rename(275, 80, "+")
    wait(lambda layout: layout["voyages"][0]["fleets"][0]["vessels"][0].get("name") == "+")
    rename(width - 270, 80, "+")
    wait(lambda layout: layout["voyages"][0]["portals"][0].get("name") == "+")
    portal = state()["value"]["voyages"][0]["portals"][0]
    rename(275, 80, "Native Vessel")
    wait(lambda layout: layout["voyages"][0]["fleets"][0]["vessels"][0].get("name") == "Native Vessel")
    rename(275, 80, "")
    time.sleep(0.3)
    assert state()["value"]["voyages"][0]["fleets"][0]["vessels"][0]["name"] == "Native Vessel"
    capture("placement-empty-name-refused")
    click(355, 30)
    switched = wait(lambda layout: len(layout["voyages"][0]["fleets"]) == 2)
    assert switched["value"]["voyages"][0]["portals"][0] == portal
    assert switched["value"]["context"] == {"kind": "portal", "id": portal["id"]}
    capture("placement-portal-across-fleets")
    source_path = evidence / "profile/mods/header/main.js"
    source = source_path.read_text()
    delayed = source.replace(
        "result = await invoke(action, this.version);",
        'if (action.operation === "select-fleet") await task.sleep(2000);\n'
        "result = await invoke(action, this.version);",
    ).replace(
        ".on_click((event, cx) => {",
        '.on_click((event, cx) => { console.log(JSON.stringify({ click: event.click_count, target: rename, busy: this.busy, editing: !!this.editing }));',
    )
    assert delayed != source
    source_path.write_text(delayed)
    time.sleep(1)
    click(275, 30)
    click(275, 30)
    assert state()["value"]["selectedFleet"] == switched["value"]["selectedFleet"]
    capture("placement-editor-during-pending-selection")
    replace("Slow Fleet")
    key(65293)
    wait(lambda layout: layout["voyages"][0]["fleets"][0]["name"] == "Slow Fleet")
    source_path.write_text(source)
    time.sleep(0.6)
    rename(275, 30, "Discarded Fleet", "escape")
    time.sleep(0.3)
    assert state()["value"]["voyages"][0]["fleets"][0]["name"] == "Slow Fleet"
    capture("placement-rename-cancelled")
    saved = state()
    close()
    start_frame("placement-reopened")
    assert state() == saved
    close()
    rpc("server.stop", {})
    return ["real-voyage-portal", "enter-and-blur-save", "keyboard-tab-and-f2-rename", "vessel-and-portal-plus-names", "empty-name-refused", "portal-identity-and-context-retained-across-fleets", "rename-during-controlled-pending-selection", "changed-draft-escape-cancelled", "saved-placement-reopened", "native-quit"]
