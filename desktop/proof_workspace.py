import json
import subprocess
import time
from functools import partial


def core_rpc(method, params, *, session, env):
    request = json.dumps(
        {"jsonrpc": "2.0", "id": 1, "method": method, "params": params}
    )
    result = subprocess.run(
        ["hc", "connect", "--session", session],
        input=request + "\n",
        text=True,
        capture_output=True,
        env=env,
        check=True,
        timeout=5,
    )
    reply = json.loads(result.stdout.splitlines()[-1])
    assert "result" in reply, reply
    return reply["result"]


def prove(
    *, native, capture, geometry, close, start_frame, evidence, session, env, journey
):
    if journey == "workspace-unavailable":
        for _ in range(30):
            frame = capture("workspace-core-unavailable")
            if frame.getcolors(16) is None:
                break
            time.sleep(0.1)
        assert frame.getcolors(16) is None, "Unavailable view never painted its error"
        close()
        return ["core-unavailable-captured-for-visual-review", "native-quit"]

    rpc = partial(core_rpc, session=session, env=env)

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
        native(
            "move", int(bounds["X"]) + round(x * 2), int(bounds["Y"]) + round(y * 2), 2
        )
        native("button", True)
        native("button", False)
        time.sleep(0.2)

    initial = wait(lambda layout: layout is not None)
    assert len(initial["value"]["voyages"]) == 1, "Use a new isolated workspace"
    original = initial["value"]["voyages"][0]
    capture("workspace-initial")
    (evidence / "workspace-initial.json").write_text(json.dumps(initial, indent=2))
    click(367, 30)
    created = wait(lambda layout: len(layout["voyages"][0]["fleets"]) == 2)
    second = created["value"]["voyages"][0]["fleets"][1]
    click(width - 40, height - 37)
    split = wait(lambda layout: len(layout["voyages"][0]["fleets"][1]["vessels"]) == 2)
    assert (
        split["value"]["voyages"][0]["fleets"][1]["vessels"][0] == second["vessels"][0]
    )
    capture("workspace-split")
    click(width - 40, 80)
    docked = wait(lambda layout: layout["context"]["kind"] == "vessel")
    context = docked["value"]["context"]
    click(275, 30)
    selected = wait(
        lambda layout: layout["selectedFleet"] == original["fleets"][0]["id"]
    )
    assert selected["value"]["context"] == context, (
        "Navigation changed explicit context"
    )
    click(65, 233)
    added = wait(lambda layout: len(layout["voyages"]) == 2)
    capture("workspace-new-voyage")
    assert added["value"]["context"] == context
    click(80, 186)
    selected = wait(lambda layout: layout["selectedVoyage"] == original["id"])
    bumped = rpc(
        "doc.set",
        {
            "name": "voyager-layout-v1",
            "version": selected["version"],
            "value": selected["value"],
        },
    )
    click(465, 30)
    time.sleep(0.3)
    refused = state()
    assert (
        refused["value"] == selected["value"]
        and refused["version"] == bumped["version"]
    )
    capture("workspace-stale-refused")
    (evidence / "workspace-stale.json").write_text(json.dumps(refused, indent=2))
    click(270, height - 30)
    click(width - 40, height - 37)
    repaired = wait(
        lambda layout: len(layout["voyages"][0]["fleets"][0]["vessels"]) == 2
    )
    capture("workspace-refreshed")
    close()
    start_frame("workspace-reopened")
    assert state() == repaired, "Reopening changed the saved workspace"
    close()
    rpc("server.stop", {})
    return [
        "native-create-select-split-dock",
        "context-independent-of-navigation",
        "stale-layout-refused-and-refreshed",
        "saved-workspace-reopened",
        "native-quit",
    ]
